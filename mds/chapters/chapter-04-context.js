// Chapter 4: 第 4 章：上下文压缩与 Prompt Caching 缓存工程
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  "id": "context",
  "title": "第 4 章：上下文压缩与 Prompt Caching 缓存工程",
  "subtitle": "上下文工程不是摘要技巧，而是在释放 token 空间、保持历史可恢复、死保字节级缓存前缀之间做状态机级取舍。",
  "review": [
    "Prompt Caching 要求请求前缀保持字节级稳定",
    "五层压缩管线按成本和破坏性递进",
    "Cache Edits 改 API 请求视图，不破坏本地历史",
    "Session Memory 是全量压缩前的成本捷径",
    "Reactive Compact 把 413 和媒体超限转化为下一轮输入"
  ],
  "sections": [
    {
      "id": "context-cache-principles",
      "title": "4.1 缓存第一性原理：字节级前缀与动静隔离",
      "sources": [
        "prompt-boundary",
        "tool-interface"
      ],
      "qas": [
        "context-cache"
      ],
      "html": "<p>理解上下文压缩前，必须先理解 Prompt Caching 的物理约束：缓存匹配从请求开头向后单向寻找相同前缀。只要中间某个字节发生变化，后续 KV Cache 就会失效，几万 token 的请求成本和延迟都会被重新计算。</p><p class='level-beginner'>这就是为什么动态信息不能随手塞进 System Prompt。当前时间、工作目录、Git 状态、MCP 连接状态和临时附件都应该放在稳定边界之后，通常以 <code>&lt;system-reminder&gt;</code> 形式进入后部消息流。</p><p class='level-intermediate'><button class='inline-action source-trigger' data-source='prompt-boundary'>System Prompt 动静分界线</button>把安全底线、工具定义等稳定内容留在缓存前缀，把高频变化的数据推到尾部。这不是文本组织洁癖，而是直接影响 API 账单的字节级约束。</p><p class='level-advanced'>工具定义也服从同一原则。内置工具必须稳定排序并形成固定前缀；动态 MCP 工具追加在后面，避免外部工具增删导致内置工具 schema 的缓存前缀整体失效。第 5 章会把这个约束接到 <button class='inline-action source-trigger' data-source='tool-interface'>Tool 接口</button>和工具池组装。</p><p>对应问题见 <button class='inline-action qa-trigger' data-qa='context-cache'>上下文压缩 QA</button>。</p><div class='learning-check'><strong>小检查</strong>如果把 <code>Today is ${new Date()}</code> 放进 System Prompt 开头，会怎样影响后续几万 token 的缓存命中？</div>"
    },
    {
      "id": "context-pipeline",
      "title": "4.2 五层递进式压缩管线：先低损，后重构",
      "sources": [
        "compaction-pipeline",
        "cache-edits"
      ],
      "qas": [
        "context-cache"
      ],
      "html": "<p>Claude Code 的上下文治理不是一次性截断历史，而是按 token 收益、语义损耗和缓存破坏性排序的降级链路。点击 <button class='inline-action source-trigger' data-source='compaction-pipeline'>压缩管线源码</button> 看主流程。</p><ol><li><strong>预算缩减</strong>：先限制单个工具结果体积，把超大日志、搜索结果或媒体描述替换成预览与引用，避免一个工具输出支配整轮请求。</li><li><strong>Snip</strong>：轻量裁剪最旧历史，并把释放的 <code>snipTokensFreed</code> 传给后续计数逻辑，避免误触发更昂贵压缩。</li><li><strong>Microcompact</strong>：专门清理过期工具日志，优先处理低价值、高体积的工具结果。</li><li><strong>Context collapse</strong>：读时投影，把历史折叠成当前请求可用的视图，但不直接改写底层本地消息数组。</li><li><strong>Auto-compact</strong>：最昂贵的全量重构，请 LLM 生成摘要边界并替换旧历史，只在前面几层无法回到安全水位时触发。</li></ol><p class='level-intermediate'>这条顺序的工程含义是：能靠工具预算解决，就不要总结整个会话；能靠读时投影解决，就不要永久替换本地历史。越靠后的手段释放空间越大，恢复成本和细节损失也越高。</p><p class='level-intermediate'>真正进入全量 Auto-compact 前，系统还会尝试 <code>trySessionMemoryCompaction()</code>：直接复用后台已经提取的 <code>summary.md</code>，再拼接最近约 10K-40K token 的尾部原文。如果这个拼接视图仍超过安全阈值，才认命发起昂贵的 LLM 摘要请求。</p><p class='level-advanced'>Auto-compact 本身也按缓存思路设计。摘要请求不是冷启动的短 prompt，而是主会话的一次 fork：尽量复用完全一致的 System Prompt、工具定义和历史前缀，只在尾部追加压缩指令，使处理海量历史的请求仍能命中已有缓存。</p><div class='learning-check'><strong>小检查</strong>一个会话被 80K token 的日志撑爆时，为什么应先处理工具结果预算和 microcompact，甚至尝试 Session Memory 拼接，而不是立即发起 auto-compact？</div>"
    },
    {
      "id": "context-cache-edits",
      "title": "4.3 Cache Edits：请求层删除，本地历史保真",
      "sources": [
        "cache-edits",
        "prompt-boundary"
      ],
      "qas": [
        "context-cache"
      ],
      "html": "<p><button class='inline-action source-trigger' data-source='cache-edits'>Cache Edits</button> 解决 microcompact 的核心悖论：旧工具日志已经不值得继续发给模型，但直接从本地 <code>messages</code> 里 splice 掉它们，会破坏 UI 展示、resume、debug 以及缓存前缀。</p><p class='level-intermediate'>源码的做法是把删除延迟到 API 请求层。可缓存工具结果带有 <code>cache_reference</code>；当系统决定跳过旧块时，请求携带 <code>cache_edits</code>，例如 <code>type: 'delete'</code>，让后端缓存树在读时跳过对应块。本地消息数组仍保持完整顺序。</p><p class='level-intermediate'>删除状态还需要被保存和重放。<code>pendingCacheEdits</code> 不是一次性技巧，而是后续请求也要继续携带的旁路视图；否则服务端缓存树下一轮又会重新看见那些庞大的旧工具结果。</p><p class='level-advanced'>这个设计把“物理历史”和“本轮请求视图”拆开：终端 UI 还能查看完整日志，恢复机制还能重放真实历史；API 侧则少读低价值 token，并尽可能保留稳定前缀。热缓存时走增量 cache edits 的收益最大；冷缓存或缓存失效后，系统才可能回退到本地替换。</p><p>它与 <button class='inline-action source-trigger' data-source='prompt-boundary'>System Prompt boundary</button> 是同一类工程约束：为了性能可以改变请求视图，但不能轻易牺牲本地事实、恢复能力和前缀稳定性。</p><div class='learning-check'><strong>小检查</strong>为什么“不修改本地 messages”反而能让系统更可靠？请从 resume、debug、UI 展示、cache edit 重放和缓存命中五个角度回答。</div>"
    },
    {
      "id": "context-reactive-reinjection",
      "title": "4.4 Reactive Compact 与反遗忘重注入",
      "sources": [
        "message-normalization",
        "compaction-pipeline",
        "prompt-boundary"
      ],
      "qas": [
        "context-cache"
      ],
      "html": "<p>主动压缩依赖 token 预估，但真实 API 仍可能返回 <code>prompt_too_long</code>、413、图片或 PDF 体积超限等错误。query loop 不把这些错误直接抛给用户，而是先扣留错误，触发 <button class='inline-action source-trigger' data-source='compaction-pipeline'>Reactive Compact</button> 或局部剥离，再带着 <code>hasAttemptedReactiveCompact</code> 等标记重试，避免同一轮无限重压缩。</p><p class='level-intermediate'><button class='inline-action source-trigger' data-source='message-normalization'>消息规范化</button>处理媒体错误时也遵循最小破坏原则：只剥离导致超限的尾部图片、PDF 或块类型，保留其余上下文继续推进。这类路径把物理边界失败转化成下一轮输入修正。</p><p class='level-advanced'>破坏性 auto-compact 完成后，还需要“反遗忘”重注入。摘要替换旧历史会让模型丢掉活跃 Skills、近期核心文件和当前执行状态；系统通过 <code>buildPostCompactMessages</code> 把这些动态附件重新挂到消息尾部，例如给活跃 Skills 预留约 25K token、给近期核心文件保留有限数量和单文件预算。它们通常仍使用 <code>&lt;system-reminder&gt;</code> 或附件形式，而不是污染稳定 System Prompt。</p><div class='learning-check'><strong>小检查</strong>为什么全量压缩后还要重新注入活跃 Skills 和近期文件？如果只保留摘要，模型可能丢掉哪些执行约束？</div>"
    }
  ]
});
Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {
  "context-cache-principles": {
    "framing": "上下文压缩的底层目标不是生成漂亮摘要，而是在上下文窗口、请求延迟、API 成本和缓存前缀稳定性之间做取舍。Prompt Caching 的字节级匹配规则决定了后续所有设计。",
    "points": [
      "缓存从请求开头向后匹配，越靠前的字节越应该稳定，越动态的数据越应该靠后。",
      "System Prompt 的稳定部分承载安全底线、工具定义和长期规则；当前时间、cwd、Git 状态、MCP 状态等动态内容放在边界之后。",
      "<system-reminder> 的价值不是标签形式本身，而是把系统生成的动态事实放进消息尾部，避免污染全局缓存前缀。",
      "内置工具稳定排序、MCP 工具后置，都是为了让工具 schema 的大块 token 继续命中缓存。",
      "理解这一层后，cache_edits、post-compact reinjection 和 fork-style compaction 才会显得必要。"
    ],
    "reading": [
      {
        "source": "prompt-boundary",
        "label": "System Prompt 动静分界线",
        "note": "重点看稳定前缀和动态块如何拆开。"
      },
      {
        "source": "tool-interface",
        "label": "工具定义稳定性",
        "note": "把工具排序和延迟加载接到缓存前缀上理解。"
      }
    ],
    "pitfalls": [
      "不要把当前时间、随机 ID 或 Git 状态写到 System Prompt 开头。一次变化会让后续前缀缓存整体失效。",
      "不要为了局部清爽随意重排工具列表。字节级排序变化会变成真实成本。",
      "不要把 <system-reminder> 理解成提示词装饰。它是动静隔离的承载层。"
    ],
    "practice": "审视一个 Agent 请求 payload：标出哪些字段必须稳定，哪些字段应该放到动态尾部，并说明每个选择对缓存命中的影响。"
  },
  "context-pipeline": {
    "framing": "五层压缩管线是长会话的资源管理状态机。它优先使用低损、局部、可恢复手段，只有在上下文水位仍不安全时才进入破坏性摘要重构。",
    "points": [
      "工具结果预算先限制单个输出膨胀，避免 grep、日志、PDF 或搜索结果吞掉整轮窗口。",
      "Snip 释放最旧历史，并把释放 token 数传给后续逻辑，减少重复压缩。",
      "Microcompact 面向老化工具结果，尤其是巨大但当前价值低的工具日志。",
      "Context collapse 是读时投影，服务当前请求，不等价于永久改写 REPL messages。",
      "Session Memory compaction 会优先复用后台 summary.md 加最近尾部原文，只有仍超水位才进入真实 LLM 压缩。",
      "Auto-compact 最昂贵，会生成 compact boundary 和 post-compact messages，因此必须配合缓存复用和反遗忘重注入。"
    ],
    "reading": [
      {
        "source": "compaction-pipeline",
        "label": "query.ts 压缩顺序",
        "note": "按预算、snip、microcompact、collapse、autocompact 的损耗递增顺序读。"
      },
      {
        "source": "cache-edits",
        "label": "Microcompact 与 cache edits",
        "note": "继续追工具结果为什么可能不从本地消息删除。"
      }
    ],
    "pitfalls": [
      "不要把 Autocompact 当第一选择。它最重，且最容易丢失细节；已有 Session Memory 可用时应先尝试拼接式降级。",
      "不要忽略工具结果预算。长会话爆掉时，问题常常不是对话轮数，而是工具输出过大。",
      "不要混淆 read-time projection 和持久化历史替换。前者更可逆，后者更省空间但破坏颗粒度。"
    ],
    "practice": "给一个 150K token 会话设计压缩策略：最近 10 轮、巨大日志、旧搜索结果、用户明确要求保留的事实分别如何处理？"
  },
  "context-cache-edits": {
    "framing": "Cache Edits 是缓存工程里的旁路编辑：请求侧跳过低价值块，本地侧保留真实历史。它让系统同时拿到 token 节省、缓存收益和恢复能力。",
    "points": [
      "本地 messages 保持完整顺序，方便 UI、resume、debug 和后续恢复。",
      "云端请求额外携带 cache_edits，按 cache_reference 对缓存树做读时删除。",
      "pendingCacheEdits 需要被保存并在后续请求中重放，否则被删除的旧块会重新进入请求视图。",
      "热缓存时走增量删除，尽量保持前缀匹配；冷缓存时可能回退到本地内容替换。",
      "cache_edits 把“真实历史”和“请求视图”解耦，是 microcompact 能细粒度工作的关键。",
      "这一机制和 System Prompt boundary 都是在维护同一件事：稳定前缀服务缓存，动态变化放到尾部或请求视图层。"
    ],
    "reading": [
      {
        "source": "cache-edits",
        "label": "pendingCacheEdits",
        "note": "看 microcompact 如何把编辑延迟到 API 请求层。"
      },
      {
        "source": "prompt-boundary",
        "label": "Prompt boundary",
        "note": "把动静分离和 cache edits 对照起来理解。"
      }
    ],
    "pitfalls": [
      "不要把 cache_edits 当本地删除。它更接近向云端缓存树提交读时编辑。",
      "不要为了节省 token 破坏消息顺序。顺序一变，前缀缓存和会话恢复都会受影响。",
      "不要忽略缓存 TTL。缓存技术有时间窗口，超过窗口后策略收益会变化。"
    ],
    "practice": "解释这句话：同样是“忘掉旧工具结果”，直接 splice 本地数组和发送 cache_edits 的工程后果完全不同。"
  },
  "context-reactive-reinjection": {
    "framing": "压缩系统除了主动预测，还要处理 API 已经拒绝请求后的补救路径。Reactive Compact、媒体剥离和 post-compact reinjection 共同决定长会话能否跨过上下文物理极限继续工作。",
    "points": [
      "Reactive Compact 在 prompt_too_long、413 或媒体尺寸错误后介入，属于 API 拒绝后的兜底恢复路径。",
      "错误不会被简单重试；系统会改变下一轮输入，例如折叠历史、剥离超限媒体或减少尾部块。",
      "hasAttemptedReactiveCompact 等标记防止同一错误路径无限循环。",
      "Autocompact 请求复用主对话稳定前缀，只追加总结指令，使压缩本身像主会话 fork 一样继续利用缓存折扣。",
      "buildPostCompactMessages 在摘要后重注入活跃 Skills 和近期文件，降低行为断片和规范遗忘。"
    ],
    "reading": [
      {
        "source": "message-normalization",
        "label": "错误后的最小修复",
        "note": "对照图片、PDF、请求过大错误如何只剥离问题块。"
      },
      {
        "source": "compaction-pipeline",
        "label": "Reactive compact 与 post-compact",
        "note": "追压缩失败恢复和 buildPostCompactMessages。"
      },
      {
        "source": "prompt-boundary",
        "label": "动态附件位置",
        "note": "理解为什么压缩后重注入仍放在消息尾部。"
      }
    ],
    "pitfalls": [
      "不要把失败恢复理解成原样重试。原样重试只会再次撞上同一物理边界。",
      "不要认为摘要消息天然足够。摘要后的附件和技能重注入是行为连续性的关键。",
      "不要把动态项目数据塞进 System Prompt。压缩后的恢复信息同样应走动态消息尾部。"
    ],
    "practice": "设计一次 prompt_too_long 恢复：先尝试哪些低损修复？什么时候进入 reactive compact？压缩后需要补回哪些上下文？"
  }
});
