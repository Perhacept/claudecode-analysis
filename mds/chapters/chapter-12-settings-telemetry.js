// Chapter 12: 第 12 章：设置、遥测与实战复盘
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "settings",
  "title": "第 12 章：设置、遥测与工程实践复盘",
  "subtitle": "生产级 Agent 的长期运行，依赖配置防冲突机制、多通道可观测性、Feature Flags 和可以随着模型进步而删除的工程线束。",
  "review": [
    "Settings 通过七级覆盖、passthrough 和 drop-in 分发处理长期配置演化",
    "数组合并语义保护企业 deny 等安全不变量，防止低信任来源擦除底线",
    "遥测、DCE、PII 过滤和 Mini Harness 清单把源码阅读落回可验证工程实践",
    "Prompt Cache、防幻觉和错误扣留构成全书首尾呼应的三条物理暗线"
  ],
  "sections": [
    {
      "id": "settings-compat-section",
      "title": "12.1 Settings 治理：七级覆盖与 Drop-in 分发",
      "sources": [
        "settings-compat"
      ],
      "qas": [
        "settings-reflection"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='settings-compat'>Settings 源码</button>体现了长期产品必须具备的配置兼容能力。Claude Code 的设置不是单个 JSON 文件，而是由用户设置、项目设置、本地覆盖、企业托管策略、运行参数等来源组成的多层覆盖链；源码分析中可归纳为七级覆盖，难点在优先级、兼容性和审计语义都必须可解释。</p><p class='level-intermediate'>解析层采用 passthrough：运行时严格使用 schema 认可的字段，但读取和写回时保留未知字段。这样旧版本字段、实验字段、企业字段或插件字段不会因为一次跨版本编辑被删除，配置文件可以在长期演化中保持向前兼容。</p><p class='level-advanced'>企业托管配置不仅支持 managed-settings.json，也支持 managed-settings.d/*.json drop-in。安全、平台、合规团队可以把策略拆成独立文件，系统启动时按确定顺序合并，避免所有组织策略挤进一个不可维护的单文件。</p><p>查看 <button class='inline-action qa-trigger' data-qa='settings-reflection'>设置与反思 QA</button>。</p><div class='learning-check'><strong>小检查</strong>为什么“遇到未知字段就删除”在长期项目里很危险？drop-in 目录为什么需要确定的合并顺序？</div>"
    },
    {
      "id": "settings-merge-invariant",
      "title": "12.2 Merge Semantics：数组合并的安全不变量",
      "sources": [
        "settings-compat"
      ],
      "qas": [
        "settings-reflection"
      ],
      "html": "<p>Settings 合并不是简单的高优先级覆盖低优先级。对标量字段，高优先级值可以覆盖；但对 deny、allowlist、MCP server 等数组字段，源码采用类似 concat + uniq 的合并语义，让多个来源的规则共同进入最终配置。</p><p class='level-intermediate'>这对 deny 规则尤其关键。假设企业策略写入 deny Bash(sudo)，项目配置又声明 allow Bash(*)；如果数组字段被项目级配置整体覆盖，企业安全底线就会被抹掉。拼接并去重能保证企业 deny 仍进入最终权限漏斗，再由 deny-first 规则压过低信任层的 allow。</p><p class='level-advanced'>这里的核心是安全不变量：更低信任层级可以补充自己的规则，但不能删除更高信任层级已经声明的底线。配置合并错误不会停留在 settings 层，它会直接变成工具执行层的越权。</p><div class='learning-check'><strong>小检查</strong>企业 deny Bash(sudo)，项目 allow Bash(*)。合并后最终权限判断应该如何处理，为什么？</div>"
    },
    {
      "id": "telemetry-observability",
      "title": "12.3 可观测性：遥测、Feature Flags 与防泄露",
      "sources": [
        "telemetry-sinks",
        "settings-compat"
      ],
      "qas": [
        "settings-reflection"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='telemetry-sinks'>setup 阶段</button>会尽早初始化 analytics sinks、session file access hooks、team memory watcher 等外围设施，并在主循环启动前打出启动信号。这样即使 Agent Loop 失败，系统仍能留下启动失败、配置错误、环境异常或文件访问异常的观测入口。</p><p class='level-intermediate'>生产级 Agent 的遥测不是一个可选上报函数，而是三通道可观测体系。第一条是请求元数据或 API Header，携带客户端版本、入口点、会话哈希等最小排障字段；第二条是第一方深度事件流，用模型、仓库指纹、OS、终端、包管理器、CPU/内存曲线和成本轨迹描述 5 层环境指纹；第三条是 Datadog 类白名单报警，专门盯住 API 失败、OAuth、compact 失败、远程连接和启动异常。</p><p class='level-intermediate'>遥测自身也要容错。事件应按时间或数量批量发送，例如 5 秒或 200 条阈值；网络失败时先落本地 JSON 队列并退避重试；遇到鉴权失败时可以降级为匿名崩溃信号，避免最需要排障的失败路径反而丢失观测数据。长周期 Agent 的许多错误是静默的；没有环境指纹，就很难定位特定 WSL、容器、终端或包管理器组合下的长尾死锁。</p><p class='level-intermediate'>这套体系还必须防泄露。涉及 Plugin、MCP Server、Skill 名称等可识别部署形态的数据应被视为 PII 或准 PII，在进入监控平台前做字段剥离；外部 MCP 工具名称可归一成 mcp，用户 prompt 内容默认 redacted，只有明确配置才允许进入更深层事件。</p><p class='level-advanced'>Feature Flags 和编译时门控把治理推到发布边界。源码通过 feature gate 控制记忆、多 Agent、MCP、远程能力和实验能力；构建阶段的 dead code elimination 让未启用功能在外部发布包中物理不存在，减少运行分支、包体积和暴露面。</p><div class='learning-check'><strong>小检查</strong>为什么 setup 阶段要先初始化遥测和 watcher，而不是等 query loop 成功启动后再做？批量落盘、匿名降级、PII 过滤和 prompt redaction 分别防什么风险？</div>"
    },
    {
      "id": "telemetry-practice",
      "title": "12.4 实战复盘：Mini Harness 与可删除架构",
      "sources": [
        "telemetry-sinks",
        "settings-compat"
      ],
      "qas": [
        "settings-reflection"
      ],
      "html": "<p>读完源码后，最有效的复盘方式不是复刻完整项目，而是剥离几十万行外围能力，用约 200 行代码写一个 Mini Harness，验证自己是否真正理解 Agent 的物理边界。</p><p class='level-intermediate'>最小清单可以压缩成四件事：Tool 执行分离，模型只输出结构化意图，本地框架解析后执行；Deny-first 鉴权拦截，真实 Shell 或 Write 前先过规则门；上下文主动注入，请求前读取工作区 CLAUDE.md 或项目规则拼到当前轮；死循环状态机，用 while 或 async generator 串起 API 请求、权限询问、工具执行、结果追加，只在模型没有 tool_use 意图时退出。</p><p class='level-intermediate'>第二阶段再加入消息规范化、microcompact、读前写、memory 和恢复标记；第三阶段再挂 Hook、MCP、Remote Bridge、UI、Settings 与 Telemetry。这个路线能把抽象架构压回可运行约束：工具是否可并发、权限如何 fail-closed、压缩何时触发、远程审批如何回到本地、配置合并如何保护 deny 规则。</p><p class='level-advanced'>全书最后要看到一个工程取向：很多防线是当前模型能力、运行环境和产品边界共同形成的脚手架。20 多道 Bash 防线、复杂压缩管线、特殊恢复分支都应保持模块化；当未来模型或平台能力提升时，应该能删除一部分规则、压缩层或特殊分支，而不是把临时约束固化成不可移除的核心。</p><div class='learning-check'><strong>小检查</strong>如果你只能用 200 行复现一个 Claude Code Mini Harness，四个必备模块分别是什么？哪个模块最能证明你理解了系统的第一性约束？</div>"
    },
    {
      "id": "architecture-darklines",
      "title": "12.5 三条物理暗线：缓存、防幻觉与错误扣留",
      "sources": [
        "prompt-boundary",
        "file-edit-defenses",
        "yolo-classifier",
        "compaction-pipeline"
      ],
      "qas": [
        "settings-reflection"
      ],
      "html": "<p>回看 1-12 章，Claude Code 的复杂度不是为了展示架构技巧，而是在对抗三个底层物理约束。第一条是 Prompt Cache 第一性原理：稳定内容必须保持字节级前缀一致，动态时间、Git 状态、Memory、Skills 和 MCP 状态都要后置到 <code>&lt;system-reminder&gt;</code> 或按需附件里；内置工具 A-Z 排序、MCP 后置、Tool Deferral 和 fork 前缀复用都服务同一个目标。</p><p class='level-intermediate'>第二条是对抗模型固有缺陷。Harness 不信任模型的行号记忆、权限自判和验证自信，因此 FileEdit 要写前必读，Bash 要做 AST 级子命令拆解，YOLO 分类器连续拒绝后要熔断，Verification Agent 必须给出实际测试输出而不是一句“看起来没问题”。这些机制把软提示变成可执行的状态机门槛。</p><p class='level-intermediate'>第三条是灾难恢复与错误扣留。413、媒体超限、payload 过大和远程传输失败不能直接击穿 UI 或 SDK 消费者；状态机要先扣留错误，尝试 Reactive Compact、cache_edits、局部剥离、断点恢复或权限取消回传。只有恢复路径耗尽后，错误才应升级给用户。</p><p class='level-advanced'>这三条暗线共同指向“为删除而设计”。当前的五层压缩、权限漏斗、远程桥、MCP 去重和遥测体系都是为当前模型上下文贵、容易忘、会瞎编、执行环境不稳定而存在。优秀的 Harness 应该把这些补偿层保持模块化，未来模型底座或平台能力变强时，可以删除整块线束，而不是继续把历史约束堆进核心。</p><div class='learning-check'><strong>小检查</strong>请把一个看似奇怪的源码设计归因到三条暗线之一：工具排序、写前必读、413 后静默压缩、Skill 动态发现分别对应什么物理约束？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "settings-compat-section": {
    "framing": "设置系统是长期项目的稳定器。用户配置、项目配置、企业托管配置、CLI 参数和插件配置会不断演化，源码必须既严格使用有效字段，又尽量不破坏未知字段。",
    "points": [
      "七级覆盖链把不同来源的配置放入可解释的优先级顺序，而不是做一次浅层对象覆盖。",
      "passthrough 让系统校验已知语义，同时保留旧版本、实验字段或插件字段。",
      "managed-settings.json 与 managed-settings.d/*.json 支持企业把策略拆成多个 drop-in 文件。",
      "Settings 和权限系统强相关：配置合并结果会直接影响 allow、deny、ask。"
    ],
    "reading": [
      {
        "source": "settings-compat",
        "label": "Settings passthrough/drop-in",
        "note": "看未知字段保留、数组合并和 managed settings 检测。"
      },
      {
        "source": "permission-modes",
        "label": "Permission modes",
        "note": "理解设置最终如何影响工具调用。"
      }
    ],
    "pitfalls": [
      "不要把未知字段删掉。用户可能在用新版、插件或企业策略。",
      "不要把 drop-in 目录当普通文件列表随意合并。加载顺序需要可解释。",
      "不要把配置错误静默当成功。用户需要可理解的冲突提示。"
    ],
    "practice": "设计一个 managed-settings.d 目录：安全、平台、合规三个团队各放什么文件，如何命名才能保证合并顺序清晰？"
  },
  "settings-merge-invariant": {
    "framing": "数组合并语义是 Settings 安全性的关键细节。对 deny、allowlist、MCP server 等数组字段，覆盖合并可能删除更高信任来源的安全规则。",
    "points": [
      "标量可以按优先级覆盖，但数组字段需要 concat + uniq 让多个来源共同进入最终配置。",
      "企业 deny 不能被项目 allow 或用户配置覆盖删除。",
      "更低信任层可以补充规则，但不能擦除更高信任层的底线。",
      "合并语义必须和权限漏斗一起设计，否则设置层漏洞会变成工具层越权。"
    ],
    "reading": [
      {
        "source": "settings-compat",
        "label": "Settings merge semantics",
        "note": "关注数组字段与托管策略如何合并。"
      },
      {
        "source": "permission-modes",
        "label": "Permission rules",
        "note": "看 deny 优先级如何在最终权限判断中生效。"
      }
    ],
    "pitfalls": [
      "不要让项目级配置整体覆盖企业级 deny 数组。",
      "不要把数组字段一律当普通值覆盖。不同字段可能需要不同安全语义。",
      "不要只在 UI 上提示企业策略存在，真正的最终配置也必须保留它。"
    ],
    "practice": "给两个 settings 来源：企业 deny Bash(sudo)，项目 allow Bash(*)。写出合并后配置和最终权限结果。"
  },
  "telemetry-observability": {
    "framing": "生产 Agent 需要可观测、可灰度、可恢复、可脱敏。遥测、feature flags、cost tracker、session restore 和 watcher 都属于主循环外侧的治理层。",
    "points": [
      "启动阶段先初始化 sinks 并打 started beacon，是为了让崩溃和启动失败也有观测入口。",
      "可观测性包含请求元数据、事件日志、监控报警、本地 session 记录、成本追踪和环境指纹。",
      "遥测管线需要失败落盘、重试退避、鉴权降级和字段剥离，否则自身会成为可靠性与隐私风险。",
      "Feature Flags 与编译时 DCE 让实验能力灰度启用，并降低外部发布包的包体积和暴露面。"
    ],
    "reading": [
      {
        "source": "telemetry-sinks",
        "label": "setup telemetry",
        "note": "看后台 watcher、analytics sinks 和 tengu_started 的初始化顺序。"
      },
      {
        "source": "settings-compat",
        "label": "settings 治理层",
        "note": "把配置、feature flags 和企业托管联系起来。"
      },
      {
        "source": "query-loop",
        "label": "回到主循环",
        "note": "所有外围能力最终都要服务 query loop 的稳定推进。"
      }
    ],
    "pitfalls": [
      "不要把遥测只理解成上报。它也是调试、灰度、成本控制和产品健康度基础设施。",
      "不要在没有观测的情况下开启自主 Agent。长任务没有成本和失败信号会很难治理。",
      "不要让 prompt、插件名、MCP server 名或 Skill 名称直接进入宽口径监控平台。"
    ],
    "practice": "列出一个 Mini Harness 的最小遥测事件集：启动、工具调用、权限拒绝、压缩触发、异常退出分别应该记录什么？哪些字段必须 redacted？"
  },
  "telemetry-practice": {
    "framing": "最后一节把源码阅读拉回工程实践。Mini Harness 能验证你是否真正理解 Agent 主循环；可删除架构提醒你不要把当前模型缺陷造成的脚手架写成永久核心。",
    "points": [
      "第 1 阶段实现 Tool 执行分离、Deny-first Permission、CLAUDE.md 注入和 while/async generator 主循环。",
      "第 2 阶段加入消息规范化、microcompact、读前写、memory 和错误恢复标记，验证上下文治理。",
      "第 3 阶段加入 Hook、MCP、Remote Bridge、UI、Settings 和 Telemetry，验证扩展边界。",
      "当模型或平台能力提升时，应该能删除部分规则、压缩层和特殊分支，而不是继续堆叠。"
    ],
    "reading": [
      {
        "source": "query-loop",
        "label": "主循环",
        "note": "Mini Harness 应先复现 query loop 的推进与停止条件。"
      },
      {
        "source": "tool-interface",
        "label": "Tool 接口",
        "note": "工具契约是最容易落地验证的骨架。"
      },
      {
        "source": "settings-compat",
        "label": "Settings",
        "note": "把配置合并和权限规则纳入最终练习。"
      }
    ],
    "pitfalls": [
      "不要只读不做。Mini Harness 会逼你把抽象概念变成可运行约束。",
      "不要一开始复刻 UI 和远程桥。先证明主循环、工具和权限能稳定推进。",
      "不要把所有防线永久化。可删除性也是架构质量的一部分。"
    ],
    "practice": "按三阶段路线给自己定验收 demo：每个阶段只加一个核心能力，并写出成功与失败的判定标准。"
  },
  "architecture-darklines": {
    "framing": "全书的收束点不是功能清单，而是三条贯穿所有章节的物理暗线：死保 Prompt Cache、用状态机约束模型缺陷、把可恢复错误扣留在 harness 内部。",
    "points": [
      "Prompt Cache 要求字节级前缀稳定，因此动态数据后置、内置工具稳定排序、MCP 后置和 Tool Deferral 都是成本控制手段。",
      "防幻觉不能靠提醒模型小心；FileEdit 写前必读、Bash AST 拆解、YOLO 熔断和 Verification 证据要求都属于物理门槛。",
      "错误扣留让 413、媒体超限和远程传输失败先进入恢复路径，而不是直接终止下游 UI 或 SDK 状态机。",
      "为删除而设计意味着这些补偿层要保持模块化，未来模型或平台能力增强时可以整块移除。"
    ],
    "reading": [
      {
        "source": "prompt-boundary",
        "label": "Prompt boundary",
        "note": "对应缓存第一性原理。"
      },
      {
        "source": "file-edit-defenses",
        "label": "FileEdit defenses",
        "note": "对应写前必读与防行号幻觉。"
      },
      {
        "source": "yolo-classifier",
        "label": "YOLO classifier",
        "note": "对应自动权限与熔断。"
      },
      {
        "source": "compaction-pipeline",
        "label": "Reactive Compact",
        "note": "对应错误扣留与恢复。"
      }
    ],
    "pitfalls": [
      "不要把排序、后置注入和按需加载当代码风格问题。它们是在保护缓存账单。",
      "不要把权限和验证交给模型自觉。生产 harness 必须把关键约束写成状态机。",
      "不要让可恢复的物理错误直接暴露成终端崩溃。恢复路径应先在内部消化。"
    ],
    "practice": "从 1-12 章任选一个机制，写出它对应的物理约束、工程妥协和未来可以被删除的前提条件。"
  }
});
