// Chapter 2: 第 2 章：启动与消息入模
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "startup",
  "title": "第 2 章：启动与消息入模（Prompt Caching 与上下文组装）",
  "subtitle": "启动不是把消息发给模型，而是建立执行边界，并把请求排布成可缓存、可恢复的物理结构。",
  "review": [
    "启动阶段先建立 OS、防劫持、信号处理和状态落盘边界，再进入模型请求",
    "Prompt Cache 要求字节级前缀稳定，System Prompt 必须动静隔离",
    "内置工具 A-Z 固定排序、MCP 后置、ToolSearch 延迟加载都在保护黄金前缀",
    "动态事实用 <system-reminder> 和消息规范化注入，避免击穿静态缓存"
  ],
  "sections": [
    {
      "id": "startup-physical-fence",
      "title": "2.1 启动时的物理防线：推理与执行解耦",
      "sources": [
        "telemetry-sinks",
        "query-loop",
        "permission-modes"
      ],
      "qas": [
        "startup-flow"
      ],
      "html": "<p>Claude Code 启动时的首要任务不是立刻连接模型，而是建立进程、权限、状态和观测边界。生产级 Agent 必须把推理与执行分离：模型负责提出意图，Harness 负责决定这些意图能否触碰文件系统、Shell、网络、远程会话或团队记忆。</p><p>资料中特别提到 Windows 初始化里的 <code>NoDefaultCurrentDirectoryInExePath</code>。这类设置看似离模型很远，本质是在启动阶段防止当前目录劫持可执行文件搜索路径，避免推理层还没开始，执行层已经被恶意环境污染。</p><p class='level-intermediate'>另一个启动边界是 session JSONL。长任务 transcript、工具结果、压缩边界和恢复线索都依赖追加式持久化。如果用户按 Ctrl+C 或进程被终止，信号处理器必须尽量 flush pending writes，避免下次 resume 时读到半截 JSON 或丢失最后一个工具结果。</p><p class='level-advanced'><button class='inline-action source-trigger' data-source='telemetry-sinks'>setup 阶段遥测</button>也要早于主循环。启动失败、配置错误、权限模式异常、团队 memory watcher 或文件访问 hook 都需要在 queryLoop 之前留下观测信号，否则生产环境只会看到一个沉默退出的终端。</p><p>本节问题见 <button class='inline-action qa-trigger' data-qa='startup-flow'>启动链路 QA</button>。</p><div class='learning-check'><strong>小检查</strong>为什么启动阶段要先做 OS 级防护、信号处理和遥测初始化，而不是等模型第一次回答后再做？</div>"
    },
    {
      "id": "startup-boundary",
      "title": "2.2 第一性原理：字节级前缀匹配与动静隔离墙",
      "sources": [
        "prompt-boundary",
        "cache-edits",
        "fork-subagent"
      ],
      "qas": [
        "startup-flow"
      ],
      "html": "<p>很多开发者以为消息入模只是拼接聊天记录。Claude Code 的真实目标更苛刻：把每轮请求排布成尽可能稳定的字节前缀，用 Prompt Cache 抵消长上下文的成本和首字延迟。</p><p>Prompt Cache 不是语义缓存，而是前缀字节序列缓存。前缀里一个时间戳、一个大小写字符、一次数组顺序变化，都可能让其后几万 token 的 KV Cache 失效。一个 100 轮长会话，如果每轮都击穿前缀，成本可能接近全量重算；如果稳定命中，实际账单和 P95 TTFT 会显著下降。</p><p><button class='inline-action source-trigger' data-source='prompt-boundary'>SYSTEM_PROMPT_DYNAMIC_BOUNDARY</button> 是这条链路的核心切口。边界前是静态 Global Cache，放身份、安全底线、稳定工具规范和跨用户可复用规则；边界后是动态 Session 区，放当前会话、MCP 状态、环境和预算信息，不跨用户复用。</p><p class='level-intermediate'>最危险的踩坑是把动态事实放进 System Prompt 顶部，例如 <code>Today is ${new Date().toISOString()}</code>。这会让每次请求前缀 hash 都不同，缓存读取路径退回全额创建路径，账单和延迟同时上升。</p><p class='level-advanced'>第 9 章的 <button class='inline-action source-trigger' data-source='fork-subagent'>Fork Subagent</button> 也继承同一原则：子 Agent 尽量复用父会话已渲染的 prompt bytes，把差异集中到尾部任务指令，避免破坏主会话昂贵缓存。</p><div class='learning-check'><strong>小检查</strong>如果你要注入当前时间、项目路径和用户规则，哪些能进静态 System Prompt，哪些必须进动态区或消息流？</div>"
    },
    {
      "id": "startup-tool-pool",
      "title": "2.3 工具池组装：A-Z 排序、MCP 后置与延迟加载",
      "sources": [
        "tool-interface",
        "prompt-boundary",
        "permission-modes"
      ],
      "qas": [
        "startup-flow"
      ],
      "html": "<p>工具定义通常是请求里最长、最昂贵的稳定块之一。Claude Code 不是按业务重要性或最近使用频率排列工具，而是在 <code>assembleToolPool</code> 一类逻辑中让内置工具保持确定性顺序，并固定放在 MCP 外部工具之前。</p><ul><li><strong>内置工具 A-Z 固定排序</strong>：Bash、FileRead、FileEdit、Grep 等内置工具形成稳定工具前缀。顺序不随会话、项目或用户偏好波动。</li><li><strong>MCP 工具追加在后</strong>：外部服务器工具是动态能力，可能因配置、网络或插件变化而增减。后置可以把波动限制在尾部，不污染内置工具缓存层。</li><li><strong>ToolSearch 延迟加载</strong>：低频或重量级工具初始只暴露名称和短 stub，模型主动检索时才展开完整 schema。这是用一次工具查询换首轮上下文瘦身。</li></ul><p class='level-intermediate'>这个排序规则解释了源码里很多看似刻板的 <code>sort()</code>。工具 schema 是 prompt 的一部分，顺序一变，缓存前缀就可能全变。把 MCP 插入到内置工具中间，会让一个外部工具的变化导致几十个核心工具的缓存位置全部漂移。</p><p class='level-advanced'>权限也参与工具池组装。被 deny 或当前模式不可见的工具，不应该只在执行时拦截；最好在请求层就让模型看不到这些能力，减少无效 tool_use、权限弹窗和误导性上下文。</p><div class='learning-check'><strong>小检查</strong>为什么内置工具必须在 MCP 工具之前？如果某个 MCP server 冷启动失败，反向排序会怎样影响缓存？</div>"
    },
    {
      "id": "startup-system-reminder",
      "title": "2.4 <system-reminder>：冻结 Prompt 后的动态注入",
      "sources": [
        "message-normalization",
        "memory-recall",
        "prompt-boundary"
      ],
      "qas": [
        "startup-flow"
      ],
      "html": "<p>System Prompt 必须尽量冻结，但 Agent 又必须知道当前时间、工作目录、Git 状态、<code>CLAUDE.md</code>、Memory 召回、文件读取警告和工具引用说明。Claude Code 的解法是把高频变化事实从 System Prompt 拿出来，用 <code>&lt;system-reminder&gt;</code> 包装后放进消息流。</p><p>这类内容在语义上像系统提醒，在物理位置上却不破坏边界前的静态缓存。它可以作为历史 User Message、附件或尾部提醒参与本轮推理，把不稳定性推迟到请求后段。</p><p class='level-intermediate'>这就是动静隔离的工程悖论解法：模型仍然能看到实时环境，但静态规则和核心工具前缀不被时间、Git diff、项目记忆这类易变数据击穿。</p><p class='level-advanced'>可以把缓存断点理解为阶梯防御：System Prompt 静态结束处、工具定义列表尾部、携带 <code>CLAUDE.md</code> 或 Memory 的 <code>&lt;system-reminder&gt;</code> 尾部、以及最近几轮对话附近分别保护不同层级。用户最新输入打破最后一层时，前面几层仍可能命中。</p><div class='learning-check'><strong>小检查</strong>为什么 <code>CLAUDE.md</code> 和 Memory 不应该常驻静态 Global Cache？请同时回答缓存和隐私两个角度。</div>"
    },
    {
      "id": "startup-normalize",
      "title": "2.5 normalizeMessagesForAPI：入模前的最小必要修复",
      "sources": [
        "message-normalization",
        "query-loop",
        "compaction-pipeline"
      ],
      "qas": [
        "startup-flow"
      ],
      "html": "<p>组装好上下文后，历史消息进入 <button class='inline-action source-trigger' data-source='message-normalization'>normalizeMessagesForAPI</button>。这一步不是美化 transcript，而是生成一份符合 API、工具可用性和恢复约束的请求视图。屏幕上的 transcript 和模型最终收到的 payload 不是同一个对象。</p><ul><li><strong>附件和工具结果重排</strong>：图片、PDF、document、tool_result 需要被移动到 API 能接受的位置，避免顺序非法。</li><li><strong>剥离展示噪音</strong>：virtual message、display-only 状态和不可用工具引用不应进入模型上下文。</li><li><strong>局部错误修复</strong>：大图、大 PDF、request_too_large 或 media_size_error 出现后，系统只剥离导致错误的 block types，保留其余文本和历史。</li></ul><p class='level-intermediate'>这体现了 Claude Code 的恢复哲学：不要因为一个图片块超限就丢掉整段对话。改变下一轮输入、保留可用上下文、让 <button class='inline-action source-trigger' data-source='query-loop'>queryLoop</button> 继续推进，才是长任务可恢复的关键。</p><p class='level-advanced'>消息规范化还要过滤 available tool names。工具池变化会让旧工具调用在请求层变成非法引用，规范化必须在每轮入模前重新判定，而不是假设历史永远合法。</p><div class='learning-check'><strong>小检查</strong>如果一次请求因为 PDF 过大失败，下一轮应该丢掉整条用户消息，还是只剥离 PDF block？为什么？</div>"
    },
    {
      "id": "startup-cache-economics",
      "title": "2.6 缓存经济学：多模型切换与断点布局陷阱",
      "sources": [
        "prompt-boundary",
        "fork-subagent",
        "cache-edits"
      ],
      "qas": [
        "startup-flow"
      ],
      "html": "<p>Prompt Cache 的经济学结论很直接：长会话里，前缀稳定比少几个提示词形容词重要得多。一个包含大量工具 schema、项目规则和历史工具结果的请求，如果每轮都全量创建缓存，成本和 TTFT 会线性恶化；如果前缀稳定，大部分请求只需为尾部 delta 付出主要计算。</p><p class='level-intermediate'>多模型切换是常见陷阱。缓存通常与模型强绑定，主会话如果已经积累了 100K token 的昂贵模型缓存，临时切到便宜模型并不能复用这段缓存，反而可能从零重算完整上下文。Claude Code 更倾向于通过独立子 Agent 承接小模型或旁路任务，把缓存域隔离开。</p><p class='level-intermediate'>缓存断点也不是无限资源。应该把断点放在最稳定、最昂贵、最可能复用的边界：静态 System Prompt 后、工具定义尾部、动态项目规则或 system-reminder 后、近期历史附近。断点位置越靠前，越要避免混入项目私有或频繁变化数据。</p><p class='level-advanced'><button class='inline-action source-trigger' data-source='cache-edits'>cache_edits</button> 是更进阶的缓存工程：它允许请求层对旧上下文做删除、固定或引用，而不是直接改写本地 transcript。这样既能缩小入模窗口，也能保留 UI、resume 和调试所需的原始历史。</p><div class='learning-check'><strong>小检查</strong>为什么主对话中途切换到便宜模型可能反而更贵？独立子 Agent 为什么能降低这个风险？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "startup-flow": {
    "framing": "本章把启动与消息入模看成一条物理流水线：先建立执行边界，再组装可缓存前缀，最后生成一份可被 API 接受、可被 queryLoop 恢复的 payload。",
    "points": [
      "启动阶段要先做进程级防护、信号处理、session JSONL 完整性和遥测初始化，避免模型调用前的执行环境失控。",
      "Prompt Cache 依赖字节级前缀稳定。System Prompt 必须切成静态 Global Cache 和动态 Session 区。",
      "工具池是 prompt 前缀的一部分。内置工具 A-Z 排序、MCP 后置和 ToolSearch 延迟加载都在保护黄金前缀。",
      "<system-reminder> 用消息流承载动态事实，让模型看到当前环境，同时避免改动静态 System Prompt。",
      "normalizeMessagesForAPI 生成请求视图，负责附件重排、虚拟消息过滤、不可用工具过滤和媒体错误后的最小修复。",
      "缓存与模型、断点和上下文域绑定。主会话随意切模型或把动态事实放进静态区，都会破坏成本模型。"
    ],
    "reading": [
      {
        "source": "telemetry-sinks",
        "label": "启动阶段遥测",
        "note": "看外围设施为什么必须先于 queryLoop 初始化。"
      },
      {
        "source": "prompt-boundary",
        "label": "System Prompt 分界线",
        "note": "看 staticBlocks 和 dynamicBlocks 如何划分缓存域。"
      },
      {
        "source": "message-normalization",
        "label": "消息规范化",
        "note": "看 transcript 如何转换为 API payload。"
      }
    ],
    "pitfalls": [
      "不要把所有上下文都塞进 System Prompt。那会牺牲缓存、隐私边界和可恢复性。",
      "不要在静态 prompt 顶部放精确到秒的当前时间、Git 状态或项目私有数据。",
      "不要让 MCP 工具随机插入内置工具之间。外部能力波动会污染稳定工具前缀。",
      "不要把页面上看到的 transcript 当作模型收到的原样请求。入模前会有重排、过滤和局部剥离。",
      "不要在主会话里为了省钱随意切模型。不同模型之间通常不能共享既有缓存。"
    ],
    "practice": "设计一个最小 Agent 请求结构：静态 System Prompt、动态 Session 区、工具列表、system-reminder、用户消息分别放什么？逐项说明缓存理由。"
  },
  "startup-physical-fence": {
    "framing": "这一节说明启动阶段先建立物理边界。Agent 的安全从进程和状态完整性开始，而不是从第一条模型回复开始。",
    "points": [
      "推理与执行必须分离，模型不能直接拥有文件系统和 shell 的执行权。",
      "OS 级防劫持、信号处理、session JSONL flush 和启动遥测共同保护恢复性。",
      "早期初始化失败也要可观测，否则 queryLoop 还没启动就已经失去诊断入口。"
    ],
    "reading": [
      {
        "source": "telemetry-sinks",
        "label": "setup 初始化",
        "note": "观察 analytics sinks、session hooks 和 watcher 的启动顺序。"
      },
      {
        "source": "permission-modes",
        "label": "权限模式",
        "note": "把启动边界接到后续工具执行边界。"
      }
    ],
    "pitfalls": [
      "不要把启动阶段当成 CLI 参数解析。",
      "不要忽略 Ctrl+C、SIGTERM 和异常退出对 JSONL transcript 的影响。",
      "不要等第一次模型请求成功后才初始化观测系统。"
    ],
    "practice": "写出你的 Agent 启动顺序：配置、遥测、信号处理、状态文件、工具池、模型请求分别在哪一步。"
  },
  "startup-boundary": {
    "framing": "这一节讲模型每轮请求最先遇到的缓存边界：System Prompt 不是一整块文本，而是被切成可缓存的静态基座和会话相关的动态后缀。",
    "points": [
      "Prompt Cache 不是语义缓存，而是前缀字节序列缓存；时间戳、排序变化和动态环境都会击穿后续缓存。",
      "静态前缀适合放跨用户稳定的规则，例如身份、格式、工具使用底线和安全原则。",
      "动态后缀适合放当前会话、环境、MCP、用户偏好等信息。它变化频繁，不适合跨用户共享缓存。",
      "规则放 System Prompt，数据放动态区或 User Message。CLAUDE.md、MEMORY.md、Git 状态和附件这类项目数据不能混进全局静态缓存。",
      "Fork Subagent 后面也复用同一思想：子任务越能保持相同请求前缀，prompt cache 命中率越高。"
    ],
    "reading": [
      {
        "source": "prompt-boundary",
        "label": "System Prompt 分界线",
        "note": "看 boundary marker 如何把 staticBlocks 和 dynamicBlocks 拆开。"
      },
      {
        "source": "fork-subagent",
        "label": "Fork 的字节级前缀复用",
        "note": "提前观察第 9 章的缓存复用逻辑。"
      }
    ],
    "pitfalls": [
      "不要把所有上下文都塞进 System Prompt。",
      "不要在静态 prompt 顶部放当前时间。",
      "不要把动态内容不缓存理解为每轮都全量重算。源码里仍会对部分动态 section 做会话级冻结。"
    ],
    "practice": "假设你要把项目规范、当前 Git 状态和 MCP 服务器说明放入请求。请分别判断它们更适合静态 prompt、动态 prompt 还是 user message。"
  },
  "startup-tool-pool": {
    "framing": "这一节把工具池看成缓存前缀的一部分。工具 schema 越长，排序稳定性越重要。",
    "points": [
      "内置工具 A-Z 排序并前置，形成稳定工具前缀。",
      "MCP 工具后置，把外部能力波动限制在尾部。",
      "ToolSearch 延迟加载把重 schema 推迟到模型确实需要时再展开。",
      "权限过滤越早发生，模型越少提出无效或不可执行的工具调用。"
    ],
    "reading": [
      {
        "source": "tool-interface",
        "label": "Tool 接口",
        "note": "观察工具 schema 如何成为请求上下文的一部分。"
      },
      {
        "source": "permission-modes",
        "label": "权限模式",
        "note": "观察工具可见性和执行权限如何协同。"
      }
    ],
    "pitfalls": [
      "不要把工具描述当成纯 UI 文案。",
      "不要忽略工具顺序稳定性。",
      "不要把所有 MCP 工具 schema 首轮全量注入。"
    ],
    "practice": "写一个工具池排序规则：哪些工具固定前置，哪些工具后置，哪些工具只暴露 stub。"
  },
  "startup-system-reminder": {
    "framing": "<system-reminder> 是 Claude Code 保护静态 prompt cache 的关键技巧之一：动态数据继续给模型看，但不去改动昂贵的稳定前缀。",
    "points": [
      "环境变化不一定要更新 System Prompt。可以把动态上下文延迟注入到消息流里。",
      "<system-reminder> 让提醒在语义上像系统指令，在物理位置上又不破坏静态前缀。",
      "当前时间、工作目录、CLAUDE.md、Memory、文件读取警告、工具引用说明等都适合借这类 wrapper 注入。",
      "缓存断点可以形成阶梯式防线：系统前缀、工具列表、项目规则和最近历史分别保护不同层级的复用。"
    ],
    "reading": [
      {
        "source": "message-normalization",
        "label": "消息规范化",
        "note": "看 system-reminder 相关内容如何在消息层被整理。"
      },
      {
        "source": "memory-recall",
        "label": "Memory 召回",
        "note": "后续章节会看到记忆如何被筛选后注入当前轮次。"
      }
    ],
    "pitfalls": [
      "不要把 system-reminder 当成真正的 System Prompt。",
      "不要滥用动态提醒。提醒越多，模型注意力和 token 预算越紧。",
      "不要把敏感项目数据放进可跨用户复用的静态缓存区域。"
    ],
    "practice": "列出三种应该用 system-reminder 动态注入的信息，再列出三种应该留在静态 System Prompt 的规则。"
  },
  "startup-normalize": {
    "framing": "消息规范化是进入模型前的最后一道整理工序。它的目标不是美化数据，而是让历史消息满足 API 约束、重试约束和工具可用性约束。",
    "points": [
      "附件会被移动到更适合 API 的位置，避免图片、PDF、工具结果和 assistant 消息的顺序破坏请求格式。",
      "virtual messages 是 UI 或内部展示用消息，不应该进入模型上下文。",
      "遇到图片、PDF、请求体过大或 media_size_error 时，系统会有针对性地剥离问题块，而不是粗暴清空整段历史。",
      "工具集合变化会影响消息合法性，所以每轮还要刷新可用工具，避免旧工具引用污染下一次请求。"
    ],
    "reading": [
      {
        "source": "message-normalization",
        "label": "normalizeMessagesForAPI",
        "note": "重点看 reorder、filter virtual、stripTargets 三类处理。"
      },
      {
        "source": "query-loop",
        "label": "进入 queryLoop",
        "note": "把规范化后的消息接到主循环状态里看。"
      }
    ],
    "pitfalls": [
      "不要以为页面上看到的 transcript 就是模型收到的原样请求。",
      "不要把媒体错误当成用户输入失败。",
      "不要在恢复时清空整段历史。那会损失缓存前缀、调试线索和任务语义。"
    ],
    "practice": "构造一个包含图片、PDF、工具结果和普通文本的对话，写出规范化后哪些信息应该保留，哪些应该剥离。"
  },
  "startup-cache-economics": {
    "framing": "这一节把缓存当作账单和延迟问题，而不是微优化。长会话里，前缀稳定常常比单轮 prompt 瘦身更重要。",
    "points": [
      "缓存命中能把昂贵的历史上下文读取变成低成本复用；缓存击穿会让每轮请求重新承担完整前缀计算。",
      "不同模型之间通常不能共享同一段 KV Cache，所以主会话随意切模型可能反而更贵。",
      "缓存断点应放在稳定、昂贵、可复用的边界，不应浪费在频繁变化的数据前。",
      "cache_edits 让请求层缩小上下文，同时保留本地 transcript 的恢复和调试价值。"
    ],
    "reading": [
      {
        "source": "cache-edits",
        "label": "Cache Edits",
        "note": "理解缓存感知压缩为什么不等于直接改本地 messages。"
      },
      {
        "source": "fork-subagent",
        "label": "Fork Subagent",
        "note": "理解旁路任务如何隔离缓存域。"
      }
    ],
    "pitfalls": [
      "不要随手在主会话中切换模型。",
      "不要把缓存断点放在每轮都会变化的位置。",
      "不要为了省 token 直接删除可恢复历史。"
    ],
    "practice": "给一个 100K token 主会话设计子任务执行方案：哪些任务留在主模型，哪些任务交给子 Agent，为什么？"
  }
});
