# 语音识别面试助手 — 设计文档

- 日期: 2026-05-31
- 状态: 已确认设计,待生成实施计划
- 作者: jiguangya
- 相关项目: interview-coder-v1 (Electron 桌面应用,已有截图→AI 解题能力)

## 1. 目标

在现有"截图识别代码题→AI 解答"流程之上,新增一条**语音通道**:在网页面试过程中持续后台监听面试官说话,用户按热键即可让 AI 回答最近一个问题(技术题/行为题/追问),并把答案显示在隐身悬浮窗中。

## 2. 关键约束

| 约束 | 说明 |
|---|---|
| **不影响第三方面试软件** | 任何主流面试平台(Zoom、Google Meet、HackerRank Coderpad、CodeSignal、Karat 等)的音视频流不能被抢占、改路由或破坏。 |
| **不动麦克风** | 用户的麦克风从头到尾不被本应用触碰 — 面试软件正常采集用户讲话。 |
| **隐身** | 沿用项目现有 BrowserWindow 隐身策略,新 UI 只是悬浮答案面板的一部分。 |
| **macOS only** | 首版只支持 macOS 13+。Windows/Linux 后续考虑。 |

## 3. 用户场景

1. 面试开始前打开应用,首次运行授予"屏幕录制"权限。
2. 应用进入后台监听:用 ScreenCaptureKit 抓系统输出音频 mix(只读副本),滚动写入 60s 环形缓冲。
3. 面试官提问("Can you walk me through how you'd design X?")。
4. 用户听完问题,按 `Cmd+;`。
5. 应用用 VAD 在缓冲里找到面试官最近一段完整发言(起止时间戳),最多回看 30s。
6. 切出 wav → OpenAI Whisper API 转写。
7. 转写文本送到用户当前选定的 LLM(沿用现有 OpenAI/Anthropic/Gemini 路由),system prompt 让 LLM 自己判断意图并回答。
8. 答案 ipc 推到 renderer,悬浮面板显示"问题转写 + AI 回答"。

## 4. 整体架构

```
┌── Electron Main ─────────────────────────────────────────┐
│                                                          │
│  [native: AudioCapture (Swift)]                          │
│   ScreenCaptureKit SCStream → PCM 16kHz mono Float32     │
│           │                                              │
│           ▼ ~20ms 帧                                    │
│  [AudioCaptureHelper.ts]                                 │
│   60s 环形缓冲                                           │
│   能量 VAD → 标记每段"面试官发言"的起止时间戳          │
│           ▲                                              │
│           │ sliceMostRecentUtterance(maxSec=30)         │
│  [shortcuts.ts] ── 热键 Cmd+; 触发 ──┐                  │
│                                       ▼                  │
│                              [ProcessingHelper]          │
│                              ① Whisper API 转写         │
│                              ② LLM(意图判断+回答)      │
│                                       │                  │
└───────────────────────────────────────┼──────────────────┘
                                        ▼ ipc
                       renderer 悬浮答案面板(新)
                       状态灯 / 转写 / AI 回答
```

## 5. 模块设计

### 5.1 `native/AudioCapture/` (新, Swift)

**职责**: 用 ScreenCaptureKit 录系统输出音频,通过 N-API 暴露给 Node 层。

**接口**:
```ts
interface AudioCaptureNative {
  start(callback: (pcm: Float32Array, sampleRate: number, timestampMs: number) => void): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean
}
```

**实现要点**:
- 用 `SCStream` + `SCStreamConfiguration`,只配 audio,不配 video(节省资源)。
- `SCContentFilter` 选 `init(display:excludingApplications:exceptingWindows:)`,排除自身应用以避免回环。
- 输出 16kHz mono Float32(适合 Whisper,降低带宽)。
- N-API 通过 `Napi::ThreadSafeFunction` 把 PCM 帧推回 JS 主循环。
- 编译产物:`.node` 二进制,通过 prebuild 脚本打包到 `assets/native/audio_capture-{arch}.node`。

