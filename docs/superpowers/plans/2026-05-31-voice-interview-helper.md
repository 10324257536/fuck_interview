# Voice Interview Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a voice channel to the Electron interview-coder app: continuously buffer the interviewer's voice from system audio (macOS, ScreenCaptureKit), and on hotkey press transcribe the most recent utterance with Whisper and let the existing LLM answer.

**Architecture:** A small Swift CLI binary captures system audio via ScreenCaptureKit and streams 16-kHz mono Float32 PCM frames to stdout. The Electron main process spawns that binary as a child process, feeds frames into a 60-second ring buffer with energy-VAD utterance segmentation, slices the latest utterance on hotkey press, sends it to Whisper for transcription, then to the user's currently-configured LLM with an intent-classifying prompt, and pushes the answer to the renderer over IPC. Using a CLI subprocess (instead of an N-API native addon) avoids Electron-version coupling and lets the binary be tested standalone.

**Tech Stack:** Electron 29 + TypeScript (existing), React 18 (existing), Swift 5.9 + ScreenCaptureKit (new, macOS 13+), Vitest (new — no test infra exists), OpenAI Whisper API, existing OpenAI/Anthropic/Gemini routing.

---

## File Structure

**New files:**
- `electron/audio/ringBuffer.ts` — Float32 ring buffer keyed by sample index
- `electron/audio/vad.ts` — Energy-based voice activity detection + utterance segmentation
- `electron/audio/wavEncoder.ts` — Encode Float32 PCM to 16-bit PCM WAV bytes
- `electron/audio/pcmSource.ts` — Interface for PCM frame sources (mockable)
- `electron/audio/subprocessPcmSource.ts` — Spawns the Swift CLI, parses stdout
- `electron/audio/whisper.ts` — Wraps OpenAI `audio.transcriptions.create`
- `electron/AudioCaptureHelper.ts` — Composes ring buffer + VAD + source; `sliceMostRecentUtterance(maxSec)`
- `native/AudioCapture/Package.swift` — Swift Package manifest
- `native/AudioCapture/Sources/audio_capture/main.swift` — ScreenCaptureKit audio→stdout
- `native/AudioCapture/build.sh` — One-line build script
- `src/_pages/AudioPanel.tsx` — Renderer UI: status pill + last Q&A card
- `vitest.config.ts` — Test runner config
- `electron/audio/*.test.ts` — Colocated tests for each module

**Modified files:**
- `electron/ConfigHelper.ts` — Add `audio` config block
- `electron/ProcessingHelper.ts` — Add `processAudioQuestion(wavBuffer)`
- `electron/ipcHandlers.ts` — Add `audio:start|stop|status|answer|error` channels
- `electron/preload.ts` — Expose `audio:*` IPC to renderer
- `electron/shortcuts.ts` — Register Cmd+; hotkey
- `electron/main.ts` — Instantiate `AudioCaptureHelper`, wire to ProcessingHelper
- `src/App.tsx` — Mount `AudioPanel`
- `package.json` — Add vitest, build:native script
- `build/entitlements.mac.plist` — Add screen-recording entitlement note (verify)

**File-size discipline:** Each new file stays under ~250 lines. ProcessingHelper.ts is already 1387 lines — only append the new method, do not refactor.

---

## Task 1: Set up Vitest test infrastructure

The project has no test runner. We need one before TDD.

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install vitest**

```bash
npm install -D vitest @vitest/ui
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['electron/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
})
```

- [ ] **Step 3: Update `package.json` `scripts` block**

Replace the existing `"test"` line with:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Add a smoke test**

Create `electron/audio/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run it**

```bash
npm test
```

Expected: 1 test passes, exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts electron/audio/smoke.test.ts
git commit -m "chore: add vitest test infrastructure"
```

---

## Task 2: Add audio config block to ConfigHelper

**Files:**
- Modify: `electron/ConfigHelper.ts`
- Test: `electron/ConfigHelper.test.ts`

- [ ] **Step 1: Read existing ConfigHelper.ts**

Open `electron/ConfigHelper.ts`, find the `Config` interface (around line 8) and the `defaultConfig` object (around line 24).

- [ ] **Step 2: Write a failing test**

Create `electron/ConfigHelper.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/configtest-' + Math.random() },
}))

describe('ConfigHelper audio defaults', () => {
  beforeEach(() => vi.resetModules())

  it('exposes audio defaults', async () => {
    const { ConfigHelper } = await import('./ConfigHelper')
    const helper = new ConfigHelper()
    const cfg = helper.loadConfig()
    expect(cfg.audio).toEqual({
      enabled: false,
      hotkey: 'CommandOrControl+;',
      maxLookbackSeconds: 30,
      sttProvider: 'openai-whisper',
    })
  })
})
```

- [ ] **Step 3: Run test, see it fail**

```bash
npm test -- ConfigHelper.test.ts
```

Expected: FAIL — `cfg.audio` is undefined.

- [ ] **Step 4: Add `audio` block to Config interface**

In `electron/ConfigHelper.ts`, extend the `Config` interface:

```ts
interface AudioConfig {
  enabled: boolean
  hotkey: string
  maxLookbackSeconds: number
  sttProvider: 'openai-whisper'
}

interface Config {
  apiKey: string;
  apiProvider: "openai" | "gemini" | "anthropic";
  extractionModel: string;
  solutionModel: string;
  debuggingModel: string;
  language: string;
  opacity: number;
  targetLanguage: string;
  translationMode: "translate" | "extract" | "both";
  sourceLanguage: string;
  audio: AudioConfig;
}
```

- [ ] **Step 5: Add to `defaultConfig`**

Append to the `defaultConfig` object literal (just before the closing `}`):

```ts
audio: {
  enabled: false,
  hotkey: 'CommandOrControl+;',
  maxLookbackSeconds: 30,
  sttProvider: 'openai-whisper',
},
```

- [ ] **Step 6: Run test, expect pass**

```bash
npm test -- ConfigHelper.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add electron/ConfigHelper.ts electron/ConfigHelper.test.ts
git commit -m "feat(config): add audio capture config block"
```

---

## Task 3: WAV encoder utility

Encodes Float32 mono PCM at 16 kHz to a PCM-16 WAV byte buffer suitable for Whisper.

**Files:**
- Create: `electron/audio/wavEncoder.ts`
- Test: `electron/audio/wavEncoder.test.ts`

- [ ] **Step 1: Write failing test**

