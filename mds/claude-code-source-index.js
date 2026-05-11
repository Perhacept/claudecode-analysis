// Auto-split from claude-code-source-walkthrough.html.
window.CC_WALKTHROUGH_SOURCE_INDEX = [
  {
    "id": "query-loop",
    "title": "queryLoop 的状态循环",
    "topic": "Agent Loop / async generator / turn state",
    "file": "sources/Claude-Code-main/src/query.ts",
    "lines": "第241-307行",
    "snippet": "async function* queryLoop(params, consumedCommandUuids) {\n  const { systemPrompt, userContext, canUseTool, maxTurns } = params\n  let state = {\n    messages: params.messages,\n    toolUseContext: params.toolUseContext,\n    turnCount: 1,\n    hasAttemptedReactiveCompact: false\n  }\n  using pendingMemoryPrefetch = startRelevantMemoryPrefetch(\n    state.messages, state.toolUseContext\n  )\n  while (true) {\n    const { messages, turnCount } = state\n    // 每轮读 state，产生消息、工具结果或恢复动作\n  }\n}"
  },
  {
    "id": "message-normalization",
    "title": "消息入 API 前的规范化",
    "topic": "message normalization / attachments / virtual messages",
    "file": "sources/Claude-Code-main/src/utils/messages.ts",
    "lines": "第1989-2055行",
    "snippet": "export function normalizeMessagesForAPI(messages, tools = []) {\n  const availableToolNames = new Set(tools.map(t => t.name))\n  const reorderedMessages = reorderAttachmentsForAPI(messages)\n    .filter(m => !m.isVirtual)\n\n  const errorToBlockTypes = {\n    [getImageTooLargeErrorMessage()]: new Set(['image']),\n    [getRequestTooLargeErrorMessage()]: new Set(['document', 'image'])\n  }\n\n  // 遇到大图、大 PDF 等错误后，只剥离对应块，而不是粗暴丢历史\n}"
  },
  {
    "id": "prompt-boundary",
    "title": "System Prompt 动静分界线",
    "topic": "static global cache / dynamic session context",
    "file": "sources/Claude-Code-main/src/constants/prompts.ts + src/utils/api.ts",
    "lines": "prompts.ts 第105-115行；api.ts 第321-410行",
    "snippet": "export const SYSTEM_PROMPT_DYNAMIC_BOUNDARY =\n  '__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__'\n\nfunction splitSysPromptPrefix(systemPrompt) {\n  const boundaryIndex = systemPrompt.findIndex(\n    s => s === SYSTEM_PROMPT_DYNAMIC_BOUNDARY\n  )\n  const staticBlocks = []\n  const dynamicBlocks = []\n  // boundary 前进入 cacheScope: 'global'\n  // boundary 后保持 cacheScope: null\n}"
  },
  {
    "id": "compaction-pipeline",
    "title": "四层上下文压缩管线",
    "topic": "snip / microcompact / context collapse / autocompact",
    "file": "sources/Claude-Code-main/src/query.ts",
    "lines": "第400-535行",
    "snippet": "let messagesForQuery = [...getMessagesAfterCompactBoundary(messages)]\n\nif (feature('HISTORY_SNIP')) {\n  messagesForQuery = snipCompactIfNeeded(messagesForQuery).messages\n}\n\nconst microcompactResult = await deps.microcompact(messagesForQuery, toolUseContext)\nmessagesForQuery = microcompactResult.messages\n\nif (feature('CONTEXT_COLLAPSE') && contextCollapse) {\n  messagesForQuery = (await contextCollapse.applyCollapsesIfNeeded(...)).messages\n}\n\nconst { compactionResult } = await deps.autocompact(messagesForQuery, ...)\nif (compactionResult) {\n  const postCompactMessages = buildPostCompactMessages(compactionResult)\n  for (const message of postCompactMessages) yield message\n}"
  },
  {
    "id": "cache-edits",
    "title": "Cache Edits 与缓存引用",
    "topic": "cached microcompact / cache_edits / cache_reference",
    "file": "sources/Claude-Code-main/src/services/compact/microCompact.ts + src/services/api/claude.ts",
    "lines": "microCompact.ts 第276-392行；claude.ts 第3052-3210行",
    "snippet": "const pendingCacheEdits = microcompactResult.compactionInfo?.pendingCacheEdits\n\n// cached microcompact 不直接改本地 messages\n// 它把删除/固定等操作排成 cache_edits，交给 API 请求层发送\n\nrequest.cache_edits = dedupeAndPinCacheEdits(pendingCacheEdits)\ntoolResult.cache_reference = { tool_use_id, cache_key }"
  },
  {
    "id": "tool-interface",
    "title": "Tool 接口与安全默认值",
    "topic": "Tool contract / fail-closed defaults",
    "file": "sources/Claude-Code-main/src/Tool.ts",
    "lines": "第362-520行；第744-769行",
    "snippet": "export type Tool<Input, Output> = {\n  call(args, context, canUseTool, parentMessage, onProgress)\n  inputSchema: Input\n  isConcurrencySafe(input): boolean\n  isReadOnly(input): boolean\n  checkPermissions(input, context): Promise<PermissionResult>\n  validateInput?(input, context): Promise<ValidationResult>\n}\n\nconst TOOL_DEFAULTS = {\n  isEnabled: () => true,\n  isConcurrencySafe: () => false,\n  isReadOnly: () => false,\n  checkPermissions: input => Promise.resolve({ behavior: 'allow', updatedInput: input })\n}"
  },
  {
    "id": "streaming-tools",
    "title": "StreamingToolExecutor 并发规则",
    "topic": "tool queue / read-only concurrency / unsafe blocking",
    "file": "sources/Claude-Code-main/src/services/tools/StreamingToolExecutor.ts",
    "lines": "第40-158行",
    "snippet": "class StreamingToolExecutor {\n  private tools = []\n\n  addTool(block, assistantMessage) {\n    const parsedInput = toolDefinition.inputSchema.safeParse(block.input)\n    const isConcurrencySafe = parsedInput?.success\n      ? Boolean(toolDefinition.isConcurrencySafe(parsedInput.data))\n      : false\n    this.tools.push({ status: 'queued', isConcurrencySafe, block })\n    void this.processQueue()\n  }\n\n  private canExecuteTool(isConcurrencySafe) {\n    const executing = this.tools.filter(t => t.status === 'executing')\n    return executing.length === 0 ||\n      (isConcurrencySafe && executing.every(t => t.isConcurrencySafe))\n  }\n}"
  },
  {
    "id": "permission-modes",
    "title": "权限模式与 deny 优先",
    "topic": "permission mode / allow deny ask / path validation",
    "file": "sources/Claude-Code-main/src/types/permissions.ts + src/utils/permissions/pathValidation.ts",
    "lines": "permissions.ts 第16-44行；pathValidation.ts 第150-164行",
    "snippet": "export const EXTERNAL_PERMISSION_MODES = [\n  'acceptEdits', 'bypassPermissions', 'default', 'dontAsk', 'plan'\n]\nexport type PermissionBehavior = 'allow' | 'deny' | 'ask'\n\n// path validation\nconst denyRule = matchingRuleForInput(resolvedPath, context, permissionType, 'deny')\nif (denyRule !== null) {\n  return { allowed: false, decisionReason: { type: 'rule', rule: denyRule } }\n}"
  },
  {
    "id": "yolo-classifier",
    "title": "Auto 模式的两阶段分类器",
    "topic": "fast classifier / thinking classifier / fail closed",
    "file": "sources/Claude-Code-main/src/utils/permissions/yoloClassifier.ts",
    "lines": "第698-826行",
    "snippet": "async function classifyYoloActionXml(...) {\n  // Stage 1: fast，max_tokens 很小，追求立即 yes/no\n  if (mode !== 'thinking') {\n    const stage1Raw = await sideQuery(stage1Opts)\n    const stage1Block = parseXmlBlock(extractTextContent(stage1Raw.content))\n    if (stage1Block === false) return { shouldBlock: false, stage: 'fast' }\n    if (mode === 'fast') return handleStage1FinalVerdict(...)\n  }\n  // Stage 2: thinking，降低误杀或漏判风险\n}"
  },
  {
    "id": "hooks-schema",
    "title": "Hooks 的四类执行器",
    "topic": "command / prompt / http / agent hooks",
    "file": "sources/Claude-Code-main/src/schemas/hooks.ts",
    "lines": "第31-140行",
    "snippet": "const BashCommandHookSchema = z.object({\n  type: z.literal('command'), command: z.string(), if: IfConditionSchema()\n})\nconst PromptHookSchema = z.object({\n  type: z.literal('prompt'), prompt: z.string(), model: z.string().optional()\n})\nconst HttpHookSchema = z.object({\n  type: z.literal('http'), url: z.string().url(), headers: z.record(...).optional()\n})\nconst AgentHookSchema = z.object({\n  type: z.literal('agent'), prompt: z.string()\n})"
  },
  {
    "id": "hook-invariant",
    "title": "Hook allow 不能绕过 deny/ask",
    "topic": "hook permission invariant",
    "file": "sources/Claude-Code-main/src/services/tools/toolHooks.ts",
    "lines": "第322-410行",
    "snippet": "export async function resolveHookPermissionDecision(hookPermissionResult, tool, input, ctx, canUseTool) {\n  if (hookPermissionResult?.behavior === 'allow') {\n    const hookInput = hookPermissionResult.updatedInput ?? input\n    const ruleCheck = await checkRuleBasedPermissions(tool, hookInput, ctx)\n    if (ruleCheck === null) return { decision: hookPermissionResult, input: hookInput }\n    if (ruleCheck.behavior === 'deny') return { decision: ruleCheck, input: hookInput }\n    return { decision: await canUseTool(tool, hookInput, ctx, ...), input: hookInput }\n  }\n}"
  },
  {
    "id": "bash-defenses",
    "title": "BashTool 的复合命令防线",
    "topic": "command injection / sandbox auto allow / subcommand deny",
    "file": "sources/Claude-Code-main/src/tools/BashTool/bashPermissions.ts",
    "lines": "第1213-1320行",
    "snippet": "if (!astParseSucceeded) {\n  const safetyResult = await bashCommandIsSafeAsync(input.command)\n  if (safetyResult.behavior !== 'passthrough') {\n    return { behavior: 'ask', suggestions: [] }\n  }\n}\n\nconst subcommands = splitCommand(command)\nfor (const sub of subcommands) {\n  const subResult = matchingRulesForInput({ command: sub }, ctx, 'prefix')\n  if (subResult.matchingDenyRules[0]) return { behavior: 'deny' }\n}"
  },
  {
    "id": "file-edit-defenses",
    "title": "FileEditTool 的读后写与唯一匹配",
    "topic": "read-before-write / modified since read / old_string match",
    "file": "sources/Claude-Code-main/src/tools/FileEditTool/FileEditTool.ts",
    "lines": "第275-336行",
    "snippet": "const readTimestamp = toolUseContext.readFileState.get(fullFilePath)\nif (!readTimestamp || readTimestamp.isPartialView) {\n  return { result: false, behavior: 'ask', message: 'Read it first' }\n}\nif (lastWriteTime > readTimestamp.timestamp && fileContent !== readTimestamp.content) {\n  return { result: false, behavior: 'ask', message: 'Read it again' }\n}\nconst actualOldString = findActualString(file, old_string)\nif (!actualOldString) return { result: false, behavior: 'ask' }\nif (matches > 1 && !replace_all) return { result: false, behavior: 'ask' }"
  },
  {
    "id": "memory-recall",
    "title": "Memory 主动召回链路",
    "topic": "memory scan / frontmatter / relevant selection",
    "file": "sources/Claude-Code-main/src/memdir/memoryScan.ts + src/memdir/findRelevantMemories.ts",
    "lines": "memoryScan.ts 第35-74行；findRelevantMemories.ts 第35-75行",
    "snippet": "async function scanMemoryFiles(memoryDir, signal) {\n  const mdFiles = entries.filter(f => f.endsWith('.md') && basename(f) !== 'MEMORY.md')\n  const { frontmatter } = parseFrontmatter(content, filePath)\n  return headers.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_MEMORY_FILES)\n}\n\nasync function findRelevantMemories(query, memoryDir, signal, recentTools, alreadySurfaced) {\n  const memories = (await scanMemoryFiles(memoryDir, signal))\n    .filter(m => !alreadySurfaced.has(m.filePath))\n  const selectedFilenames = await selectRelevantMemories(query, memories, signal, recentTools)\n  return selected.map(m => ({ path: m.filePath, mtimeMs: m.mtimeMs }))\n}"
  },
  {
    "id": "team-memory-secret",
    "title": "Team Memory 上传前的 Secret 阻断",
    "topic": "secret scan / skip upload",
    "file": "sources/Claude-Code-main/src/services/teamMemorySync/index.ts",
    "lines": "第563-620行",
    "snippet": "const content = await readFile(fullPath, 'utf8')\nconst secretMatches = scanForSecrets(content)\nif (secretMatches.length > 0) {\n  skippedSecrets.push({\n    path: relPath,\n    ruleId: firstMatch.ruleId,\n    label: firstMatch.label\n  })\n  return\n}\nentries[relPath] = content"
  },
  {
    "id": "fork-subagent",
    "title": "Fork Subagent 的缓存复用",
    "topic": "fork / inherited context / bubble permission / cache prefix",
    "file": "sources/Claude-Code-main/src/tools/AgentTool/forkSubagent.ts",
    "lines": "第18-105行",
    "snippet": "export const FORK_AGENT = {\n  agentType: 'fork',\n  tools: ['*'],\n  maxTurns: 200,\n  model: 'inherit',\n  permissionMode: 'bubble',\n  getSystemPrompt: () => ''\n}\n\n// fork path 使用父会话已经渲染好的 system prompt bytes\n// 子 Agent 的前缀尽量字节一致，以最大化 prompt cache 命中"
  },
  {
    "id": "coordinator-rules",
    "title": "Coordinator 不委派理解",
    "topic": "worker prompt / bounded task / line references",
    "file": "sources/Claude-Code-main/src/coordinator/coordinatorMode.ts",
    "lines": "第251-267行",
    "snippet": "const workerInstructions = [\n  \"Workers can't see your conversation with the user.\",\n  \"Never delegate the task of understanding the user's high-level goal.\",\n  \"Include exact file paths and line numbers when assigning work.\",\n  \"Give workers concrete, bounded tasks with clear ownership.\"\n]"
  },
  {
    "id": "flush-gate",
    "title": "FlushGate 防止历史/实时消息乱序",
    "topic": "bridge initial flush / queue live messages",
    "file": "sources/Claude-Code-main/src/bridge/flushGate.ts",
    "lines": "第1-71行",
    "snippet": "export class FlushGate<T> {\n  private _active = false\n  private _pending: T[] = []\n  start() { this._active = true }\n  enqueue(...items) {\n    if (!this._active) return false\n    this._pending.push(...items)\n    return true\n  }\n  end() {\n    this._active = false\n    return this._pending.splice(0)\n  }\n}"
  },
  {
    "id": "remote-permissions",
    "title": "RemoteSessionManager 权限桥接",
    "topic": "WebSocket / HTTP POST / permission request",
    "file": "sources/Claude-Code-main/src/remote/RemoteSessionManager.ts",
    "lines": "第88-198行",
    "snippet": "export class RemoteSessionManager {\n  private websocket = null\n  private pendingPermissionRequests = new Map()\n\n  connect() {\n    this.websocket = new SessionsWebSocket(sessionId, orgUuid, getAccessToken, callbacks)\n    void this.websocket.connect()\n  }\n\n  private handleMessage(message) {\n    if (message.type === 'control_request') return this.handleControlRequest(message)\n    if (message.type === 'control_cancel_request') return this.callbacks.onPermissionCancelled?.(...)\n    if (isSDKMessage(message)) this.callbacks.onMessage(message)\n  }\n}"
  },
  {
    "id": "worktree",
    "title": "EnterWorktreeTool 的物理隔离",
    "topic": "isolated git worktree / cwd switch",
    "file": "sources/Claude-Code-main/src/tools/EnterWorktreeTool/EnterWorktreeTool.ts",
    "lines": "第52-116行",
    "snippet": "async call(input) {\n  if (getCurrentWorktreeSession()) throw new Error('Already in a worktree session')\n  const mainRepoRoot = findCanonicalGitRoot(getCwd())\n  if (mainRepoRoot && mainRepoRoot !== getCwd()) {\n    process.chdir(mainRepoRoot)\n    setCwd(mainRepoRoot)\n  }\n  const worktreeSession = await createWorktreeForSession(getSessionId(), slug)\n  process.chdir(worktreeSession.worktreePath)\n  setCwd(worktreeSession.worktreePath)\n  clearSystemPromptSections()\n  clearMemoryFileCaches()\n}"
  },
  {
    "id": "ink-renderer",
    "title": "Ink 终端渲染的批量写入",
    "topic": "terminal buffer / synchronized update / DEC 2026",
    "file": "sources/Claude-Code-main/src/ink/terminal.ts",
    "lines": "第193-247行",
    "snippet": "function applyPatches(terminal, diff, skipSyncMarkers = false) {\n  const useSync = !skipSyncMarkers\n  let buffer = useSync ? BSU : ''\n  for (const patch of diff) {\n    if (patch.type === 'stdout') buffer += patch.content\n    if (patch.type === 'clear') buffer += eraseLines(patch.count)\n    if (patch.type === 'cursorMove') buffer += cursorMove(patch.x, patch.y)\n  }\n  if (useSync) buffer += ESU\n  terminal.stdout.write(buffer)\n}"
  },
  {
    "id": "mcp-transports",
    "title": "MCP 的多传输协议",
    "topic": "stdio / sse / http / ws / sdk",
    "file": "sources/Claude-Code-main/src/services/mcp/types.ts",
    "lines": "第23-96行",
    "snippet": "export const TransportSchema = z.enum(['stdio', 'sse', 'sse-ide', 'http', 'ws', 'sdk'])\n\nconst McpStdioServerConfigSchema = z.object({\n  type: z.literal('stdio').optional(),\n  command: z.string().min(1),\n  args: z.array(z.string()).default([])\n})\n\nconst McpHTTPServerConfigSchema = z.object({\n  type: z.literal('http'),\n  url: z.string(),\n  oauth: McpOAuthConfigSchema().optional()\n})"
  },
  {
    "id": "skill-fork",
    "title": "Skill 的 fork 执行",
    "topic": "skill command / context fork",
    "file": "sources/Claude-Code-main/src/tools/SkillTool/SkillTool.ts",
    "lines": "第621-634行",
    "snippet": "if (command?.type === 'prompt' && command.context === 'fork') {\n  return executeForkedSkill(\n    command, commandName, args, context, canUseTool, parentMessage, onProgress\n  )\n}\n// 普通 skill 则在当前上下文中继续处理"
  },
  {
    "id": "settings-compat",
    "title": "Settings 宽进严出与 Drop-in",
    "topic": "passthrough / preserve unknown fields / managed drop-in",
    "file": "sources/Claude-Code-main/src/utils/settings/types.ts + src/utils/settings/mdm/settings.ts",
    "lines": "types.ts 第70-100、230-245、480-505行；settings.ts 第276-313行",
    "snippet": "permissions: z.object({ ... }).passthrough()\n\n// 设置系统保留未知字段：旧配置不因新 schema 直接损坏\n// invalid settings are not used, but remain in the file\n\nfunction hasManagedSettingsFile() {\n  const main = join(getManagedFilePath(), 'managed-settings.json')\n  const dropInDir = getManagedSettingsDropInDir()\n  // managed-settings.d/*.json 中非空文件也算托管设置存在\n}"
  },
  {
    "id": "telemetry-sinks",
    "title": "启动阶段的遥测与后台钩子",
    "topic": "analytics sinks / session start beacon / team watcher",
    "file": "sources/Claude-Code-main/src/setup.ts",
    "lines": "第331-380行",
    "snippet": "if (!isBareMode()) {\n  if (feature('COMMIT_ATTRIBUTION')) {\n    setImmediate(() => import('./utils/attributionHooks.js'))\n  }\n  void import('./utils/sessionFileAccessHooks.js')\n  if (feature('TEAMMEM')) void import('./services/teamMemorySync/watcher.js')\n}\ninitSinks()\nlogEvent('tengu_started', {})"
  }
];
