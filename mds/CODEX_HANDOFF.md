# Codex 维护交接说明

这份文档给后续维护本目录的 Codex 使用。当前学习页是一个纯前端本地网页，核心入口是 `claude-code-source-walkthrough.html`，数据拆在同级 JS 和 `chapters/` 目录里。维护时优先只看 `mds/`，除非任务明确要求补源码索引，才去对照 `sources/Claude-Code-main` 找真实源码位置。

## 目录职责

- `claude-code-source-walkthrough.html`：页面结构、样式、交互逻辑和本地学习状态管理。这里不再内联章节正文、默认 QA 或源码索引数据。
- `claude-code-source-index.js`：源码弹窗索引。维护绿色源码按钮、顶部源码搜索、弹窗标题/文件/行号/精简片段。
- `claude-code-qa-data.js`：系统预设 QA。维护蓝色 QA 按钮打开的问题组和 NotebookLM 回答。
- `chapters/chapter-*.js`：章节正文与扩展带读数据。每章向全局章节数组追加一个 chapter，并向扩展带读 map 追加多个 lesson extension。
- `chapters/README.md`：章节拆分说明。
- `learning-state/README.md`：学习记录导入导出说明。网页用户右键新增的自定义 QA 是个人状态，不会自动写回 `claude-code-qa-data.js`。

## 页面加载关系

`claude-code-source-walkthrough.html` 的脚本加载顺序很重要：

1. `claude-code-qa-data.js` 写入 `window.CC_WALKTHROUGH_QA_GROUPS`
2. `claude-code-source-index.js` 写入 `window.CC_WALKTHROUGH_SOURCE_INDEX`
3. `chapters/chapter-01-*.js` 到 `chapter-12-*.js` 依次 push 章节，并写入 `window.CC_WALKTHROUGH_LESSON_EXTENSIONS`
4. HTML 末尾的主脚本读取这些全局对象并渲染页面

主脚本读取后会缓存到局部常量：

- `sourceIndex = window.CC_WALKTHROUGH_SOURCE_INDEX || []`
- `qaGroups = window.CC_WALKTHROUGH_QA_GROUPS || {}`
- `chapters = window.CC_WALKTHROUGH_CHAPTERS || []`
- `lessonExtensions = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {}`

如果新增数据文件，必须同时在 HTML 中补 `<script src="..."></script>`，并确保它在主脚本之前加载。

## 核心数据模型

### 源码索引

`claude-code-source-index.js` 导出数组，每个条目形如：

```js
{
  id: "query-loop",
  title: "queryLoop 的状态循环",
  topic: "Agent Loop / async generator / turn state",
  file: "sources/Claude-Code-main/src/query.ts",
  lines: "第241-307行",
  snippet: "async function* queryLoop(...) {\n  ..."
}
```

字段用途：

- `id` 是所有源码按钮的稳定引用键。章节正文、章节 `sources`、扩展带读 `reading[].source` 都用它关联。
- `title` 显示在绿色源码按钮和源码弹窗标题。
- `topic` 显示在源码弹窗副标题和学习点。
- `file` 和 `lines` 只作为展示文本，不会自动读取源码。
- `snippet` 是弹窗里的精简代码片段，应该短、可读、聚焦教学点。

### 默认 QA

`claude-code-qa-data.js` 导出对象 map，每个 key 是 QA 组 id：

```js
"tool-system": {
  title: "Tool 接口和流式编排",
  ref: "问题组 5.1 / 5.2",
  answerSource: "notebookAns.md",
  sources: ["tool-interface", "streaming-tools"],
  questions: ["..."],
  answers: ["..."]
}
```

字段用途：

- map key 是 `data-qa` 和章节 `qas` 的引用键。
- `title` 显示在 QA 面板标题。
- `ref` 显示在蓝色 QA chip 和 QA 面板副标题。
- `sources` 可选，保存该 QA 组关联的源码索引 id；QA 面板会渲染为“相关源码”按钮。
- `questions` 和 `answers` 按数组下标一一对应。
- `answers` 可以暂时缺省或留空；页面会显示“待 NotebookLM 回答”占位。
- `answers` 正文支持源码标记：`[[source:tool-interface|Tool 接口源码]]`。页面会在保持 HTML 转义的前提下，把存在于源码索引里的 id 转成可点击源码按钮。

### 章节数据

每个 `chapters/chapter-*.js` 文件都执行：

```js
window.CC_WALKTHROUGH_CHAPTERS = window.CC_WALKTHROUGH_CHAPTERS || [];
window.CC_WALKTHROUGH_LESSON_EXTENSIONS = window.CC_WALKTHROUGH_LESSON_EXTENSIONS || {};
window.CC_WALKTHROUGH_CHAPTERS.push({
  id: "tools",
  title: "第 5 章：工具系统与底层执行流",
  subtitle: "...",
  review: ["..."],
  sections: [
    {
      id: "tools-contract",
      title: "5.1 Tool 接口：结构化契约与 fail-closed 默认值",
      sources: ["tool-interface"],
      qas: ["tool-system"],
      html: "<p>...</p>"
    }
  ]
});
```

字段用途：

