// Chapter 3: 第 3 章：Agent Loop（核心循环）与状态机架构
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "agent-loop",
  "title": "第 3 章：Agent Loop（核心循环）与状态机架构",
  "subtitle": "queryLoop 不是 while 循环，而是扣留错误、重建状态、流式分发并持续恢复的异步状态机。",
  "review": [
    "AsyncGenerator 让模型流、UI 渲染、工具调度和恢复事件非阻塞推进",
    "State 与 continue sites 把长任务跃迁收束成可审计的状态快照",
    "错误扣留阻止 413、媒体过大和输出截断过早杀死上游会话",
    "并发工具调度、读前写、拒绝熔断和验证证据共同约束模型缺陷"
  ],
  "sections": [
    {
      "id": "loop-streaming",
      "title": "3.1 AsyncGenerator：非阻塞流式控制中心",
      "sources": [
        "query-loop",
        "streaming-tools"
      ],
      "qas": [
        "agent-loop-core"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='query-loop'>queryLoop</button> 不是等待最终答案的普通 <code>async</code> 函数，而是一个 <code>AsyncGenerator</code>。它在执行过程中持续 <code>yield</code> 文本流、StreamEvent、工具摘要、墓碑消息、进度状态、恢复提示和最终 Terminal 结果。</p><p>这个结构把四条路径合在同一个控制面里：模型 token 可以边到达边显示，终端 UI 可以增量渲染，<button class='inline-action source-trigger' data-source='streaming-tools'>StreamingToolExecutor</button> 可以在解析到完整 <code>tool_use</code> 后立即排队工具，恢复逻辑也能在中途扣留错误并准备下一轮输入。</p><p class='level-intermediate'>流式不是只为手感服务。长任务里，模型生成、权限弹窗、工具 I/O、用户 Esc 中断和后台记忆预取会同时发生；AsyncGenerator 让这些事件有统一顺序和统一消费接口。</p><p class='level-advanced'>读源码时不要只找 <code>return</code>。要追踪每一种 yield 的消费者、消息是否进入 transcript、是否影响下一轮 state、以及异常被 yield 前是否仍有恢复机会。</p><p>打开 <button class='inline-action qa-trigger' data-qa='agent-loop-core'>Agent Loop QA</button>，用状态机角度检查主循环。</p><div class='learning-check'><strong>小检查</strong>为什么终端 Agent 不适合等所有模型输出和工具执行结束后一次性返回？请从 UI、中断、工具并发和恢复四方面回答。</div>"
    },
    {
      "id": "loop-state",
      "title": "3.2 State 与 7 个 Continue Sites：伪不可变跃迁",
      "sources": [
        "query-loop",
        "memory-recall"
      ],
      "qas": [
        "agent-loop-core"
      ],
      "html": "<p>长任务会经历几十次 API 请求、多个工具结果、压缩、恢复和用户中断。为了避免隐式共享变量失控，queryLoop 把跨轮变量收敛到一个 <code>State</code> 对象里：<code>messages</code>、<code>toolUseContext</code>、<code>turnCount</code>、<code>maxOutputTokensRecoveryCount</code>、<code>hasAttemptedReactiveCompact</code>、pending memory prefetch 等都从这里读写。</p><p>资料中把主循环归纳为 7 个关键 continue sites：Settings Resolution、Mutable State Initialization、Context Assembly、Pre-model Context Shapers、Model Call、Tool-use Dispatch、Stop Condition Assessment。每当系统需要进入下一轮，例如工具结果追加、上下文折叠、输出截断续写或媒体错误修复，都会先用 <code>state = { ... }</code> 重建完整快照，再显式 <code>continue</code> 回到循环顶部。</p><p class='level-intermediate'>这不是函数式洁癖，而是恢复性的最低要求。恢复分支必须同时说明 messages 怎么变、toolUseContext 是否刷新、恢复计数是否递增、哪些标记防止同一恢复无限重复。局部改几个变量，很容易在并发工具和异常路径中制造脏状态。</p><p class='level-advanced'>pending memory prefetch 体现了状态机里的并行优化：相关记忆召回可以在请求准备或模型流期间提前启动，但最终是否注入仍要回到 state 和消息组装边界，不能绕过主循环直接污染上下文。</p><div class='learning-check'><strong>小检查</strong>任选一个 continue 前的状态重建点，写出它修改了哪些字段，以及这些字段如何防止重复恢复或脏读。</div>"
    },
    {
      "id": "loop-pipeline",
      "title": "3.3 单轮迭代：从缓存前缀到工具结果的标准管线",
      "sources": [
        "query-loop",
        "compaction-pipeline",
        "prompt-boundary",
        "permission-modes"
      ],
      "qas": [
        "agent-loop-core"
      ],
      "html": "<p>理解 queryLoop 最稳的方式，是把一次迭代看成一条标准化管线，而不是一堆随意分支。</p><ol><li>从 <code>State</code> 取当前快照，解析模型、权限模式、最大轮次和工具上下文。</li><li>组装 system prompt、用户上下文、<code>&lt;system-reminder&gt;</code>、Memory 预取结果和工具池。</li><li>执行 pre-model shapers：Budget Reduction、HISTORY_SNIP、microcompact、context collapse、autocompact 等 <button class='inline-action source-trigger' data-source='compaction-pipeline'>压缩管线</button>。</li><li>保持 <button class='inline-action source-trigger' data-source='prompt-boundary'>Prompt Cache</button> 友好的前缀布局，避免动态数据击穿静态区。</li><li>发起流式模型调用，持续 yield 文本和事件。</li><li>解析完整 tool_use，送入 StreamingToolExecutor。</li><li>执行权限门，经过 allow、deny、ask、Hook、沙盒或远程审批。</li><li>运行工具，收集 stdout、stderr、结构化结果、错误和进度。</li><li>根据工具结果、恢复标记、预算和 stop 条件决定 continue 或返回 Terminal。</li></ol><p class='level-advanced'>这条管线是定位 bug 的坐标系。权限弹窗没出现，先看第 7 步；请求 413，先看第 3 步和第 9 步恢复；工具结果乱序，先看第 6-8 步；缓存失效，先看第 2-4 步是否引入动态前缀。</p><div class='learning-check'><strong>小检查</strong>如果添加一个新的动态上下文来源，你会把它接到第几步？如何保证它不破坏 Prompt Cache？</div>"
    },
    {
      "id": "loop-recovery",
      "title": "3.4 错误扣留：把可恢复异常转成下一轮输入",
      "sources": [
        "compaction-pipeline",
        "message-normalization",
        "query-loop"
      ],
      "qas": [
        "agent-loop-core"
      ],
      "html": "<p>生产级 Agent 的关键不是 happy path，而是失败后能否让会话继续。queryLoop 的恢复策略不是简单重试，而是先扣留可恢复错误，改变下一轮输入或状态，只有恢复耗尽后才向上游暴露最终异常。</p><ul><li><strong>Prompt Too Long / 413</strong>：错误不会立即 yield 给 UI 或 SDK，而是触发 context collapse 或 reactive compact，释放空间后带着 <code>hasAttemptedReactiveCompact</code> 等标记重试。</li><li><strong>媒体尺寸异常</strong>：大图、大 PDF、request_too_large 或 media_size_error 由 <button class='inline-action source-trigger' data-source='message-normalization'>消息规范化</button>局部剥离问题 block，保留文本、工具历史和可用上下文。</li><li><strong>Max Output Tokens</strong>：模型输出被截断时，系统可以提高输出窗口并注入续写元消息，例如要求模型直接继续、不要道歉，同时用 <code>maxOutputTokensRecoveryCount</code> 限制尝试次数。</li><li><strong>API 过载或流异常</strong>：能恢复的中间状态先留在 loop 内，转成重试、降级、提示模型继续或 Terminal exit；不能把半截错误过早交给会立刻关闭会话的上游消费者。</li></ul><p class='level-intermediate'>错误扣留尤其保护 SDK、Desktop App、远程桥接这类消费端。它们一旦收到未处理异常，可能直接终止会话，底层的压缩、剥离和重试就没有机会执行。</p><p class='level-advanced'>判断恢复路径是否合格，看四点：是否改变下一轮输入，是否保留 transcript 和调试证据，是否限制重复尝试次数，是否在最终失败时给出明确 Terminal 原因。</p><div class='learning-check'><strong>小检查</strong>任选 413、图片过大或输出截断，写出系统应扣留什么、修改什么 state、追加什么消息、何时停止恢复。</div>"
    },
    {
      "id": "loop-tool-scheduling",
      "title": "3.5 工具调度：并发分区、兄弟中止与顺序回填",
      "sources": [
        "streaming-tools",
        "tool-interface",
        "permission-modes"
      ],
      "qas": [
        "agent-loop-core"
      ],
      "html": "<p>工具调度是 queryLoop 和物理世界接触最密集的地方。StreamingToolExecutor 不会对所有 tool_use 简单 <code>Promise.all</code>，而是先根据工具的 <code>isConcurrencySafe</code> 和 <code>isReadOnly</code> 标签划分并发边界。</p><p>只读搜索、文件读取、grep 等可证明并发安全的工具可以并行，降低等待时间；FileEdit、FileWrite、Bash 这类可能修改外部状态的工具会切断并发分区，等待前序执行完成。未显式声明并发安全时，默认按不可并发处理。</p><p class='level-intermediate'>并行批次还需要兄弟中止控制。一个 Bash 子进程出现致命错误时，同批次关联进程可能已经失去前提条件；AbortController 会中止兄弟任务，避免脏进程继续改写文件系统。失败快比继续制造不可控副作用更安全。</p><p class='level-advanced'>结果回填必须保持模型请求顺序。即使底层并行执行，返回给模型的 tool_result 仍要按原 tool_use 顺序对齐，否则模型的注意力会把 A 的输出误配给 B 的调用，后续推理直接漂移。</p><div class='learning-check'><strong>小检查</strong>为什么只读不一定等于并发安全？请考虑共享缓存、速率限制、认证状态和外部系统副作用。</div>"
    },
    {
      "id": "loop-model-defenses",
      "title": "3.6 防幻觉与防懒惰：主循环里的不信任判定",
      "sources": [
        "file-edit-defenses",
        "yolo-classifier",
        "hook-invariant",
        "query-loop"
      ],
      "qas": [
        "agent-loop-core"
      ],
      "html": "<p>Harness 不默认相信模型。queryLoop 把模型的 tool_use 当成待验证意图，而不是可直接执行命令。后续章节会分别拆 Bash、FileEdit、权限和多 Agent，但防幻觉逻辑从主循环就已经开始。</p><ul><li><strong>写前必读</strong>：<button class='inline-action source-trigger' data-source='file-edit-defenses'>FileEditTool</button> 要求系统缓存中存在当前文件的 <code>readFileState</code>，并校验 mtime 与内容，防止模型凭旧记忆或训练语料盲改。</li><li><strong>不信任自动审批</strong>：Auto/YOLO 分类器与主模型分离。主模型提出行动，分类器审查行动；连续拒绝或重复高危试探会触发熔断，避免模型换语法消耗预算。</li><li><strong>Hook 不能提权</strong>：即使 Hook 返回 allow，仍要回到规则权限检查。deny 和 ask 不能被第三方扩展静默改写。</li><li><strong>验证必须有证据</strong>：Verification Agent 不能只说代码看起来没问题，必须回传实际命令、测试输出或可复现实验。没有物理输出，就只是模型自我确认。</li></ul><p class='level-advanced'>这些规则的共同点是把语义判断降级为物理证据：文件状态、权限规则、命令输出、测试日志、Hook 决策链。模型可以建议，Harness 必须验证。</p><div class='learning-check'><strong>小检查</strong>为什么模型说我已经看过这个文件不能作为 FileEdit 的写入依据？系统应该要求什么物理证据？</div>"
    },
    {
      "id": "loop-terminal",
      "title": "3.7 Terminal Exits 与预算防死循环",
      "sources": [
        "query-loop",
        "compaction-pipeline",
        "hook-invariant"
      ],
      "qas": [
        "agent-loop-core"
      ],
      "html": "<p><code>while true</code> 能安全运行的前提，是退出边界被严格定义。queryLoop 的合法收口不是随处抛异常，而是返回 Terminal 结果或 yield 明确的终止事件，让外围 QueryEngine、UI、遥测和 Hook 都知道会话为何结束。</p><p>常见终止原因包括：正常完成且没有新 tool_use、达到 <code>maxTurns</code>、prompt_too_long 恢复耗尽、StopHook 阻断、用户 Esc 中断模型流或工具执行、权限拒绝无法继续、预算策略主动停止、输出截断恢复次数耗尽等。</p><p class='level-intermediate'>无人值守任务还需要 Token Budget 与收益递减检测。系统可以在接近预算目标时注入 nudge，要求模型继续完成剩余工作；如果连续多轮增量输出很少，说明模型可能陷入尝试失败换语法的低产循环，循环应当主动收口。</p><p class='level-advanced'>Terminal exits 是治理接口。没有明确终止原因，遥测无法统计失败类型，UI 无法区分用户取消与系统耗尽恢复，Hook 无法执行正确的善后动作，resume 也无法判断上一轮是否完整结束。</p><div class='learning-check'><strong>小检查</strong>列出你自己的 Agent 至少 6 种终止原因，并说明哪些是正常结束，哪些是恢复耗尽，哪些是用户或策略中断。</div>"
    },
    {
      "id": "loop-philosophy",
      "title": "3.8 极简编排哲学：少做规划，多做边界",
      "sources": [
        "query-loop",
        "tool-interface",
        "permission-modes"
      ],
      "qas": [
        "agent-loop-core"
      ],
      "html": "<p>Claude Code 没有把所有任务预先建成复杂图状态机，也没有在系统层硬塞一个重 planner。它更接近极简 ReAct：模型决定下一步，Harness 机械地组装上下文、验证工具、检查权限、执行动作、记录结果、扣留错误并回到下一轮。</p><p>这不是放任模型，而是把约束放在更可靠的位置。模型可以自由提出计划，但工具 schema、权限门、文件状态、Hook 不变量、压缩预算和 Terminal exits 由代码执行。编排层越少替模型假设路径，越需要执行层边界清晰。</p><p class='level-advanced'>复杂图状态机当然能带来显式规划和可视化，但也会增加状态同步、缓存前缀漂移、恢复跳转和调试成本。Claude Code 的取舍是让主循环朴素，把确定性基础设施做厚。第 1 章的结论在这里落地：1.6% 的推理内核外面，是 98.4% 的工程线束。</p><div class='learning-check'><strong>小检查</strong>什么场景适合引入显式 planner？什么场景更适合保持 queryLoop 这种极简循环并加厚边界？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "agent-loop-core": {
    "framing": "本章把 queryLoop 解释为生产级 Agent 的可恢复异步状态机。重点不是 while(true)，而是 state 如何重建、错误如何扣留、工具如何调度、终止如何收口。",
    "points": [
      "AsyncGenerator 让模型流、UI 渲染、工具执行、恢复事件和最终 Terminal 结果都能通过同一条事件流推进。",
      "State 收拢 messages、toolUseContext、turnCount、恢复计数、reactive compact 标记和 pending memory prefetch，避免跨轮状态分裂。",
      "7 个 continue sites 把恢复、工具结果、上下文重塑和终止判定变成显式状态跃迁。",
      "Pre-model shapers 按成本递进处理上下文：预算裁剪、snip、microcompact、context collapse、autocompact。",
      "Error Withholding 会先扣留可恢复的 413、媒体错误和截断错误，修改下一轮输入后再重试。",
      "StreamingToolExecutor 按并发安全分区，必要时中止同批兄弟任务，并按 tool_use 顺序回填结果。",
      "防幻觉机制要求物理证据：读前写、YOLO 熔断、Hook 不变量、验证命令输出。",
      "Terminal exits 和预算防死循环定义生命周期边界，避免无限循环或异常撕裂。"
    ],
    "reading": [
      {
        "source": "query-loop",
        "label": "queryLoop 状态循环",
        "note": "先看函数签名、state 初始化、while true 和 continue sites。"
      },
      {
        "source": "compaction-pipeline",
        "label": "Pre-model shapers",
        "note": "观察上下文如何在请求前被裁剪、折叠或语义摘要。"
      },
      {
        "source": "streaming-tools",
        "label": "StreamingToolExecutor",
        "note": "理解工具如何边流式解析边排队执行。"
      }
    ],
    "pitfalls": [
      "不要把 queryLoop 当普通 retry loop。它同时承担流式输出、工具执行、权限拦截、错误扣留和状态恢复。",
      "不要只看最终返回值。很多重要行为发生在中途 yield 的事件里。",
      "不要在恢复分支里局部改变量。必须完整说明下一轮 state 的 messages、上下文、计数和标记。",
      "不要过早向上游暴露可恢复错误。SDK 或远程消费端可能因此直接关闭会话。",
      "不要把工具并发写成 Promise.all。并发安全、权限、顺序回填和 abort 语义都必须考虑。"
    ],
    "practice": "拿一个实际工具调用，按本章 9 步管线写出它从模型输出到工具结果回到下一轮模型请求的完整路径。"
  },
  "loop-streaming": {
    "framing": "queryLoop 是整套 Harness 的流式控制中心。理解它时，先掌握为什么用 async generator，再看它如何把模型流、工具执行、UI 渲染和恢复路径串起来。",
    "points": [
      "async generator 让模型流、工具进度、消息更新和 UI 可以边产生边消费，而不是等最终结果一次性返回。",
      "yield 的对象不只是文本，还包括 StreamEvent、中间状态、工具摘要、墓碑消息和恢复提示。",
      "StreamingToolExecutor 可以在模型输出过程中接管 tool-use 块，降低长任务交互延迟。",
      "流式控制和恢复路径耦合在一起：系统可以在中途发现错误、扣留可恢复异常、yield 状态并准备下一轮。"
    ],
    "reading": [
      {
        "source": "query-loop",
        "label": "queryLoop 状态初始化",
        "note": "先看函数签名和 async generator，再看 while true 的循环入口。"
      },
      {
        "source": "streaming-tools",
        "label": "StreamingToolExecutor",
        "note": "理解工具如何在流式输出期间排队、并发或阻塞。"
      }
    ],
    "pitfalls": [
      "不要把 queryLoop 当普通 retry loop。",
      "不要忽略 yield 的消息类型。",
      "不要只看最终返回值。很多重要行为发生在中途事件里。"
    ],
    "practice": "画一个 5 步状态图：用户输入、模型流、工具调用、工具结果、下一轮 state。每一步标出可能 yield 给 UI 的内容。"
  },
  "loop-state": {
    "framing": "这一节关注 state 如何收拢跨轮变量。长循环里最容易出问题的不是单个分支，而是多个恢复分支对同一组状态的更新不一致。",
    "points": [
      "State 把 messages、toolUseContext、turnCount、恢复计数、hasAttemptedReactiveCompact 和 pending prefetch 等跨轮变量收拢起来。",
      "每轮循环从 state 解构当前快照，然后执行上下文组装、压缩、模型请求、工具执行或恢复。",
      "continue sites 前必须显式重建 state，这种伪不可变写法让状态跃迁更容易审计。",
      "恢复标记和计数是防无限重试的关键，不是附属细节。"
    ],
    "reading": [
      {
        "source": "query-loop",
        "label": "State 字段",
        "note": "先列出字段，再追踪哪些分支会修改它们。"
      },
      {
        "source": "memory-recall",
        "label": "Memory 预取链路",
        "note": "理解为什么查询开始时就要启动相关记忆召回。"
      }
    ],
    "pitfalls": [
      "不要追丢 state 重建点。",
      "不要把恢复计数当小细节。",
      "不要漏看 hasAttemptedReactiveCompact 这类标记。",
      "不要把 Mutable state 误解成随手可改。这里的可变性被限制在显式快照更新里。"
    ],
    "practice": "找出 maxOutputTokensRecoveryCount 的更新路径，并说明它如何防止无限续写。"
  },
  "loop-pipeline": {
    "framing": "这一节把主循环拆成单轮标准管线。管线视角能帮助你定位 bug，也能避免在 while true 里迷路。",
    "points": [
      "每轮先从 state 取快照，再组装上下文、记忆预取结果和工具集合。",
      "模型请求前会经过多层上下文处理，避免把过大的历史直接送进 API。",
      "模型流中解析出的工具调用进入流式执行器，然后再过权限门和工具实现。",
      "一轮结束时要么追加工具结果进入下一轮，要么进入恢复分支，要么满足终止条件返回 Terminal。"
    ],
    "reading": [
      {
        "source": "query-loop",
        "label": "循环主干",
        "note": "按 9 步管线给源码分段标注。"
      },
      {
        "source": "compaction-pipeline",
        "label": "Pre-model shapers",
        "note": "观察请求前上下文怎样被裁剪、压缩或折叠。"
      },
      {
        "source": "permission-modes",
        "label": "Permission Gate",
        "note": "把工具执行前的权限判定放进管线位置里看。"
      }
    ],
    "pitfalls": [
      "不要把权限、工具和压缩混成一个大黑盒。",
      "不要只看 happy path。",
      "不要跳过 recovery withhold 分支。",
      "不要跳过终止检查。while true 合法运行的前提是退出条件清晰。"
    ],
    "practice": "拿一个实际工具调用，按 9 步管线写出它从模型输出到工具结果回到模型的完整路径。"
  },
  "loop-recovery": {
    "framing": "生产级 Agent 不怕失败，怕的是失败后只能重开。queryLoop 的恢复路径会先扣留可恢复错误，再把上下文过长、输出截断、模型过载、媒体错误等情况变成可继续的下一轮输入。",
    "points": [
      "上下文接近上限时，系统会优先触发压缩管线，而不是等 API 报错后才补救。",
      "Prompt Too Long 或媒体体积错误会走局部修复路径，例如折叠上下文或剥离过大附件。",
      "Max Output Tokens 可先提升输出窗口，再注入续写指令，让模型在不丢历史的情况下继续完成任务。",
      "Error Withholding 会避免把仍可恢复的 413、媒体错误或截断错误过早暴露给 SDK 上游。",
      "恢复路径必须有次数限制和最终 Terminal 原因。"
    ],
    "reading": [
      {
        "source": "compaction-pipeline",
        "label": "压缩作为恢复路径",
        "note": "看主动压缩和反应式压缩如何接入查询前处理。"
      },
      {
        "source": "message-normalization",
        "label": "媒体错误恢复",
        "note": "看它如何只剥离导致错误的 block types。"
      },
      {
        "source": "query-loop",
        "label": "Terminal exits",
        "note": "把所有 continue 和 return 统一映射到生命周期边界。"
      }
    ],
    "pitfalls": [
      "不要把失败恢复理解成简单重试。",
      "不要过早向上游暴露中间错误。",
      "不要过早总结历史。能局部剥离或折叠时，保留原始细节更有价值。",
      "不要忽略恢复次数限制。"
    ],
    "practice": "任选一个失败：图片过大、输出截断或模型 529。写出系统扣留什么错误、追加什么消息、修改什么状态、何时停止重试。"
  },
  "loop-tool-scheduling": {
    "framing": "这一节解释工具调度为什么不是 Promise.all。工具执行触碰真实系统，必须同时管理并发、权限、顺序和中止。",
    "points": [
      "并发安全由工具显式声明，默认不并发。",
      "只读工具也可能因为共享缓存、外部速率限制或认证状态而不适合并行。",
      "兄弟中止控制可以在同批任务出现致命错误时快速停止相关进程。",
      "结果回填顺序必须匹配 tool_use 顺序，保护模型注意力对齐。"
    ],
    "reading": [
      {
        "source": "streaming-tools",
        "label": "StreamingToolExecutor",
        "note": "看队列、执行中集合和 canExecuteTool 的条件。"
      },
      {
        "source": "tool-interface",
        "label": "Tool 接口",
        "note": "看 isConcurrencySafe 和 isReadOnly 如何进入调度。"
      }
    ],
    "pitfalls": [
      "不要把只读和并发安全画等号。",
      "不要忽略错误批次里的兄弟任务。",
      "不要让工具结果按完成时间回填给模型。"
    ],
    "practice": "给 FileRead、Grep、Bash、FileEdit 分别标注是否只读、是否并发安全，并说明理由。"
  },
  "loop-model-defenses": {
    "framing": "这一节把主循环视为不信任模型的执行环境。模型可以提出行动，但必须被文件状态、权限规则和测试输出验证。",
    "points": [
      "FileEdit 写前必读要求 readFileState，避免模型凭旧上下文或幻觉行号改文件。",
      "Auto/YOLO 分类器和主模型分离，避免模型自我审批高风险操作。",
      "连续拒绝或重复高危尝试要熔断，防止模型换语法消耗预算。",
      "Hook allow 不能覆盖规则 deny 或 ask。",
      "验证结论必须基于实际命令输出、测试日志或可复现实验。"
    ],
    "reading": [
      {
        "source": "file-edit-defenses",
        "label": "FileEdit 防线",
        "note": "看 read-before-write、mtime 和唯一匹配。"
      },
      {
        "source": "yolo-classifier",
        "label": "YOLO 分类器",
        "note": "看独立审查和 fail-closed。"
      },
      {
        "source": "hook-invariant",
        "label": "Hook 不变量",
        "note": "看第三方 allow 为什么不能绕过 deny/ask。"
      }
    ],
    "pitfalls": [
      "不要把模型记忆当作当前文件事实。",
      "不要让主模型自己审批自己的危险操作。",
      "不要接受没有测试输出的验证通过。"
    ],
    "practice": "设计一个验证 Agent 的完成标准，要求必须包含命令、输出摘要和失败时的下一步。"
  },
  "loop-terminal": {
    "framing": "这一节关注 while true 的退出边界。无限循环只有在终止原因清晰时才安全。",
    "points": [
      "Terminal exits 把正常完成、maxTurns、恢复耗尽、用户中断、StopHook 阻断和预算停止统一成可观测结果。",
      "Token Budget 可以推动无人值守任务继续工作，但必须配合收益递减检测。",
      "连续多轮低增量输出可能说明模型进入低产试错循环，应主动收口。",
      "明确终止原因让 UI、遥测、Hook 和 resume 都能做正确善后。"
    ],
    "reading": [
      {
        "source": "query-loop",
        "label": "queryLoop 终止",
        "note": "把 continue 和 return 分别映射到恢复与终止。"
      },
      {
        "source": "hook-invariant",
        "label": "StopHook",
        "note": "理解 Hook 如何影响最终生命周期。"
      }
    ],
    "pitfalls": [
      "不要用裸异常替代终止原因。",
      "不要让预算 nudge 变成无限继续。",
      "不要把用户中断和系统恢复耗尽混为一种失败。"
    ],
    "practice": "为你的 Agent 定义 Terminal 类型字段：reason、recoverable、userVisibleMessage、telemetryCode。"
  },
  "loop-philosophy": {
    "framing": "这一节解释 Claude Code 的编排取舍：主循环保持朴素，确定性基础设施做厚，让模型在清晰边界内自行决策。",
    "points": [
      "系统不把每个任务预先建成复杂图，而是让模型通过 ReAct 风格的工具调用推进任务。",
      "Harness 的职责是机械执行：解析工具、验证 schema、检查权限、运行工具、记录结果、扣留可恢复错误并收口 Terminal exits。",
      "确定性边界越清楚，模型自由决策越可控。",
      "复杂图状态机可能提升可视化和显式规划能力，但也会增加调试、恢复、缓存和状态同步成本。"
    ],
    "reading": [
      {
        "source": "query-loop",
        "label": "朴素主循环",
        "note": "看它如何通过少数确定性步骤支撑复杂任务。"
      },
      {
        "source": "tool-interface",
        "label": "工具契约",
        "note": "理解系统为什么把工具边界做厚，而不是只依赖模型自觉。"
      },
      {
        "source": "permission-modes",
        "label": "权限词汇表",
        "note": "把 allow、deny、ask 看成最小确定性控制面。"
      }
    ],
    "pitfalls": [
      "不要因为 while true 朴素就低估它。",
      "不要把 planner 当成必需品。",
      "不要忽略编排层的成本。越复杂的图，越需要处理缓存失效、恢复跳转和观测一致性。"
    ],
    "practice": "列出你会在什么场景引入显式 Planner，以及什么场景坚持 queryLoop 这种极简编排。"
  }
});
