// Chapter 8: 第 8 章：Memory 系统与上下文持久化
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "memory",
  "title": "第 8 章：Memory 系统与上下文持久化",
  "subtitle": "Memory 的核心不是外接向量库，而是在 Token 预算、缓存命中率、事实新鲜度和同步安全之间做文件级物理调度。",
  "review": [
    "Claude Code 的长期记忆基于本地 Markdown 文件，而不是默认依赖 Vector DB",
    "读时主动召回先扫 frontmatter，再由低成本 side-query 挑少量正文",
    "六层记忆隔离不同生命周期：Auto、Session、AutoDream、Agent、Team、CLAUDE.md",
    "双轨写入把主模型显式记录和后台 extractMemories 分开治理，并用游标、节流和轮次上限限制成本",
    "AutoDream 通过 24h/5 会话触发、PID 锁和 MEMORY.md 预算对抗记忆熵增",
    "旧记忆通过 mtime 注入过期警告，Team Memory 上传前 fail-closed 阻断 secret"
  ],
  "sections": [
    {
      "id": "memory-recall-section",
      "title": "8.1 Active Recall：放弃向量库后的读时召回",
      "sources": [
        "memory-recall",
        "prompt-boundary"
      ],
      "qas": [
        "memory-system"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='memory-recall'>Memory scan</button> 的工程假设很明确：长期记忆是昂贵资源，不是每轮都全量注入的背景资料。系统不先做 embedding 查向量库，也不会读取所有正文，而是在用户请求到来时执行低成本文件扫描。</p><p class='level-beginner'>召回阶段只需要判断哪些记忆可能相关，不需要立刻读取全部内容。系统扫描 memory 目录下的 <code>.md</code> 文件，排除全局索引 <code>MEMORY.md</code>，只读取文件头部 frontmatter 摘要，先得到候选清单。</p><p class='level-intermediate'>这条链路有明确硬边界：资料强调最多扫描 200 个文件，每个只读前 30 行。<code>alreadySurfaced</code> 会过滤当前会话已经注入过的文件，防止同一份记忆在长会话中反复占用 token。</p><p class='level-advanced'>候选摘要会交给低成本 side-query 模型做相关性裁判，最多挑少量文件进入正文读取阶段。完整记忆随后作为 <code>&lt;system-reminder&gt;</code> 附件注入当前轮次，处在 <button class='inline-action source-trigger' data-source='prompt-boundary'>System Prompt 动态边界</button>之后，而不是污染跨项目复用的静态缓存前缀。</p><p>查看 <button class='inline-action qa-trigger' data-qa='memory-system'>Memory QA</button>。</p><div class='learning-check'><strong>小检查</strong>为什么召回阶段只读 frontmatter，往往比直接读取完整 memory 文件更适合生产级 Agent？</div>"
    },
    {
      "id": "memory-layers-write",
      "title": "8.2 六层物理记忆与隐形双轨写入",
      "sources": [
        "memory-recall",
        "tool-interface"
      ],
      "qas": [
        "memory-system"
      ],
      "html": "<p>Memory 不是单一数据库，而是按生命周期和作用域拆成六层：Auto Memory 记录项目短期工作状态，Session Memory 服务单会话摘要和压缩，AutoDream 做跨会话离线巩固，Agent Memory 绑定特定子代理，Team Memory 面向团队同步，<code>CLAUDE.md</code> 承载人工维护的静态规则。</p><p class='level-intermediate'>分层的价值在于隔离失效半径。当前 bug 线索、单会话推理轨迹、角色偏好、团队规范和项目静态指令不能混在一份文件里，否则召回语义会失真，压缩预算、同步权限和过期策略也无法区分。</p><p class='level-advanced'>写入路径同样拆成两条。路径 A 是主模型在对话中显式调用工具写入，适合用户明确要求记录的事实；路径 B 是每轮结束后由 <code>stopHooks</code> 静默触发后台 <code>extractMemories</code> 子 Agent，异步分析最近对话并写入 Memory 目录。</p><p class='level-advanced'>后台链路必须被阉割权限和轮次。它只能在受限工具范围内读写，使用 <code>lastMemoryMessageUuid</code> 之类游标只处理增量消息，并受节流配置和 <code>Max Turns = 5</code> 约束。主模型当前轮已经主动写过记忆时，后台提取应跳过或延后，避免并发重复写入。</p><div class='learning-check'><strong>小检查</strong>一条用户偏好、一条当前 bug 线索、一条团队规范，分别应该进入哪一层记忆？为什么？</div>"
    },
    {
      "id": "autodream-cache-freshness",
      "title": "8.3 AutoDream、缓存分界与 mtime 防幻觉",
      "sources": [
        "memory-recall",
        "prompt-boundary",
        "compaction-pipeline"
      ],
      "qas": [
        "memory-system"
      ],
      "html": "<p>长期记忆如果只增不减，会迅速产生重复、冲突和过期事实。AutoDream 是离线巩固路径：当距离上次整理超过 24 小时且累积 5 个新会话后，系统获取 PID 互斥锁，启动 consolidation Agent，遍历 transcript 与现有记忆，执行合并、去重和冲突消解。</p><p class='level-intermediate'>巩固的目标不是写更长的总结，而是把记忆系统压回可用预算。资料强调 <code>MEMORY.md</code> 全局索引必须被修剪在 200 行或 25KB 以内；否则索引本身会从导航结构退化成新的 token 黑洞。</p><p class='level-advanced'>Memory 还必须保护 Prompt Cache。关于“如何使用记忆”的稳定规则适合放在 System Prompt 静态前缀；真实 <code>MEMORY.md</code> 内容、召回文件正文、当前时间和项目状态则属于动态数据，应放在 <code>SYSTEM_PROMPT_DYNAMIC_BOUNDARY</code> 之后，或作为 <code>&lt;system-reminder&gt;</code> 注入 User Message。只要把真实记忆写进 System Prompt 开头，缓存命中就会随用户、项目和日期变化而失效。</p><p class='level-advanced'>旧记忆还会诱发事实幻觉。系统根据 <code>mtimeMs</code> 计算记忆年龄；当记忆距今达到 2 天以上时，注入文本会附带 freshness note，要求模型在基于该记忆断言函数名、行号或行为前先验证当前代码。这是从物理层降低旧快照可信度。</p><div class='learning-check'><strong>小检查</strong>为什么长期记忆里的函数名或行号不能直接当作当前源码事实？</div>"
    },
    {
      "id": "team-memory",
      "title": "8.4 Team Memory：ETag 同步前先拦 Secret",
      "sources": [
        "team-memory-secret"
      ],
      "qas": [
        "memory-system"
      ],
      "html": "<p>团队记忆涉及上传，安全边界高于本地召回。<button class='inline-action source-trigger' data-source='team-memory-secret'>Team Memory 同步逻辑</button>会在把文件加入上传 payload 前执行 secret 扫描；一旦命中密钥特征，系统跳过整个文件，而不是只删除命中行后继续上传。</p><p class='level-intermediate'>同步一致性通过 ETag 和乐观锁解决，密钥出境则必须先 fail-closed。对 AWS Key、GitHub PAT、Slack Token、PEM 私钥等凭证类型，局部脱敏不足以证明剩余上下文安全。</p><p class='level-advanced'>审计日志只记录首个命中规则的标签与相对路径，不记录明文内容或精确片段，避免 secret 通过 telemetry 或日志系统发生二次泄露。团队同步的原则是：先证明可以出境，再谈版本一致性。</p><div class='learning-check'><strong>小检查</strong>为什么发现一个 secret 后不应该只删除那一行再上传？想想误删、上下文泄露和审计责任。</div>"
    },
    {
      "id": "memory-cost-tradeoffs",
      "title": "8.5 成本与取舍：可审计文件、低延迟召回和可控遗忘",
      "sources": [
        "memory-recall",
        "prompt-boundary",
        "team-memory-secret"
      ],
      "qas": [
        "memory-system"
      ],
      "html": "<p>这套 Memory 系统最反直觉的地方，是它没有把 Vector DB 当默认答案。向量检索能提供语义相似度，但代码任务需要的是当前可验证事实、路径级线索和可审计来源；在 CLI 场景里，引入 embedding、数据库服务和额外索引同步，会增加延迟、部署面和失效模式。</p><p class='level-intermediate'>纯文件架构的优势是透明、便宜、可人工编辑、可用普通版本控制审计。代价是召回质量依赖 frontmatter 摘要、文件命名和 side-query 裁判；因此系统必须用文件数、行数、最大召回数量、alreadySurfaced、mtime 警告和 AutoDream 修剪共同约束熵增。</p><p class='level-advanced'>Memory 的设计目标不是永远记住，而是可控地忘记。真正稳定的规则进入 <code>CLAUDE.md</code> 或团队规范；短期线索留在 Auto Memory；过期事实被 mtime 降权；跨会话碎片由 AutoDream 合并；不能出境的内容在 Team Memory 上传前被本地阻断。</p><p class='level-advanced'>这也是“为删除而设计”的一部分：当未来模型上下文更便宜、检索更可靠、事实验证更强时，frontmatter 扫描、side-query、去重集合和离线巩固都应该能按层替换，而不是变成不可维护的永久复杂度。</p><div class='learning-check'><strong>小检查</strong>如果一个项目一年后积累了 800 份记忆文件，哪些机制会阻止它们每轮全部进入上下文？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "memory-recall-section": {
    "framing": "Memory 系统的关键不是存很多东西，而是每轮只唤醒少量当前相关、不过期、不过大的记忆。Claude Code 用文件系统加读时主动召回，替代了很多 Agent 教程默认的 Vector DB 路径。",
    "points": [
      "召回阶段只读 frontmatter，是为了用低成本建立候选清单，而不是把所有正文塞进模型。",
      "扫描会排除 MEMORY.md，因为索引文件和 topic memory 承担不同职责。",
      "扫描数量和读取行数有硬预算，资料中强调最多 200 个文件、每个只读前 30 行摘要。",
      "alreadySurfaced 避免同一份记忆在长会话里反复占用 token。",
      "低成本 side-query 最多选择少量相关文件，随后才读取完整内容并注入当前轮次。",
      "召回内容作为动态附件注入，避免破坏 System Prompt 的静态缓存前缀。"
    ],
    "reading": [
      {
        "source": "memory-recall",
        "label": "scanMemoryFiles/findRelevantMemories",
        "note": "看扫描、过滤、选择、返回 path/mtime 的最小链路。"
      },
      {
        "source": "prompt-boundary",
        "label": "System Prompt boundary",
        "note": "对照记忆正文为什么不应该进入静态 prompt 前缀。"
      }
    ],
    "pitfalls": [
      "不要把 Memory 当实时数据库。记忆是时间点观察，具体代码事实仍要 grep 当前源码。",
      "不要把 MEMORY.md 和 topic memory 混成一条路径。索引和具体记忆承担不同职责。",
      "不要无限召回。Byte、line、file count、session total budget 是 Memory 能进生产的前提。",
      "不要默认向量库更高级。文件系统路径的可审计性、低延迟和低成本本身就是工程选择。"
    ],
    "practice": "写一条 memory frontmatter：包含 type、description 和文件名。再说明什么样的用户问题应该唤醒它。"
  },
  "memory-layers-write": {
    "framing": "长期记忆需要按作用域和时间尺度分层，否则单一存储会同时承载当前任务、跨会话经验、团队知识和静态规范，最终导致召回语义混乱。",
    "points": [
      "六层记忆可以按作用域理解：Auto Memory、Session Memory、AutoDream、Agent Memory、Team Memory、CLAUDE.md。",
      "Auto Memory 承载项目私有工作经验；Session Memory 是单会话压缩的降级基底；CLAUDE.md 是人工维护的静态规则。",
      "主模型直接写适合用户明确要求记录的事实；后台 extractMemories 适合在对话结束后异步沉淀工作状态。",
      "后台写入必须有游标、节流和互斥，否则长会话或并发 Agent 会制造重复写入和文件冲突。",
      "Max Turns = 5 这类硬上限防止记忆提取子 Agent 为了验证一个模式而无限搜索。",
      "双轨链路的治理重点是互斥：主流程写过记忆时，后台提取不能再对同一窗口重复加工。"
    ],
    "reading": [
      {
        "source": "memory-recall",
        "label": "记忆召回与 mtime",
        "note": "把 mtimeMs 视作 freshness 判断的基础信号。"
      },
      {
        "source": "tool-interface",
        "label": "Tool boundary",
        "note": "对照记忆写入为什么仍要服从工具权限和输入校验。"
      }
    ],
    "pitfalls": [
      "不要把后台记忆提取放进主交互关键路径。它应尽量不影响用户当前响应。",
      "不要让旧记忆覆盖当前文件事实。涉及代码状态时，必须回到源码重新验证。",
      "不要把 Agent Memory 与 Team Memory 混用。前者服务角色分域，后者服务多人共享。",
      "不要忽略写入节流。自动记忆如果每轮都跑，可能比主任务更浪费 token。"
    ],
    "practice": "把一条用户偏好、一条当前 bug 线索、一条团队规范分别放入合适的记忆层级，并说明原因。"
  },
  "autodream-cache-freshness": {
    "framing": "Memory 的长期价值来自巩固和遗忘，而不是无限追加。AutoDream 负责离线去噪；Prompt Cache 分界负责把规则和用户数据隔离；freshness note 负责压住模型对旧事实的过度自信。",
    "points": [
      "AutoDream 在满足 24 小时和 5 个新会话条件后启动 consolidation Agent，合并 transcript 与现有记忆。",
      "PID 互斥锁避免多个离线巩固任务同时写同一组 memory 文件。",
      "MEMORY.md 索引需要被裁剪在 200 行或 25KB 以内，否则索引本身会变成新的 token 黑洞。",
      "记忆使用规则可以缓存，真实记忆内容不能进入静态 System Prompt 前缀。",
      "mtime 触发的新鲜度警告是防幻觉机制：旧记忆只能提示方向，不能替代当前源码验证。",
      "这条链路和 compaction pipeline 的目标一致：让长期运行的 Agent 持续收缩，而不是只会累加。"
    ],
    "reading": [
      {
        "source": "memory-recall",
        "label": "mtime freshness",
        "note": "关注召回结果如何携带 path 与 mtimeMs。"
      },
      {
        "source": "prompt-boundary",
        "label": "动态数据后置",
        "note": "把记忆注入和 System Prompt 动静分界联系起来。"
      },
      {
        "source": "compaction-pipeline",
        "label": "Context shrinkage",
        "note": "对照会话压缩和记忆巩固都在为上下文收缩服务。"
      }
    ],
    "pitfalls": [
      "不要把 AutoDream 写成“总结聊天记录”。它的工程职责是合并、去重、冲突消解和缩减索引。",
      "不要把真实 MEMORY.md 拼到 System Prompt 静态区。这样会破坏缓存前缀，也会扩大隐私边界。",
      "不要让模型直接相信旧行号。记忆越旧，越需要回到文件系统重新验证。"
    ],
    "practice": "设计一条 freshness note：当一份记忆已有 5 天历史时，应该怎样提醒模型使用它而不把它当事实？"
  },
  "team-memory": {
    "framing": "Team Memory 把个人经验变成团队资产，但一旦涉及上传，安全边界必须比本地记忆更硬。这里的核心是先在本地阻断 secret，再考虑 ETag 同步。",
    "points": [
      "上传前扫描内容，而不是上传后依赖服务端清洗，能把泄露风险挡在机器边界内。",
      "发现 secret 后跳过整个文件，是因为单行删除可能保留上下文线索，也可能误删不完整。",
      "只记录规则、标签和相对路径，减少日志里泄露凭据内容或精确位置的风险。",
      "同步一致性和 secret 阻断是两个问题：前者追求版本正确，后者必须先保证不出境。",
      "ETag 和乐观锁解决多人并发写，gitleaks 风格规则解决数据能不能离开本机。"
    ],
    "reading": [
      {
        "source": "team-memory-secret",
        "label": "readLocalTeamMemory",
        "note": "看 scanForSecrets 在 entries 写入前触发。"
      },
      {
        "source": "memory-recall",
        "label": "Memory 召回",
        "note": "对比本地 recall 和团队同步的不同风险。"
      }
    ],
    "pitfalls": [
      "不要为了同步完整性牺牲密钥安全。一个 secret 命中就足够跳过文件。",
      "不要把日志当安全区域。日志也可能进入遥测、文件或外部系统。",
      "不要用权限模式放宽 Team Memory 的 secret 阻断。数据出本机前应有硬底线。"
    ],
    "practice": "列出三类不应进入 Team Memory 的内容：例如 API key、客户数据、内部部署地址。说明检测和人工审查各负责什么。"
  },
  "memory-cost-tradeoffs": {
    "framing": "Claude Code 的 Memory 设计是成本约束下的状态调度。它牺牲了向量库的语义检索精细度，换来可审计、低延迟、易部署、易人工修正的文件系统路径。",
    "points": [
      "不用 Vector DB 可以减少 embedding、索引同步、数据库部署和权限面的复杂度。",
      "代价是必须维护高质量 frontmatter，否则 side-query 的候选输入会变差。",
      "alreadySurfaced、文件数上限、读取行数上限和最大召回数共同防止 token 预算失控。",
      "mtime freshness、AutoDream 和 Team Secret Scan 分别处理事实过期、知识熵增和数据出境风险。",
      "可审计文件不等于低级实现；在代码 Agent 场景里，可读性和可修正性本身是生产优势。"
    ],
    "reading": [
      {
        "source": "memory-recall",
        "label": "File-based recall",
        "note": "把文件扫描、frontmatter 和 selected full read 连成一条成本链。"
      },
      {
        "source": "prompt-boundary",
        "label": "Cache-safe injection",
        "note": "理解 Memory 为什么不能直接进入 system prompt 顶部。"
      },
      {
        "source": "team-memory-secret",
        "label": "Sync safety",
        "note": "把本地记忆和团队出境边界分开。"
      }
    ],
    "pitfalls": [
      "不要为了显得高级而强行上向量库。新增组件会带来部署、权限和一致性成本。",
      "不要让记忆无限增长。没有 AutoDream 和索引预算，记忆目录会变成上下文垃圾场。",
      "不要把可审计文件等同于没有治理。文件系统路径同样需要扫描、选择、去重、过期和出境检查。"
    ],
    "practice": "设计一个不依赖向量库的项目记忆目录：写出文件命名、frontmatter 字段、召回上限、过期警告和同步前 secret 扫描策略。"
  }
});
