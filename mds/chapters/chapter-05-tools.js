// Chapter 5: 第 5 章：工具系统与底层执行流
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "tools",
  "title": "第 5 章：工具系统与底层执行流",
  "subtitle": "工具系统把模型文本意图转换成可验证、可调度、可审计的物理操作，同时继续维护缓存前缀和上下文预算。",
  "review": [
    "Tool 是能力声明、输入 schema、权限语义和结果预算的组合",
    "StreamingToolExecutor 用并发安全标记做动态分区",
    "tool.call 只是执行链后段，前面还有验证、Hook、权限和沙盒",
    "工具池排序、延迟加载和 contextModifier 都服务成本与副作用隔离",
    "工具输出预算从源头阻止单次结果撑爆上下文"
  ],
  "sections": [
    {
      "id": "tools-contract",
      "title": "5.1 Tool 接口：结构化契约与 fail-closed 默认值",
      "sources": [
        "tool-interface"
      ],
      "qas": [
        "tool-system"
      ],
      "html": "<p>Claude Code 的工具不是普通函数注册。<button class='inline-action source-trigger' data-source='tool-interface'>Tool 接口</button>要求工具声明 <code>inputSchema</code>、<code>call</code>、<code>description</code>、<code>isConcurrencySafe</code>、<code>isReadOnly</code>、<code>isDestructive</code>、<code>checkPermissions</code>、<code>maxResultSizeChars</code> 等字段。模型提出行动后，Harness 可以先验证输入、判断权限、规划并发并限制返回体积。</p><p class='level-beginner'>初级读法是把 Tool 拆成四部分：模型能看到什么描述，模型输出如何被 schema 验证，执行前是否需要权限，执行后结果如何进入上下文。</p><p class='level-intermediate'>安全相关默认值采用 fail-closed。未显式声明并发安全，就按不可并发处理；未显式声明只读，就按可能产生副作用处理；结果大小没有明确预算，就会把上下文窗口暴露给超大输出风险。<code>maxResultSizeChars</code> 是工具侧的预算阀门，超大日志应被截断、摘要化或落盘成引用，而不是原样倒进下一轮 prompt。</p><p class='level-advanced'>源码里 <code>checkPermissions</code> 默认 allow 并不代表工具绕过安全。工具级检查只处理具体语义，后续仍会经过通用权限规则、Hooks、canUseTool、沙盒和工具专属防线。工具 schema 还必须尽量静态，动态生成字段会制造请求前缀抖动，把第 4 章死保的 Prompt Cache 打碎。</p><p>查看 <button class='inline-action qa-trigger' data-qa='tool-system'>Tool System QA</button>。</p><div class='learning-check'><strong>小检查</strong>如果新增一个 DeleteFileTool，哪些字段必须显式设计？至少写出 inputSchema、权限策略、并发安全、只读/破坏性标记和结果大小策略。</div>"
    },
    {
      "id": "tools-streaming",
      "title": "5.2 StreamingToolExecutor：流式执行与动态并发分区",
      "sources": [
        "streaming-tools",
        "tool-interface"
      ],
      "qas": [
        "tool-system"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='streaming-tools'>StreamingToolExecutor</button> 不等待模型完整回答结束。只要流里解析出完整 <code>tool_use</code> 块，它就把工具加入调度队列，并根据 <code>isConcurrencySafe</code> 决定立即执行还是等待。这是一种边生成、边解析、边执行的流式管线，目标是把模型输出延迟和 I/O 延迟重叠起来。</p><p class='level-beginner'>核心规则只有两个：没有工具正在执行时，队首工具可以开始；已有工具执行中时，只有新工具和所有执行中工具都声明为并发安全，才允许并行。</p><p class='level-intermediate'>这个规则把性能收益集中给读类、搜索类和可证明安全的 I/O 工具。连续 FileRead、Grep 可以并发，延迟接近最慢的一次读取；FileEdit、FileWrite、Bash 等可能修改外部状态的工具会切断并发分区，等待前序任务结束。</p><p class='level-advanced'>并发不是简单 <code>Promise.all</code>。执行器维护队列、运行中集合、结果顺序和 abort controller。并行批次中 Bash 等工具产生致命错误时，<code>siblingAbortController</code> 可以中止同批次兄弟进程，切断无效后台计算；主 query loop 则扣留异常，把错误标准化成工具结果交给模型进入下一轮恢复。</p><div class='learning-check'><strong>小检查</strong>为什么“只读”不天然等于“并发安全”？请考虑网络请求、外部速率限制、共享缓存和认证状态。</div>"
    },
    {
      "id": "tools-execution-pipeline",
      "title": "5.3 7 步执行链：tool.call 之前发生了什么",
      "sources": [
        "tool-interface",
        "streaming-tools",
        "hook-invariant",
        "permission-modes"
      ],
      "qas": [
        "tool-system",
        "permission-hooks"
      ],
      "html": "<p>执行工具不是直接调用 <code>tool.call()</code>。生产链路要先把模型生成的 JSON 意图转成可审计的物理操作，并把失败转换成标准工具结果交还给模型，而不是让异常撕裂 Agent Loop。</p><ol><li><strong>Schema 解析</strong>：用 <code>inputSchema</code> 拦住字段缺失、类型错误和非法枚举。</li><li><strong>业务验证</strong>：工具自己的 <code>validateInput</code> 或等价逻辑检查路径、参数组合、读写前置条件；FileEdit 这类写工具还会检查 <code>readFileState</code>，防止模型凭过期记忆盲改。</li><li><strong>PreToolUse Hook</strong>：生命周期扩展可以审计、阻断或要求额外确认，但不能越过规则权限。</li><li><strong>权限裁决</strong>：通用权限引擎把动作收敛成 <code>allow</code>、<code>deny</code>、<code>ask</code>。</li><li><strong>沙盒与运行时封装</strong>：根据工具类型准备 abort signal、权限上下文、cwd、环境限制和 UI 回调。</li><li><strong>tool.call</strong>：真正执行工具，实现文件、Shell、搜索、MCP 或其它能力。</li><li><strong>结果标准化</strong>：执行 <code>maxResultSizeChars</code> 等输出预算，生成用户可见摘要，必要时返回 <code>contextModifier</code> 延迟修改全局状态。</li></ol><p class='level-advanced'><code>contextModifier</code> 是副作用隔离的关键。工具执行后如果要更新 cwd、文件访问状态或 app state，不能在并发工具内部随手改全局变量，而是返回延迟修改器，由执行器在安全时机按顺序应用。</p><div class='learning-check'><strong>小检查</strong>如果一个工具的 schema 通过了，但 PreToolUse Hook 要求询问用户，后续权限规则又命中 deny，最终应该怎样处理？</div>"
    },
    {
      "id": "tools-pool-context",
      "title": "5.4 工具池组装：强制排序、延迟加载与上下文预算",
      "sources": [
        "tool-interface",
        "streaming-tools",
        "prompt-boundary"
      ],
      "qas": [
        "tool-system",
        "context-cache"
      ],
      "html": "<p>发给模型的工具列表不是简单拼接。<code>assembleToolPool</code> 会先组装内置工具，再合并 MCP 工具；两类工具分别稳定排序，并让内置工具形成字节级固定前缀。这个设计直接服务第 4 章的 <button class='inline-action source-trigger' data-source='prompt-boundary'>Prompt Caching 动静隔离</button>。</p><p class='level-intermediate'>内置工具 schema 往往占用大量 token。如果外部 MCP 工具随机插入到内置工具之间，每次增删外部能力都会打碎前缀缓存。源码让 MCP 工具后置，并在组装阶段通过 <code>filterToolsByDenyRules()</code> 预先过滤被 blanket deny 命中的工具，使模型在请求层面看不到这些能力，也不会为不可用工具浪费推理 token。</p><p class='level-advanced'>工具数量继续增长后，完整 JSON Schema 本身会变成上下文负担。Claude Code 用 <code>shouldDefer</code>、<code>alwaysLoad</code> 和 <code>ToolSearchTool</code> 做延迟加载：低频或外部工具初始只暴露存根，模型需要时再主动检索完整 schema。这是用一次额外工具查询换首轮请求瘦身。</p><p>每次 <code>call()</code> 还会收到一个显式 <code>ToolUseContext</code>：abortController、MCP 客户端、权限上下文、readFileState、app state 读写、工具池刷新、通知和 UI 回调都从这里进入。它把当前查询的运行时事实装进受控对象，避免工具依赖隐式全局状态，也减少多 Agent 并发时的内存污染。</p><div class='learning-check'><strong>小检查</strong>为什么工具池要让内置工具保持稳定前缀？如果 MCP 工具随机插入到内置工具之间，会怎样影响 prompt cache？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "tools-contract": {
    "framing": "Tool System 是模型接触外部环境的正规入口。每个工具都应被理解为“能力声明 + 输入 schema + 权限语义 + 并发语义 + UI 语义 + 结果预算”的组合，而不是一个裸函数。",
    "points": [
      "inputSchema 是模型输出能否落地的第一道结构化约束，错误参数会在执行前被拦住。",
      "isReadOnly、isConcurrencySafe、isDestructive 等标记影响权限、调度和用户体验。",
      "maxResultSizeChars 说明工具输出也要纳入上下文预算，超大结果必须落盘、截断或被替换成预览。",
      "validateInput 和 checkPermissions 分别处理输入合法性与权限语义，职责不能混在一起。",
      "Fail-closed 默认值让新增工具在遗漏声明时倾向保守，而不是意外并发或静默写入。",
      "工具 schema 应尽量静态，动态字段会造成请求前缀抖动并击穿 Prompt Cache。"
    ],
    "reading": [
      {
        "source": "tool-interface",
        "label": "Tool 类型定义",
        "note": "按输入、执行、验证、权限、渲染、并发、结果预算七类给字段分组。"
      },
      {
        "source": "streaming-tools",
        "label": "执行器如何使用工具标记",
        "note": "看 Tool 声明如何影响真实调度。"
      }
    ],
    "pitfalls": [
      "不要新增工具时只写 call。没有 schema、权限和结果大小限制的工具很难进入生产。",
      "不要把 readOnly 当安全充分条件。只读工具也可能触发网络、缓存或认证副作用。",
      "不要让工具返回无预算长文本。一个 10MB 日志足以让后续压缩管线被迫进入昂贵恢复路径。",
      "不要忽略用户可见名称和渲染信息。终端 Agent 的可解释性也属于安全体验。"
    ],
    "practice": "设计一个 WordCountTool：写出 input schema、是否 readOnly、是否 concurrency safe、最大结果大小和权限策略。"
  },
  "tools-streaming": {
    "framing": "StreamingToolExecutor 让工具调用不必等模型完整回答结束。它在模型流里提前发现工具块，能跑就跑，不能并发就排队，性能收益来自明确的安全分类。",
    "points": [
      "连续可证明并发安全的工具可以重叠执行，读取多个文件时延迟接近最慢的那一个。",
      "写入、编辑、删除、外部状态修改等工具会阻塞队列，避免行号偏移、缓存污染和竞态条件。",
      "schema 解析失败或 isConcurrencySafe 抛错时，执行器默认按不并发安全处理。",
      "Bash 工具失败时可以通过 sibling abort 中止兄弟子进程，但 query loop 本身仍能使用错误消息继续恢复。",
      "执行器维护结果顺序与 UI 进度事件，因此并发批次不能被简化成一次普通 Promise.all。"
    ],
    "reading": [
      {
        "source": "streaming-tools",
        "label": "canExecuteTool",
        "note": "理解“没有执行中工具”或“全部并发安全”这两个条件。"
      },
      {
        "source": "tool-interface",
        "label": "isConcurrencySafe 默认值",
        "note": "回看工具默认不安全如何影响队列。"
      }
    ],
    "pitfalls": [
      "不要为了速度让写工具并发。两个 Edit 同时改同一文件，收益会变成数据损坏风险。",
      "不要把工具批处理理解成一次性 Promise.all。源码会动态维护队列、执行中状态和结果顺序。",
      "不要忽略工具进度事件。流式 UI 能展示进展，靠的是执行器把结果逐步吐回。"
    ],
    "practice": "给一组工具调用排序：Read A、Read B、Edit A、Grep、Bash npm test。标出哪些能并发，哪些必须等待。"
  },
  "tools-execution-pipeline": {
    "framing": "tool.call 只是执行链的后段。真正的工业级工具执行要先完成结构化解析、业务验证、Hook 拦截、权限裁决和运行时封装，再把结果标准化回消息流。",
    "points": [
      "Zod schema 负责结构形状，validateInput 负责工具语义，两者失败都应转成模型可读的工具错误。",
      "写工具可以在 validateInput 阶段绑定 readFileState，强制写前必读，阻止模型凭幻觉行号盲改。",
      "PreToolUse Hook 可以审计、阻断或要求确认，但 Hook allow 不能覆盖后续 rule-based deny 或 ask。",
      "权限引擎把复杂规则收敛为 allow、deny、ask，再由 canUseTool 或 UI 处理人工确认。",
      "沙盒和 ToolUseContext 把 cwd、环境、abort signal、readFileState 和 UI 回调统一注入工具。",
      "contextModifier 把全局状态修改延迟到安全时机应用，避免并发工具污染共享状态。"
    ],
    "reading": [
      {
        "source": "tool-interface",
        "label": "validateInput / checkPermissions / ToolUseContext",
        "note": "把工具声明和运行时上下文一起读。"
      },
      {
        "source": "hook-invariant",
        "label": "Hook allow 后仍查规则",
        "note": "理解扩展点为什么不能提权。"
      },
      {
        "source": "permission-modes",
        "label": "allow / deny / ask",
        "note": "把权限原子行为接入工具执行链。"
      }
    ],
    "pitfalls": [
      "不要把 schema 通过当成可以执行。语义校验、Hook 和权限仍可能拒绝。",
      "不要在工具内部直接改全局 AppState。并发执行下这会制造隐蔽竞态。",
      "不要把工具异常直接抛穿主循环。模型需要标准化错误结果来重新规划。"
    ],
    "practice": "设计一个 MoveFileTool 的执行链：schema、validateInput、PreToolUse、权限、沙盒、call、contextModifier 各自负责什么？"
  },
  "tools-pool-context": {
    "framing": "大型 Agent 的工具系统还必须解决上下文组装和状态隔离问题。工具越多，越需要稳定排序、按需加载和明确的运行时上下文边界。",
    "points": [
      "assembleToolPool 让内置工具形成稳定排序前缀，再追加经过过滤和排序的 MCP 工具，以保护 prompt cache。",
      "filterToolsByDenyRules 在请求前剔除 blanket deny 命中的工具，使模型没有机会选择已禁用能力。",
      "shouldDefer、alwaysLoad 和 ToolSearchTool 把完整 schema 从首轮请求中移出，降低 token 成本和首字延迟。",
      "ToolUseContext 汇集 abortController、MCP 客户端、权限上下文、readFileState、app state、工具刷新、通知和 UI 回调，是工具运行时的受控入口。",
      "工具定义本身也是上下文资产，不能因为接入大量 MCP 服务器就无条件全部注入。"
    ],
    "reading": [
      {
        "source": "tool-interface",
        "label": "ToolSearch 字段与 ToolUseContext",
        "note": "看 shouldDefer、alwaysLoad、ToolUseContext 和结果预算字段。"
      },
      {
        "source": "streaming-tools",
        "label": "contextModifier 应用时机",
        "note": "追执行器如何收集和应用工具返回的上下文修改。"
      },
      {
        "source": "prompt-boundary",
        "label": "Prompt cache 前缀",
        "note": "把工具排序放回字节级缓存约束中理解。"
      }
    ],
    "pitfalls": [
      "不要让 MCP 工具随机改变内置工具前缀。前缀抖动会降低缓存命中率。",
      "不要一次性塞入所有长尾工具 schema。工具定义本身也会耗尽上下文。",
      "不要在工具内部随意修改全局状态。跨轮状态要通过 ToolUseContext 和 contextModifier 管控。",
      "不要只在执行时拒绝被禁用工具。能在工具池组装阶段过滤，就应让模型一开始看不到它。"
    ],
    "practice": "解释一个工具从“注册到被模型调用”的路径：工具池组装、deny 过滤、可能的延迟加载、schema 验证、权限检查、执行和状态修改分别发生在哪里？"
  }
});
