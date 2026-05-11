// Chapter 6: 第 6 章：Permission 与 Hooks 系统
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "permissions",
  "title": "第 6 章：Permission 与 Hooks 系统",
  "subtitle": "权限系统拦截模型越权意图，Hooks 允许外部逻辑介入生命周期，但任何扩展都不能突破 deny-first 安全边界。",
  "review": [
    "权限裁决收敛为 allow、deny、ask",
    "Deny-first 是规则解析和复杂工具拦截的核心不变量",
    "Auto 模式用独立分类器降低人工审批，但仍 fail-closed",
    "Hook 是扩展点，不是提权通道；启动时序和高频性能同样属于安全边界",
    "Hook 阻断必须回注给模型纠偏，不能制造重试死亡螺旋"
  ],
  "sections": [
    {
      "id": "permissions-pipeline",
      "title": "6.1 权限管线与 6 层纵深防御",
      "sources": [
        "permission-modes",
        "bash-defenses",
        "hook-invariant"
      ],
      "qas": [
        "permission-hooks"
      ],
      "html": "<p>Claude Code 将工具权限裁决收敛为三种原子行为：<code>allow</code>、<code>deny</code>、<code>ask</code>。<button class='inline-action source-trigger' data-source='permission-modes'>权限模式源码</button>展示了 default、plan、acceptEdits、dontAsk、bypassPermissions 等用户可见模式；内部类型还包含 auto、bubble 等运行态语义。</p><p class='level-beginner'>先记住 deny-first：如果同一个输入同时命中 allow 和 deny，最终必须以 deny 为准。宽泛放行规则不能覆盖明确拒绝规则，ask 也不能把高危 deny 降级成弹窗确认。</p><p class='level-intermediate'>权限系统不是只读 <code>settings.json</code>。它更接近 6 层纵深防御：<code>CLAUDE.md</code> 软约束、Permission Rules 声明式拦截、Hooks 可编程拦截、YOLO Classifier 独立 AI 审查、Sandbox 操作系统隔离、Hardcoded Denials 硬编码禁写或禁操作。</p><p class='level-intermediate'>拒绝规则还能前移到工具池组装阶段。<code>filterToolsByDenyRules()</code> 会在模型看到工具列表前移除 blanket deny 命中的能力，既减少无效推理 token，也避免模型反复尝试一个永远不能调用的工具。</p><p class='level-advanced'>Bash 这类复杂工具会把复合命令拆成 AST 子命令，让子命令级 deny 早于整条命令的 ask 生效。只要危险片段命中拒绝规则，整条复合命令就必须熔断。但精细拆解也有性能边界：超过约 50 个子命令时，系统应降级为全局 <code>ask</code>，避免安全检查本身拖垮 UI 或触发 ReDoS 风险。可对照 <button class='inline-action source-trigger' data-source='bash-defenses'>Bash 子命令规则</button>。</p><p>打开 <button class='inline-action qa-trigger' data-qa='permission-hooks'>权限与 Hook QA</button>。</p><div class='learning-check'><strong>小检查</strong>用户允许 <code>Bash(git *)</code>，企业策略拒绝 <code>Bash(git push --force)</code>，当前命令是 <code>git push --force</code>。最终应该是什么裁决？为什么？</div>"
    },
    {
      "id": "permissions-auto",
      "title": "6.2 Auto 模式：两阶段分类器与拒绝熔断",
      "sources": [
        "yolo-classifier",
        "permission-modes"
      ],
      "qas": [
        "permission-hooks"
      ],
      "html": "<p>Auto 模式不是把工具调用全部自动放行，而是把一部分审批交给独立分类器。<button class='inline-action source-trigger' data-source='yolo-classifier'>YOLO 分类器</button>与执行任务的主模型分离：主模型提出行动，分类器审查行动，避免同一个模型自我批准高风险操作。</p><p class='level-beginner'>分类器仍服从权限管线。明确 deny 先于分类器，分类器不确定时回到 ask 或 block，而不是静默 allow。</p><p class='level-intermediate'>两阶段架构平衡成本与延迟：fast 阶段用很小输出快速做 yes/no 判断；复杂或高风险输入再升级到 thinking 阶段。纯读取、搜索这类低风险路径可以尽量走规则或快速通道，避免每个工具调用都支付一次分类器延迟。</p><p class='level-advanced'>自动审查还必须防止无限消耗。如果分类器连续拒绝 3 次或累计拒绝达到更高阈值，系统会触发类似 circuit breaker 的降级：剥离自动审批权，转回人工 ask 或中止会话，避免主模型不断换语法重试同一类危险动作。</p><div class='learning-check'><strong>小检查</strong>为什么 Auto 模式需要独立分类器，而不是让主模型在同一段回答里自己判断“这个操作是否安全”？</div>"
    },
    {
      "id": "hooks-invariant",
      "title": "6.3 Hooks 扩展与安全不变量",
      "sources": [
        "hooks-schema",
        "hook-invariant",
        "permission-modes"
      ],
      "qas": [
        "permission-hooks"
      ],
      "html": "<p>Hooks 提供生命周期扩展能力。<button class='inline-action source-trigger' data-source='hooks-schema'>schema</button>里可以看到 command、prompt、http、agent 等执行器；Hook 事件覆盖 PreToolUse、PostToolUse、SessionStart、PreCompact、PermissionRequest、FileChanged 等关键节点。</p><p>关键安全不变量在 <button class='inline-action source-trigger' data-source='hook-invariant'>resolveHookPermissionDecision</button>：即使 PreToolUse Hook 返回 <code>allow</code>，系统仍要继续执行 <code>checkRuleBasedPermissions</code>。如果命中 deny，deny 覆盖；如果命中 ask，仍回到 canUseTool 弹窗或对应审批流程。</p><p class='level-intermediate'>这让企业可以接入 HTTP 审批、Prompt 风险判断、Shell 检查或 Agent 验证，同时不把第三方扩展变成提权后门。Hook 可以帮助判定风险、记录审计、要求确认或拒绝操作，但不能把 settings 里的 deny/ask 改写成 allow。</p><p class='level-advanced'>Hook 类型也有成本分层：command Hook 适合本地低成本检查；prompt Hook 适合语义风险判断；http Hook 适合外部审批；agent Hook 最强也最贵，适合关键变更后的验证，不适合挂在高频路径上无差别触发。验证类 Hook 或子 Agent 也不能只给口头结论，应该返回实际命令、退出码或测试输出作为证据。</p><div class='learning-check'><strong>小检查</strong>请构造一个“Hook 说 allow，但规则必须 ask”的例子，例如需要人工确认的生产数据库操作。</div>"
    },
    {
      "id": "hooks-temporal-performance",
      "title": "6.4 启动时序、Pre-trust 窗口与 Hook 性能红线",
      "sources": [
        "hooks-schema",
        "hook-invariant",
        "permission-modes"
      ],
      "qas": [
        "permission-hooks"
      ],
      "html": "<p>安全不只取决于规则覆盖，还取决于加载时序。CVE-2025-59536 指向的核心问题是 startup trust dialog 之前的执行窗口：版本低于 1.0.111 的 Claude Code 可能在用户接受项目信任前执行项目配置中的代码。Hooks、MCP 和项目级 settings 都必须放在“用户信任确认之后”这个时间边界内审视。</p><p class='level-intermediate'>这类问题提醒开发者：配置文件在 Agent 系统里不再只是被动文本，它可能定义 Hooks、MCP server 和环境变量，进而变成启动阶段的主动执行面。安全设计必须同时问“谁能执行”和“什么时候开始执行”。</p><p class='level-intermediate'>Hook 阻断还必须改变下一轮输入。PreToolUse 拦截后如果只是抛异常或静默跳过，模型可能看不到真实原因并反复重试。更稳的做法是把 <code>blockingErrors</code> 打包成带纠偏指令的 User Message 回注上下文，并用 <code>stopHookActive</code> 等状态避免 Stop Hook 递归触发。</p><p class='level-advanced'>性能也是 Hook 安全的一部分。PostToolUse、FileChanged 这类高频事件如果每次都启动外部进程、做完整 JSON 序列化或网络请求，会拖慢 Agent Loop，甚至诱发超时和恢复风暴。源码通过内部 callback hooks 等 fast path 处理会话文件访问记录这类高频任务，把重型外部 Hook 留给真正需要审批或审计的节点。</p><div class='learning-check'><strong>小检查</strong>为什么“信任确认前不执行项目配置”、“Hook 阻断要回注纠偏”和“高频 Hook 走内部 fast path”都属于安全设计，而不只是用户体验优化？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "permissions-pipeline": {
    "framing": "权限模型不是一个 if 判断，而是软约束、声明规则、Hook、AI 分类器、沙盒和硬编码拒绝共同组成的评估管线。目标是让低风险动作快速通过，把危险动作拦到人类或硬规则面前。",
    "points": [
      "PermissionBehavior 只有 allow、deny、ask，便于把复杂策略收敛成可组合裁决。",
      "deny-first 让明确禁止比模糊允许更强，避免 allow 规则意外放大权限。",
      "用户可见模式包括 default、plan、acceptEdits、dontAsk、bypassPermissions；auto 和 bubble 属于内部运行态语义。",
      "纵深防御可以按六层理解：CLAUDE.md 软约束、Permission Rules、Hooks、YOLO Classifier、Sandbox、Hardcoded Denials。",
      "filterToolsByDenyRules 把 blanket deny 前移到工具池组装阶段，让模型从源头看不到被禁用工具。",
      "Bash 和文件工具会在通用权限之外叠加工具专属防线，例如复合命令拆分、读后写和唯一匹配。"
    ],
    "reading": [
      {
        "source": "permission-modes",
        "label": "PermissionBehavior",
        "note": "先把 allow、deny、ask 记成权限系统最小代数。"
      },
      {
        "source": "bash-defenses",
        "label": "Bash 子命令规则",
        "note": "观察 deny-first 在复杂工具里如何落地。"
      },
      {
        "source": "hook-invariant",
        "label": "Hook 不变量",
        "note": "确认 Hook allow 为什么不能覆盖规则 deny 或 ask。"
      }
    ],
    "pitfalls": [
      "不要把 bypassPermissions 当开发默认模式。它只适合极少数可信环境。",
      "不要只看 UI 是否弹窗。很多拒绝发生在弹窗之前。",
      "不要无限拆解复杂 Bash。子命令数量超过阈值时，降级 ask 比冻结 UI 更可靠。",
      "不要认为一层规则足够。Agent 安全要处理提示词诱导、配置误设、插件扩展和操作系统边界。"
    ],
    "practice": "写一个权限判定顺序：用户 allow Bash(git *)，企业 deny Bash(git push --force)，当前命令是 git push --force。最终应是什么？"
  },
  "permissions-auto": {
    "framing": "Auto 模式用独立分类器减少人工审批，但它仍然受规则、Hook、熔断和 fail-closed 约束。它不是跳过权限系统，而是在权限管线中增加一个可观测的自动审查节点。",
    "points": [
      "fast 阶段使用小 max_tokens 和 stop sequence，目标是快速得到 yes/no 式判断。",
      "thinking 阶段处理更复杂或高风险的动作，降低 fast 阶段误判带来的风险。",
      "分类器解析失败时按安全失败处理，不能悄悄 allow。",
      "分类器请求记录 stage、duration、usage、requestId 等信息，方便审计和调试。",
      "连续拒绝 3 次或累计拒绝阈值形成 circuit breaker，避免模型在危险动作上无限重试和烧钱。"
    ],
    "reading": [
      {
        "source": "yolo-classifier",
        "label": "classifyYoloActionXml",
        "note": "看 fast 阶段如何早返回，以及 thinking 阶段如何处理不可解析输出。"
      },
      {
        "source": "permission-modes",
        "label": "auto 模式位置",
        "note": "对照用户可见模式和内部模式的差异。"
      }
    ],
    "pitfalls": [
      "不要把 Auto 模式理解成 YOLO 全放行。源码中 Auto 仍在规则和分类器之间做降级。",
      "不要让主模型自批自己的危险动作。审查者和行动者分离是安全边界。",
      "不要忽略分类器成本。高频工具调用需要 fast path，否则 Agent Loop 会被审批延迟拖慢。",
      "不要让自动拒绝无限循环。连续失败必须升级为 ask 或 abort。"
    ],
    "practice": "给三类工具调用设计 Auto 策略：读取 README、修改 package.json、执行生产数据库迁移。哪些可快速放行，哪些必须升级或询问？"
  },
  "hooks-invariant": {
    "framing": "Hooks 是扩展点，不是提权通道。它能把 Shell、LLM、HTTP 服务或验证 Agent 挂到生命周期上，但最终仍要服从用户、项目和托管设置的安全规则。",
    "points": [
      "Command Hook 适合低成本本地检查，例如格式化、lint、路径扫描。",
      "Prompt Hook 适合让小模型判断语义风险，例如 SQL 注入或合规问题。",
      "HTTP Hook 适合接外部审批或审计系统，但要注意环境变量插值白名单和 SSRF 防护。",
      "Agent Hook 最强也最贵，适合复杂验证，不适合每次工具调用都触发。",
      "验证类 Hook 或 Agent 应输出真实命令、退出码或测试日志，不能只给“看起来没问题”的口头结论。",
      "Hook allow 后仍然必须运行 checkRuleBasedPermissions；deny 和 ask 都不能被第三方扩展覆盖。"
    ],
    "reading": [
      {
        "source": "hooks-schema",
        "label": "Hook schema 与事件集合",
        "note": "看 type 字段如何决定执行器，再看 HOOK_EVENTS 覆盖哪些生命周期。"
      },
      {
        "source": "hook-invariant",
        "label": "resolveHookPermissionDecision",
        "note": "重点看 hook allow 后仍然 checkRuleBasedPermissions。"
      },
      {
        "source": "permission-modes",
        "label": "Permission rules",
        "note": "把 Hook 决策接回 deny-first 规则。"
      }
    ],
    "pitfalls": [
      "不要让第三方 Hook 扩大权限。Hook 可以帮助判断，但不能覆盖 deny 或 ask。",
      "不要把高成本 Agent Hook 挂到高频事件上。PostToolUse 这类路径必须考虑序列化、进程启动和网络延迟。",
      "不要把 Hook 审批日志当成最终权限事实。最终事实仍要看规则、分类器、沙盒和硬拒绝。"
    ],
    "practice": "设计两个 Hook：一个 PreToolUse 阻止写 .env，一个 PostToolUse 在写 ts 文件后运行测试。说明它们分别应该返回 allow、ask 还是 deny。"
  },
  "hooks-temporal-performance": {
    "framing": "权限系统还必须覆盖时间维度和性能维度。启动时序错误会产生 pre-trust 执行窗口；高频 Hook 过重会拖垮 Agent Loop，让安全扩展本身变成可靠性风险。",
    "points": [
      "项目级 Hooks、MCP 配置和 settings 在 Agent 系统中可能触发真实命令，不能在用户信任确认前执行。",
      "CVE-2025-59536 的教训是：startup trust dialog 不是 UI 细节，而是执行边界，修复点落在版本 1.0.111。",
      "PreToolUse 的 blockingErrors 应作为纠偏消息回注给模型，否则模型可能看不到失败原因并重复触发同一阻断。",
      "高频内部事件适合 callback fast path，避免每次都走外部进程、完整 JSON 封装或网络审批。",
      "重型 HTTP、prompt 或 agent Hook 应放在真正需要人工或外部审计的节点，避免给每次工具调用增加固定延迟。",
      "安全规则要同时回答空间问题和时间问题：哪个动作允许，在哪个生命周期阶段允许。"
    ],
    "reading": [
      {
        "source": "hooks-schema",
        "label": "Hook 事件位置",
        "note": "看 SessionStart、PreToolUse、PostToolUse 等事件分别处于什么生命周期。"
      },
      {
        "source": "hook-invariant",
        "label": "Hook 决策边界",
        "note": "把生命周期扩展和权限不变量合在一起看。"
      }
    ],
    "pitfalls": [
      "不要在用户信任确认前加载会执行代码的项目扩展。pre-trust 窗口会绕开后续规则设计。",
      "不要默认信任仓库内的配置文件。它们在 Agent 环境里可能等价于执行入口。",
      "不要把 Hook 阻断当普通异常抛出后结束。可恢复阻断应转成模型可读反馈并限制递归触发。",
      "不要把所有 Hook 都实现成外部命令。安全扩展也需要延迟预算和失败隔离。"
    ],
    "practice": "设计一个安全启动序列：进入未知仓库后，哪些配置可以先读取但不能执行？信任确认后才允许启动哪些 Hook 或 MCP 能力？"
  }
});
