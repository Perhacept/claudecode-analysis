// Chapter 9: 第 9 章：多 Agent 协作架构
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "multi-agent",
  "title": "第 9 章：多 Agent 协作架构",
  "subtitle": "多 Agent 不是并发聊天，而是围绕上下文隔离、缓存继承、任务边界、权限回传和物理写入空间构建的调度系统。",
  "review": [
    "子 Agent 的完整执行轨迹进入 sidechain，父会话只接收摘要，避免探索噪音污染主上下文",
    "Fork 通过 byte-identical 父前缀继承 Prompt Cache，并用尾部 directive 承载分支差异",
    "Coordinator 必须自持理解，只能委派具体、可验收、可合并的任务",
    "Leader Permission Bridge 与 file-based mailbox 把后台 Worker 的审批和消息集中回控制面",
    "Worktree、Explore、Verification 分别解决写冲突、Token 瘦身和确认偏误"
  ],
  "sections": [
    {
      "id": "sidechain-isolation",
      "title": "9.1 Context Isolation：侧链日志与摘要返回",
      "sources": [
        "fork-subagent"
      ],
      "qas": [
        "multi-agent"
      ],
      "html": "<p>多 Agent 的第一性问题不是“能不能并发”，而是子任务的搜索日志、试错输出和中间推理不能污染父会话上下文。子 Agent 拥有独立消息历史，其完整执行轨迹写入 sidechain transcript 和元数据文件，父会话只接收最终摘要。</p><p class='level-beginner'>这把 Token 增长从 O(探索全过程) 压成 O(摘要)。一个子 Agent 可以 grep、读文件、试命令几十轮，但主会话不需要吞下每一条中间输出。</p><p class='level-intermediate'>Sidechain 也保留了恢复和审计能力：细节不进入父 prompt，并不意味着被丢弃；需要 resume、debug 或查看子任务轨迹时，系统仍可以从侧链记录重建过程。</p><p class='level-advanced'>摘要返回不是语义美化，而是上下文治理。父 Agent 需要的是可决策结论、关键证据、文件路径、剩余风险和可合并边界，不是子进程的完整终端转录。</p><p>查看 <button class='inline-action qa-trigger' data-qa='multi-agent'>多 Agent QA</button>。</p><div class='learning-check'><strong>小检查</strong>为什么子 Agent 的完整搜索日志不应该原样返回父会话？</div>"
    },
    {
      "id": "fork-agent",
      "title": "9.2 Fork Subagent：字节级前缀稳定与缓存复用",
      "sources": [
        "fork-subagent",
        "prompt-boundary"
      ],
      "qas": [
        "multi-agent"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='fork-subagent'>Fork Subagent</button> 是一种隐式子代理创建路径。当模型省略 <code>subagent_type</code> 时，系统可以让子任务继承父会话上下文、模型和工具池，并把权限模式设为 <code>bubble</code>，让敏感审批回到父终端。</p><p class='level-beginner'>Fork 的关键是共享同一段已渲染的父会话前缀。每个子任务只在请求末尾追加自己的具体 directive，因此不需要重复解释完整背景。</p><p class='level-intermediate'>为了最大化 <button class='inline-action source-trigger' data-source='prompt-boundary'>Prompt Cache</button> 命中，系统保持多个并行 fork 请求的前缀字节级一致：父级 assistant history 被保留，工具结果用稳定 placeholder 补齐，差异集中在最后的子任务指令。</p><p class='level-advanced'>缓存命中不是“语义相似”，而是 byte-identical。并发 3 到 5 个 fork 分支如果共享父级前缀，就能把昂贵的历史上下文读取成本压到缓存读路径；如果子任务改模型、改工具列表或重渲染 prompt，缓存继承就会被破坏。</p><p class='level-advanced'>Fork 子代理仍保留 AgentTool，但运行时会根据 <code>querySource</code> 与 <code>&lt;fork-boilerplate&gt;</code> 消息扫描阻断递归 fork，防止子进程无限分裂。</p><div class='learning-check'><strong>小检查</strong>Fork 子任务为什么适合并行探索源码旁支，而不适合替父 Agent 重新理解用户最终目标？</div>"
    },
    {
      "id": "coordinator",
      "title": "9.3 Coordinator：纯编排与指令边界",
      "sources": [
        "coordinator-rules"
      ],
      "qas": [
        "multi-agent"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='coordinator-rules'>Coordinator 指令</button>明确指出：Workers can't see your conversation。Worker 是在隔离上下文中启动的执行单元，不自动拥有用户目标、历史协商或父级推理过程。</p><p class='level-intermediate'>因此 Coordinator 不能委派高层理解，只能委派具体任务。合格任务要包含文件路径、行号、写入范围、所有权、禁止事项、预期输出和验收标准，避免 Worker 在零上下文中自行补全目标。</p><p class='level-advanced'>Coordinator 自身通常承担纯编排职责：先完成任务理解和拆解，再把互不重叠的探索、修改或验证任务分发给 Worker。并行提高吞吐的同时，也会放大上下文缺失、目标漂移和写入冲突。</p><p class='level-advanced'>共享 scratchpad 或 mailbox 只能传递中间状态，不能替代任务边界。Worker 输出也不能机械拼接，Coordinator 必须把局部结论重新放回用户目标和当前代码事实里判断。</p><div class='learning-check'><strong>小检查</strong>把“修复权限 bug”改写成一个合格 worker 任务，要求包含文件、行号和验收标准。</div>"
    },
    {
      "id": "agent-governance",
      "title": "9.4 权限、Mailbox 与 Worktree 物理隔离",
      "sources": [
        "fork-subagent",
        "coordinator-rules",
        "worktree"
      ],
      "qas": [
        "multi-agent"
      ],
      "html": "<p>多 Agent 系统还要控制权限审批、进程通信和并发写入。在 Swarm 或 Team 模式中，后台 Worker 的权限请求不能各自悬挂。Leader Permission Bridge 通过文件级邮箱和 <code>bubble</code> 权限模式，把 Worker 的审批请求集中冒泡到主控终端，再把用户决定写回给 Worker。</p><p class='level-intermediate'>file-based mailbox 把同进程、tmux 窗口和后台 Worker 的通信统一成可持久化协议。纯文本消息、<code>shutdown_request</code>、<code>plan_approval_request</code> 等结构化消息都可以落到同一类 mailbox 路径，便于 resume、debug 和审计。</p><p class='level-intermediate'>并发写入不能只靠进程互斥解决。<button class='inline-action source-trigger' data-source='worktree'>EnterWorktreeTool</button> 可以为子任务创建独立 Git worktree，每个 Agent 在自己的物理文件树内修改，任务结束后再由主流程决定是否合并。Worktree 隔离修改位置，但不替代权限审批或业务合并。</p><p class='level-advanced'>权限覆盖也要有优先级。自定义 Agent 可以收紧工具范围或声明限制，但不能破坏父级已确立的全局权限运转模式；后台进程必须通过 bubble 或桥接路径把危险操作带回用户可见控制面。</p><div class='learning-check'><strong>小检查</strong>Worktree 隔离解决的是哪类问题？它为什么不能替代权限审批？</div>"
    },
    {
      "id": "agent-specialists-cost",
      "title": "9.5 专用 Agent：Explore 瘦身与 Verification 证据约束",
      "sources": [
        "coordinator-rules",
        "worktree",
        "streaming-tools"
      ],
      "qas": [
        "multi-agent"
      ],
      "html": "<p>多 Agent 的价值不只是角色命名，而是按任务裁剪上下文、工具和权限。Explore Agent 面向只读搜索，可以显式移除 <code>CLAUDE.md</code> 注入和 Git 状态获取；纯检索任务不需要项目提交流程规范，也不需要每轮携带完整工作树状态。</p><p class='level-intermediate'>这类微小裁剪有真实成本意义。建议资料提到，Explore 这类高频调用中去掉 Git 状态与项目规则，每周可节省 50-150 亿 token 级别的输入开销；更重要的是，它降低了无关背景噪声和 TTFT。</p><p class='level-advanced'>Verification Agent 则反向强化证据要求。模型在验证任务中容易确认偏误，直接回复“代码看起来没问题”。因此验证代理必须基于实际工具命令、测试输出、退出码和报错证据下结论，不能只给语言判断。</p><p class='level-advanced'>这套专家化同样是为删除而设计的脚手架：当前模型上下文贵、会遗忘、会偷懒，所以 Harness 用 sidechain、specialist prompt 和工具证据约束它。未来底座足够强时，过细的角色和补偿逻辑应该能被收缩。</p><div class='learning-check'><strong>小检查</strong>为什么 Explore Agent 应该删掉 Git 状态，而 Verification Agent 反而必须保留真实测试输出？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "sidechain-isolation": {
    "framing": "多 Agent 的核心收益之一是把探索噪声隔离到侧链。父会话需要保留决策上下文，而不是把每个子任务的所有 grep、read、test 输出都塞回主 prompt。",
    "points": [
      "每个子 Agent 拥有独立消息历史，完整执行轨迹写入 sidechain transcript 和元数据。",
      "父会话只接收最终摘要，把上下文增长控制在 O(summary)。",
      "侧链记录仍可用于 resume、debug 和审计，隔离不等于丢失。",
      "摘要需要包含结论、关键证据、文件路径和剩余风险，而不是流水账。",
      "Sidechain 与 Prompt Cache 是同一类成本治理：保留必要信息，同时避免污染主请求前缀。"
    ],
    "reading": [
      {
        "source": "fork-subagent",
        "label": "Fork/sidechain",
        "note": "把 inherited context、bubble 和 sidechain 隔离一起看。"
      },
      {
        "source": "coordinator-rules",
        "label": "Worker 边界",
        "note": "理解摘要如何回到 coordinator 的任务整合。"
      }
    ],
    "pitfalls": [
      "不要把子 Agent 的完整执行日志塞回父 prompt。摘要返回是控制上下文增长的基本策略。",
      "不要让摘要只写结论。没有路径和证据的摘要无法被父 Agent 可靠整合。",
      "不要把隔离理解为不可追踪。侧链记录仍要支持恢复和排障。"
    ],
    "practice": "把一个 30 轮搜索子任务的返回格式压成 5 行：结论、证据、相关文件、未验证点、建议下一步。"
  },
  "fork-agent": {
    "framing": "Fork Subagent 把多 Agent 并行和 Prompt Cache 经济学绑在一起。它复制父会话已渲染前缀，只在尾部追加子任务 directive，让并行分支尽量复用同一段缓存。",
    "points": [
      "Fork 模式适合从同一父上下文分出多个方向，减少重复解释背景的成本。",
      "多个 fork 请求只在末尾 directive 不同，前缀越稳定，Prompt Cache 命中价值越高。",
      "byte-identical 是硬条件：模型、工具列表、system bytes 或占位符顺序变化都会削弱缓存继承。",
      "permissionMode bubble 让子任务遇到敏感操作时回到父终端审批，避免后台子进程私自扩大权限。",
      "递归 fork guard 防止子任务继续无限分裂，保持系统可控。",
      "sidechain transcript 让子任务的探索细节留在侧链，父会话只接收摘要。"
    ],
    "reading": [
      {
        "source": "fork-subagent",
        "label": "FORK_AGENT",
        "note": "看 model inherit、tools *、permission bubble 和 rendered prompt 复用。"
      },
      {
        "source": "prompt-boundary",
        "label": "Prompt boundary",
        "note": "对照 fork 为什么必须保护父级稳定前缀。"
      }
    ],
    "pitfalls": [
      "不要把 fork 当万能并发。任务目标不清时，并发只会放大误解。",
      "不要让子 Agent 替你理解用户需求。它看到的是被传递的上下文或指令，不是完整协商过程。",
      "不要忽略缓存前缀。子任务间只有最后 directive 不同时，缓存价值最大。",
      "不要随手给 fork 改模型。不同模型无法复用父级 Prompt Cache。"
    ],
    "practice": "把“分析权限系统”拆成 3 个 fork 子任务：源码搜索、风险清单、测试建议。每个任务写出输入和预期输出。"
  },
  "coordinator": {
    "framing": "Coordinator 是编排者。它必须先自己理解用户目标，再把工作切成带路径、行号、边界和验收标准的任务交给 worker。",
    "points": [
      "Worker 看不到你和用户的完整对话，所以任务描述必须自包含。",
      "Coordinator 不应该委派高层理解，只能委派具体探索、修改或验证。",
      "并行 worker 的写入范围要尽量不重叠，避免后续整合冲突。",
      "共享 scratchpad 或 mailbox 可以解决隔离 worker 之间的中间结果交换，但不能替代清晰任务边界。",
      "汇总结果时要把 worker 的局部发现重新放回全局目标中判断，而不是机械拼接。",
      "可验收任务应包含文件路径、行号、所有权、允许修改范围、禁止事项和验证命令。"
    ],
    "reading": [
      {
        "source": "coordinator-rules",
        "label": "Worker instructions",
        "note": "重点看 Workers cannot see your conversation 和 never delegate understanding。"
      },
      {
        "source": "fork-subagent",
        "label": "Fork guard",
        "note": "对照另一种多 Agent 模式的边界控制。"
      }
    ],
    "pitfalls": [
      "不要给 worker 发“看看这个模块”这种模糊任务。",
      "不要让两个 worker 同时改同一文件同一区域，除非你明确承担整合成本。",
      "不要把 worker 摘要当事实结论。关键事实仍要回到源码或测试验证。",
      "不要把 scratchpad 当全局记忆。它只是临时交换区，不是任务定义。"
    ],
    "practice": "把“增强网页内容”改写成合格 worker 任务：限定文件、不要动 QA 数据、输出验收标准。"
  },
  "agent-governance": {
    "framing": "多 Agent 进入长周期协作后，真正的难点不只是启动更多模型请求，而是控制日志膨胀、权限交互、进程通信、文件写入隔离和权限覆盖优先级。",
    "points": [
      "Leader Permission Bridge 把后台 Worker 的危险操作审批集中回主控终端，避免多个后台进程各自等待用户输入。",
      "bubble 权限模式让数据面在 Worker 中执行，控制面审批仍回到 Leader。",
      "file-based mailbox 让同进程、tmux 和后台 Worker 使用统一通信协议，并天然保留可调试记录。",
      "Worktree 让并发写入进入独立物理目录，降低脏写和 Git 锁冲突，但不负责业务合并。",
      "自定义 Agent 可以收紧工具权限，但不能破坏父级已经确立的全局权限模式和审批路径。",
      "不同 Agent 应针对任务裁剪工具、上下文和权限，而不是复用一套最大权限配置。"
    ],
    "reading": [
      {
        "source": "fork-subagent",
        "label": "Fork 与 bubble",
        "note": "把权限冒泡和 sidechain 隔离放在同一张图里理解。"
      },
      {
        "source": "worktree",
        "label": "EnterWorktreeTool",
        "note": "看 worktree 创建、cwd 切换和缓存清理。"
      },
      {
        "source": "coordinator-rules",
        "label": "Worker 边界",
        "note": "对照 Swarm/Team 场景中任务边界和权限边界的差异。"
      }
    ],
    "pitfalls": [
      "不要让后台 Worker 静默等待审批。权限请求必须有可见、可追踪的回传路径。",
      "不要把 worktree 当自动合并工具。它隔离修改，不解决业务冲突。",
      "不要用子 Agent 的权限 frontmatter 破坏父级安全生命周期。",
      "不要把 mailbox 当随意日志。它是控制协议的一部分，消息类型和落盘路径都需要治理。"
    ],
    "practice": "设计一个三 Agent 流程：Explore 只读定位问题，Worker 在 worktree 修改指定文件，Verification 运行命令验证。写出每个 Agent 的上下文、工具和输出边界。"
  },
  "agent-specialists-cost": {
    "framing": "专用 Agent 的价值来自精确裁剪，而不是角色拟人化。Explore、Worker、Verification 的工具、上下文和证据要求应当按任务物理约束分别收缩。",
    "points": [
      "Explore Agent 是只读搜索路径，应尽量去掉 Git 状态、提交规范、写入工具和与检索无关的项目规则。",
      "高频 Explore 调用中的上下文裁剪有账单级意义，资料提到每周可节省 5-15 Gtok。",
      "Verification Agent 用真实命令、stdout、stderr 和 exit code 对抗模型确认偏误。",
      "后台验证可以异步运行，但结论必须带证据；只说“看起来没问题”不应被父 Agent 接受。",
      "专家化 Harness 是对当前模型缺陷的补偿，应保持模块化，未来可以随底座能力提升而收缩。"
    ],
    "reading": [
      {
        "source": "coordinator-rules",
        "label": "Verification boundary",
        "note": "把验收标准和实际命令输出绑定起来。"
      },
      {
        "source": "streaming-tools",
        "label": "Tool execution evidence",
        "note": "理解验证为什么必须落到真实工具结果。"
      },
      {
        "source": "worktree",
        "label": "Worktree for worker",
        "note": "Worker 写入与验证可以在隔离文件树里完成。"
      }
    ],
    "pitfalls": [
      "不要给 Explore Agent 塞完整项目规范。只读搜索任务应尽量瘦身上下文。",
      "不要让验证 Agent 只做语言判断。验证必须绑定工具执行证据。",
      "不要把高频专家调用的 token 浪费看成小事。一次裁剪乘以数千万调用就是基础设施成本。",
      "不要让专家角色变成永久复杂度。能用更强模型或更短链路替换时，应优先收缩。"
    ],
    "practice": "给一个修复任务设计 Explore、Worker、Verification 三段上下文：分别列出保留信息、删除信息、工具权限和输出格式。"
  }
});