**权限**: macOS "屏幕录制"权限。即使只录音频,系统也按"屏幕录制"归类。首次启动用 `tccutil` 不可行,需引导用户在"系统设置 → 隐私与安全 → 屏幕录制"勾选。

### 5.2 `electron/AudioCaptureHelper.ts` (新)

**职责**: 包装原生模块,管理 60s 环形缓冲和 VAD 段落标注,提供"取最近一段发言"接口。

**接口**:
```ts
class AudioCaptureHelper {
  start(): Promise<void>            // 启动原生捕获
  stop(): Promise<void>
  isCapturing(): boolean
  sliceMostRecentUtterance(maxSec?: number): Buffer  // 返回 wav buffer
  onStateChange(cb: (state: 'idle'|'capturing'|'speaking') => void): void
}
```

**内部状态**:
- 环形 buffer:`Float32Array`,长度 = 16000 * 60 = 960000。
- 写指针 + 已写字节数。
- 段落列表:`Array<{startSampleIdx, endSampleIdx}>`,持续更新最近 60s 内识别到的所有"面试官发言"段。

**VAD 算法**: 一阶简单能量阈值(RMS) + 滞后时间窗:
- 每 20ms 帧算 RMS。
- RMS > 阈值 持续 ≥ 200ms → 标记 utterance 起点。
- RMS < 阈值 持续 ≥ 700ms → 标记 utterance 终点。
- 阈值通过启动后 1s 静默校准(取静默 RMS + 6dB 边距)。

**`sliceMostRecentUtterance`**: 找最近一个 `endSampleIdx` 的段。如果该段持续时间 > maxSec,从段尾往前回看 maxSec。打包成 16kHz mono PCM-16 WAV(给 Whisper)。

### 5.3 `electron/ProcessingHelper.ts` (改)

**新增方法**:
```ts
async processAudioQuestion(wavBuffer: Buffer): Promise<void>
```

**步骤**:
1. 调 OpenAI `audio.transcriptions.create({file, model:'whisper-1'})` → 文本(Whisper 自动识别中英文)。
2. 把转写文本送给当前选定 LLM(用 ConfigHelper 已有的 provider 路由),system prompt 见 §6。
3. 通过 ipc 推 `audio:answer` 到 renderer。
4. 失败处理:Whisper 报错 → 推 `audio:error`;LLM 报错 → 同上。

### 5.4 `electron/shortcuts.ts` (改)

注册新热键 `Cmd+;`,触发:
```ts
const wav = audioCaptureHelper.sliceMostRecentUtterance(30)
processingHelper.processAudioQuestion(wav).catch(log)
```

热键可在 ConfigHelper 里改。

### 5.5 `electron/ipcHandlers.ts` (改)

新增通道:
- `audio:start` / `audio:stop` (renderer → main): 用户在设置面板手动开/关监听。
- `audio:status` (main → renderer): 推 `idle/capturing/speaking/transcribing/answering`。
- `audio:answer` (main → renderer): payload `{transcript: string, answer: string, intent: 'technical'|'behavioral'|'chitchat'|'unclear'}`。
- `audio:error` (main → renderer): payload `{message: string}`。

### 5.6 `electron/ConfigHelper.ts` (改)

新增字段:
```ts
{
  audio: {
    enabled: boolean              // 默认 false,需用户主动开启
    hotkey: string                // 默认 'CommandOrControl+;'
    maxLookbackSeconds: number    // 默认 30
    sttProvider: 'openai-whisper' // V1 唯一选项
  }
}
```

### 5.7 renderer 新 UI

**新页面/组件**: `src/_pages/AudioPanel.tsx` + 子组件。

**视觉**:
- 顶部状态条:🎙️ 监听中(绿) / 🟡 处理中 / ⚪ 已关闭。
- 主区域:最近一次"问题转写 + AI 回答"。卡片式。
- 历史滚动条:本次会话所有 Q&A,可点击翻看。