Create `electron/audio/wavEncoder.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { encodeWavPCM16 } from './wavEncoder'

describe('encodeWavPCM16', () => {
  it('produces a valid 16-kHz mono WAV header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1])
    const wav = encodeWavPCM16(samples, 16000)

    // RIFF header
    expect(wav.subarray(0, 4).toString()).toBe('RIFF')
    expect(wav.subarray(8, 12).toString()).toBe('WAVE')
    expect(wav.subarray(12, 16).toString()).toBe('fmt ')
    // PCM format = 1
    expect(wav.readUInt16LE(20)).toBe(1)
    // mono
    expect(wav.readUInt16LE(22)).toBe(1)
    // 16 kHz
    expect(wav.readUInt32LE(24)).toBe(16000)
    // 16-bit
    expect(wav.readUInt16LE(34)).toBe(16)
    expect(wav.subarray(36, 40).toString()).toBe('data')
    // 5 samples × 2 bytes
    expect(wav.readUInt32LE(40)).toBe(10)
  })

  it('clips and quantizes Float32 to PCM-16 correctly', () => {
    const samples = new Float32Array([0, 1, -1, 2, -2])
    const wav = encodeWavPCM16(samples, 16000)
    const data = wav.subarray(44)
    expect(data.readInt16LE(0)).toBe(0)
    expect(data.readInt16LE(2)).toBe(32767)
    expect(data.readInt16LE(4)).toBe(-32768)
    expect(data.readInt16LE(6)).toBe(32767) // clipped
    expect(data.readInt16LE(8)).toBe(-32768) // clipped
  })
})
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- wavEncoder
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `wavEncoder.ts`**

Create `electron/audio/wavEncoder.ts`:

```ts
export function encodeWavPCM16(samples: Float32Array, sampleRate: number): Buffer {
  const byteRate = sampleRate * 2
  const dataSize = samples.length * 2
  const buf = Buffer.alloc(44 + dataSize)

  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)        // PCM
  buf.writeUInt16LE(1, 22)        // mono
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(2, 32)        // block align
  buf.writeUInt16LE(16, 34)       // bits per sample
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples.length; i++) {
    const clipped = Math.max(-1, Math.min(1, samples[i]))
    const int16 = clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff
    buf.writeInt16LE(int16 | 0, 44 + i * 2)
  }
  return buf
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- wavEncoder
```

Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add electron/audio/wavEncoder.ts electron/audio/wavEncoder.test.ts
git commit -m "feat(audio): add Float32 → PCM-16 WAV encoder"
```

---

## Task 4: Float32 ring buffer

Append-only ring buffer keyed by absolute sample index. Lets us request "samples between abs index A and B" even after old data has been overwritten (returns null in that case).

**Files:**
- Create: `electron/audio/ringBuffer.ts`
- Test: `electron/audio/ringBuffer.test.ts`

- [ ] **Step 1: Write failing test**

Create `electron/audio/ringBuffer.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { Float32RingBuffer } from './ringBuffer'

describe('Float32RingBuffer', () => {
  it('appends and reads back', () => {
    const rb = new Float32RingBuffer(8)
    rb.append(new Float32Array([1, 2, 3]))
    expect(rb.totalSamplesWritten).toBe(3)
    const out = rb.readBetween(0, 3)
    expect(Array.from(out!)).toEqual([1, 2, 3])
  })

  it('overwrites oldest samples and tracks abs index', () => {
    const rb = new Float32RingBuffer(4)
    rb.append(new Float32Array([1, 2, 3, 4, 5, 6]))
    expect(rb.totalSamplesWritten).toBe(6)
    expect(rb.oldestAvailableIndex).toBe(2)
    const out = rb.readBetween(2, 6)
    expect(Array.from(out!)).toEqual([3, 4, 5, 6])
  })

  it('returns null when the requested range is older than the buffer', () => {
    const rb = new Float32RingBuffer(4)
    rb.append(new Float32Array([1, 2, 3, 4, 5, 6]))
    expect(rb.readBetween(0, 2)).toBeNull()
  })

  it('returns null when end index is in the future', () => {
    const rb = new Float32RingBuffer(4)
    rb.append(new Float32Array([1, 2]))
    expect(rb.readBetween(0, 5)).toBeNull()
  })
})
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- ringBuffer
```

Expected: FAIL.

- [ ] **Step 3: Implement `ringBuffer.ts`**

Create `electron/audio/ringBuffer.ts`:

```ts
export class Float32RingBuffer {
  private readonly buf: Float32Array
  private writePos = 0
  private written = 0

  constructor(public readonly capacity: number) {
    if (capacity <= 0) throw new Error('capacity must be > 0')
    this.buf = new Float32Array(capacity)
  }

  get totalSamplesWritten(): number { return this.written }

  get oldestAvailableIndex(): number {
    return Math.max(0, this.written - this.capacity)
  }

  append(frame: Float32Array): void {
    for (let i = 0; i < frame.length; i++) {
      this.buf[this.writePos] = frame[i]
      this.writePos = (this.writePos + 1) % this.capacity
    }
    this.written += frame.length
  }

  readBetween(startAbs: number, endAbs: number): Float32Array | null {
    if (startAbs < this.oldestAvailableIndex) return null
    if (endAbs > this.written) return null
    if (endAbs < startAbs) return null
    const len = endAbs - startAbs
    const out = new Float32Array(len)
    let readPos = (this.writePos - (this.written - startAbs) + this.capacity * 2) % this.capacity
    for (let i = 0; i < len; i++) {
      out[i] = this.buf[readPos]
      readPos = (readPos + 1) % this.capacity
    }
    return out
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- ringBuffer
```

Expected: PASS, all four tests.

- [ ] **Step 5: Commit**

```bash
git add electron/audio/ringBuffer.ts electron/audio/ringBuffer.test.ts
git commit -m "feat(audio): add Float32 ring buffer with absolute-index reads"
```

---

## Task 5: Energy VAD with utterance segmentation

Stateful VAD: receives Float32 frames, emits "utterance start" / "utterance end" events with absolute sample indices. Uses RMS over 20-ms windows and onset/hangover hysteresis.

**Files:**
- Create: `electron/audio/vad.ts`
- Test: `electron/audio/vad.test.ts`

- [ ] **Step 1: Write failing test**

Create `electron/audio/vad.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EnergyVad } from './vad'

function silence(n: number) { return new Float32Array(n) }
function tone(n: number, amp = 0.5) {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = Math.sin(i * 0.1) * amp
  return a
}

describe('EnergyVad', () => {
  it('detects an utterance bracketed by silence', () => {
    const vad = new EnergyVad({
      sampleRate: 16000,
      frameMs: 20,
      onsetMs: 200,
      hangoverMs: 700,
      threshold: 0.05,
    })
    const events: Array<{ kind: string; index: number }> = []
    vad.on('start', i => events.push({ kind: 'start', index: i }))
    vad.on('end', i => events.push({ kind: 'end', index: i }))

    vad.feed(silence(16000))                // 1s silence (samples 0..15999)
    vad.feed(tone(16000 * 2))               // 2s speech (16000..47999)
    vad.feed(silence(16000 * 2))            // 2s silence (48000..79999) — hangover triggers end

    expect(events.length).toBe(2)
    expect(events[0].kind).toBe('start')
    expect(events[1].kind).toBe('end')
    // Start should be inside the speech window
    expect(events[0].index).toBeGreaterThanOrEqual(16000)
    expect(events[0].index).toBeLessThan(16000 + 16000 * 0.5)
    // End should be after speech stopped + hangover
    expect(events[1].index).toBeGreaterThan(48000)
  })

  it('exposes the most recent completed utterance', () => {
    const vad = new EnergyVad({
      sampleRate: 16000, frameMs: 20, onsetMs: 200, hangoverMs: 700, threshold: 0.05,
    })
    vad.feed(silence(16000))
    vad.feed(tone(32000))
    vad.feed(silence(32000))
    const u = vad.lastCompletedUtterance()
    expect(u).not.toBeNull()
    expect(u!.endAbs).toBeGreaterThan(u!.startAbs)
  })

  it('returns null when no utterance has completed', () => {
    const vad = new EnergyVad({
      sampleRate: 16000, frameMs: 20, onsetMs: 200, hangoverMs: 700, threshold: 0.05,
    })
    vad.feed(silence(8000))
    expect(vad.lastCompletedUtterance()).toBeNull()
  })
})
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- vad
```