- chapter `id` 是左侧导航和最后打开章节的状态键。
- section `id` 是完成进度、扩展带读、右键自定义 QA 绑定的关键键，改名会让已有学习记录失效。
- section `sources` 决定小节底部绿色源码 chip。
- section `qas` 决定小节底部蓝色 QA chip。
- section `html` 是正文 HTML 字符串。正文里可以嵌入 inline 按钮：
  - 源码按钮：`<button class='inline-action source-trigger' data-source='tool-interface'>Tool 契约</button>`
  - QA 按钮：`<button class='inline-action qa-trigger' data-qa='tool-system'>Tool System QA</button>`

### 扩展带读

章节文件末尾用 `Object.assign(window.CC_WALKTHROUGH_LESSON_EXTENSIONS, {...})` 追加扩展内容：

```js
"tools-contract": {
  framing: "...",
  points: ["..."],
  reading: [
    { source: "tool-interface", label: "Tool 类型定义", note: "..." }
  ],
  pitfalls: ["..."],
  practice: "..."
}
```

key 通常对应 section `id`。页面会在小节正文后追加“扩展带读”。如果 key 不存在，对应小节不会显示扩展带读。

## 主要交互逻辑

HTML 主脚本里的关键函数：

- `init()`：设置难度、渲染导航/当前页/进度并绑定事件。
- `renderNav()`：根据 `chapters` 和 `appState.progress` 渲染左侧章节导航。
- `renderCurrent()`：渲染主页或当前章节；章节页会调用 `renderSection()`。
- `renderSection(section)`：渲染正文、完成勾选、源码 chip、QA chip 和扩展带读。
- `openSource(id)`：从 `sourceIndex` 找条目并打开源码弹窗。
- `openQA(id)`：从 `qaGroups` 找问题组并打开 QA 面板。
- `renderSearch()`：顶部搜索只查 `sourceIndex` 的 `title/topic/file/lines/snippet`。
- `saveCustomQA()`：保存用户右键新增的自定义 QA 到本地学习状态。
- `openCustomQAEditor(id)` / `deleteCustomQA(id)`：修改或删除已有自定义 QA。修改只改问题和回答，保留原选中文本与 `anchor`；删除会移除该条记录并刷新对应高亮。
- `applyLessonHighlights()` / `applySourceHighlights()`：把自定义 QA 的选中文本重新高亮。
- `exportState()` / `importState()` / `connectStateDir()`：导出、导入或连接 `learning-state/claude-code-walkthrough-state.json`。

自定义 QA 绑定选区时不要只依赖 `text`。新版保存会额外写入 `anchor`：

```json
{
  "text": "文章",
  "sectionId": "context-pipeline",
  "anchor": {
    "version": 1,
    "startOffset": 120,
    "endOffset": 122,
    "textLength": 2,
    "containerTextLength": 3000,
    "contextBefore": "...文章1说明了...",
    "contextAfter": "2说明了...",
    "scope": "lesson",
    "containerIndex": 0
  }
}
```

`startOffset/endOffset` 是相对于当前 section 的 `.section-body` 或源码弹窗 `#sourceSnippet` 的文本偏移。恢复高亮时优先用 offset 精确命中，再用 `contextBefore/contextAfter` 兜底，最后才兼容旧记录的文本首匹配。因此重复短词（例如文章 1 和文章 2 都有“文章”）不会再默认落到第一处。

## 本地状态边界

网页使用 `localStorage` 保存学习状态：

- `ccWalkthrough.progress.v1`
- `ccWalkthrough.customQA.v1`
- `ccWalkthrough.level.v1`
- `ccWalkthrough.lastChapter.v1`

导出的 JSON 结构由 `buildExportState()` 生成：

```json
{
  "version": 1,
  "exportedAt": "ISO 时间",
  "progress": {},
  "customQA": [],
  "level": "beginner",
  "lastChapter": "home"
}
```

`customQA[]` 里的旧记录可能没有 `anchor`，页面会继续兼容，但这类旧记录本身无法知道用户当时选中的是第几次出现的同名字符串。

自定义 QA 卡片现在支持修改和删除。修改会原地更新 `question`、`answer`，并追加/覆盖 `updatedAt`；不会改 `text`、`sectionId`、`scope`、`sourceId` 或 `anchor`。如果用户要换绑定位置，应删除后重新选中文字添加。

维护默认内容时不要把个人 `customQA` 写进 `claude-code-qa-data.js`。默认 QA 属于系统预设；右键新增 QA 属于用户学习记录。

## 常见维护任务

### 给标注文字补源码索引

1. 在 `sources/Claude-Code-main` 中确认源码文件、关键行号和真实逻辑。
2. 在 `claude-code-source-index.js` 新增一个稳定 `id`，填好 `title/topic/file/lines/snippet`。
3. 在相关 `chapters/chapter-*.js` 的 section `sources` 加入该 `id`。
4. 如果正文中某段文字要直接打开弹窗，在 `html` 字符串里加 `data-source="新 id"` 的 inline button。
5. 如果扩展带读也需要这个入口，在 lesson extension 的 `reading` 加 `{ source, label, note }`。
6. 检查是否有拼写不一致。找不到的 `source id` 不会报错，只会不显示按钮或点击无反应。