**可选**: 在现有页面顶部加一个迷你状态点,而非独立面板,降低 UI 改动量。具体放置在实施阶段定。

## 6. LLM 意图判断 prompt

```
你是一名实时面试助手。下面是面试官刚才说的一段话(由系统音频转写而来,可能有少量识别错误)。

请判断意图并回答:
- 如果是【技术题】:给出解题思路 + 可运行代码(优先 Python/JavaScript,LeetCode 风格),含复杂度分析。
- 如果是【行为/项目题】:用 STAR 格式给出 3-5 句的回答框架,关键点用 bold。
- 如果是【追问/澄清】(基于此前回答的追问):给出 2-3 句直接回应。
- 如果【似乎不是面向我的问题】(闲聊、反馈、自言自语):回 "(似乎不是问题:<一句话概括内容>)"。
- 如果【转写不完整或听不清】:回 "(转写不完整,请重试或调整回看时长)"。

输出格式: 第一行 [intent: technical|behavioral|followup|chitchat|unclear],之后是回答正文。
```

## 7. 不影响第三方面试软件 — 技术保证

- ScreenCaptureKit 拿的是 **系统输出 mix 的副本**,操作系统层面是只读监听,不修改音频路由表、不抢占设备。
- 不安装任何虚拟音频驱动(BlackHole / Loopback 都不需要)。
- 麦克风全程不被本应用 `getUserMedia` 触碰 — 面试软件独占麦克风,行为与未安装本应用完全一致。
- 即使本应用崩溃,面试软件音频也不受任何影响(没有共享资源)。

## 8. 隐私和数据

- 默认 Whisper API 不留训练数据(OpenAI 政策),但音频毕竟传云。
- 不持久化任何音频:60s 环形 buffer 在内存,程序退出即销毁。
- 转写文本和答案默认不写盘,仅 in-memory 显示。如果用户开"会话历史"功能(后续阶段),才落本地 IndexedDB。

## 9. 成本

- Whisper API: $0.006/分钟。一次按键处理 ≤ 30s ≈ $0.003。
- 1 小时面试假设按 60 次 ≈ $0.18,可忽略。
- LLM 部分:走用户当前选的模型,不新增成本。

## 10. 测试策略

- **单元测试**:
  - `AudioCaptureHelper`:模拟 PCM 输入 → 验证环形 buffer 写入、VAD 段落识别、`sliceMostRecentUtterance` 正确性。
  - WAV 打包格式正确(头部、采样率、单声道)。
- **集成测试**:
  - 提供一个"喂 wav 文件代替原生模块"的测试开关,跑通"假音频 → Whisper → LLM → ipc"端到端。
- **手动 E2E**:
  - 打开 Zoom/Meet 播放预录的面试音频,按热键验证答案合理性。
  - 在 HackerRank/CodeSignal 真实环境冒烟,验证不影响平台音频。

## 11. 范围外 (YAGNI)

V1 不做:
- 实时连续转写
- 说话人分离 / diarization(单源系统音频本就单人)
- 多语言切换 UI(Whisper 自动识别)
- 离线 STT(`whisper.cpp` 等)
- Windows / Linux
- 历史会话持久化
- 答案语音播报(TTS)
- 面试官答案的反馈学习

V2 候选清单(单独 spec):
- 本地 whisper.cpp(隐私场景)
- Windows WASAPI loopback
- 会话历史

## 12. 待办的不确定项

- [ ] ScreenCaptureKit 对自身应用的排除是否真的有效(若不排除可能产生反馈循环)— 实施阶段写最小 Swift 原型验证。
- [ ] N-API + Swift 的工程脚手架(用 `node-addon-api` + `swift build` 还是 `napi-rs`)— 实施阶段决定。
- [ ] 热键 `Cmd+;` 是否与常用面试软件冲突(Zoom 没占,VS Code 占了"展开侧边栏")— 实施阶段提供改键 UI。