Expected: FAIL.

- [ ] **Step 3: Implement `vad.ts`**

Create `electron/audio/vad.ts`:

```ts
type EventKind = 'start' | 'end'
type Listener = (absIndex: number) => void

export interface VadOptions {
  sampleRate: number
  frameMs: number
  onsetMs: number
  hangoverMs: number
  threshold: number
}

export interface Utterance {
  startAbs: number
  endAbs: number
}

export class EnergyVad {
  private readonly frameSize: number
  private readonly onsetFrames: number
  private readonly hangoverFrames: number
  private readonly listeners: Record<EventKind, Listener[]> = { start: [], end: [] }

  private speaking = false
  private aboveCount = 0
  private belowCount = 0
  private currentUtteranceStart: number | null = null
  private last: Utterance | null = null

  private leftover: Float32Array = new Float32Array(0)
  private framesProcessed = 0

  constructor(private readonly opts: VadOptions) {
    this.frameSize = Math.round(opts.sampleRate * opts.frameMs / 1000)
    this.onsetFrames = Math.max(1, Math.round(opts.onsetMs / opts.frameMs))
    this.hangoverFrames = Math.max(1, Math.round(opts.hangoverMs / opts.frameMs))
  }

  on(kind: EventKind, fn: Listener): void {
    this.listeners[kind].push(fn)
  }

  lastCompletedUtterance(): Utterance | null {
    return this.last
  }

  feed(samples: Float32Array): void {
    const merged = new Float32Array(this.leftover.length + samples.length)
    merged.set(this.leftover, 0)
    merged.set(samples, this.leftover.length)

    let offset = 0
    while (offset + this.frameSize <= merged.length) {
      const frame = merged.subarray(offset, offset + this.frameSize)
      this.processFrame(frame)
      offset += this.frameSize
    }
    this.leftover = merged.slice(offset)
  }

  private processFrame(frame: Float32Array): void {
    let sumSq = 0
    for (let i = 0; i < frame.length; i++) sumSq += frame[i] * frame[i]
    const rms = Math.sqrt(sumSq / frame.length)
    const above = rms >= this.opts.threshold

    const frameStartAbs = this.framesProcessed * this.frameSize
    this.framesProcessed += 1

    if (!this.speaking) {
      if (above) {
        this.aboveCount += 1
        if (this.aboveCount >= this.onsetFrames) {
          this.speaking = true
          this.currentUtteranceStart = frameStartAbs - (this.onsetFrames - 1) * this.frameSize
          this.belowCount = 0
          this.listeners.start.forEach(fn => fn(this.currentUtteranceStart!))
        }
      } else {
        this.aboveCount = 0
      }
    } else {
      if (above) {
        this.belowCount = 0
      } else {
        this.belowCount += 1
        if (this.belowCount >= this.hangoverFrames) {
          this.speaking = false
          const endAbs = frameStartAbs + this.frameSize - this.hangoverFrames * this.frameSize
          this.last = { startAbs: this.currentUtteranceStart!, endAbs }
          this.currentUtteranceStart = null
          this.aboveCount = 0
          this.listeners.end.forEach(fn => fn(endAbs))
        }
      }
    }
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- vad
```

Expected: PASS, all three tests.

- [ ] **Step 5: Commit**

```bash
git add electron/audio/vad.ts electron/audio/vad.test.ts
git commit -m "feat(audio): add energy VAD with utterance segmentation"
```

---

## Task 6: PCM source interface + AudioCaptureHelper

Wires ring buffer + VAD together behind a clean interface that we can drive with mock PCM in tests.

**Files:**
- Create: `electron/audio/pcmSource.ts`
- Create: `electron/AudioCaptureHelper.ts`
- Test: `electron/AudioCaptureHelper.test.ts`

- [ ] **Step 1: Create the PCM source interface**

Create `electron/audio/pcmSource.ts`:

```ts
export type PcmFrameListener = (frame: Float32Array) => void

export interface PcmSource {
  start(): Promise<void>
  stop(): Promise<void>
  isRunning(): boolean
  onFrame(listener: PcmFrameListener): void
  readonly sampleRate: number
}
```

- [ ] **Step 2: Write failing test**

Create `electron/AudioCaptureHelper.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { AudioCaptureHelper } from './AudioCaptureHelper'
import type { PcmSource, PcmFrameListener } from './audio/pcmSource'

class MockSource implements PcmSource {
  readonly sampleRate = 16000
  private listeners: PcmFrameListener[] = []
  private running = false
  async start() { this.running = true }
  async stop() { this.running = false }
  isRunning() { return this.running }
  onFrame(l: PcmFrameListener) { this.listeners.push(l) }
  push(samples: Float32Array) { this.listeners.forEach(l => l(samples)) }
}

function silence(n: number) { return new Float32Array(n) }
function tone(n: number, amp = 0.5) {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = Math.sin(i * 0.1) * amp
  return a
}

describe('AudioCaptureHelper', () => {
  let src: MockSource
  let helper: AudioCaptureHelper

  beforeEach(async () => {
    src = new MockSource()
    helper = new AudioCaptureHelper(src, { bufferSeconds: 60 })
    await helper.start()
  })

  it('returns null wav when no utterance has completed', () => {
    src.push(silence(8000))
    expect(helper.sliceMostRecentUtterance(30)).toBeNull()
  })

  it('returns wav for the most recent completed utterance', () => {
    src.push(silence(16000))         // 1s silence
    src.push(tone(32000))            // 2s tone
    src.push(silence(32000))         // 2s silence — closes utterance
    const wav = helper.sliceMostRecentUtterance(30)
    expect(wav).not.toBeNull()
    expect(wav!.subarray(0, 4).toString()).toBe('RIFF')
    // PCM data should be > 1s of audio
    const dataSize = wav!.readUInt32LE(40)
    expect(dataSize).toBeGreaterThan(16000 * 2 * 0.8)
  })

  it('caps lookback at maxSec', () => {
    src.push(silence(16000))
    src.push(tone(16000 * 10))       // 10 s tone
    src.push(silence(32000))
    const wav = helper.sliceMostRecentUtterance(3)
    expect(wav).not.toBeNull()
    const dataSize = wav!.readUInt32LE(40)
    // ≤ 3 s of PCM-16
    expect(dataSize).toBeLessThanOrEqual(16000 * 2 * 3 + 100)
  })
})
```

