// Chapter 7: 第 7 章：BashTool 与 FileEditTool 的防线
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "bash-file",
  "title": "第 7 章：BashTool 与 FileEditTool 的防线",
  "subtitle": "高风险工具不是能力接口，而是把模型意图转换成可审计物理操作的 Harness：它必须同时守住注入面、文件状态、权限优先级、缓存前缀和交互延迟。",
  "review": [
    "BashTool 先把复合 Shell 字符串拆成子命令，再执行 deny-first 权限裁决",
    "注入检测覆盖命令替换、进程替换、Heredoc、Zsh 专属绕过和 Git 外部执行面",
    "超过 50 个子命令时降级为通用 ask，这是防 ReDoS 与实时 UI 之间的保守取舍",
    "FileEditTool 写前必须存在 readFileState，并用 mtime、内容快照和 old_string 唯一匹配防止盲改",
    "工具工程还服务 Prompt Cache：稳定工具顺序、隔离动态数据，避免安全层本身击穿成本边界"
  ],
  "sections": [
    {
      "id": "bash-defense",
      "title": "7.1 BashTool：复合命令拆解与 Deny-first 裁决",
      "sources": [
        "bash-defenses",
        "permission-modes"
      ],
      "qas": [
        "bash-fileedit"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='bash-defenses'>BashTool 权限逻辑</button>面对的是表达力极高的 Shell 字符串。生产级 Agent 不能把它当作一段普通文本做前缀白名单，而要先还原成可审计的结构化动作：管道、逻辑运算符、命令替换、脚本解释器和包管理脚本都可能把真实动作藏在第二层。</p><p class='level-beginner'>判断风险不能只看首词。<code>echo ok &amp;&amp; rm -rf target</code>、<code>npm test || curl ...</code>、<code>python -c ...</code> 都能让危险动作出现在外层命令名之后；如果只按 <code>echo</code>、<code>npm</code> 或 <code>python</code> 判定，权限系统就会被复合语法绕过。</p><p class='level-intermediate'>源码优先使用 AST 和 <code>splitCommand</code> 提取子命令，并对每个子命令执行规则匹配。核心不变量是 <button class='inline-action source-trigger' data-source='permission-modes'>deny-first</button>：任一子命令命中拒绝规则，整条复合命令必须熔断，外层 full-command ask 不能把内部 deny 降级成询问。</p><p class='level-advanced'>AST 解析失败时，系统不会乐观放行，而是回退到保守注入检查；即使处于 sandbox 或 <code>autoAllowBashIfSandboxed</code> 路径，也必须服从显式 deny、ask 和企业策略。沙盒降低执行面的破坏半径，但不能替代权限语义。</p><p>查看 <button class='inline-action qa-trigger' data-qa='bash-fileedit'>Bash/FileEdit QA</button>。</p><div class='learning-check'><strong>小检查</strong>为什么 <code>echo ok &amp;&amp; rm -rf target</code> 不能只按 <code>echo</code> 的权限规则处理？</div>"
    },
    {
      "id": "bash-injection-boundary",
      "title": "7.2 注入流水线：Shell 方言、Git 与性能阈值",
      "sources": [
        "bash-defenses",
        "permission-modes",
        "yolo-classifier"
      ],
      "qas": [
        "bash-fileedit"
      ],
      "html": "<p>Bash 防线不是单条正则，而是一组防御流水线。检查面覆盖 <code>$()</code>、反引号、<code>&lt;()</code>、Heredoc 内嵌命令、环境变量展开、别名式绕过，以及 <code>zmodload</code>、<code>=curl</code>、<code>zpty</code>、<code>zf_rm</code> 等 Zsh 专属风险。PowerShell 和 Windows PATH 劫持也需要独立边界，而不是套用 Unix Shell 假设。</p><p class='level-intermediate'>Git 在 Agent 环境里不能天然视为只读安全工具。<code>core.fsmonitor</code>、<code>diff.external</code>、<code>core.gitProxy</code>、hooks 等配置可能让看似普通的 <code>git diff</code> 或 <code>git status</code> 触发外部程序，因此需要延迟信任和参数级校验。</p><p class='level-advanced'>只读白名单也必须做到 flag 级。<code>xargs</code>、<code>find -exec</code>、解释器 <code>-c</code>、包管理器 script 都能把数据重新变成命令执行通道；只校验命令名会把危险参数留成提权入口。</p><p class='level-advanced'>源码设定 <code>MAX_SUBCOMMANDS_FOR_SECURITY_CHECK = 50</code>。当复合命令被拆成过多子命令时，逐个 AST/正则校验会带来 ReDoS 和 UI 冻结风险，系统会降级为通用 <code>ask</code>。这不是静默放行，而是在安全精度、延迟和交互可用性之间选择保守失败。Auto 模式下连续拒绝还会触发 <button class='inline-action source-trigger' data-source='yolo-classifier'>分类器熔断</button>，避免模型换语法反复重试同一类高危命令。</p><div class='learning-check'><strong>小检查</strong>为什么“命令名在只读白名单里”仍不足以证明整条 Bash 安全？</div>"
    },
    {
      "id": "fileedit-defense",
      "title": "7.3 FileEditTool：写前必读与唯一性匹配",
      "sources": [
        "file-edit-defenses",
        "tool-interface"
      ],
      "qas": [
        "bash-fileedit"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='file-edit-defenses'>FileEditTool</button>的核心不是覆盖写入，而是在写入前证明模型掌握当前文件状态。LLM 很容易基于训练记忆、旧上下文或错误行号生成看似合理的补丁；工具 Harness 必须把这种概率性判断挡在物理文件系统之外。</p><p class='level-beginner'>编辑请求必须绑定当前文件快照。系统要求当前会话存在对应的 <code>readFileState</code>；如果模型没有在本轮读过目标文件，或者只读过局部视图，就不能声称知道应该改哪一处。</p><p class='level-intermediate'>读后写入还要比较 <code>mtime</code> 与实际内容。如果用户、formatter、linter 或其他 Agent 在读取后改过文件，工具会要求重新读取，避免把旧快照写回去造成并发脏写。</p><p class='level-advanced'><code>old_string</code> 必须在当前文件中精确且唯一地匹配。匹配不到或匹配多处时，工具要求提供更多上下文；智能引号规范化只用于容忍排版字符差异，不允许模型靠猜测选择目标位置。底层替换还会把新文本作为函数返回值传入，避免 <code>$1</code>、<code>$&amp;</code> 等正则替换元语义污染模型生成的内容。</p><div class='learning-check'><strong>小检查</strong>如果 <code>old_string</code> 在文件里出现三次，为什么工具不应该自动修改第一处？</div>"
    },
    {
      "id": "tool-cost-recovery",
      "title": "7.4 成本边界、错误扣留与可删除 Harness",
      "sources": [
        "streaming-tools",
        "prompt-boundary",
        "compaction-pipeline"
      ],
      "qas": [
        "bash-fileedit"
      ],
      "html": "<p>复杂工具防线也受物理约束。<button class='inline-action source-trigger' data-source='streaming-tools'>StreamingToolExecutor</button> 会让只读且并发安全的工具并行运行，而把状态修改类工具串行化；当兄弟任务失败或 abort 时，相关执行链需要及时停下，避免错误输出继续污染会话。</p><p class='level-intermediate'>工具定义本身也是 Prompt Cache 的一部分。内置工具必须稳定排序并放在 MCP 工具之前，动态时间、Git 状态和项目环境不能写进 System Prompt 静态前缀，而应放在 <button class='inline-action source-trigger' data-source='prompt-boundary'><code>&lt;system-reminder&gt;</code></button> 或动态边界之后。否则安全工具越多，缓存击穿越严重。</p><p class='level-advanced'>工具结果还必须受预算控制。超长 stdout、媒体过大或 <code>prompt_too_long</code> 这类中间错误不应直接外抛给下游 UI；系统会扣留可恢复错误，触发 <button class='inline-action source-trigger' data-source='compaction-pipeline'>裁剪、microcompact、context collapse 或 autocompact</button>，腾出上下文后带重试标记继续请求。</p><p class='level-advanced'>这些防线本质上是为当前模型缺陷搭的工程脚手架：上下文贵、行号会错、会凭空补全、会逃避验证。优秀 Harness 要把这些约束模块化封装，未来模型和 API 能力提升后，过重的拦截与补偿逻辑应能被成块删除。</p><div class='learning-check'><strong>小检查</strong>为什么工具 schema 排序、超长输出截断和错误扣留都属于工具安全架构，而不只是性能优化？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "bash-defense": {
    "framing": "BashTool 是最高风险工具之一，因为 Shell 字符串可以把读取、写入、网络、进程控制和删除动作混在一条输入里。源码的重点不是执行命令，而是在执行前把命令字符串还原成可审计的安全决策单元。",
    "points": [
      "优先用 AST 拆解复合命令；解析不可靠时，回退到保守注入检查路径。",
      "任何子命令命中 deny，整条命令都应拒绝；外层 full-command ask 不能覆盖内部 deny。",
      "子命令级判断解决的是复合命令绕过问题：危险动作可以藏在管道、逻辑运算符、命令替换或脚本调用后面。",
      "沙盒自动放行只是物理隔离后的交互优化，不能越权覆盖显式 deny、ask 或企业规则。",
      "工具 Harness 的职责是把模型的语义意图转换成确定性的权限输入，而不是相信模型自述“这是安全的”。"
    ],
    "reading": [
      {
        "source": "bash-defenses",
        "label": "Bash permission",
        "note": "重点看 AST fallback、subcommands、deny before ask 三段。"
      },
      {
        "source": "permission-modes",
        "label": "PermissionBehavior",
        "note": "把 Bash 的局部判断接回全局 allow/deny/ask 语义。"
      }
    ],
    "pitfalls": [
      "不要只按命令首词判断安全。echo、python、sh、npm script 都可能包住危险动作。",
      "不要把 sandbox 当万能安全。sandbox 只能减少受限环境下的破坏半径，不能覆盖显式 deny 或 ask。",
      "不要把 full-command ask 当作更高优先级。子命令 deny 必须先熔断。"
    ],
    "practice": "分析 `npm test && rm -rf dist`：哪一部分可能被 allow，哪一部分必须单独检查，最终为什么不能只看 npm？"
  },
  "bash-injection-boundary": {
    "framing": "Bash 的真实攻击面来自 Shell 语法本身。命令替换、进程替换、Heredoc、Zsh 扩展、Git 配置和危险 flag 都可能让一个看似只读的命令变成执行通道。",
    "points": [
      "注入检查覆盖常见命令替换、进程替换、Heredoc 嵌套命令，以及 zmodload、=curl、zpty、zf_rm 等 Zsh 专属风险。",
      "Git 命令需要延迟信任：仓库配置、hooks、diff.external、core.fsmonitor 都可能让看似只读的 Git 操作触发外部代码。",
      "只读白名单必须细化到 flag 级。例如 xargs、find、解释器和包管理器脚本会把参数重新变成执行能力。",
      "超过 50 个子命令时，系统会为了防 ReDoS 和 UI 冻结降级到通用 ask。",
      "Auto 分类器连续拒绝后的熔断，是为了防止模型换一种 Shell 写法继续消耗 token 和权限审批。"
    ],
    "reading": [
      {
        "source": "bash-defenses",
        "label": "Bash security checks",
        "note": "看 MAX_SUBCOMMANDS_FOR_SECURITY_CHECK、注入检查和子命令处理。"
      },
      {
        "source": "yolo-classifier",
        "label": "Auto classifier",
        "note": "理解自动审批为什么需要拒绝阈值和 fail-closed。"
      },
      {
        "source": "permission-modes",
        "label": "Deny-first",
        "note": "理解降级为 ask 与显式 deny 的优先级差异。"
      }
    ],
    "pitfalls": [
      "不要忽略 shell 方言差异。Bash、Zsh、PowerShell 和 here-document 的解析特性会改变攻击面。",
      "不要默认信任 Git 子命令。项目目录本身也可能是执行环境的一部分。",
      "不要用命令名白名单替代参数验证。危险 flag 可以让只读工具执行外部程序或访问意外路径。",
      "不要把性能阈值误解成安全缺口。超过阈值后的 ask 是保守降级，不是静默允许。"
    ],
    "practice": "说明为什么 `git diff`、`xargs` 和 `find -exec` 这三个看似常规的命令，在 Agent 环境里仍需要参数级验证。"
  },
  "fileedit-defense": {
    "framing": "FileEditTool 防的是模型最常见的代码幻觉：没读文件就改、读了旧版本还改、old_string 太短导致改错位置、引号或格式细节不一致导致匹配失败。",
    "points": [
      "read-before-write 强制模型先获取当前文件事实，不能凭训练记忆或旧上下文编辑。",
      "partial view 不足以支撑全文件编辑；只看过片段时，工具仍会要求重新读取。",
      "mtime 和完整内容比较共同防止用户、linter 或其他 Agent 在读后改过文件。",
      "old_string 必须能定位唯一位置，多处匹配时要求更多上下文，而不是猜第一处。",
      "智能引号规范化说明源码还在防模型生成文本和真实代码字符之间的细小差异。",
      "替换函数回调避免 $1、$& 等正则替换元语义污染模型生成的替换文本。"
    ],
    "reading": [
      {
        "source": "file-edit-defenses",
        "label": "FileEditTool 检查链",
        "note": "按 readTimestamp、mtime、findActualString、matches 顺序读。"
      },
      {
        "source": "tool-interface",
        "label": "Tool validate/checkPermissions",
        "note": "理解复杂工具为什么需要工具内校验和全局权限双层防线。"
      }
    ],
    "pitfalls": [
      "不要把 Write 覆盖当默认编辑方式。精确 Edit 能显著降低误改范围。",
      "不要给 old_string 太短的上下文。越短越容易多处匹配。",
      "不要忽略读后变更。只要物理文件状态变化，就应重新读取后再编辑。",
      "不要把行号当事实。行号只能辅助定位，真正的写入依据是当前文件内容匹配。"
    ],
    "practice": "给一段重复出现的函数名，写出一个足够长的 old_string，使它只匹配你想改的那一处。"
  },
  "tool-cost-recovery": {
    "framing": "工具安全不只是在危险动作前拦一下。生产级 Harness 还要控制并发、缓存、输出预算和可恢复错误，避免工具层把 Agent Loop 拖进成本或可靠性灾难。",
    "points": [
      "StreamingToolExecutor 允许只读并发，但状态修改类工具必须阻塞或串行，避免物理状态竞争。",
      "工具 schema 顺序会进入请求前缀；内置工具稳定排序、MCP 后置，是为了保住 Prompt Cache。",
      "动态时间、Git 状态和项目环境应该在动态边界或 system-reminder 注入，不能污染 System Prompt 静态前缀。",
      "超长 tool result 必须截断或压缩，避免单个命令输出击穿上下文窗口。",
      "413、媒体过大、prompt_too_long 等可恢复错误应被扣留并触发后台压缩或重试，而不是让下游 UI 直接崩溃。",
      "这套 Harness 应该为删除而设计：它服务当前模型缺陷，不应演化成无法替换的永久复杂度。"
    ],
    "reading": [
      {
        "source": "streaming-tools",
        "label": "StreamingToolExecutor",
        "note": "观察 read-only concurrency 与 unsafe blocking 的队列规则。"
      },
      {
        "source": "prompt-boundary",
        "label": "Prompt boundary",
        "note": "把工具 schema 稳定顺序和缓存前缀联系起来。"
      },
      {
        "source": "compaction-pipeline",
        "label": "Recovery via compact",
        "note": "看压缩如何接管 prompt_too_long 这类中间错误。"
      }
    ],
    "pitfalls": [
      "不要让高频动态信息进入静态 system prompt。一个时间戳就足以击穿后续大段缓存。",
      "不要把 tool output 当无限上下文。stdout 是最常见的 token 黑洞之一。",
      "不要把可恢复错误直接外抛。Agent Loop 需要先尝试收缩、重试或降级。",
      "不要把补偿逻辑写死在业务路径里。未来模型能力变化时，过重 Harness 应能被替换或删除。"
    ],
    "practice": "设计一个 Bash 执行策略：同时满足只读命令并发、写命令串行、超长输出截断、prompt_too_long 后自动压缩重试。"
  }
});
