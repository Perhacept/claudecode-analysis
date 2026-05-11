注意： 入口是mds/claude-code-source-walkthrough.html。zip是claude code源码+资料，就不解压传了

# 学习记录文件夹

claudecode-analysis\mds\learning-state

这个文件夹用于集中放置 `claude-code-source-walkthrough.html` 导出的学习记录。

由于网页是纯前端、可直接用 `file://` 打开的本地 HTML，浏览器默认不能在未授权的情况下静默写入项目目录。因此页面提供两种方式：

1. 在支持 File System Access API 的浏览器中，点击网页右侧的“连接记录文件夹”，选择本文件夹。之后进度、自定义 QA、难度设置会同步写入 `claude-code-walkthrough-state.json`。
2. 如果浏览器不支持直接连接文件夹，点击“导出记录 JSON”，把文件保存到本文件夹；需要恢复时点击“导入记录 JSON”。

清空网页里的本地学习记录后，再次打开网页会回到全新状态。

学习记录包含：

​	个人预设QA

​	自选学习进度

补充说明：

- 网页内置的默认 QA 问题在： `../claude-code-qa-data.js`，适合维护“系统预设问题”。
- 你在网页里右键新增的自定义 QA 属于个人学习记录，保存在浏览器本地记录或导出的 `claude-code-walkthrough-state.json` 中，不会自动写回 `claude-code-qa-data.js`。

# QA&源码索引

预设QA： `../claude-code-qa-data.js`

自定义QA：claudecode-analysis\mds\learning-state\claude-code-walkthrough-state.json 

源码索引： `../claude-code-source-index.js`

claude code源码：解压sources下的Claude-Code-main.zip

互联网高质量文章材料：解压sources下的online-res.zip

# 自定义功能

接入codex后，给codex看：claudecode-analysis\mds\CODEX_HANDOFF.md