- [ ] **Step 3: Run, see fail**

```bash
npm test -- AudioCaptureHelper
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `AudioCaptureHelper.ts`**

Create `electron/AudioCaptureHelper.ts`:

```ts
import { Float32RingBuffer } from './audio/ringBuffer'
import { EnergyVad } from './audio/vad'
import { encodeWavPCM16 } from './audio/wavEncoder'
import type { PcmSource } from './audio/pcmSource'

export interface AudioCaptureHelperOptions {
  bufferSeconds: number
  vadOnsetMs?: number
  vadHangoverMs?: number
  vadThreshold?: number
}

export class AudioCaptureHelper {
  private readonly buffer: Float32RingBuffer
  private readonly vad: EnergyVad
  private readonly sampleRate: number

  constructor(
    private readonly source: PcmSource,
    opts: AudioCaptureHelperOptions,
  ) {
    this.sampleRate = source.sampleRate
    this.buffer = new Float32RingBuffer(this.sampleRate * opts.bufferSeconds)
    this.vad = new EnergyVad({
      sampleRate: this.sampleRate,
      frameMs: 20,
      onsetMs: opts.vadOnsetMs ?? 200,
      hangoverMs: opts.vadHangoverMs ?? 700,
      threshold: opts.vadThreshold ?? 0.02,
    })
    source.onFrame(frame => {
      this.buffer.append(frame)
      this.vad.feed(frame)
    })
  }

  async start(): Promise<void> { await this.source.start() }
  async stop(): Promise<void> { await this.source.stop() }
  isCapturing(): boolean { return this.source.isRunning() }

  sliceMostRecentUtterance(maxSec: number): Buffer | null {
    const u = this.vad.lastCompletedUtterance()
    if (!u) return null
    const maxSamples = Math.round(maxSec * this.sampleRate)
    const startAbs = Math.max(u.startAbs, u.endAbs - maxSamples)
    const samples = this.buffer.readBetween(startAbs, u.endAbs)
    if (!samples) return null
    return encodeWavPCM16(samples, this.sampleRate)
  }
}
```

- [ ] **Step 5: Run, expect pass**

```bash
npm test -- AudioCaptureHelper
```

Expected: PASS, all three tests.

- [ ] **Step 6: Commit**

```bash
git add electron/audio/pcmSource.ts electron/AudioCaptureHelper.ts electron/AudioCaptureHelper.test.ts
git commit -m "feat(audio): add AudioCaptureHelper composing ring buffer + VAD"
```

---

## Task 7: Whisper transcription wrapper

**Files:**
- Create: `electron/audio/whisper.ts`
- Test: `electron/audio/whisper.test.ts`

- [ ] **Step 1: Write failing test**

Create `electron/audio/whisper.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { transcribeWavWithWhisper } from './whisper'

const transcribeMock = vi.fn(async () => ({ text: 'hello world' }))

vi.mock('openai', () => ({
  OpenAI: class {
    audio = { transcriptions: { create: transcribeMock } }
  },
}))

describe('transcribeWavWithWhisper', () => {
  it('sends a wav buffer and returns text', async () => {
    const wav = Buffer.alloc(44 + 32000)
    wav.write('RIFF', 0)
    const text = await transcribeWavWithWhisper(wav, 'sk-test')
    expect(text).toBe('hello world')
    expect(transcribeMock).toHaveBeenCalledOnce()
    const args = transcribeMock.mock.calls[0][0]
    expect(args.model).toBe('whisper-1')
  })
})
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- whisper
```

Expected: FAIL.

- [ ] **Step 3: Implement `whisper.ts`**

Create `electron/audio/whisper.ts`:

```ts
import { OpenAI } from 'openai'
import { toFile } from 'openai/uploads'

export async function transcribeWavWithWhisper(
  wav: Buffer,
  apiKey: string,
): Promise<string> {
  const client = new OpenAI({ apiKey })
  const file = await toFile(wav, 'utterance.wav', { type: 'audio/wav' })
  const resp = await client.audio.transcriptions.create({
    model: 'whisper-1',
    file,
  })
  return resp.text
}
```

> **Note:** `openai/uploads` exports `toFile` which builds a `File`-like object accepted by the SDK. If your installed `openai` version doesn't expose this path, use `import { toFile } from 'openai'` instead.

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- whisper
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add electron/audio/whisper.ts electron/audio/whisper.test.ts
git commit -m "feat(audio): add Whisper transcription wrapper"
```

---

## Task 8: Add `processAudioQuestion` to ProcessingHelper

We append a new method to the existing 1387-line ProcessingHelper without restructuring. It transcribes the wav, asks the user-configured LLM to classify intent and answer, then pushes the result over IPC.

**Files:**
- Modify: `electron/ProcessingHelper.ts` (append new method)
- Test: `electron/ProcessingHelper.audio.test.ts`

- [ ] **Step 1: Read ProcessingHelper structure**

```bash
grep -n "class ProcessingHelper\|private.*OpenAI\|private.*Anthropic\|private.*genAI\|getMainWindow" electron/ProcessingHelper.ts | head -30
```

Note the class name, the LLM client field names, and how it pushes IPC events to the renderer (look for `webContents.send` calls).

- [ ] **Step 2: Write failing test**

Create `electron/ProcessingHelper.audio.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendMock = vi.fn()
const transcribeMock = vi.fn(async () => 'What is a binary tree?')
const llmMock = vi.fn(async () => 'intent: technical\nA binary tree is...')

vi.mock('./audio/whisper', () => ({
  transcribeWavWithWhisper: transcribeMock,
}))

describe('ProcessingHelper.processAudioQuestion', () => {
  beforeEach(() => {
    sendMock.mockClear()
    transcribeMock.mockClear()
    llmMock.mockClear()
  })

  it('transcribes, asks LLM, and emits audio:answer', async () => {
    const { ProcessingHelper } = await import('./ProcessingHelper')
    const fakeDeps = {
      getMainWindow: () => ({ webContents: { send: sendMock } } as any),
      getConfig: () => ({
        apiKey: 'sk-test',
        apiProvider: 'openai',
        solutionModel: 'gpt-4o-mini',
        audio: { enabled: true, hotkey: '', maxLookbackSeconds: 30, sttProvider: 'openai-whisper' },
      }),
      callLlmForAudio: llmMock,
    }
    const helper = new ProcessingHelper(fakeDeps as any)
    await helper.processAudioQuestion(Buffer.from('RIFFfakewav'))

    expect(transcribeMock).toHaveBeenCalledOnce()
    expect(llmMock).toHaveBeenCalledOnce()
    expect(sendMock).toHaveBeenCalledWith('audio:answer', expect.objectContaining({
      transcript: 'What is a binary tree?',
      intent: 'technical',
    }))
  })

  it('emits audio:error when transcription fails', async () => {
    transcribeMock.mockRejectedValueOnce(new Error('whisper down'))
    const { ProcessingHelper } = await import('./ProcessingHelper')
    const fakeDeps = {
      getMainWindow: () => ({ webContents: { send: sendMock } } as any),
      getConfig: () => ({
        apiKey: 'sk-test',
        apiProvider: 'openai',
        solutionModel: 'gpt-4o-mini',
        audio: { enabled: true, hotkey: '', maxLookbackSeconds: 30, sttProvider: 'openai-whisper' },
      }),
      callLlmForAudio: llmMock,
    }
    const helper = new ProcessingHelper(fakeDeps as any)
    await helper.processAudioQuestion(Buffer.from('RIFFfakewav'))
    expect(sendMock).toHaveBeenCalledWith('audio:error', expect.objectContaining({
      message: expect.stringContaining('whisper down'),
    }))
  })
})
```

