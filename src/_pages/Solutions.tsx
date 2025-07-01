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

  const copyToClipboard = () => {
    if (typeof content === "string") {
      navigator.clipboard.writeText(content).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  return (
    <div className="space-y-2 relative">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        {title}
      </h2>
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
              backgroundColor: "rgba(22, 27, 34, 0.5)"
            }}
            wrapLongLines={true}
          >
            {content as string}
          </SyntaxHighlighter>
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
        const text = `**【项目描述】** 在国际化营销场景下，为满足拉新、促活等多样化需求，构建了一套统一的营销活动引擎。核心以TCA（事件触发满足条件动作执行）为基础组件，TCA排列组合形成step单元，step之间通过前后继关联形成的活动图模型。

**【项目职责】**
**高可用**
* 高可用动作执模块设计与落地
    * 高吞吐设计：将动作模块作为流量积压缓冲池，避免上游计算模块因下游瓶颈阻塞；通过MQ异步队列与"两阶段执行机制"（预执行入队+真正执行），实现动作执行与计算解耦；通过流量打标，区分异步定时和实时流量，通过优先级队列保障高优先级任务执行；动作模块设计保障了系统具有高吞吐量，支撑日均亿级调用和稳定消峰。
    * 多维幂等机制保障数据一致性：通过状态持久化+MQ版本号控制，保障多阶段系统中消息重入、乱序场景下的幂等执行；结合逻辑版本号支持失败补偿；使用KV数据库存储中间状态，实现幂等判断与数据感知查询。
    * 重试补偿保障机制：支持限流无限重试、执行失败有限重试多种重试机制；通过分钟级随机抖动+优先级重试队列保障高优先级重试任务；建立异常情况报警+人工补偿机制，通过fusion存储、hive落盘数据支持不同时间范围的数据补偿。

**【项目成果】**
系统支持日均亿级别动作调用量项目上线后，在多个国家和地区的营销推广活动中稳定运行，支撑千万级用户参与的复杂活动流程。
建立了完善的异常处理与数据补偿机制，实现分钟级异常感知与跨周期数据回溯，确保营销活动稳定执行。

**高可用、高幂等、高吞吐**

**（高吞吐亮点）**
积压在动作模块，避免上游计算延迟 （流量消峰架构）
* 不将积压留在引擎计算模块，而是将动作模块作为"流量缓冲池"；
* 避免同步链路阻塞，保障上游服务性能；
* 支持异步队列 + 两阶段处理架构，实现流量解耦和峰值削减。

**两阶段执行机制（预执行队列 + 真正执行）**
* 阶段一写入预执行队列，仅存储必要上下文；
* 阶段二才触发实际下游调用；

**（数据一致性）亮点：多维幂等保障**
**状态持久化**
动作执行状态会写入fusion，作为幂等判断和流程协同的核心数据源。

**多维幂等保障**
通过 flag_index版本号控制 MQ 消息唯一执行，通过 op_index 版本号保证同 UUID 逻辑幂等。
	消费级幂等保障：每条 MQ 消息到达都查询fusion校验flag_index，执行前比对一致性，只允许执行一次；每次执行flag_idx会加1，如果发生重试时会根据新的flag_idx进行校验。
	逻辑幂等保障：op_index可以支持同一个UUID的失败后的补偿执行、同一个UUID的多次执行等。

**（高可用性亮点）亮点**
**多样的重试机制**
失败有限重试，限流无限重试。根据事件类型（在线/定时）优先级，决定重试延迟时间。
在线流量重试时间短，定时任务重试时间间隔较长，通过随机抖动打散流量。

**超时报警机制**
动作执行成功或者失败后，动作模块会回调上游引擎，如果长时间未回调，会有报警。

**定时补偿机制**
根据uuid查出当时的上下文，当动作是执行中、执行失败，可以重复执行。

**保证幂等和数据一致性 —— 有哪些典型场景会导致一致性问题？**
1、写预执行队列成功，写fusion失败：先写fusion，再写队列，任何一个失败本次请求都是失败，会报错，上游重试
2、预执行队列写入成功，但未消费或消费被中断：
3、执行成功，但写状态失败：fusion写失败会重试，有专门的重试场景字段，
状态持久化：动作执行状态会写入fusion
超时报警机制：动作执行成功或者失败后，动作模块会回调上游引擎，如果长时间未回调，会有报警
人工补偿机制：根据uuid查出当时的上下文，当动作是执行中、执行失败，可以重复执行。

失败日志同步es，定时任务会刷新状态。
4、上游重复下发同一 UUID 请求：action写预执行队列之前会进行"幂等检测"，通过redis。
5、KV 和 ES 状态不一致：以fusion结果为准，es作为辅助。

**为什么需要同时使用 flag_index 和 op_index，能不能合成一个？**
系统中使用两个版本号 flag_index 和 op_index，是为了分别解决消费级幂等与失败补偿可多次执行两类不同的问题，它们关注的对象和场景完全不同，因此不可合并。

**UUID生成维度？**
uid + canvas_id + step_id + 轮次 + 执行次数

**如何保证在 MQ 消息重入、乱序、并发消费等情况下仍然只执行一次？**
1、并发消费使用锁进行保障
2、消费级幂等保障：每条 MQ 消息到达都查询fusion校验flag_index，执行前比对一致性，只允许执行一次；每次执行flag_idx会加1，如果发生重试时会根据新的flag_idx进行校验。

**在执行动作成功但写状态失败的场景下如何处理？会不会导致动作被重复执行？**
执行成功但是写失败，会有专门的重试队列和重试方法：消费后会先将写入fusion失败的数据写入，后续判断执行结果状态，如果是成功则直接回调计算模块，其他情况则继续执行统一流程。

**如果 Fusion 状态与 ES 日志状态不一致，最终会导致什么问题？系统如何发现和修复？**
Fusion会存储活动结束后90天内的数据，实际执行结果以fusion为主，es通过日志同步数据，有可能会出现丢和重复，es大部分场景用于问题排查。不需要修复。

**在多阶段调用流程中，比如计算模块 -> 动作模块 -> 下游服务，如果动作模块挂掉后恢复，怎么补偿？如何保证最终一致性？**
1、动作模块挂了，事件都会执行失败，计算模块执行失败会同步es和hive表落盘，等动作模块恢复后，从hive表获取故障期间的事件，计算模块重新触发执行。
2、如果计算模块也挂了，关键事件会落库。

**限流失败为什么要无限重试？无限重试不会带来数据膨胀和系统雪崩吗？怎么防止？**
1、限流本质上不是系统异常或逻辑失败，而是系统容量的保护性拒绝。对于这类"正常但未处理成功"的请求，业务上仍然是需要处理的，如果重试一定次数丢弃，人工还是要处理的，限流一般是流量较大，如果人工进行处理，会非常棘手。
2、保护措施：
	重试时间窗口内"随机抖动"，可以有效防止雪崩
	重试队列消费速度可调节，不会拖垮系统
	限流其实是一种资源异常情况，日常情况限流不应该太多，如果出现，需要联系下游沟通扩量，防止大量限流的出现。

**不同优先级的事件如何做到限流时有差异化处理？怎么避免低优先级任务"饿死"？**
目前是根据流量类型：异步实时、异步定时、异步延时
1、定时任务的优先级最低，实时要求低
2、异步实时流量优先级最高，比如发单、开端等事件

**什么情况会触发失败重试？失败重试的重试策略有哪些？为什么要使用随机抖动？**
1、一般是rpc失败，比如http超时、下游错误码异常、触达占位符获取失败等分支逻辑失败导致的。
2、随机抖动是防止大量重试流量在同一时间过来，继续导致限流。

**人工补偿是怎么定位数据的？op_index 在补偿中起到什么作用？**`;
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
