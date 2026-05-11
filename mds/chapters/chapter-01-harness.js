// Chapter 1: 第 1 章：先建立 Harness（工程线束）视角
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "harness",
  "title": "第 1 章：先建立 Harness（工程线束）视角",
  "subtitle": "不要把 Agent 看成提示词外壳，而要看成围绕成本、延迟与模型缺陷搭出的工程线束。",
  "review": [
    "Harness 的职责是把概率性模型意图转成受控、可审计、可恢复的物理动作",
    "源码主体不是 AI 推理，而是上下文、权限、工具、恢复、UI、遥测和治理基础设施",
    "后续 12 章要贯穿 Prompt Cache、防幻觉/防懒惰、错误扣留三条物理暗线",
    "当前复杂 Harness 是为大模型缺陷搭建的工程脚手架，长期目标是可整块删除"
  ],
  "sections": [
    {
      "id": "harness-boundary",
      "title": "1.1 从模型中心论转向 Harness 视角",
      "sources": [
        "tool-interface",
        "permission-modes",
        "query-loop"
      ],
      "qas": [
        "harness-why"
      ],
      "html": "<p>阅读 Claude Code 源码时，首要任务不是寻找某一段神奇 Prompt，而是建立 <strong>Harness</strong> 视角：模型只是产生概率性意图的推理内核，工程线束负责把这些意图转译为结构化工具调用、权限判定、状态落盘、错误恢复和用户可见事件。</p><p>生产级 Agent 的核心矛盾不在于模型是否聪明，而在于底层模型 API 像一块不可靠的硬件：它会超时，会返回 413 <code>prompt_too_long</code>，会遗忘旧上下文，会幻觉行号，也会因为确认偏误把没有验证过的代码说成没问题。Harness 的任务就是把这种不稳定输出包进确定性的控制面。</p><blockquote><strong>源码阅读的三问</strong>：这段代码如何控制模型能看见什么？它如何限制模型能做什么？失败、超限或恢复时，它如何把系统带回可继续状态？</blockquote><p class='level-intermediate'>这也是为什么 <button class='inline-action source-trigger' data-source='tool-interface'>Tool 契约</button>、<button class='inline-action source-trigger' data-source='permission-modes'>权限模式</button>、<button class='inline-action source-trigger' data-source='query-loop'>queryLoop</button>、压缩、Hook、Memory 和遥测都属于同一套线束工程。它们不是模型之外的边角料，而是让模型能在真实终端里长期工作的操作系统层。</p><p class='level-advanced'>把大模型当成不可靠硬件 API 后，很多看似过度的实现都会变得合理：重试不是补丁，状态机不是炫技，权限门不是 UI 弹窗，缓存布局不是微优化。它们共同承担的是物理约束屏蔽层。</p><p>点击 <button class='inline-action qa-trigger' data-qa='harness-why'>这组 QA</button>，先确认你已经把阅读坐标从 Prompt 切换到 Harness。</p><div class='learning-check'><strong>小检查</strong>任选一个 Agent 项目，写出它的输入控制、执行边界和错误恢复。如果三者缺任意一项，它还不是完整 Harness。</div>"
    },
    {
      "id": "harness-loc",
      "title": "1.2 冷酷的数据：1.6% 推理内核与 98.4% 基础设施",
      "sources": [
        "tool-interface",
        "compaction-pipeline",
        "permission-modes",
        "telemetry-sinks"
      ],
      "qas": [
        "harness-why"
      ],
      "html": "<p>整理材料给出的源码规模很直接：Claude Code 约 51 万行 TypeScript 中，真正接近 AI 决策推理的代码只占约 1.6%，剩余 98.4% 都在做运行基础设施。这个比例不是为了制造震撼，而是提醒你：工业级 Agent 的胜负点通常在模型调用前后，而不是调用模型那一行。</p><p>可以把代码规模粗略拆成四块：<code>utils/</code> 承担权限、缓存和通用基础设施，约 18 万行；<code>components/</code> 承担 React 终端 UI，约 8 万行；<code>services/</code> 承担 API、压缩、MCP 和后台服务，约 5 万行；<code>tools/</code> 承担 40+ 工具实现，约 5 万行。工具代码本身只是一部分，更大的成本在让工具安全、可观测、可恢复地运行。</p><p class='level-intermediate'>这解释了 Harness 的 ROI。底座模型对多数开发者是给定条件；你真正能优化的是上下文注入、工具 schema、权限漏斗、错误恢复、缓存边界、<button class='inline-action source-trigger' data-source='compaction-pipeline'>压缩管线</button>和启动遥测。资料中提到，单纯升级模型在某些任务上可能只带来个位数提升，而改进 Harness 可以带来更大幅度的成功率增益。</p><p class='level-advanced'>读源码时不要把 UI、遥测、settings 和 session storage 当成外围杂项。终端 UI 决定用户能否及时中断风险动作，遥测决定长尾失败能否定位，session JSONL 决定崩溃后能否恢复，配置兼容决定系统能否在企业环境长期演化。</p><div class='learning-check'><strong>小检查</strong>为什么一个只有模型调用、没有工具权限和恢复管线的项目，即使回答看起来聪明，也很难称为生产级 Agent？</div>"
    },
    {
      "id": "harness-physical-lines",
      "title": "1.3 三条物理暗线：缓存、防幻觉、错误扣留",
      "sources": [
        "prompt-boundary",
        "cache-edits",
        "file-edit-defenses",
        "yolo-classifier",
        "compaction-pipeline"
      ],
      "qas": [
        "harness-why"
      ],
      "html": "<p>后续章节的细节很多，但最重要的是三条贯穿全篇的物理暗线。离开这些约束去谈架构，很多实现都会显得像过度设计；带着这些约束阅读，源码里的怪异行为才有解释。</p><ul><li><strong>缓存第一性原理</strong>：Prompt Cache 依赖字节级前缀匹配。内置工具 A-Z 排序并固定在 MCP 工具之前、System Prompt 动静分界、动态时间和 Git 状态用 <code>&lt;system-reminder&gt;</code> 注入、microcompact 通过 <button class='inline-action source-trigger' data-source='cache-edits'>cache_edits</button> 旁路删除，目的都是死保昂贵前缀。</li><li><strong>对抗 LLM 固有缺陷</strong>：系统默认不信任模型记忆。<button class='inline-action source-trigger' data-source='file-edit-defenses'>FileEditTool</button> 写前必须证明存在当前文件的 <code>readFileState</code>；Auto/YOLO 分类器连续拒绝会熔断，防止模型换语法反复试探；验证 Agent 必须给出实际测试输出，而不是一句看起来没问题。</li><li><strong>灾难恢复与错误扣留</strong>：遇到 413、媒体过大或输出截断时，系统会先扣留可恢复错误，后台触发 context collapse、reactive compact 或局部剥离，再带着重试标记重新入模。中间错误过早外抛，会让 SDK、桌面端或远程桥接直接终止会话。</li></ul><p class='level-advanced'>这三条线对应的是成本、可信度和存续性。缓存线让系统付得起钱、等得起延迟；防幻觉线让系统不把概率猜测落到文件系统；错误扣留线让长任务不会因为一次可恢复 API 异常直接崩溃。</p><div class='learning-check'><strong>小检查</strong>任选一个怪异实现：工具排序、system-reminder、cache_edits 或写前必读。分别说明它在保护哪条物理暗线。</div>"
    },
    {
      "id": "harness-pillars",
      "title": "1.4 三大支柱与六层纵深防御",
      "sources": [
        "compaction-pipeline",
        "streaming-tools",
        "hook-invariant",
        "bash-defenses",
        "yolo-classifier"
      ],
      "qas": [
        "harness-why"
      ],
      "html": "<p>不要按目录机械阅读 Claude Code。更稳的方式是把系统拆成三条工程主线：上下文工程、架构约束和熵管理。</p><ul><li><strong>上下文工程</strong>：管理模型此刻能看见什么。它覆盖 System Prompt 动静分离、消息规范化、<button class='inline-action source-trigger' data-source='compaction-pipeline'>压缩管线</button>、Memory 主动召回、ToolSearch 延迟加载、缓存断点与 cache_edits。</li><li><strong>架构约束</strong>：管理模型输出如何落地。它覆盖标准化 Tool 接口、<button class='inline-action source-trigger' data-source='streaming-tools'>流式并发执行器</button>、权限漏斗、Hooks、沙盒和 Bash/FileEdit 的工具专属防线。</li><li><strong>熵管理</strong>：管理系统跑久以后如何不退化。它覆盖多 Agent 隔离、Git worktree、Memory 新鲜度、设置兼容、遥测治理、会话恢复和 AutoDream 这类后台巩固机制。</li></ul><p class='level-intermediate'>安全也不是一次 allow/deny，而是六层纵深防御：第 1 层 <code>CLAUDE.md</code> 是指导性软约束；第 2 层 Permission Rules 是声明式拦截；第 3 层 Hooks 是生命周期拦截；第 4 层 <button class='inline-action source-trigger' data-source='yolo-classifier'>YOLO Classifier</button> 是独立 AI 审查；第 5 层 Sandbox 是操作系统隔离；第 6 层 Hardcoded Denials 是绝对禁区。</p><p class='level-advanced'>越靠后越接近物理执行边界，语义弹性越小。前面的自然语言规则可以指导模型，后面的路径校验、AST 拆解、沙盒和硬编码拒绝必须机械执行。生产级 Agent 的安全来自层叠，而不是某一个判断器自称聪明。</p><div class='learning-check'><strong>小检查</strong>把 BashTool 放进这三条线里：它需要什么上下文，执行边界在哪里，长期运行会制造什么熵？</div>"
    },
    {
      "id": "harness-tradeoffs",
      "title": "1.5 成本与妥协：为什么复杂性不是装饰",
      "sources": [
        "prompt-boundary",
        "cache-edits",
        "compaction-pipeline",
        "fork-subagent"
      ],
      "qas": [
        "harness-why"
      ],
      "html": "<p>Claude Code 的复杂性大多来自物理妥协，而不是抽象偏好。长上下文越完整，成本、延迟、缓存失效和恢复失败概率越高；工具越强，权限、并发和审计压力越大；子 Agent 越多，目标漂移和上下文污染风险越高。</p><p>五层压缩流水线就是典型的成本阶梯：Budget Reduction 先做零模型成本的工具结果裁剪；Snip 做轻量历史截断；Microcompact 对齐缓存块；Context Collapse 做读时虚拟投影；Auto-compact 最后才调用模型做语义摘要。顺序不能随意调换，因为越靠后越贵、越慢、越可能丢细节。</p><p class='level-intermediate'>工程妥协还体现在很多局部规则里：子 Agent 只向父级返回 summary，是用细节透明度换父会话上下文带宽；重量级工具先以 stub 暴露，是用一次 ToolSearch 换首轮前缀瘦身；动态 Git 状态不进 System Prompt，是用尾部提醒换静态缓存命中。</p><p class='level-advanced'>看见复杂排序、边界 marker、旁路删除、缓存断点、fork 前缀复用时，先问它是否在保护一个昂贵稳定前缀。Prompt Cache 不是锦上添花；在长会话和大规模用户下，它决定系统是否付得起、是否足够快、是否能在 200K 级上下文里持续工作。</p><div class='learning-check'><strong>小检查</strong>为什么直接删除本地 messages 数组可以省上下文，却可能不如 cache_edits？请从恢复、UI transcript 和 KV Cache 三方面解释。</div>"
    },
    {
      "id": "harness-shrinkage",
      "title": "1.6 架构哲学：为删除而设计",
      "sources": [
        "query-loop",
        "bash-defenses",
        "compaction-pipeline",
        "settings-compat"
      ],
      "qas": [
        "harness-why"
      ],
      "html": "<p>Claude Code 当前的 Harness 很厚：多层压缩、20 多重 Bash 注入检查、权限规则、Hook 不变量、缓存编辑、媒体错误恢复、Memory 新鲜度警告和多 Agent 权限桥。它们共同构成了一套对当前模型缺陷的工程脚手架。</p><p><strong>Design for Shrinkage</strong> 的含义是：这些脚手架应该保持边界清晰，未来当模型原生具备更可靠的长期上下文、更低成本缓存、更强安全判断和更少幻觉时，相关模块能被整块删除或变薄，而不是变成永久复杂性。</p><p class='level-intermediate'>因此，本教程不是教你崇拜复杂性，而是教你识别复杂性背后的约束。该保留的是物理边界、状态机语义、审计能力和恢复性；该删除的是被模型能力进步淘汰的冗余提示、重复校验和临时兼容层。</p><p class='level-advanced'>也要看到监督悖论：Harness 越强，开发者越容易把理解外包给系统。工程治理不能只追求短期能力放大，还要保留可解释 transcript、可复现测试输出、权限审计和 telemetry，让人类仍然有能力监督这个执行器。</p><div class='learning-check'><strong>小检查</strong>列出一个你认为未来可以删除的 Harness 组件，并说明删除它需要模型或平台先具备什么能力。</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "harness-why": {
    "framing": "本节建立全篇坐标：Claude Code 的核心价值不是把用户消息转发给模型，而是用工程线束持续约束模型、喂给模型、观察模型、恢复模型。后续每个源码模块，都可以回到输入控制、执行边界、复杂度回收三类问题上。",
    "points": [
      "Harness 是模型之外的物理拦截层：它把自然语言意图变成工具调用、权限判定、状态写入、恢复动作和可观测事件。",
      "源码比例提醒读者：AI 推理代码只是一小部分，真正的工程主体是上下文、缓存、工具、权限、UI、遥测、恢复和治理。",
      "三条物理暗线贯穿全篇：死保 Prompt Cache、对抗模型幻觉与懒惰、扣留可恢复错误并后台降级。",
      "Context Engineering 解决模型能看见什么；Architectural Constraints 解决模型能做什么；Entropy Management 解决系统跑久后如何不退化。",
      "Design for Shrinkage 要求当前脚手架保持可删除性。未来模型和平台变强后，冗余线束应能变薄或整块移除。"
    ],
    "reading": [
      {
        "source": "prompt-boundary",
        "label": "从 Prompt 分界线看缓存边界",
        "note": "确认静态规则、动态数据和用户消息为什么必须物理分层。"
      },
      {
        "source": "tool-interface",
        "label": "从 Tool 接口看行动边界",
        "note": "确认 Claude Code 让模型行动的入口是结构化工具，而不是随意执行文本。"
      },
      {
        "source": "query-loop",
        "label": "从 queryLoop 看恢复边界",
        "note": "观察错误扣留、状态重建和终止原因如何收束长任务生命周期。"
      }
    ],
    "pitfalls": [
      "不要把提示词写得好误认为完整 Harness。提示词只能建议，源码里的权限、工具、沙盒和恢复路径才会强制改变行为。",
      "不要离开成本、延迟和缓存谈架构。长上下文 Agent 的很多复杂性都来自这些物理约束。",
      "不要把模型的自我判断当成证据。写文件、执行命令和宣告验证通过，都需要工具输出或文件状态支撑。",
      "不要把所有脚手架永久化。模型能力、平台缓存和安全机制改变后，复杂线束必须重新评估。"
    ],
    "practice": "用三句话复述 Claude Code：它怎样组织上下文，怎样控制工具行动，怎样处理长会话老化。写完后再进入第 2 章。"
  },
  "harness-boundary": {
    "framing": "这一节把大模型 API 当成不可靠硬件来理解。Harness 不负责让模型变聪明，而负责屏蔽模型和 API 的不稳定性。",
    "points": [
      "模型输出是概率性的，工具执行和文件写入必须是确定性的。",
      "大模型 API 可能超时、返回 413、输出截断、产生幻觉或确认偏误，所以主循环必须能扣留错误并恢复。",
      "工具、权限、状态机、压缩、Hook 和遥测共同构成执行环境，而不是模型调用的附属品。"
    ],
    "reading": [
      {
        "source": "query-loop",
        "label": "queryLoop",
        "note": "先看它如何把不可靠调用包装为可恢复状态机。"
      },
      {
        "source": "permission-modes",
        "label": "权限模式",
        "note": "再看模型意图如何经过机械边界。"
      }
    ],
    "pitfalls": [
      "不要只追模型调用点。",
      "不要让模型直接解释自己是否安全。",
      "不要把恢复逻辑写成异常后简单重试。"
    ],
    "practice": "把你自己的 Agent 画成三层：模型层、Harness 层、物理执行层。标出哪些边界是机械强制的。"
  },
  "harness-loc": {
    "framing": "这一节用代码规模说明工程权重：Claude Code 的价值主要不在模型调用，而在调用前后的运行基础设施。",
    "points": [
      "1.6% 与 98.4% 不是精确到版本的永恒数字，而是架构重心的提示。",
      "终端 UI、遥测、session JSONL、权限、缓存和设置兼容都会影响 Agent 的真实可用性。",
      "Harness 优化常常比换模型更可控，因为它改变模型看到的信息、能做的动作和失败后的恢复路径。"
    ],
    "reading": [
      {
        "source": "compaction-pipeline",
        "label": "压缩管线",
        "note": "看上下文工程如何保护长任务。"
      },
      {
        "source": "telemetry-sinks",
        "label": "启动遥测",
        "note": "看外围设施为什么必须早于主循环。"
      }
    ],
    "pitfalls": [
      "不要把 benchmark 提升只归因于模型。",
      "不要忽略 UI 和遥测对安全干预、故障定位的影响。",
      "不要用单轮问答体验评价长任务 Agent。"
    ],
    "practice": "列出你自己的 Agent 中最大的一块非模型代码，并判断它在保护成本、安全、恢复还是治理。"
  },
  "harness-physical-lines": {
    "framing": "这一节是 12 章的暗线地图。所有章节都应回到缓存、防幻觉和错误扣留这三个物理约束。",
    "points": [
      "Prompt Cache 需要字节级稳定，所以排序、分界线、动态注入和 cache_edits 都是成本控制手段。",
      "模型会幻觉和偷懒，所以 FileEdit 写前必读、YOLO 熔断和 Verification Agent 证据要求都是物理约束。",
      "生产系统不能把可恢复错误过早外抛，所以 413、媒体错误和截断恢复要先在 loop 内扣留和降级。"
    ],
    "reading": [
      {
        "source": "cache-edits",
        "label": "Cache Edits",
        "note": "理解为什么请求层删除不等于本地历史删除。"
      },
      {
        "source": "file-edit-defenses",
        "label": "FileEdit 防线",
        "note": "理解写前必读如何防止行号幻觉。"
      },
      {
        "source": "compaction-pipeline",
        "label": "压缩恢复",
        "note": "理解 413 后为什么先恢复再暴露错误。"
      }
    ],
    "pitfalls": [
      "不要把缓存当微优化。",
      "不要相信没有工具证据的验证结论。",
      "不要让 SDK 上游先于恢复管线看到中间态错误。"
    ],
    "practice": "选一个你最常见的 Agent 失败案例，把它归到成本、模型缺陷或恢复缺失中的一类。"
  },
  "harness-pillars": {
    "framing": "这一节把三大支柱变成后续阅读路线。你会反复看到同一个模式：先给模型受控视野，再给它受控工具，最后在循环中持续压缩、观测和纠偏。",
    "points": [
      "上下文线从 System Prompt 动静分离开始，经过消息规范化、压缩管线、Memory 主动召回和 ToolSearch 延迟加载，最后落到缓存和成本控制。",
      "行动线从 Tool 契约开始，经过流式执行器、Bash/FileEdit 这种复杂工具，再进入 MCP 和 Skills 的外部能力扩展。",
      "安全线不是单点判断，而是 CLAUDE.md 软约束、settings 权限、Hooks、YOLO 分类器、沙盒和硬编码拒绝的叠加。",
      "熵管理线贯穿设置、遥测、feature flags、会话恢复、长期记忆新鲜度和源码中暴露出的架构痛点。"
    ],
    "reading": [
      {
        "source": "compaction-pipeline",
        "label": "上下文线的压缩入口",
        "note": "看它如何先轻后重地处理历史膨胀。"
      },
      {
        "source": "streaming-tools",
        "label": "行动线的并发入口",
        "note": "看它如何把工具调用按安全性排队或并发。"
      },
      {
        "source": "hook-invariant",
        "label": "安全线的不变量",
        "note": "看第三方扩展为什么不能覆盖用户拒绝规则。"
      }
    ],
    "pitfalls": [
      "不要把三条线割裂开。比如 Cache Edits 同时是上下文优化、成本优化和恢复性设计。",
      "不要把工具越多越强当成真理。工具越多，权限、上下文和 UI 压力也越大。",
      "不要把安全理解成一次 allow/deny。越接近物理执行边界，越需要保守的机械阻断。"
    ],
    "practice": "把你最关心的一个模块，例如 BashTool 或 Memory，分别写出它的上下文输入、行动边界和熵管理风险。"
  },
  "harness-tradeoffs": {
    "framing": "这一节强调成本与妥协。Claude Code 的许多复杂结构都在用较低成本的手段推迟较高成本的恢复或压缩。",
    "points": [
      "压缩流水线按成本排序，先做本地裁剪和轻量折叠，最后才调用模型摘要。",
      "子 Agent summary、ToolSearch stub、动态尾部注入都是用细节、延迟或额外轮次换上下文带宽。",
      "缓存优化必须和恢复、UI transcript、调试证据一起看，不能只追 token 数字。"
    ],
    "reading": [
      {
        "source": "prompt-boundary",
        "label": "Prompt 分界线",
        "note": "理解哪些内容值得放进稳定前缀。"
      },
      {
        "source": "fork-subagent",
        "label": "Fork Subagent",
        "note": "理解多 Agent 如何复用父会话前缀。"
      }
    ],
    "pitfalls": [
      "不要为了省 token 破坏可恢复历史。",
      "不要把自动摘要放得太早，摘要会丢失调试细节。",
      "不要把缓存优化和安全边界混在一起，跨用户静态缓存不能包含私有数据。"
    ],
    "practice": "设计一条你自己的压缩阶梯，按零成本、本地成本、模型成本排序。"
  },
  "harness-shrinkage": {
    "framing": "这一节给全篇定下长期哲学：Harness 是必要的，但不应该被神化。它是为当前模型缺陷和 API 物理成本服务的脚手架。",
    "points": [
      "为删除而设计意味着模块边界清晰、功能职责明确、替换和删除成本可控。",
      "随着模型上下文、缓存、工具使用和安全判断能力提升，一部分提示词、正则防线和恢复补丁应该变薄。",
      "能力放大必须配合可解释 transcript、测试证据、权限审计和 telemetry，避免人类监督能力退化。"
    ],
    "reading": [
      {
        "source": "bash-defenses",
        "label": "Bash 防线",
        "note": "看当前模型和 shell 复杂性要求多少机械拦截。"
      },
      {
        "source": "settings-compat",
        "label": "Settings 兼容",
        "note": "看长期治理层如何避免一次升级破坏系统。"
      }
    ],
    "pitfalls": [
      "不要把复杂性本身当价值。",
      "不要因为未来可删除，就现在省掉必要边界。",
      "不要让自动化验证替代真实测试输出和人工可审计证据。"
    ],
    "practice": "写下一个可以未来删除的防线，以及当前还不能删除它的物理原因。"
  }
});