- [ ] **Step 3: Run, see fail**

```bash
npm test -- ProcessingHelper.audio
```

Expected: FAIL.

- [ ] **Step 4: Append method to `ProcessingHelper.ts`**

Add these imports at the top of `electron/ProcessingHelper.ts` (place after existing imports):

```ts
import { transcribeWavWithWhisper } from './audio/whisper'
```

The existing constructor takes a `deps` object. Read its type definition (usually near the top, look for `interface IProcessingHelperDeps` or similar). Add these optional fields to that interface — without removing existing fields:

```ts
// Add to existing IProcessingHelperDeps interface
callLlmForAudio?: (transcript: string, cfg: any) => Promise<string>
```

Inside the `ProcessingHelper` class body, append a new method (before the closing `}` of the class):

```ts
public async processAudioQuestion(wav: Buffer): Promise<void> {
  const win = this.deps.getMainWindow()
  const cfg = this.deps.getConfig()
  if (!win) return

  const send = (channel: string, payload: any) => win.webContents.send(channel, payload)

  send('audio:status', { state: 'transcribing' })
  let transcript: string
  try {
    transcript = await transcribeWavWithWhisper(wav, cfg.apiKey)
  } catch (e: any) {
    send('audio:error', { message: `Transcription failed: ${e.message}` })
    return
  }

  send('audio:status', { state: 'answering' })
  let raw: string
  try {
    raw = this.deps.callLlmForAudio
      ? await this.deps.callLlmForAudio(transcript, cfg)
      : await this.callLlmForAudioDefault(transcript, cfg)
  } catch (e: any) {
    send('audio:error', { message: `LLM call failed: ${e.message}` })
    return
  }

  const intent = this.parseIntent(raw)
  const answer = this.stripIntentLine(raw)
  send('audio:answer', { transcript, answer, intent })
  send('audio:status', { state: 'idle' })
}

private parseIntent(raw: string): 'technical' | 'behavioral' | 'followup' | 'chitchat' | 'unclear' {
  const m = raw.match(/^\s*(?:\[?intent:?\s*)?(technical|behavioral|followup|chitchat|unclear)\]?/i)
  return (m ? m[1].toLowerCase() : 'unclear') as any
}

private stripIntentLine(raw: string): string {
  return raw.replace(/^\s*(?:\[?intent:?\s*)?(technical|behavioral|followup|chitchat|unclear)\]?\s*\n+/i, '').trim()
}

private async callLlmForAudioDefault(transcript: string, cfg: any): Promise<string> {
  const system = `You are a real-time interview assistant. The text below is the most recent thing the interviewer said (transcribed from system audio; minor errors possible).

Classify intent and respond:
- TECHNICAL question: give approach + runnable code (Python or JavaScript, LeetCode-style) with complexity.
- BEHAVIORAL/PROJECT question: give a 3-5 sentence STAR-format outline, key points bold.
- FOLLOWUP/clarification: give a 2-3 sentence direct response.
- CHITCHAT or feedback (not a question for you): reply "(似乎不是问题: <one-line summary>)".
- UNCLEAR / incomplete transcription: reply "(转写不完整,请重试)".

First line MUST be: intent: technical|behavioral|followup|chitchat|unclear
Then the answer body.`

  // Reuse existing LLM clients on `this`. Provider-specific calls follow the same
  // shape used by other methods in this file — pick the provider per cfg.apiProvider
  // and call the existing client with model = cfg.solutionModel.
  // The simplest path: route through the OpenAI client when apiProvider === 'openai',
  // and add stubs for 'anthropic'/'gemini' that throw "not yet wired" so we can
  // verify the test path first. Wider provider support comes in Task 9 follow-up.
  if (cfg.apiProvider === 'openai') {
    const { OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey: cfg.apiKey })
    const resp = await client.chat.completions.create({
      model: cfg.solutionModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: transcript },
      ],
    })
    return resp.choices[0]?.message?.content ?? ''
  }
  throw new Error(`Audio LLM provider '${cfg.apiProvider}' not yet supported; please switch to OpenAI for the audio feature.`)
}
```

- [ ] **Step 5: Run test, expect pass**

```bash
npm test -- ProcessingHelper.audio
```

Expected: PASS, both tests.

- [ ] **Step 6: Run full test suite**

```bash
npm test
```

Expected: ALL tests pass.

- [ ] **Step 7: Commit**

```bash
git add electron/ProcessingHelper.ts electron/ProcessingHelper.audio.test.ts
git commit -m "feat(audio): add processAudioQuestion to ProcessingHelper"
```

---

## Task 9: Wire IPC handlers and preload

**Files:**
- Modify: `electron/ipcHandlers.ts`
- Modify: `electron/preload.ts`

- [ ] **Step 1: Inspect existing IPC patterns**

```bash
grep -n "ipcMain\.handle\|ipcMain\.on\|contextBridge" electron/ipcHandlers.ts electron/preload.ts | head -30
```

Note the registration style — copy it exactly for new handlers.

- [ ] **Step 2: Add audio IPC handlers**

In `electron/ipcHandlers.ts`, find the function that registers handlers (typically `initializeIpcHandlers(deps)` or similar). Append these registrations alongside the existing ones:

```ts
ipcMain.handle('audio:start', async () => {
  await deps.audioCaptureHelper?.start()
  return { ok: true }
})

ipcMain.handle('audio:stop', async () => {
  await deps.audioCaptureHelper?.stop()
  return { ok: true }
})

ipcMain.handle('audio:answerNow', async () => {
  const helper = deps.audioCaptureHelper
  if (!helper) return { ok: false, reason: 'audio not initialized' }
  const cfg = deps.getConfig()
  const wav = helper.sliceMostRecentUtterance(cfg.audio.maxLookbackSeconds)
  if (!wav) {
    deps.getMainWindow()?.webContents.send('audio:error', {
      message: '没有最近的发言可用,请等面试官说话或调整回看时长。',
    })
    return { ok: false, reason: 'no utterance' }
  }
  await deps.processingHelper.processAudioQuestion(wav)
  return { ok: true }
})
```

Extend the `IIpcHandlerDeps` interface (or whatever the local name is) to include:

```ts
audioCaptureHelper?: import('./AudioCaptureHelper').AudioCaptureHelper
processingHelper: import('./ProcessingHelper').ProcessingHelper
```

- [ ] **Step 3: Expose IPC to renderer in `preload.ts`**

Locate the `contextBridge.exposeInMainWorld(...)` block and append to its object:

```ts
audio: {
  start: () => ipcRenderer.invoke('audio:start'),
  stop: () => ipcRenderer.invoke('audio:stop'),
  answerNow: () => ipcRenderer.invoke('audio:answerNow'),
  onStatus: (cb: (s: { state: string }) => void) => {
    const fn = (_: unknown, s: { state: string }) => cb(s)
    ipcRenderer.on('audio:status', fn)
    return () => ipcRenderer.removeListener('audio:status', fn)
  },
  onAnswer: (cb: (a: { transcript: string; answer: string; intent: string }) => void) => {
    const fn = (_: unknown, a: any) => cb(a)
    ipcRenderer.on('audio:answer', fn)
    return () => ipcRenderer.removeListener('audio:answer', fn)
  },
  onError: (cb: (e: { message: string }) => void) => {
    const fn = (_: unknown, e: any) => cb(e)
    ipcRenderer.on('audio:error', fn)
    return () => ipcRenderer.removeListener('audio:error', fn)
  },
},
```

If `preload.ts` uses a TypeScript declaration for `window.electronAPI`, also add the matching type entries (mirror the shape above). If no such declaration exists, skip — TypeScript in renderer will treat the new field as `any`.

- [ ] **Step 4: Type check**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

Expected: no errors. Fix any introduced.

- [ ] **Step 5: Commit**

```bash
git add electron/ipcHandlers.ts electron/preload.ts
git commit -m "feat(audio): expose audio IPC channels"
```

---

## Task 10: Register hotkey

**Files:**
- Modify: `electron/shortcuts.ts`

- [ ] **Step 1: Inspect existing shortcut registration**

```bash
grep -n "globalShortcut\|register\|accelerator" electron/shortcuts.ts | head -20
```

Note the registration pattern.

- [ ] **Step 2: Register Cmd+; for audio answer**

In `electron/shortcuts.ts`, find the function that calls `globalShortcut.register(...)`. Append:

```ts
const audioAccel = deps.getConfig().audio?.hotkey || 'CommandOrControl+;'
globalShortcut.register(audioAccel, () => {
  deps.getMainWindow()?.webContents.send('audio:status', { state: 'triggered' })
  // Trigger via IPC handler so the same code path runs as a renderer-initiated call.
  deps.triggerAudioAnswer?.()
})
```

Extend the deps type to include:

```ts
triggerAudioAnswer?: () => void
```

- [ ] **Step 3: Wire `triggerAudioAnswer` in main.ts**

Open `electron/main.ts`, find where `initializeShortcuts(...)` is called, and pass:

```ts
triggerAudioAnswer: async () => {
  const cfg = configHelper.loadConfig()
  const wav = audioCaptureHelper.sliceMostRecentUtterance(cfg.audio.maxLookbackSeconds)
  if (!wav) {
    mainWindow?.webContents.send('audio:error', { message: '没有最近发言' })
    return
  }
  await processingHelper.processAudioQuestion(wav)
},
```

(`audioCaptureHelper`, `processingHelper`, `configHelper`, `mainWindow` should all already be in scope at that point. If `audioCaptureHelper` is not yet instantiated, that happens in Task 12; for now passing `undefined` and guarding is fine.)

- [ ] **Step 4: Type check**

```bash
npx tsc -p tsconfig.electron.json --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add electron/shortcuts.ts electron/main.ts
git commit -m "feat(audio): register Cmd+; hotkey for audio answer"
```

---

## Task 11: Renderer audio panel UI

**Files:**
- Create: `src/_pages/AudioPanel.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the panel**

Create `src/_pages/AudioPanel.tsx`:

```tsx
import { useEffect, useState } from 'react'

type Status = 'idle' | 'capturing' | 'speaking' | 'transcribing' | 'answering' | 'triggered'

interface Answer {
  transcript: string
  answer: string
  intent: string
}

declare global {
  interface Window {
    // augment if a declaration already exists; otherwise this is `any`
    electronAPI?: any
  }
}

