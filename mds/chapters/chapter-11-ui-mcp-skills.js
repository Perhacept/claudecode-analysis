// Chapter 11: 第 11 章：UI、MCP 与 Skills
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "ui-mcp-skills",
  "title": "第 11 章：UI、MCP 与 Skills",
  "subtitle": "展示层和扩展层的真正难点，是在高频终端渲染、海量外部工具和复杂工作流之间继续守住上下文预算与 Prompt Cache。",
  "review": [
    "终端 UI 通过 BSU/ESU、双缓冲和对象池压低流式渲染成本",
    "MCP 用多传输协议、确定性工具池和 InProcess 分支控制网络与进程开销",
    "Tool Deferral 与 Skill Discovery 用按需注入保护 Token 预算和静态缓存前缀",
    "长期对象池重置、MCP 去重和远程 Skill 限权共同约束扩展层风险"
  ],
  "sections": [
    {
      "id": "ink-ui",
      "title": "11.1 终端渲染引擎：同步更新与双缓冲优化",
      "sources": [
        "ink-renderer"
      ],
      "qas": [
        "ui-mcp-skills"
      ],
      "html": "<p>Claude Code 的终端界面不是 stdout 字符串拼接，而是基于 React 与 Ink 风格框架维护终端组件树。模型逐字流式输出、工具进度、权限弹窗、Esc 中断和可编辑输入会同时驱动渲染层；如果每个事件都直接写终端，CPU、系统调用和画面闪烁都会被长会话放大。</p><p><button class='inline-action source-trigger' data-source='ink-renderer'>terminal patch 应用</button>会把多次差异写入合并到一个 buffer，并在终端支持时用 BSU/ESU 包裹整帧更新。终端只在完整 ANSI 指令到达后绘制，从协议层减少半帧状态、撕裂和中间态闪烁。</p><p class='level-intermediate'>源码分析还提到双缓冲、dirty 标记、CharPool 和 StylePool。可以把它理解为 FrontFrame/BackFrame 的差异渲染：未变化的字符和样式节点通过池化 ID 复用或 blit，避免重复字符串分配、ANSI 解析和整屏重绘；高频更新再按约 16ms 的节流窗口合并，逼近 60fps 的交互手感。</p><p class='level-advanced'>UI 性能会直接影响 Agent 的可控性。权限请求、Esc 中断和工具状态都依赖终端及时刷新；如果渲染阻塞，用户无法准确判断系统是否仍在执行，也无法在风险工具继续推进前完成干预。</p><p>查看 <button class='inline-action qa-trigger' data-qa='ui-mcp-skills'>UI/MCP/Skills QA</button>。</p><div class='learning-check'><strong>小检查</strong>为什么终端 UI 的半帧状态会影响用户对 Agent 执行风险的判断？如果工具每秒输出 100 行日志，渲染层应如何降载？</div>"
    },
    {
      "id": "mcp-transports-section",
      "title": "11.2 MCP 集成：多传输协议与稳定工具池",
      "sources": [
        "mcp-transports"
      ],
      "qas": [
        "ui-mcp-skills"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='mcp-transports'>MCP types</button> 展示了多种传输形态：stdio 适合本地轻量子进程，SSE、HTTP 和 WebSocket 适合远程服务或长连接能力，SDK Control 覆盖控制面通信，InProcess 则用于同进程模块调用。MCP 的价值不是单一协议，而是把不同物理位置、不同成本结构的外部能力收敛成统一工具接口。</p><p class='level-intermediate'>工具池组装必须保持确定性。内置工具按 A-Z 字母序稳定排列并放在前缀位置，外部 MCP 工具经过去重、黑名单和权限规则过滤后追加。这样用户动态增删 MCP 服务器时，核心内置工具的字节前缀仍尽量稳定，持续命中 Prompt Cache，而不是让每轮请求为工具顺序抖动重新付费。</p><p class='level-advanced'>InProcess 是一个关键性能分支。对 Chrome/Computer Use 这类重量级 MCP 服务，如果每次都通过 stdio 拉起独立 Node.js 子进程，会产生约数百 MB 的额外运行时开销和明显冷启动延迟；进程内传输把服务作为模块加载，减少 IPC、重复 V8 运行时和进程生命周期成本。</p><div class='learning-check'><strong>小检查</strong>为什么 MCP 同时需要 stdio、网络协议、SDK Control 和 InProcess，而不是统一使用一种传输？工具排序为什么会影响缓存成本？</div>"
    },
    {
      "id": "mcp-deferral",
      "title": "11.3 Tool Deferral：MCP Schema 的按需加载",
      "sources": [
        "mcp-transports"
      ],
      "qas": [
        "ui-mcp-skills"
      ],
      "html": "<p>外部 MCP 服务器可能暴露几十甚至上百个工具。如果启动时把所有 JSON Schema 全量注入上下文，Token 预算会被工具定义吞掉，静态 Prompt Cache 也会被动态工具生态持续扰动。Claude Code 使用 Tool Deferral 把“知道有这个能力”和“拿到完整参数结构”拆成两步。</p><p class='level-intermediate'>初始上下文只提供轻量工具存根：名称、简述和可检索入口。模型先在稳定目录里判断需要哪类外部能力，再通过原生 ToolSearchTool 拉取目标 MCP 工具的完整 schema。这是一种 compute-for-context 交换：用一次可控检索换取更小的前缀、更少的无关 schema 和更稳定的缓存命中。</p><p class='level-advanced'>Tool Deferral 也降低了模型行为扰动。模型不会在每轮都看到大量与当前任务无关的参数结构，而是在具体任务进入调用阶段时才加载高细节定义；这让外部工具生态可以扩张，而不把每轮 query 都变成工具手册全量再训练。</p><div class='learning-check'><strong>小检查</strong>如果一个 MCP 服务器有 80 个工具，全部注入和按需 ToolSearch 分别会带来什么 Token、延迟和行为稳定性成本？</div>"
    },
    {
      "id": "mcp-skills",
      "title": "11.4 Skills：声明式工作流、发现机制与上下文隔离",
      "sources": [
        "skill-fork"
      ],
      "qas": [
        "ui-mcp-skills"
      ],
      "html": "<p>Skills 是 Claude Code 的工作流定义层。一个 Skill 通常由 Markdown 文件描述，frontmatter 声明名称、描述、工具约束、参数约束和执行策略；加载器把它转成可被主循环调度的 <button class='inline-action source-trigger' data-source='skill-fork'>SkillTool</button>。</p><p class='level-intermediate'>当 command.context 为 fork 时，Skill 会在隐式子 Agent 中执行。子 Agent 拥有独立消息历史，主会话只接收最终结果，从而隔断长流程中的中间日志、搜索路径、试错推理和临时 Token，避免污染主上下文窗口。</p><p class='level-advanced'>Skill Discovery 同样是缓存工程。系统不会把所有 Skill 描述长期写进全局 System Prompt，而是在每轮对话中根据用户最新输入匹配相关 Skills，并作为 attachment 单次动态注入当前轮次；compact 后这些注入会被清理，下一轮重新评估。这样模型获得当前任务需要的工作流提示，但静态前缀不会被技能库规模持续拖垮。</p><div class='learning-check'><strong>小检查</strong>什么时候一个 Skill 应该 fork 执行？什么时候应该留在当前上下文？为什么 compact 后需要重新进行 Skill Discovery？</div>"
    },
    {
      "id": "extension-cost-boundaries",
      "title": "11.5 成本与安全边界：长会话、MCP 去重与 Skill 信任",
      "sources": [
        "ink-renderer",
        "mcp-transports",
        "settings-compat",
        "skill-fork"
      ],
      "qas": [
        "ui-mcp-skills"
      ],
      "html": "<p>扩展层最大的长期风险不是单次功能失败，而是长会话持续运行后的资源泄漏与上下文熵增。终端渲染的 CharPool、StylePool、HyperlinkPool 不能无限增长；源码分析建议关注周期性对象池重置：只迁移当前屏幕仍可见的 cell 引用，释放历史不可见的字符、样式和链接对象，避免数小时会话把 UI 层变成 Node.js OOM 的来源。</p><p class='level-intermediate'>MCP 配置合并也不能是简单 array push。外部服务器可能来自全局配置、项目配置、企业托管策略、插件自动发现、IDE/网页同步和本地临时覆盖。合并时必须按 URL 或 command 数组精确去重；外部工具与内置工具重名时，内置工具优先；企业 denylist 拥有最高否决权，防止低信任来源把不合规服务注入工具池。</p><p class='level-advanced'>Skill 的执行边界还要区分来源信任。本地项目或用户全局 Skills 可以在权限系统约束下声明内联 Shell 步骤；远程 MCP 动态推送的 Skills 则应禁止内联 Shell，避免第三方服务器通过 Markdown 工作流绕过 BashTool、Hooks 和审批门取得宿主机 RCE。这里的原则是：扩展可以动态发现，但执行能力必须按来源分级。</p><div class='learning-check'><strong>小检查</strong>为什么远程 MCP 推送的 Skill 不应该拥有和本地 Skill 相同的 Shell 执行能力？MCP 去重失败会怎样同时影响安全和缓存？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "ink-ui": {
    "framing": "终端 UI 是 Claude Code 的控制面。它要在纯文本环境里承载流式模型输出、工具进度、权限审批和可打断输入，因此渲染层必须按照应用 UI 的标准做性能工程。",
    "points": [
      "BSU/ESU 同步更新把一整帧 ANSI 指令包起来，避免用户看到半帧中间态。",
      "terminal patch buffer 将多次 diff 合并成更少的 stdout.write，降低闪烁、系统调用和终端解析成本。",
      "双缓冲、dirty 标记、CharPool 和 StylePool 用于减少重复字符串处理、ANSI 解析和整屏重绘。",
      "UI 响应速度影响权限弹窗、Esc 中断和工具状态展示，不能被视为后端无关层。"
    ],
    "reading": [
      {
        "source": "ink-renderer",
        "label": "terminal patch buffer",
        "note": "看 diff 如何合并到一次或少量 stdout.write。"
      },
      {
        "source": "query-loop",
        "label": "流式 yield",
        "note": "把 UI 渲染和 async generator 的事件流连起来。"
      }
    ],
    "pitfalls": [
      "不要把终端渲染当 console.log。长会话会放大每一次字符串分配和样式解析。",
      "不要让高频工具日志绕过节流和缓冲。渲染压力会影响用户中断能力。",
      "不要忽略权限弹窗和状态行。Agent 可控性依赖这些 UI 信号及时更新。"
    ],
    "practice": "假设工具每秒输出 100 行日志，你会如何减少终端闪烁和 CPU 占用？列出三种策略。"
  },
  "mcp-transports-section": {
    "framing": "MCP 把外部能力接入 Claude Code，但不同能力的成本、可信边界和物理位置差异很大，因此传输层需要同时覆盖本地子进程、远程服务、SDK 控制面和进程内模块。",
    "points": [
      "stdio 适合轻量本地服务；SSE、HTTP 和 WebSocket 适合远程服务或长连接能力。",
      "SDK Control 处理 SDK 守护与控制面通信，InProcess 处理重量级本地能力的内存复用。",
      "工具池组装要保持确定性：内置工具 A-Z 稳定排序，MCP 工具过滤去重后追加。",
      "外部工具变化不能频繁破坏核心 prompt cache，否则每轮请求都会付出额外 token 和延迟成本。"
    ],
    "reading": [
      {
        "source": "mcp-transports",
        "label": "MCP transport schema",
        "note": "先掌握各种连接方式的配置差异。"
      },
      {
        "source": "streaming-tools",
        "label": "工具刷新",
        "note": "理解 MCP 工具热加载为什么要接到每轮 query。"
      }
    ],
    "pitfalls": [
      "不要把 MCP 当无限信任的本地工具。远程服务、headers 和 OAuth 都有安全边界。",
      "不要为重量级服务默认拉子进程。冷启动、内存和 IPC 成本会被频繁调用放大。",
      "不要让 MCP 工具随机排序。工具顺序不稳定会伤害缓存与可复现性。"
    ],
    "practice": "给三个 MCP 服务选传输：本地 Git 工具、远程 Linear 服务、Chrome 控制服务，并说明理由。"
  },
  "mcp-deferral": {
    "framing": "Tool Deferral 解决 MCP 工具生态和上下文预算之间的矛盾。系统先给模型稳定、轻量的能力索引，再按任务需要拉取完整工具 schema。",
    "points": [
      "初始上下文只放工具名称、简述和检索入口，避免几十个 JSON Schema 挤占 token。",
      "ToolSearchTool 作为原生工具，让模型主动请求某个外部工具的完整参数结构。",
      "延迟加载让动态 MCP 服务器不会持续破坏静态前缀缓存。",
      "这是一种上下文治理策略，不只是 MCP 加载优化。"
    ],
    "reading": [
      {
        "source": "mcp-transports",
        "label": "MCP transport schema",
        "note": "先理解 MCP 工具来自哪些服务器，再看为什么需要按需 schema。"
      },
      {
        "source": "query-loop",
        "label": "主循环工具池",
        "note": "关注每轮请求中工具列表如何进入模型上下文。"
      }
    ],
    "pitfalls": [
      "不要把所有外部工具 schema 一次性塞进上下文。工具越多，模型越容易被无关能力干扰。",
      "不要只给工具名称而没有检索入口。模型需要可控路径拿到完整参数。",
      "不要忽略远程工具变化。按需加载可以降低变化对主 prompt 的影响。"
    ],
    "practice": "设计一个 ToolSearch 返回格式：它至少应该包含哪些字段，才能让模型安全调用目标 MCP 工具？"
  },
  "mcp-skills": {
    "framing": "Skills 把可复用流程从核心源码中抽离出来。MCP 解决外部系统连接，Skills 解决工作流描述、发现和执行隔离。",
    "points": [
      "Skill 以 Markdown 和 frontmatter 声明描述、约束和执行策略。",
      "context fork 会派生子 Agent 执行复杂流程，主会话只接收最终结果。",
      "Skill Discovery 按当前用户输入动态推送相关技能，而不是把全部技能写死进 System Prompt。",
      "compact 后动态注入会被清理，下一轮需要重新评估相关技能。"
    ],
    "reading": [
      {
        "source": "skill-fork",
        "label": "Skill context fork",
        "note": "看 command.context 如何决定执行隔离。"
      },
      {
        "source": "mcp-transports",
        "label": "MCP 与 Skills",
        "note": "注意 MCP skills 和本地 skills 的能力来源差异。"
      }
    ],
    "pitfalls": [
      "不要把所有 Skill 一次性塞给模型。按需发现才能控制 token。",
      "不要让长流程 Skill 污染主会话。日志、搜索和临时推理适合放在 fork 中。",
      "不要忽略 compact 后的技能遗忘风险。技能指令如果被清掉，需要重新注入机制。"
    ],
    "practice": "设计一个 deploy skill：哪些步骤应在 fork 子 Agent 中跑，哪些结果必须回到主会话给用户确认？"
  },
  "extension-cost-boundaries": {
    "framing": "UI、MCP 与 Skills 都属于扩展面。扩展面越大，越需要物理资源上限、确定性合并和来源信任边界，否则功能增长会直接变成上下文污染、安全绕过和长会话内存泄漏。",
    "points": [
      "终端对象池应有周期性重置策略，只保留当前屏幕仍可见的 cell 引用，释放历史样式和字符对象。",
      "MCP 配置可能来自多个来源，合并时要按 URL、command 和名称去重，并让内置工具优先。",
      "企业 denylist 应在 MCP 合并阶段一票否决，不能等工具进入模型上下文后再补救。",
      "本地 Skill 与远程 MCP 推送 Skill 的 Shell 能力不能等价；远程来源默认不应执行内联 Shell。"
    ],
    "reading": [
      {
        "source": "ink-renderer",
        "label": "Terminal renderer",
        "note": "把对象池、diff 和同步更新放到长会话内存治理里理解。"
      },
      {
        "source": "mcp-transports",
        "label": "MCP transports",
        "note": "区分传输协议、配置来源和工具池组装。"
      },
      {
        "source": "settings-compat",
        "label": "Settings merge",
        "note": "MCP 去重与企业 denylist 属于配置治理的一部分。"
      },
      {
        "source": "skill-fork",
        "label": "Skill execution",
        "note": "对照 fork 隔离和来源信任边界。"
      }
    ],
    "pitfalls": [
      "不要只测短会话 UI。长时间输出才会暴露对象池、样式池和终端 buffer 的内存问题。",
      "不要让 MCP Server 只按名称覆盖。URL、command、来源和企业策略都影响最终信任边界。",
      "不要让远程 Skill 通过 Markdown 内联 Shell 获得本地执行权。Shell 能力必须回到工具权限管线。"
    ],
    "practice": "设计一套 MCP 合并规则：列出六个配置来源、去重键、内置工具重名处理和企业 denylist 的最终优先级。"
  }
});
