// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

import ScreenshotQueue from "../components/Queue/ScreenshotQueue"

import { ProblemStatementData } from "../types/solutions"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"
import { useToast } from "../contexts/toast"
import { COMMAND_KEY } from "../utils/platform"

// 处理 ** 之间的文本，用不同颜色显示
const formatContent = (text: string) => {
  return text.replace(/\*\*(.*?)\*\*/g, '<span class="text-yellow-300 font-medium">$1</span>');
};

export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => {
  return (
    <div className="space-y-2">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        {title}
      </h2>
      {isLoading ? (
        <div className="mt-4 flex">
          <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
            Extracting problem statement...
          </p>
        </div>
      ) : (
        <div 
          className="text-[13px] leading-[1.0] text-gray-100 max-w-[600px] whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ 
            __html: typeof content === 'string' ? formatContent(content) : String(content) 
          }}
        />
      )}
    </div>
  );
}
const SolutionSection = ({
  title,
  content,
  isLoading,
  currentLanguage
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
  currentLanguage: string
}) => {
  const [copied, setCopied] = useState(false)
  const [searchTerm, setSearchTerm] = useState("");
  const [isScrollable, setIsScrollable] = useState(true);

  const copyToClipboard = () => {
    if (typeof content === "string") {
      navigator.clipboard.writeText(content).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  // 高亮函数：将匹配的关键词用 <mark> 包裹，第一个匹配加 id
  const highlightLine = (line: string, keyword: string, matchIndexRef: { current: number }) => {
    if (!keyword) return line;
    try {
      const regex = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi");
      return line.replace(regex, (match) => {
        if (matchIndexRef.current === 0) {
          matchIndexRef.current++;
          return `<mark id=\"code-search-match\" style=\"background: #ffe066; color: #000;\">${match}</mark>`;
        }
        matchIndexRef.current++;
        return `<mark style=\"background: #ffe066; color: #000;\">${match}</mark>`;
      });
    } catch {
      return line;
    }
  };

  // 用于行级高亮
  const matchIndexRef = { current: 0 };
  const getLineProps = (lineNumber: number) => {
    return {
      style: {},
      dangerouslySetInnerHTML:
        typeof content === 'string' && searchTerm
          ? { __html: highlightLine((content as string).split('\n')[lineNumber - 1] || '', searchTerm, matchIndexRef) }
          : undefined
    };
  };

  return (
    <div className="space-y-2 relative">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        {title}
      </h2>
      {/* 搜索输入框 */}
      <div className="mb-2 flex items-center gap-2">
        <input
          type="text"
          placeholder="Search in code..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              setTimeout(() => {
                const el = document.getElementById('code-search-match');
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 0);
            }
          }}
          className="px-2 py-1 rounded bg-white/10 text-white text-xs border border-white/20 focus:outline-none focus:ring-2 focus:ring-yellow-300"
          style={{ width: 180 }}
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="text-xs text-gray-300 hover:text-white"
          >
            Clear
          </button>
        )}
        <button
          onClick={() => setIsScrollable((prev) => !prev)}
          className="text-xs text-gray-300 hover:text-white border border-white/20 rounded px-2 py-1 bg-white/5"
        >
          {isScrollable ? "关闭滚动条" : "开启滚动条"}
        </button>
      </div>
      {isLoading ? (
        <div className="space-y-1.5">
          <div className="mt-4 flex">
            <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
              Loading solutions...
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full relative">
          <button
            onClick={copyToClipboard}
            className="absolute top-2 right-2 text-xs text-white bg-white/10 hover:bg-white/20 rounded px-2 py-1 transition"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          {/* 用 dangerouslySetInnerHTML 渲染高亮后的代码 */}
          <div style={{ position: 'relative' }}>
            <SyntaxHighlighter
              showLineNumbers
              language={currentLanguage == "golang" ? "go" : currentLanguage}
              style={dracula}
              customStyle={{
                maxWidth: "100%",
                margin: 0,
                padding: "1rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                backgroundColor: "rgba(22, 27, 34, 0.5)",
                maxHeight: isScrollable ? 400 : 'none',
                overflow: isScrollable ? 'auto' : 'visible',
              }}
              wrapLongLines={true}
              wrapLines={true}
              lineProps={getLineProps}
            >
              {typeof content === 'string' ? content : ''}
            </SyntaxHighlighter>
          </div>
        </div>
      )}
    </div>
  )
}

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => {
  // Helper to ensure we have proper complexity values
  const formatComplexity = (complexity: string | null): string => {
    // Default if no complexity returned by LLM
    if (!complexity || complexity.trim() === "") {
      return "Complexity not available";
    }

    const bigORegex = /O\([^)]+\)/i;
    // Return the complexity as is if it already has Big O notation
    if (bigORegex.test(complexity)) {
      return complexity;
    }
    
    // Concat Big O notation to the complexity
    return `O(${complexity})`;
  };
  
  const formattedTimeComplexity = formatComplexity(timeComplexity);
  const formattedSpaceComplexity = formatComplexity(spaceComplexity);
  
  return (
    <div className="space-y-2">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        Complexity
      </h2>
      {isLoading ? (
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          Calculating complexity...
        </p>
      ) : (
        <div className="space-y-3">
          <div className="text-[13px] leading-[1.4] text-gray-100 bg-white/5 rounded-md p-3">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Time:</strong> {formattedTimeComplexity}
              </div>
            </div>
          </div>
          <div className="text-[13px] leading-[1.4] text-gray-100 bg-white/5 rounded-md p-3">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Space:</strong> {formattedSpaceComplexity}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface SolutionsProps {
  setView: (view: "queue" | "solutions" | "debug") => void
  credits: number
  currentLanguage: string
  setLanguage: (language: string) => void
}
const Solutions: React.FC<SolutionsProps> = ({
  setView,
  credits,
  currentLanguage,
  setLanguage
}) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  const [debugProcessing, setDebugProcessing] = useState(false)
  const [problemStatementData, setProblemStatementData] =
    useState<ProblemStatementData | null>(null)
  const [solutionData, setSolutionData] = useState<string | null>(null)
  const [ideaData, setIdeaData] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )
  const [isIdeaCollapsed, setIsIdeaCollapsed] = useState(false)

  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)

  interface Screenshot {
    id: string
    path: string
    preview: string
    timestamp: number
  }

  const [extraScreenshots, setExtraScreenshots] = useState<Screenshot[]>([])
  const [noScreenshotsText, setNoScreenshotsText] = useState<string>("")

  useEffect(() => {
    const fetchScreenshots = async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        console.log("Raw screenshot data:", existing)
        const screenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        console.log("Processed screenshots:", screenshots)
        setExtraScreenshots(screenshots)
      } catch (error) {
        console.error("Error loading extra screenshots:", error)
        setExtraScreenshots([])
      }
    }

    fetchScreenshots()
  }, [solutionData])

  const { showToast } = useToast()

  useEffect(() => {
    // Height update logic
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(async () => {
        try {
          const existing = await window.electronAPI.getScreenshots()
          const screenshots = (Array.isArray(existing) ? existing : []).map(
            (p) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now()
            })
          )
          setExtraScreenshots(screenshots)
        } catch (error) {
          console.error("Error loading extra screenshots:", error)
        }
      }),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true)

        // Remove queries
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["new_solution"]
        })

        // Reset screenshots
        setExtraScreenshots([])

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onSolutionStart(() => {
        // Every time processing starts, reset relevant states
        setSolutionData(null)
        setIdeaData(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)
      }),
      window.electronAPI.onProblemExtracted((data: any) => {
        queryClient.setQueryData(["problem_statement"], data)
      }),
      //if there was an error processing the initial solution
      window.electronAPI.onSolutionError((error: string) => {
        showToast("Processing Failed", error, "error")
        // Reset solutions in the cache (even though this shouldn't ever happen) and complexities to previous states
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          idea: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
        } | null
        if (!solution) {
          setView("queue")
        }
        setSolutionData(solution?.code || null)
        setIdeaData(solution?.idea || null)
        setThoughtsData(solution?.thoughts || null)
        setTimeComplexityData(solution?.time_complexity || null)
        setSpaceComplexityData(solution?.space_complexity || null)
        console.error("Processing error:", error)
      }),
      //when the initial solution is generated, we'll set the solution data to that
      window.electronAPI.onSolutionSuccess((data: any) => {
        if (!data) {
          console.warn("Received empty or invalid solution data")
          return
        }
        console.log({ data })
        const solutionData = {
          code: data.code,
          idea: data.idea,
          thoughts: data.thoughts,
          time_complexity: data.time_complexity,
          space_complexity: data.space_complexity
        }

        queryClient.setQueryData(["solution"], solutionData)
        setSolutionData(solutionData.code || null)
        setIdeaData(solutionData.idea || null)
        setThoughtsData(solutionData.thoughts || null)
        setTimeComplexityData(solutionData.time_complexity || null)
        setSpaceComplexityData(solutionData.space_complexity || null)

        // Fetch latest screenshots when solution is successful
        const fetchScreenshots = async () => {
          try {
            const existing = await window.electronAPI.getScreenshots()
            const screenshots = existing.previews?.map((p: any) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now()
            })) || []
            setExtraScreenshots(screenshots)
          } catch (error) {
            console.error("Error loading extra screenshots:", error)
            setExtraScreenshots([])
          }
        }
        fetchScreenshots()
      }),

      //########################################################
      //DEBUG EVENTS
      //########################################################
      window.electronAPI.onDebugStart(() => {
        //we'll set the debug processing state to true and use that to render a little loader
        setDebugProcessing(true)
      }),
      //the first time debugging works, we'll set the view to debug and populate the cache with the data
      window.electronAPI.onDebugSuccess((data: any) => {
        queryClient.setQueryData(["new_solution"], data)
        setDebugProcessing(false)
      }),
      //when there was an error in the initial debugging, we'll show a toast and stop the little generating pulsing thing.
      window.electronAPI.onDebugError(() => {
        showToast(
          "Processing Failed",
          "There was an error debugging your code.",
          "error"
        )
        setDebugProcessing(false)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no extra screenshots to process.",
          "neutral"
        );
        const text = `营销中台——活动运营引擎搭建
【项目描述】 在国际化营销场景下，为满足拉新、促活等多样化需求，构建了一套统一的营销活动引擎。核心以TCA（事件触发满足条件动作执行）为基础组件，TCA排列组合形成step单元，step之间通过前后继关联形成的活动图模型。【项目职责】
高可用
* 高可用动作执模块设计与落地
    * 高吞吐设计：将动作模块作为流量积压缓冲池，避免上游计算模块因下游瓶颈阻塞；通过MQ异步队列与“两阶段执行机制”（预执行入队+真正执行），实现动作执行与计算解耦；通过流量打标，区分异步定时和实时流量，通过优先级队列保障高优先级任务执行；动作模块设计保障了系统具有高吞吐量，支撑日均亿级调用和稳定消峰。
    * 多维幂等机制保障数据一致性：通过状态持久化+MQ版本号控制，保障多阶段系统中消息重入、乱序场景下的幂等执行；结合逻辑版本号支持失败补偿；使用KV数据库存储中间状态，实现幂等判断与数据感知查询。
    * 重试补偿保障机制：支持限流无限重试、执行失败有限重试多种重试机制；通过分钟级随机抖动+优先级重试队列保障高优先级重试任务；建立异常情况报警+人工补偿机制，通过fusion存储、hive落盘数据支持不同时间范围的数据补偿。
    * 工厂化插件机制：设计标准化插件接口 + 动态注册工厂机制，支持动作模块按需插拔，新增动作只需实现标准接口并注册即可，无需改动主流程代码；提升了系统扩展性与工程规范统一性和研发效率。
【项目成果】
系统支持日均亿级别动作调用量项目上线后，在多个国家和地区的营销推广活动中稳定运行，支撑千万级用户参与的复杂活动流程。
建立了完善的异常处理与数据补偿机制，实现分钟级异常感知与跨周期数据回溯，确保营销活动稳定执行。


高可用、高幂等、高吞吐
（高吞吐亮点）
积压在动作模块，避免上游计算延迟 （流量消峰架构）
* 不将积压留在引擎计算模块，而是将动作模块作为“流量缓冲池”；
* 避免同步链路阻塞，保障上游服务性能；
* 支持异步队列 + 两阶段处理架构，实现流量解耦和峰值削减。
两阶段执行机制（预执行队列 + 真正执行）
* 阶段一写入预执行队列，仅存储必要上下文；
* 阶段二才触发实际下游调用；
替代方案	描述	弊端
积压在上游计算模块	上游计算完成后阻塞等待动作执行	同步链路易被阻塞，延迟传播，计算模块雪崩
一阶段直接执行	到了就执行	无法缓冲突发流量，高峰时接口挂掉
统一异步 MQ 执行	所有事件全进 MQ，MQ 后直接调用	缺乏调度控制，无法优先级处理 + 无法感知处理上下文阶段


（数据一致性）亮点：多维幂等保障
状态持久化
动作执行状态会写入fusion，作为幂等判断和流程协同的核心数据源。

多维幂等保障
通过 flag_index版本号控制 MQ 消息唯一执行，通过 op_index 版本号保证同 UUID 逻辑幂等。
	消费级幂等保障：每条 MQ 消息到达都查询fusion校验flag_index，执行前比对一致性，只允许执行一次；每次执行flag_idx会加1，如果发生重试时会根据新的flag_idx进行校验。
	逻辑幂等保障：op_index可以支持同一个UUID的失败后的补偿执行、同一个UUID的多次执行等。	

替代方案	描述	弊端
使用单一幂等标识	UUID控制所有幂等行为	无法区分“消息重复”和“业务补偿”，逻辑混乱
不做逻辑幂等	失败后靠人工补偿	容易造成动作重复发券、重复触达，成本高
依赖下游幂等	下游自行幂等判断	自身不可控，最终一致性弱，排查复杂


（高可用性亮点）亮点
多样的重试机制
失败有限重试，限流无限重试。根据事件类型（在线/定时）优先级，决定重试延迟时间。
在线流量重试时间短，定时任务重试时间间隔较长，通过随机抖动打散流量。

超时报警机制
动作执行成功或者失败后，动作模块会回调上游引擎，如果长时间未回调，会有报警。

定时补偿机制
根据uuid查出当时的上下文，当动作是执行中、执行失败，可以重复执行。
替代方案	描述	弊端
统一使用有限重试	超过次数就放弃	会丢掉流量，影响核心动作（发券、发通知）
无优先级重试控制	重试任务全部 FIFO	高优任务被低优淹没，导致 SLA 不达标
手动补偿为主	无系统补偿机制	人工代价高，补偿粒度粗，时效差



难点：保证幂等和数据一致性 —— 有哪些典型场景会导致一致性问题？
📌 场景 1：写入预执行队列成功，但写状态失败
* 问题描述：预执行入队成功，但写 Fusion 状态失败；
* 可能后果：MQ 消息存在，但状态丢失，无法判断是否执行过；
* 应对机制：
    * ⚙️ 流程顺序反转：先写 Fusion，成功后才入队；
    * ❌ 任何一步失败即视为本次请求失败，主动上抛，上游重试；
    * ✅ 保证请求的幂等与状态原子性。

📌 场景 2：预执行队列写入成功，但未消费 / 中断消费
* 问题描述：动作模块未及时消费，或消费失败、被 kill；
* 风险点：动作迟迟未执行，流程卡死；
* 应对机制：
    * 🔔 超时报警机制：预设超时时间，若长时间无消费 → 报警；
    * ⛓️ 上游链路阻塞感知：引擎模块可监测队列未回调，视为流程未闭环；
    * 🛠️ 支持定时补偿与重试消费。

📌 场景 3：动作执行成功，但写入执行状态失败
* 问题描述：动作已实际完成，但 fusion 状态未更新；
* 风险点：无法准确识别已完成，可能重复执行；
* 应对机制：
    * 🔁 fusion 写状态失败自动重试；
    * ⏱️ 失败记录入专用重试队列，定期回写状态；
    * 📣 超时无状态回调触发报警，由人工或系统查补；
    * 🧾 执行日志同步 ES + Hive，便于事后查询 & 补偿判断。

📌 场景 4：上游重复下发同一 UUID 请求
* 问题描述：上游模块因重试、网络抖动等，再次发送相同 UUID；
* 风险点：动作模块二次处理 → 重复发券、发短信等；
* 应对机制：
    * 🔐 动作模块入队前幂等校验（如 Redis）；
    * 🧠 使用 flag_index 校验每次请求是否是“当前最新版本”。

📌 场景 5：KV 与 ES 状态不一致
* 问题描述：状态写入 Fusion（KV）成功，但写 ES 日志失败或延迟；
* 风险点：排查视角受限，但不影响业务执行；
* 应对机制：
    * ✅ Fusion 为唯一“判定真值”的状态源；
    * 🔍 ES 日志为辅助排查手段，不依赖其一致性；
    * 🕵️ 定时任务刷新 ES 状态用于最终日志对齐。


问题
一、幂等性与一致性控制类

1. 为什么需要同时使用 flag_index 和 op_index，能不能合成一个？
flag_index 保证每条 MQ 消息只执行一次（消费级幂等），op_index 支持同 UUID 的失败补偿与逻辑多次执行，职责不同，不可合并。

2. UUID 是怎么生成的？
通常由 uid + canvas_id + step_id + 轮次 + 执行次数 组成，确保唯一标识本次动作。

3. 如何保证在 MQ 消息重入、乱序、并发消费等情况下只执行一次？
使用锁机制保证并发安全；消费前查询 Fusion 校验 flag_index 版本号，只允许执行一次。

4. 执行成功但写状态失败，是否会导致重复执行？怎么处理？
有专门的状态写入重试队列；写失败后记录失败上下文，后续自动重试或通过状态判断避免重复执行。

5. Fusion 状态与 ES 日志不一致怎么办？谁为准？会不会导致错误？
以 Fusion 状态为主，ES 为辅助排查；不会直接影响主流程，通常无需修复。

二、异常补偿与恢复机制类
6. 多阶段链路中动作模块挂了如何补偿？如计算模块 → 动作模块 → 下游服务
若动作模块挂了，计算模块记录失败事件并落 ES/Hive；动作模块恢复后可从 Hive 中回放；若计算模块也挂，则核心事件也已入库，后续有手动或自动重触发机制。

7. 人工补偿是怎么定位数据的？op_index 在补偿中起什么作用？
通过 UUID 定位失败数据，op_index 支持“同 UUID 补偿场景”的幂等控制，防止多次执行同一次失败补偿。

三、失败重试机制、限流机制与高并发保护类
8. 什么情况会触发失败重试？有哪些失败策略？为什么要抖动？
常见场景：HTTP超时、下游异常、业务分支失败等；策略为：有限重试 + 抖动机制防止短时间聚集流量打爆系统。

9. 限流失败为什么要无限重试？不会导致系统雪崩吗？怎么防止？
限流是资源保护，不代表逻辑失败，必须保证最终执行；防雪崩策略包括：随机抖动 + 可控速重试队列 + 限量告警。

10. 不同优先级事件限流时如何差异化处理？怎么避免低优先级饿死？
异步实时流 > 异步定时流 > 异步延迟流；结合优先级队列调度，实时流始终优先保障，定时流支持打散等待。



营销中台——配置能力建设
【项目背景】在引擎模型的迭代过程中，TCA 组件的接入依赖于手动开发，效率较低，难以适应快速变化的业务需求。因此，需要构建一套高度配置化的平台，支持通过页面直接接入各种组。以及提供一系列通用的工具和能力，以提升开发效率和系统灵活性。
【项目职责】
* TCA 组件配置化平台设计与落地
    * 基础配置功能搭建：主导设计通用组件配置数据结构，事件组件支持条件过滤、字段筛选与可配置的时间窗口去重机制等，条件和动作组件支持请求参数、结果判定配置。构建多维参数取值机制，支持多数据源和默认值容错机制，提升组件通用性与执行灵活性。前端支持 JSON 配置一键解析与字段树渲染，极大提升配置效率；字段标准化入库管理，防止字段无限扩张，极大提高了执行模块的可维护性。
    * 配置治理与发布保障：实现平台级配置管理与发布能力，支持多环境配置隔离、版本管理与快速回滚；通过状态机控制配置生命周期，避免错误配置上线；支持配置diff与自动化测试，提升配置变更的安全性。
    * 动态配置加载与高并发稳定性：配置获取采用服务端版本控制+各模块定时拉取机制，实现配置动态热更新与不同环境的版本隔离。事件模块基于Redis实现UUID去重，条件动作模块支持统一HTTP调用与结果处理，接入限流、失败重试机制，保障高并发场景下的稳定执行。平台支持发布前的自动化测试，与真实组件隔离，提升发布前测试的独立性和安全性。
    * 构建开放式引擎配置平台：事件清洗后高效写入MQ，支持多业务方并发消费，实现事件数据跨场景共享与复用；动作模块提供执行与结果查询接口，支持业务方调用，复用限流、重试保障等中台能力。
【项目成果】
- [ ] 独立负责平台的前后端交互与引擎能力开发，推动配置化平台从 0 到 1 的落地。组件接入效率大幅提升，平均每个组件整体接入时间由 2 天缩短至 1 小时。
- [ ] 平台已支持接入 500+ 事件/条件/动作组件，覆盖国际化出行、外卖、金融等多条业务线，稳定支撑日均千万级配置调用与解析请求，显著提升营销引擎的灵活性、可维护性与研发效率。
 


你在设计组件配置数据结构时，如何兼顾通用性与扩展性？是否考虑过 JSON Schema 或 DSL 的方案？为什么？
1、结构设计：前后端统一的可插拔结构化数据：比如页面是过滤条目，展示是列表，后端就有一个filter字段，数组结构和它对应。字段不仅有业务含义，也带有可视化渲染信息
2、可扩展性设计
	数据类型需要考虑使用对象和数组，确定性数据使用对象，不确定性可使用数组。
	支持默认值、字段映射、容错机制，适配不同业务方的数据上下文。


你提到多维参数取值机制支持多数据源与默认值容错，可以详细介绍下这个机制的具体实现方式和场景吗？
多维参数取值包括：取mq事件里的字段、自定义函数获取（可以写计算逻辑和第三方调用）、活动模板里写死数据获取、数据路径不存在时可使用默认值填充。


配置治理与发布保障方面，你们是如何实现配置diff 和自动化测试的？这些能力如何嵌入到 CI/CD 流程中？
1、我们没有直接使用通用的 JSON diff 工具，而是手动编写了配置结构的对比逻辑，原因是配置数据是结构化的，字段多、层级深，用通用工具容易漏掉核心变化或误报。
2、基于每个组件的数据结构做字段级对比，比如对比 字段新增/修改/删除；，对比结果按组件维度进行列表展示

自动化测试：组件测试和整体测试
组件测试：事件、条件和动作都有对应的mock接口，通过mock接口获取单个组件的测试结果，事件查看过滤清洗的结果、条件动作可以看配置调用下游是否成功。
整体测试：配置单step测试活动，触发事件绑定指定活动执行，前端循环查询执行结果。后端也会有定时任务清理过期的自动化case。



前端是如何实现 JSON 配置解析与字段树渲染的？在渲染复杂字段时有遇到什么性能或交互问题吗？
1、前后端约定已选字段的标识，首次进入默认打开开关，只展示用户选择的字段
2、出现了性能问题，不过是前段的性能问题，json层级深导致渲染时间长，前端通过部分渲染优化


你是如何与业务方沟通需求的？平台的通用化能力是否遇到过和某些业务需求冲突的情况？你是如何平衡的？
`;
        setNoScreenshotsText(text);
      }),
      // Removed out of credits handler - unlimited credits in this version
    ]

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight])

  useEffect(() => {
    setProblemStatementData(
      queryClient.getQueryData(["problem_statement"]) || null
    )
    setSolutionData(queryClient.getQueryData(["solution"]) || null)

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === "problem_statement") {
        setProblemStatementData(
          queryClient.getQueryData(["problem_statement"]) || null
        )
      }
      if (event?.query.queryKey[0] === "solution") {
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          idea: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
        } | null

        setSolutionData(solution?.code ?? null)
        setIdeaData(solution?.idea ?? null)
        setThoughtsData(solution?.thoughts ?? null)
        setTimeComplexityData(solution?.time_complexity ?? null)
        setSpaceComplexityData(solution?.space_complexity ?? null)
      }
    })
    return () => unsubscribe()
  }, [queryClient])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        // Fetch and update screenshots after successful deletion
        const existing = await window.electronAPI.getScreenshots()
        const screenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        setExtraScreenshots(screenshots)
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot", "error")
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
      showToast("Error", "Failed to delete the screenshot", "error")
    }
  }

  return (
    <>
      {!isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <Debug
          isProcessing={debugProcessing}
          setIsProcessing={setDebugProcessing}
          currentLanguage={currentLanguage}
          setLanguage={setLanguage}
        />
      ) : (
        <div ref={contentRef} className="relative">
          <div className="space-y-3 px-4 py-3">
          {/* Conditionally render the screenshot queue if solutionData is available */}
          {solutionData && (
            <div className="bg-transparent w-fit">
              <div className="pb-3">
                <div className="space-y-3 w-fit">
                  <ScreenshotQueue
                    isLoading={debugProcessing}
                    screenshots={extraScreenshots}
                    onDeleteScreenshot={handleDeleteExtraScreenshot}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Navbar of commands with the SolutionsHelper */}
          <SolutionCommands
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
            isProcessing={!problemStatementData || !solutionData}
            extraScreenshots={extraScreenshots}
            credits={credits}
            currentLanguage={currentLanguage}
            setLanguage={setLanguage}
          />

          {/* Main Content - Modified width constraints */}
          <div className="w-full text-sm text-black bg-black/60 rounded-md">
            <div className="rounded-lg overflow-hidden">
              <div className="px-4 py-3 space-y-4 max-w-full">
                {!solutionData && (
                  <>
                    <ContentSection
                      title="Problem Statement"
                      content={problemStatementData?.problem_statement}
                      isLoading={!problemStatementData}
                    />
                    {problemStatementData && (
                      <div className="mt-4 flex">
                        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
                          Generating solutions...
                        </p>
                      </div>
                    )}
                  </>
                )}

                {(solutionData || noScreenshotsText) && (
                  <>
                    <ContentSection
                      title={`My Thoughts (${COMMAND_KEY} + Arrow keys to scroll)`}
                      content={
                        thoughtsData && (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              {thoughtsData.map((thought, index) => (
                                <div
                                  key={index}
                                  className="flex items-start gap-2"
                                >
                                  <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
                                  <div>{thought}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      }
                      isLoading={!thoughtsData}
                    />

                    {ideaData && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h2 className="text-[13px] font-medium text-white tracking-wide">
                            解题思路
                          </h2>
                          <button
                            onClick={() => setIsIdeaCollapsed(!isIdeaCollapsed)}
                            className="text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1"
                          >
                            {isIdeaCollapsed ? (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                                展开
                              </>
                            ) : (
                              <>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                                收起
                              </>
                            )}
                          </button>
                        </div>
                        {!isIdeaCollapsed && (
                          <div 
                            className="text-[13px] leading-[1.0] text-gray-100 max-w-[600px] whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ 
                              __html: typeof ideaData === 'string' ? formatContent(ideaData) : String(ideaData) 
                            }}
                          />
                        )}
                      </div>
                    )}

                    <SolutionSection
                      title="Code"
                      content={noScreenshotsText || solutionData || ""}
                      isLoading={!solutionData && !noScreenshotsText}
                      currentLanguage={currentLanguage}
                    />

                    <ComplexitySection
                      timeComplexity={timeComplexityData}
                      spaceComplexity={spaceComplexityData}
                      isLoading={!timeComplexityData || !spaceComplexityData}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </>
  )
}

export default Solutions