export function AudioPanel() {
  const [status, setStatus] = useState<Status>('idle')
  const [last, setLast] = useState<Answer | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const api = window.electronAPI?.audio
    if (!api) return
    const offStatus = api.onStatus((s: { state: Status }) => setStatus(s.state))
    const offAnswer = api.onAnswer((a: Answer) => { setLast(a); setError(null) })
    const offError = api.onError((e: { message: string }) => setError(e.message))
    return () => { offStatus?.(); offAnswer?.(); offError?.() }
  }, [])

  const dotColor =
    status === 'idle' ? 'bg-zinc-500' :
    status === 'capturing' ? 'bg-emerald-500' :
    status === 'speaking' ? 'bg-emerald-300 animate-pulse' :
    'bg-amber-400 animate-pulse'

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-3 text-sm text-zinc-100 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
        <span className="text-xs uppercase tracking-wide text-zinc-300">audio · {status}</span>
      </div>
      {error && (
        <div className="mb-2 rounded bg-red-900/40 px-2 py-1 text-xs text-red-200">{error}</div>
      )}
      {last && (
        <div className="space-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">问题转写 · {last.intent}</div>
            <div className="text-zinc-200">{last.transcript}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">回答</div>
            <div className="whitespace-pre-wrap text-zinc-100">{last.answer}</div>
          </div>
        </div>
      )}
      {!last && !error && (
        <div className="text-xs text-zinc-400">按 ⌘+; 让 AI 回答最近一段问题。</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Mount in App.tsx**

Open `src/App.tsx`. Find the top-level layout (look for the main `<div>`/`<Routes>` block). Add the import:

```tsx
import { AudioPanel } from './_pages/AudioPanel'
```

Render it as a fixed-position overlay alongside the existing UI:

```tsx
<div className="fixed bottom-3 right-3 w-[420px] max-h-[60vh] overflow-y-auto z-50">
  <AudioPanel />
</div>
```

- [ ] **Step 3: Run dev mode and visually verify panel renders**

```bash
npm run dev
```

Expected: Electron window shows the new panel in the bottom-right with status "idle" and the placeholder text.

- [ ] **Step 4: Commit**

```bash
git add src/_pages/AudioPanel.tsx src/App.tsx
git commit -m "feat(audio): add renderer audio panel UI"
```

---

## Task 12: Native Swift CLI for ScreenCaptureKit

This binary captures system audio and writes raw 16-kHz mono Float32 PCM to stdout. Tested standalone before being plugged into Electron.

**Files:**
- Create: `native/AudioCapture/Package.swift`
- Create: `native/AudioCapture/Sources/audio_capture/main.swift`
- Create: `native/AudioCapture/build.sh`
- Modify: `package.json` (add build:native script)

- [ ] **Step 1: Create the Swift package manifest**

Create `native/AudioCapture/Package.swift`:

```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
  name: "audio_capture",
  platforms: [.macOS(.v13)],
  targets: [
    .executableTarget(name: "audio_capture", path: "Sources/audio_capture"),
  ]
)
```

- [ ] **Step 2: Create `main.swift`**

Create `native/AudioCapture/Sources/audio_capture/main.swift`:

```swift
import Foundation
import AVFoundation
import ScreenCaptureKit

@MainActor
final class AudioCapturer: NSObject, SCStreamOutput, SCStreamDelegate {
  let outputQueue = DispatchQueue(label: "audio_capture.output")
  var stream: SCStream?

  func start() async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    guard let display = content.displays.first else {
      FileHandle.standardError.write("no display\n".data(using: .utf8)!)
      exit(2)
    }
    let bundleId = Bundle.main.bundleIdentifier ?? ""
    let excluded = content.applications.filter { $0.bundleIdentifier == bundleId }
    let filter = SCContentFilter(display: display, excludingApplications: excluded, exceptingWindows: [])

    let cfg = SCStreamConfiguration()
    cfg.capturesAudio = true
    cfg.sampleRate = 16000
    cfg.channelCount = 1
    // We don't actually want video; keep it tiny.
    cfg.width = 2
    cfg.height = 2
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)

    let s = SCStream(filter: filter, configuration: cfg, delegate: self)
    try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: outputQueue)
    try await s.startCapture()
    self.stream = s
  }

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard type == .audio, sampleBuffer.isValid,
          let bb = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }
    var lengthAtOffset = 0
    var totalLength = 0
    var dataPointer: UnsafeMutablePointer<Int8>?
    let r = CMBlockBufferGetDataPointer(bb, atOffset: 0, lengthAtOffsetOut: &lengthAtOffset, totalLengthOut: &totalLength, dataPointerOut: &dataPointer)
    guard r == kCMBlockBufferNoErr, let p = dataPointer else { return }
    // SCStream audio is 32-bit float interleaved. With channelCount=1 it's mono Float32.
    let data = Data(bytesNoCopy: p, count: totalLength, deallocator: .none)
    FileHandle.standardOutput.write(data)
  }

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    FileHandle.standardError.write("stream stopped: \(error)\n".data(using: .utf8)!)
    exit(3)
  }
}

let cap = AudioCapturer()
Task {
  do {
    try await cap.start()
  } catch {
    FileHandle.standardError.write("start failed: \(error)\n".data(using: .utf8)!)
    exit(4)
  }
}
RunLoop.main.run()
```

- [ ] **Step 3: Create build script**

Create `native/AudioCapture/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release
mkdir -p ../../assets/native
cp .build/release/audio_capture ../../assets/native/audio_capture
echo "Built: assets/native/audio_capture"
```

```bash
chmod +x native/AudioCapture/build.sh
```

- [ ] **Step 4: Add npm script**

In `package.json`, add to the `scripts` block:

```json
"build:native": "bash native/AudioCapture/build.sh"
```

- [ ] **Step 5: Build and smoke-test the binary**

```bash
npm run build:native
```

Expected: Binary written to `assets/native/audio_capture`.

Run it manually and verify it starts capturing (the first run will trigger a macOS screen-recording permission prompt — accept it):

```bash
./assets/native/audio_capture > /tmp/test.pcm &
PID=$!
sleep 5
kill $PID
ls -la /tmp/test.pcm
```

Expected: `/tmp/test.pcm` should be non-empty (~16000 samples * 4 bytes/sample * 5 sec = ~320 KB) if any audio was playing during capture. Empty file is OK if the system was silent.

Optional sanity check — convert to WAV and play:

```bash
ffmpeg -y -f f32le -ar 16000 -ac 1 -i /tmp/test.pcm /tmp/test.wav
afplay /tmp/test.wav
```

- [ ] **Step 6: Commit**

```bash
git add native/AudioCapture package.json
git commit -m "feat(audio): add Swift ScreenCaptureKit CLI for system audio"
```

---

## Task 13: Subprocess PCM source + wire into main

**Files:**
- Create: `electron/audio/subprocessPcmSource.ts`
- Test: `electron/audio/subprocessPcmSource.test.ts`
- Modify: `electron/main.ts`

- [ ] **Step 1: Write failing test (with a fake binary)**

Create `electron/audio/subprocessPcmSource.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SubprocessPcmSource } from './subprocessPcmSource'
import * as path from 'node:path'
import * as fs from 'node:fs'
import * as os from 'node:os'

describe('SubprocessPcmSource', () => {
  it('reads PCM Float32 from stdout and emits frames', async () => {
    // Create a tiny fake binary that writes 4 KB of zero PCM then exits.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcmsrc-'))
    const fake = path.join(tmp, 'fake.sh')
    fs.writeFileSync(fake, '#!/usr/bin/env bash\nhead -c 4096 /dev/zero\n', { mode: 0o755 })

    const src = new SubprocessPcmSource({ binaryPath: fake, sampleRate: 16000 })
    let total = 0
    src.onFrame(f => { total += f.length })
    await src.start()
    // wait for child to finish
    await new Promise(r => setTimeout(r, 200))
    await src.stop()
    expect(total).toBe(1024) // 4096 bytes / 4 bytes per Float32 = 1024 samples
  })
})
```

- [ ] **Step 2: Run, see fail**

```bash
npm test -- subprocessPcmSource
```

Expected: FAIL.

- [ ] **Step 3: Implement `subprocessPcmSource.ts`**

Create `electron/audio/subprocessPcmSource.ts`:

```ts
import { spawn, ChildProcess } from 'node:child_process'
import type { PcmSource, PcmFrameListener } from './pcmSource'

export interface SubprocessPcmSourceOptions {
  binaryPath: string
  args?: string[]
  sampleRate: number
}

export class SubprocessPcmSource implements PcmSource {
  readonly sampleRate: number
  private readonly listeners: PcmFrameListener[] = []
  private child: ChildProcess | null = null
  private leftover = Buffer.alloc(0)

  constructor(private readonly opts: SubprocessPcmSourceOptions) {
    this.sampleRate = opts.sampleRate
  }

  onFrame(l: PcmFrameListener): void { this.listeners.push(l) }

  isRunning(): boolean { return this.child !== null && !this.child.killed }

  async start(): Promise<void> {
    if (this.isRunning()) return
    const child = spawn(this.opts.binaryPath, this.opts.args ?? [], { stdio: ['ignore', 'pipe', 'pipe'] })
    this.child = child
    child.stdout!.on('data', (chunk: Buffer) => this.handleChunk(chunk))
    child.stderr!.on('data', (chunk: Buffer) => {
      console.warn('[audio_capture]', chunk.toString().trim())
    })
    child.on('exit', code => {
      if (code !== 0 && code !== null) console.warn('[audio_capture] exited with', code)
      this.child = null
    })
  }

  async stop(): Promise<void> {
    if (!this.child) return
    this.child.kill('SIGTERM')
    this.child = null
  }

  private handleChunk(chunk: Buffer): void {
    const merged = Buffer.concat([this.leftover, chunk])
    const usable = merged.length - (merged.length % 4)
    const frame = new Float32Array(merged.buffer, merged.byteOffset, usable / 4)
    // Copy because the underlying Buffer may be reused.
    const copy = new Float32Array(frame.length)
    copy.set(frame)
    this.leftover = Buffer.from(merged.subarray(usable))
    if (copy.length > 0) this.listeners.forEach(l => l(copy))
  }
}
```

- [ ] **Step 4: Run, expect pass**

```bash
npm test -- subprocessPcmSource
```

Expected: PASS.

- [ ] **Step 5: Wire into main.ts**

Open `electron/main.ts`. After existing helpers are constructed and `mainWindow` is ready, add:

```ts
import { SubprocessPcmSource } from './audio/subprocessPcmSource'
import { AudioCaptureHelper } from './AudioCaptureHelper'
import * as path from 'node:path'

// pick the right binary path for dev vs packaged
function audioBinaryPath(): string {
  const dev = path.join(process.cwd(), 'assets', 'native', 'audio_capture')
  if (process.env.NODE_ENV === 'development') return dev
  return path.join(process.resourcesPath, 'native', 'audio_capture')
}

const audioSource = new SubprocessPcmSource({
  binaryPath: audioBinaryPath(),
  sampleRate: 16000,
})
const audioCaptureHelper = new AudioCaptureHelper(audioSource, { bufferSeconds: 60 })

// Auto-start if config has it enabled
if (configHelper.loadConfig().audio.enabled) {
  audioCaptureHelper.start().catch(e => console.warn('audio start failed', e))
}
```

Pass `audioCaptureHelper` into `initializeIpcHandlers(...)` and `initializeShortcuts(...)` (the deps objects you extended in Task 9 and Task 10).

In the `electron-builder` `build.extraResources` array (in `package.json`), add the binary so it's packaged:

```json
{ "from": "assets/native", "to": "native", "filter": ["**/*"] }
```

- [ ] **Step 6: Type check + run dev**

```bash
npx tsc -p tsconfig.electron.json --noEmit
npm run build:native
npm run dev
```

Expected: app starts; if you grant screen recording permission and have audio playing on the system, watching DevTools console you should see no errors. The audio panel should still render.

- [ ] **Step 7: Commit**

```bash
git add electron/audio/subprocessPcmSource.ts electron/audio/subprocessPcmSource.test.ts electron/main.ts package.json
git commit -m "feat(audio): wire ScreenCaptureKit subprocess into main process"
```

---

## Task 14: End-to-end manual verification

No automated test — drive the full flow manually.

**Files:** none

- [ ] **Step 1: Build native + start app**

```bash
npm run build:native
npm run dev
```

Grant screen-recording permission when macOS prompts (System Settings → Privacy & Security → Screen Recording → enable Electron/Interview Coder).

- [ ] **Step 2: Enable audio capture**

In a temporary REPL or via the renderer DevTools console:

```js
window.electronAPI.audio.start()
```

The status pill should turn green ("capturing").

- [ ] **Step 3: Play a sample interview question**

In another browser tab, open YouTube and play a 30-second clip of someone saying a coding interview question (e.g., "Implement a function that reverses a linked list"). After they finish, wait ~1 second.

- [ ] **Step 4: Press Cmd+;**

Within ~5 seconds, expect:
- Status pill flashes amber ("transcribing" → "answering")
- Audio panel shows the transcript and the AI's answer
- Intent should be "technical"

- [ ] **Step 5: Verify no impact on a real video call**

- Open Zoom, start a meeting (alone), turn on speakers + mic.
- Talk to yourself; verify Zoom records your voice as before.
- Confirm the audio panel transcript is *empty for your own voice* (Zoom plays your voice through speakers in some configurations — if so, that's expected; the spec says we capture interviewer side, which means anything that comes out of the speakers).

- [ ] **Step 6: Document any deviations**

If anything diverged from the spec, append a "Verification notes" section to the spec file (`docs/superpowers/specs/2026-05-31-voice-interview-helper-design.md`) and commit.

```bash
git add docs/superpowers/specs/2026-05-31-voice-interview-helper-design.md
git commit -m "docs: verification notes from voice helper E2E"
```

---

## Task 15: Polish — VAD threshold auto-calibration (optional, only if Task 14 reveals false positives or missed starts)

If §12 in the spec's "待办的不确定项" surfaces (interviewer voice missed or background hum tripping VAD), implement a 1-second silence calibration that runs at start.

**Files:**
- Modify: `electron/audio/vad.ts`
- Modify: `electron/AudioCaptureHelper.ts`

- [ ] **Step 1: Add calibration mode to EnergyVad**

Add a method `calibrateFromBaseline(rmsValues: number[])` that sets `threshold = max(rmsValues) * 4`.

- [ ] **Step 2: Use it in AudioCaptureHelper**

For the first 1 s of frames, record RMS; after, call `calibrateFromBaseline` and clear the recorded list.

- [ ] **Step 3: Test + commit**

Add a focused test that feeds 1 s of low-noise floor + 1 s of speech and verifies the start fires. Commit.

---

## Self-Review

**Spec coverage check (against `docs/superpowers/specs/2026-05-31-voice-interview-helper-design.md`):**

| Spec section | Covered by |
|---|---|
| §3 user scenario steps 1–8 | Tasks 12 (capture), 6 (buffer+VAD), 9-10 (hotkey+IPC), 8 (transcribe+LLM), 11 (UI) |
| §4 architecture diagram | Tasks 6, 8, 12, 13 |
| §5.1 native module | Task 12 (Swift CLI) — note: spec said N-API; plan switched to subprocess CLI for simplicity. **Document this delta in the spec after Task 12.** |
| §5.2 AudioCaptureHelper | Tasks 4, 5, 6 |
| §5.3 ProcessingHelper.processAudioQuestion | Task 8 |
| §5.4 shortcuts | Task 10 |
| §5.5 IPC channels | Task 9 |
| §5.6 ConfigHelper.audio | Task 2 |
| §5.7 renderer UI | Task 11 |
| §6 LLM intent prompt | Task 8 (verbatim in `callLlmForAudioDefault`) |
| §7 no third-party impact | Task 14 step 5 (manual verification) |
| §8 privacy: no persistence | Implicit — buffer is in-memory; nothing writes to disk |
| §10 testing strategy | Tasks 3-8, 13 (unit); Task 14 (manual E2E) |
| §11 YAGNI list | All deferred items remain deferred |
| §12 unknowns | (a) ScreenCaptureKit self-exclusion verified in Task 12; (b) napi vs subprocess decided in plan = subprocess; (c) hotkey conflict surfaces in Task 14 |

**Delta from spec:** §5.1 says "N-API + Swift native module"; plan uses Swift CLI subprocess instead. Reason: subprocess is simpler, decoupled from Electron version, testable standalone. Update spec §5.1 accordingly when Task 12 lands.

**Placeholder scan:** No "TBD", no "implement later", no "similar to". Each step has runnable code or exact commands. ✅

**Type consistency:** `AudioCaptureHelper.sliceMostRecentUtterance(maxSec)` returns `Buffer | null` everywhere it's used (Tasks 6, 9, 10, 13). `transcribeWavWithWhisper(wav, apiKey)` signature stable. Audio config block shape stable (Task 2 → used in Tasks 8, 9, 10, 13). ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-31-voice-interview-helper.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
