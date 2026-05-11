// Chapter 10: 第 10 章：Remote / Bridge / Worktree
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "bridge",
  "title": "第 10 章：Remote / Bridge / Worktree",
  "subtitle": "当 Agent 从本地单进程演进为分布式执行平台，网络时序、权限透传、凭证边界和物理文件隔离会变成核心工程约束。",
  "review": [
    "FlushGate 把历史 flush 与实时输入隔离成原子时序屏障",
    "RemoteSessionManager 将远端权限请求桥接回用户可见的本地控制面",
    "Worktree、V2 传输、代理注入和 32 路容量调度共同支撑远端并发执行",
    "错误扣留、摘要回传和缓存前缀保护决定 Remote 能否长期稳定运行"
  ],
  "sections": [
    {
      "id": "flushgate",
      "title": "10.1 FlushGate：严格的时序一致性与竞态控制",
      "sources": [
        "flush-gate",
        "remote-permissions"
      ],
      "qas": [
        "remote-bridge"
      ],
      "html": "<p>Remote/Bridge 会把一个本地 CLI 会话拆成远端执行端和本地展示端。启动、跨设备连接或网络重连时，本地客户端必须先把积压的历史消息完整 flush 到远端；如果用户同时输入新的实时指令，两条数据流一旦交错，模型看到的上下文数组就不再是同一条时间线。</p><p><button class='inline-action source-trigger' data-source='flush-gate'>FlushGate</button> 是这个边界上的状态机屏障。调用 start 后，新的实时输入不会直接发送，而是进入内存等待队列；只有历史数据落盘并确认同步完成后，end 才会按原始绝对顺序释放队列。它不改写消息内容，只保证发往远端执行器和 API 的上下文阵列具备物理时序一致性。</p><p class='level-intermediate'><button class='inline-action source-trigger' data-source='remote-permissions'>RemoteSessionManager</button> 负责把远端下行消息、控制请求、取消请求和本地 UI 状态接起来。FlushGate 解决“什么时候允许发送”，RemoteSessionManager 解决“远端事件如何回到本地状态机”。</p><p class='level-advanced'>这个问题不是普通网络重试可以解决的。只要历史上下文和用户新指令乱序一次，后续工具调用、权限审批、压缩摘要和 session restore 都可能建立在错误时间线上，错误会被继续缓存和传播。</p><p>查看 <button class='inline-action qa-trigger' data-qa='remote-bridge'>Remote/Bridge QA</button>。</p><div class='learning-check'><strong>小检查</strong>如果历史消息和实时消息乱序进入模型，后续权限审批、工具执行和上下文压缩可能分别出现什么连锁错误？</div>"
    },
    {
      "id": "permission-bridge",
      "title": "10.2 RemoteSessionManager：跨机器的权限透传",
      "sources": [
        "remote-permissions"
      ],
      "qas": [
        "remote-bridge"
      ],
      "html": "<p>远端容器或无头服务器没有本地终端弹窗能力，但 Bash、文件写入、MCP 调用等工具仍然会触发权限拦截。如果执行端在不可见位置直接阻塞等待，用户看不到审批入口；如果远端默认放行，权限系统就被网络部署方式绕过。</p><p><button class='inline-action source-trigger' data-source='remote-permissions'>RemoteSessionManager</button> 将数据流和控制流拆开：远端工具触发拦截后生成 control_request，通过桥接通道传回本地；本地客户端再合成可交互的审批消息或权限 UI，让用户在终端、IDE 或控制客户端中作出 allow、deny 或 cancel 决策。</p><p class='level-intermediate'>审批结果不是本地状态的注释，而是协议级控制响应。allow 或 deny 会沿 control_response 返回远端，Esc、中断、规则短路等取消路径会变成 control_cancel_request，远端据此释放 pendingPermissionRequests，必要时中止仍在等待的工具子进程。</p><p class='level-advanced'>权限 Bridge 的关键不在“远程也能弹框”，而在审批责任不随执行位置漂移。工具可以在云端容器运行，但风险确认必须回到用户可见、可审计、可中断的控制面。</p><div class='learning-check'><strong>小检查</strong>为什么远端 Agent 不能把权限请求当成本地 allow 处理？如果取消信号没有回传，远端状态机会泄漏什么资源？</div>"
    },
    {
      "id": "worktree-section",
      "title": "10.3 Worktree：多并发任务的物理文件隔离",
      "sources": [
        "worktree"
      ],
      "qas": [
        "remote-bridge"
      ],
      "html": "<p>多个远端或后台 Agent 同时操作同一仓库时，权限规则只能回答“能不能改”，不能回答“会不会互相覆盖”。Claude Code 选择 Git 原生 worktree 作为物理隔离边界，而不是在应用层堆复杂文件锁。</p><p><button class='inline-action source-trigger' data-source='worktree'>EnterWorktreeTool</button> 会定位主仓库根，为当前 session 创建独立 Git worktree，保存 worktree state，并强制切换当前 Node 进程的 cwd。每个并发任务得到独立文件树视图，最后由上层流程或用户决定如何合并结果。</p><p class='level-intermediate'>切换 cwd 后，依赖目录的 system prompt sections、memory file caches、plans 缓存和环境探测都必须失效。否则模型会拿旧工作区的项目规则、路径、记忆和计划去解释新工作区，造成上下文与物理文件系统错位。</p><p class='level-advanced'>Worktree 和权限 Bridge 是两个正交边界：Worktree 回答“在哪里改文件”，Bridge 回答“谁批准改文件”。把二者分开，系统才能在多会话并发下同时控制文件隔离、审批责任和后续合并语义。</p><div class='learning-check'><strong>小检查</strong>为什么创建 worktree 后要重新计算环境信息，而不是继续沿用旧 system prompt section 和 memory cache？</div>"
    },
    {
      "id": "remote-transport-capacity",
      "title": "10.4 V2 传输、凭证代理与 32 路容量调度",
      "sources": [
        "flush-gate",
        "remote-permissions",
        "worktree"
      ],
      "qas": [
        "remote-bridge"
      ],
      "html": "<p>Remote 层不是把本地 stdin/stdout 换成 WebSocket。源码分析中，协议从 V1 的 WebSocket 读通道加 HTTP POST 写通道，演进到 V2 的 SSE 下行长连接加 CCRClient 批量上行。这样可以降低对双向长连接的依赖，并用批量写入、心跳保活和断点恢复适配企业代理、防火墙和不稳定网络。</p><p class='level-intermediate'>云端容器访问企业内网服务时，系统还要处理凭证注入和密钥隔离。CCR 容器内的代理层可以在受控位置注入企业请求头，再把请求转发给内部服务；同时配合 NO_PROXY 白名单、内存转储限制等机制缩小凭证暴露面，避免把密钥直接交给任意远端工具进程。</p><p class='level-advanced'>容量管理决定 Remote 是单会话桥接，还是并发调度平台。源码分析中提到默认可管理 32 路会话：当活跃任务达到上限，pollForWork 挂起等待；任一 worktree 会话结束后，事件通知唤醒调度器接纳排队任务。这让 Remote 能用明确的容量边界替代无限轮询和无限进程增长。</p><div class='learning-check'><strong>小检查</strong>为什么 V2 采用 SSE 加批量上传，可能比只依赖 WebSocket 更适合复杂企业网络？32 路上限又解决了什么资源治理问题？</div>"
    },
    {
      "id": "remote-cost-cache",
      "title": "10.5 成本、错误扣留与父会话缓存保护",
      "sources": [
        "compaction-pipeline",
        "prompt-boundary",
        "fork-subagent"
      ],
      "qas": [
        "remote-bridge"
      ],
      "html": "<p>分布式执行把本地低成本函数调用变成网络传输、容器调度、磁盘 I/O 和远端凭证治理的组合。启动带浏览器控制器的重型服务可能带来数百 MB 级内存占用和秒级冷启动；创建、切换、清理 worktree 也会消耗真实磁盘周期。因此 Remote 不能只追求“能跑”，还必须把资源上限、清理记录和失败恢复写进状态机。</p><p class='level-intermediate'>错误扣留是这层架构的可靠性底线。远端请求如果触发 413、payload too large、媒体体积过大或存储周期限制，系统不应把低级物理错误直接抛给模型或下游 UI；更稳妥的路径是扣留错误，触发 <button class='inline-action source-trigger' data-source='compaction-pipeline'>Reactive Compact</button>、局部剥离或状态重构，带着重试标记重新进入请求。这样用户看到的是连续会话，而不是一次可恢复的物理边界失败。</p><p class='level-advanced'>父会话的 Prompt Cache 同样需要保护。远端子任务、worktree 会话或 fork 分支的完整 transcript 不应直接回灌主上下文；主会话只接收摘要、证据和合并建议。这个 summary-only 边界不仅节省 token，也避免不稳定子任务历史污染 <button class='inline-action source-trigger' data-source='prompt-boundary'>稳定前缀</button>。当权限需要升级时，再通过 bubble 或 control_request 回到用户终端，而不是把子进程历史并入父请求。</p><div class='learning-check'><strong>小检查</strong>Remote 子任务完成后，为什么主会话更适合接收摘要而不是完整 transcript？如果 413 错误直接暴露给模型层，会怎样破坏状态机连续性？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "flushgate": {
    "framing": "Remote/Bridge 把本地 CLI 拆成远端执行端和本地控制端。它首先暴露的不是推理质量问题，而是历史同步、实时输入、重连恢复之间的时序一致性问题。",
    "points": [
      "启动或重连时，历史消息必须先完整 flush；用户新输入进入队列，直到 FlushGate.end 统一释放。",
      "FlushGate 的核心价值是保护上下文数组的绝对顺序，让模型、权限判断和压缩摘要共享同一条时间线。",
      "RemoteSessionManager 把 WebSocket/SSE 下行、控制请求、取消请求和本地 UI 状态接入同一个远端会话状态机。",
      "协议从 V1 WebSocket+HTTP POST 演进到 V2 SSE+CCRClient，属于传输稳定性改造，不改变权限语义。"
    ],
    "reading": [
      {
        "source": "flush-gate",
        "label": "FlushGate",
        "note": "重点看 start、enqueue、end 如何组成同步屏障。"
      },
      {
        "source": "remote-permissions",
        "label": "RemoteSessionManager",
        "note": "把 control_request 与 pendingPermissionRequests 对照阅读。"
      }
    ],
    "pitfalls": [
      "不要把远程会话当成本地会话直接搬过去。网络延迟会制造历史/实时交错问题。",
      "不要在 flush active 时直接发送新消息。一次乱序会污染后续上下文、权限和摘要。",
      "不要只验证成功连接，还要验证重连、取消、重复发送和部分失败。"
    ],
    "practice": "描述一次重连流程：服务端有 20 条历史消息，用户同时输入新命令。FlushGate 和 RemoteSessionManager 应该分别做什么？"
  },
  "permission-bridge": {
    "framing": "权限 Bridge 解决远端执行端没有本地 UI 的问题。它让工具在远端运行，但审批、取消和责任归属仍回到用户可见的终端、IDE 或控制客户端。",
    "points": [
      "远端触发权限拦截后发送 control_request，本地合成可交互审批消息。",
      "用户批准、拒绝或取消后，控制响应沿桥接通道返回远端，恢复或终止工具执行。",
      "Bridge 保持审批责任在用户侧，避免无头容器因为没有 UI 而隐式放行敏感操作。",
      "取消请求是协议完整性的关键部分，否则远端 pendingPermissionRequests 和工具子进程都可能泄漏。"
    ],
    "reading": [
      {
        "source": "remote-permissions",
        "label": "远程权限桥",
        "note": "查看 control_request、control_cancel_request 和本地回调的关系。"
      }
    ],
    "pitfalls": [
      "不要让远端无头进程自己弹权限框或默认放行。",
      "不要只实现 allow/deny，忽略 Esc、中断和本地规则短路。",
      "不要把权限桥和传输协议耦死，底层可从 WebSocket 演进到 SSE/CCRClient。"
    ],
    "practice": "画出一次远端 Bash 权限请求的往返路径：远端拦截、本地展示、用户决策、远端恢复或取消。"
  },
  "worktree-section": {
    "framing": "Worktree 解决的是多会话并发下的物理文件隔离。远程或多 Agent 同时修改同一仓库时，权限规则无法替代独立文件树。",
    "points": [
      "EnterWorktreeTool 会先定位主仓库根，再为当前 session 创建独占 worktree。",
      "切换 cwd 后，依赖目录的 system prompt section、memory cache、plans 目录缓存和环境探测都要清理。",
      "Worktree 隔离修改位置，不负责自动解决语义冲突；合并仍需要用户或上层流程决策。",
      "在 32 路会话并发调度里，worktree 是容量管理能够成立的文件系统前提。"
    ],
    "reading": [
      {
        "source": "worktree",
        "label": "EnterWorktreeTool",
        "note": "看 process.chdir、setCwd、saveWorktreeState 和 cache clear。"
      },
      {
        "source": "remote-permissions",
        "label": "远程权限桥",
        "note": "把“在哪里改”和“谁批准改”分开理解。"
      }
    ],
    "pitfalls": [
      "不要切换 cwd 后沿用旧环境信息。模型会基于错误路径做判断。",
      "不要把 worktree 当自动合并工具。它隔离修改，不解决业务冲突。",
      "不要在已经进入 worktree 的会话里重复进入，源码会阻止这种嵌套。"
    ],
    "practice": "解释为什么多会话远程执行时，worktree 比直接在同一目录创建分支更安全。"
  },
  "remote-transport-capacity": {
    "framing": "Remote 的工程复杂度还来自传输协议、企业代理和容量调度。它需要在不稳定网络、受控凭证和多会话负载之间保持执行一致性。",
    "points": [
      "V1 采用 WebSocket 读加 HTTP POST 写；V2 采用 SSE 下行加 CCRClient 批量上行。",
      "SSE 和批量上传降低了对双向长连接的依赖，适配代理、防火墙和企业网络拓扑。",
      "容器代理可在受控位置注入企业凭证，并通过 NO_PROXY、内存转储限制和请求头隔离缩小泄漏面。",
      "pollForWork 与 32 路上限展示了 Remote 从桥接协议向并发调度平台演进的方向。"
    ],
    "reading": [
      {
        "source": "flush-gate",
        "label": "FlushGate",
        "note": "把传输层重连和消息顺序联系起来。"
      },
      {
        "source": "worktree",
        "label": "Worktree",
        "note": "理解容量调度为什么需要物理隔离配合。"
      }
    ],
    "pitfalls": [
      "不要只优化连接成功率，还要验证消息顺序、重复提交和断点恢复。",
      "不要把企业凭证直接暴露给任意远端工具进程。代理注入应有隔离边界。",
      "不要让并发数只靠进程数量自然增长。容量上限和唤醒机制需要明确设计。"
    ],
    "practice": "为一个支持 32 个远端任务的控制器写出容量规则：何时接任务、何时 sleep、何时唤醒。"
  },
  "remote-cost-cache": {
    "framing": "Remote 的可靠性来自物理成本治理。容器、worktree、网络传输和缓存前缀都是真实资源；它们需要上限、清理、错误扣留和摘要边界，而不是只靠重试。",
    "points": [
      "远端执行会引入容器冷启动、重型服务内存、磁盘 worktree 和网络往返成本。容量调度必须把这些物理资源显式纳入状态机。",
      "413、payload too large、媒体体积过大等错误应优先在 harness 内部扣留并触发 Reactive Compact 或局部剥离。",
      "子任务历史只以摘要回到父会话，避免不稳定 transcript 污染主 prompt cache 前缀。",
      "权限升级通过 bubble/control_request 回到用户控制面，不能靠把远端上下文整体并入父会话解决。"
    ],
    "reading": [
      {
        "source": "compaction-pipeline",
        "label": "Reactive Compact",
        "note": "把错误扣留和重试标记联系起来。"
      },
      {
        "source": "prompt-boundary",
        "label": "Prompt boundary",
        "note": "理解 summary-only 为什么也是缓存保护。"
      },
      {
        "source": "fork-subagent",
        "label": "Fork Subagent",
        "note": "对照子任务摘要和父级前缀复用。"
      }
    ],
    "pitfalls": [
      "不要把 413 或媒体过大当普通最终错误直接抛出。可恢复错误应先进入压缩或剥离路径。",
      "不要把远端子任务完整 transcript 回灌父会话。日志量、顺序抖动和动态工具状态都会伤害缓存。",
      "不要忽略 worktree 清理记录。进程崩溃后的临时目录泄漏会变成长期存储债务。"
    ],
    "practice": "为一次远端 413 失败写恢复流程：错误在哪里扣留，如何压缩或剥离，重试标记如何避免无限循环，最终向用户展示什么。"
  }
});