维护原则：

- `snippet` 保持教学化，不要把大段源码整块塞入弹窗。
- `file` 使用相对项目根的展示路径，例如 `sources/Claude-Code-main/src/query.ts`。
- `lines` 是给人看的描述，行号变动时要一起更新。
- `id` 一旦被章节或学习记录引用，尽量不要改名。

### 增加默认 QA

1. 在 `claude-code-qa-data.js` 新增或扩展一个 QA 组。
2. 保证 `questions[index]` 对应 `answers[index]`。没有答案时可以先留空或少填，页面会显示占位。
3. 在相关 section 的 `qas` 数组加入 QA 组 id。
4. 如果正文内需要显式入口，在 `html` 字符串里加 `data-qa="QA 组 id"` 的 inline button。
5. 如果 QA 面板顶部需要“相关源码”，在 QA 组加 `sources: ["源码 id"]`。
6. 如果 QA 回答正文里需要行内源码入口，写 `[[source:源码 id|显示文字]]`，例如 `[[source:tool-interface|Tool 接口源码]]`。
7. `ref` 尽量沿用“问题组 x.y”格式，方便和外部 NotebookLM 问题分组对应。

维护原则：

- 默认 QA 是系统预设内容，回答来源如果来自 NotebookLM，保留 `answerSource`。
- 长答案可以保留 Markdown 风格的 `#`/`##`/`###` 标题、反引号、`**加粗**`、无序列表和有序列表。页面的 `formatAnswer()` 会做有限格式化，并能保留有序列表里的缩进续行，避免每个条目都重新从 1 开始。
- QA 答案中的源码入口不要直接写 HTML；用 `[[source:id|label]]` 标记。不存在的源码 id 会按普通文本显示。
- 不要在答案里依赖复杂 Markdown 表格、代码围栏或多层嵌套结构；当前渲染器只覆盖标题、段落、行内代码、加粗、源码标记和常规列表。

### 新增章节或小节

1. 新章节优先新建 `chapters/chapter-XX-name.js`，沿用现有文件模板。
2. 在 HTML 的章节脚本列表中按顺序引入新文件。
3. chapter `id`、section `id` 要稳定且语义清楚。
4. 每个 section 的 `sources` 和 `qas` 应引用已存在的源码索引和 QA 组。
5. 如果新增 section，建议同步添加同名 lesson extension，至少包含 `framing/points/reading/pitfalls/practice`。

注意：章节顺序由 HTML 中 `<script>` 顺序决定，不是文件名自动排序。

### 新增网页功能

优先在 `claude-code-source-walkthrough.html` 修改，因为页面没有构建系统。新增功能时注意：

- 数据仍尽量放到独立 JS 文件，避免 HTML 重新膨胀成大数据文件。
- 如果功能需要持久化，先扩展 `STORAGE_KEYS` 和 `buildExportState()`，再处理 `importState()` 与 `connectStateDir()` 的兼容。
- 新 DOM 入口要在 `bindEvents()` 中绑定，或复用现有事件委托。
- 任何用户输入进入 `innerHTML` 前都要走 `escapeHTML()`。章节 `html` 是可信维护数据；用户自定义 QA 不是。
- 难度控制依赖 `body[data-level]` 和 CSS class：`level-beginner`、`level-intermediate`、`level-advanced`。

## ID 一致性检查清单

改完数据后重点检查这些引用：

- `data-source="x"` 是否存在于 `CC_WALKTHROUGH_SOURCE_INDEX[].id`
- section `sources: ["x"]` 是否存在于源码索引
- QA group `sources: ["x"]` 是否存在于源码索引
- QA answer `[[source:x|...]]` 是否存在于源码索引
- lesson `reading[].source` 是否存在于源码索引
- `data-qa="x"` 是否存在于 `CC_WALKTHROUGH_QA_GROUPS`
- section `qas: ["x"]` 是否存在于 QA map
- lesson extension key 是否对应真实 section `id`

一个轻量检查方式是用浏览器打开 `claude-code-source-walkthrough.html`，看控制台是否报错，并手动点新增的绿色源码按钮、蓝色 QA 按钮、顶部搜索和章节导航。

如果需要命令行语法检查，可以在 `mds/` 范围内对 JS 文件做 `node --check`。这只检查语法，不会验证引用是否存在。

## 维护约定

- 后续 Codex 接到“补源码索引”任务时，可以读取 `sources/Claude-Code-main` 查证真实源码；没有这个任务时优先只碰 `mds/`。
- 不要随意重命名已有 chapter id、section id、source id、QA id；它们可能被学习进度、自定义 QA 或正文按钮引用。
- 不要把大段源码或完整外部文档复制进页面。弹窗只保留最能解释概念的精简片段。
- 不要把用户导出的学习记录当成默认数据合并。
- 数据文件是直接由浏览器执行的 JS，不是 JSON；新增字符串时注意引号、换行和反斜杠转义。
- 页面可通过 `file://` 直接打开，避免引入必须依赖打包器或后端服务的新能力。
