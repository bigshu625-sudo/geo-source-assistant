# 体系致胜GEO-信源分析助手

**简称「信源助手」** · **TXZS GEO Source Analysis Assistant** · **v1.4.15**

[简体中文](#中文) · [English](#english) · [架构说明 / Architecture](docs/ARCHITECTURE.md)

[体系致胜GEO 官网 / Official website](https://www.020yueshi.com/) · [产品介绍 / Product page](https://www.020yueshi.com/GEO-XY.html)

## 中文

**一键保存 AI 问答截图和可见信源，方便后续做 GEO 逆向研究。** 信源助手在 Chrome 侧栏运行。它把原提问、回答和页面展示的参考资料归到同一个本机任务，可导出 PNG、Markdown 和 Excel。用同一个问题在不同平台提问后，可以对照回答引用了哪些网站和内容、来源类型如何分布，以及不同平台或不同时间的引用有何变化。

**平台支持。** V1.4.15 支持豆包、DeepSeek、文心一言、千问、腾讯元宝、Kimi、Gemini 和 ChatGPT。Gemini 和 ChatGPT 可读取回答中的网页引用，并保存问答截图。[ChatGPT 网页版](https://chatgpt.com/) · [Gemini 网页版](https://gemini.google.com/app)

**使用条件。** 在同一个 Chrome 浏览器中打开并登录要采集的 AI 平台网页版，用该账号正常提问。扩展从当前打开的回答页面读取可见内容。使用截图和信源导出只需连接本机服务。

**免费使用。** 问答截图、信源保存和导出都不需要 API Key。提问所用的 AI 网页账号由各平台管理。

| 你想保存什么 | 用哪个按钮 |
| --- | --- |
| 只保存这轮问答的截图 | 点 **截取提问与回答**。截好后，点侧栏顶部的 **下载截图**。 |
| 一次保存回答、信源和截图 | 选择 **当前回答**，勾选 **导入时保存问答截图**，再点 **导入信源**。资料会保存在同一任务里。 |
| 把资料带走分析 | 在 **任务记录** 里选中任务，点 **导出 Markdown** 或 **导出 Excel**。 |

### 首次安装与连接

需要 **Chrome 120+** 和本机服务。Windows x64 已通过全新安装测试。macOS 提供 Apple Silicon 和 Intel 安装脚本，实机验收待完成。

1. 完整解压跨平台运行包，或使用仓库源码。首次安装需要联网准备 Python 3.12 和依赖。
2. Windows 依次运行 **安装依赖.cmd**、**启动服务.cmd**。macOS 依次运行 **安装依赖.command**、**启动服务.command**。
3. 在 Chrome 地址栏打开 `chrome://extensions`，开启 **开发者模式**，点击 **加载已解压的扩展程序**，选择项目内的 `extension/` 文件夹。
4. 从 Chrome 工具栏打开「体系致胜GEO-信源助手」侧栏。点击 **设置**，粘贴项目内 `data/pairing-token.txt` 里的连接码，再点击 **保存并连接**，确认侧栏显示 **本机已连接**。

电脑重启后重新运行启动脚本即可。更新旧版时，在原目录重启服务，到扩展管理页刷新原扩展，再刷新 AI 网页并重新打开侧栏。Mac 双击脚本遇到执行权限问题时，可在项目目录用终端运行 `bash ./安装依赖.command` 和 `bash ./启动服务.command`。详见 [Windows / macOS 安装说明](docs/跨平台安装与Mac测试.md)。

### 1. 选中要保存的问答

从侧栏快捷入口打开任一支持平台，登录网页版并提问。需要引用时，使用平台提供的联网搜索功能。等回答生成完毕后，在目标回答正文点一下。一个对话有多轮问答时，这一步可以选中对应的那一轮。可以在 **关键词／任务名** 里填入便于日后查找的名称，例如「别墅电梯推荐」。

### 2. 截图，或把信源一起保存

- **只截图**。点击 **截取提问与回答**。插件从该轮提问开始向下截取，保留回答里的表格、引用和已显示的卡片，裁掉左侧历史栏。没有信源链接的问答也能独立保存截图。
- **连同信源一起保存**。将导入范围设为 **当前回答**，勾选 **导入时保存问答截图**，点 **导入信源**。任务会保存原回答、读到的参考链接与标题，以及平台已展示且插件可读取的语义搜索词。截图也归到该任务。
- **Gemini 的来源列表**。导入时优先读取回答下方 **更多选项 → 查看信息来源** 的汇总面板。没有汇总入口时，会读取正文中的引用卡片。
- **补充或更改导入范围**。采集条数少于页面提示时，先展开参考资料列表再试。仍读不到时，可以拖选包含回答与引用链接的网页内容，再选 **手动选中的回答／信源** 并导入。也可展开 **手动补充链接**，每行粘贴一个 URL，补充到当前任务或新建链接任务。**已加载的整个对话** 只读取网页已加载的内容，截图可单独选择某一轮。

截图时保持当前 AI 标签页显示和窗口大小稳定，等待侧栏提示 **已保存问答截图**。如果提示问答内容有变化，等网页稳定后重新截图。若 Chrome 要求截图权限，先阅读侧栏说明，再点击 **启用截图权限并重试**。长图可能自动分成多张。

### 3. 下载图片，导出用于分析的资料

在 **任务记录** 中选择任务，核对侧栏顶部显示的任务名。点 **下载截图** 可一次下载该任务的全部 PNG，也可以在「截取提问与回答」按钮下方预览或下载单次截图。

| 格式 | 适合怎么用 |
| --- | --- |
| **PNG** | 保留当时的原提问和回答画面，便于回看和核对引用。 |
| **Markdown** | 在一份文档里查看原回答、可用的语义搜索词、信源链接和已经取得的正文或文案。适合阅读、整理或交给后续分析工具。 |
| **Excel** | 主表每条信源一行，便于筛选和对比。「搜索回答」页保留原回答、语义搜索词和截图信息。 |

文件下载到 Chrome 下载目录下的 `体系致胜GEO-信源助手` 子目录，按「关键词-任务日期-平台」命名，例如 `别墅电梯推荐-20261111-Doubao-问答截图.png`。将导出的 Markdown 和对应 PNG 放在同一目录，支持本地图片的 Markdown 阅读器即可显示截图。

要改保存位置，在 **设置 → 资料文件夹** 点击 **选择文件夹**，在侧栏中进入想用的目录，再点 **使用当前文件夹**。也可以填写已存在的完整路径并保存。在 **信源与导出 → 导出到** 可切换「指定文件夹」和「Chrome 下载」，也可打开当前选择的位置。指定文件夹内按任务分组；Excel、Markdown 和截图按需分别保存。只想留在本机资料库时，采集完无需导出，可在设置里点 **打开本机资料库**。

### 按需补采原文与素材

导入后可直接导出问答、语义搜索词和信源列表。需要补采文章正文或视频发布文案时，点单条信源的 **提取原文**；也可以勾选多条，展开 **批量补采原文与素材**，点 **提取所选信源**。首次补采可能需要授予信源网站读取权限。完成后点 **查看内容** 核对，再重新导出。

需要下载支持的视频或图集时，单次勾选 **本次同时保存视频／图集**。视频无法取得时，可在原网页完成登录或验证后重试，也可用 **导入视频** 添加本机已有文件。后续内容分析可使用导出的 Markdown 或 Excel。

### 找回或清理本机任务

任务、截图和素材保存在项目的 `data/` 目录。可从 **任务记录** 切换任务、修改任务名，或进入 **管理／清理记录** 将任务移到回收站。回收站内可以恢复任务，也可永久删除以释放空间。已下载到 Chrome 下载目录的文件可在该目录单独管理。

开发、模块边界和打包方法见 [架构说明](docs/ARCHITECTURE.md#中文)。

## English

**Save AI answers and visible citations in one step for generative engine optimization (GEO) research.** TXZS GEO Source Analysis Assistant runs in Chrome's side panel. It keeps the question, answer, and displayed references together in a local task and exports PNG, Markdown, and Excel files. Ask the same question across platforms to compare cited websites and source types, then repeat it over time to see how those citations change.

**Platform support.** V1.4.15 supports Doubao, DeepSeek, Baidu Wenxin (ERNIE), Qianwen (Qwen), Tencent Yuanbao, Kimi, Gemini, and ChatGPT. The extension collects web citations and Q&A screenshots from Gemini and ChatGPT. [ChatGPT web app](https://chatgpt.com/) · [Gemini web app](https://gemini.google.com/app)

**Browser setup.** Sign in to each AI platform's web app in the same Chrome browser and ask your question there. The extension reads visible content from the open answer page. Screenshots and citation exports use the local companion service.

**Free to use.** Screenshots, source collection, and exports require no API key. Accounts used to ask questions are managed by the AI platforms.

| What you want to save | Which button to use |
| --- | --- |
| A screenshot of one question and answer | Select **截取提问与回答** (Capture question and answer). When it is saved, select **下载截图** (Download screenshots) at the top of the panel. |
| The answer, references, and screenshot together | Choose **当前回答** (Current answer), enable **导入时保存问答截图** (Capture Q&A on import), then select **导入信源** (Import sources). Everything is saved under one task. |
| Files to use in later analysis | Select a task under **任务记录** (Task history), then choose **导出 Markdown** (Export Markdown) or **导出 Excel** (Export Excel). |

### First-time setup

Requires **Chrome 120+** and the local companion service. A fresh Windows x64 installation has been tested. macOS scripts are provided for Apple Silicon and Intel, with testing on a Mac pending.

1. Extract the full cross-platform package or use the repository source. The first installation requires internet access to prepare Python 3.12 and its dependencies.
2. On Windows, run **安装依赖.cmd** (Install dependencies), then **启动服务.cmd** (Start service). On macOS, run **安装依赖.command**, then **启动服务.command**.
3. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the project's `extension/` folder.
4. Open the side panel for “体系致胜GEO-信源助手.” Choose **设置** (Settings), paste the pairing code from `data/pairing-token.txt`, and select **保存并连接** (Save and connect). The panel should show **本机已连接** (Connected to the local service).

Run the start script again after restarting the computer. To upgrade, restart the service from the existing folder, reload the extension, refresh the AI page, and reopen the panel. If macOS blocks double-clicking the scripts, run `bash ./安装依赖.command` and `bash ./启动服务.command` from the project folder. See the [Windows and macOS installation guide (Chinese)](docs/跨平台安装与Mac测试.md).

### 1. Select the question and answer

Open a supported platform using a sidebar shortcut, sign in to the web app, and ask your question. Use the platform's web search mode when you need citations. Once the answer has finished generating, click its text to choose that turn in a multi-turn conversation. Use **关键词／任务名** (Keyword or task name) to enter a name you can find later, such as “Home elevator recommendations.”

### 2. Capture the Q&A or save it with its sources

- **Screenshot only.** Select **截取提问与回答** (Capture question and answer). The capture starts at the question and includes the displayed tables, citations, and cards in the answer. It crops out the left history sidebar. You can capture a Q&A even when it has no reference links.
- **Save sources and a screenshot together.** Select **当前回答** (Current answer), enable **导入时保存问答截图** (Capture Q&A on import), and select **导入信源** (Import sources). The task stores the original answer, the reference links and titles the extension could read, and any displayed search queries it could extract. The screenshot goes into the same task.
- **Gemini source list.** Import first reads the source list under **More options → View sources** at the bottom of the answer. The extension reads inline citation cards when the list is unavailable.
- **Add links or change the import scope.** If fewer sources appear than the page indicates, expand the references and try again. You can also select the answer and its links on the page, then choose **手动选中的回答／信源** (Manually selected answer and sources). To paste links directly, expand **手动补充链接** (Add links manually) and enter one URL per line. **已加载的整个对话** (Loaded conversation) imports the content already loaded in the browser. Use the separate screenshot button for a specific turn.

Keep the AI tab visible and the window size fixed until the panel confirms that the capture was saved. If the panel says the Q&A changed, wait for the page to settle and retry. If Chrome requests screenshot access, read the panel's explanation and choose **启用截图权限并重试** (Enable screenshot permission and retry). Long captures may be split into multiple PNGs.

### 3. Download images and export data for analysis

Select a task under **任务记录** (Task history) and check the task name at the top of the panel. Select **下载截图** (Download screenshots) to download all PNGs for that task. You can preview or download each capture directly beneath the Q&A capture button.

| Format | What it is useful for |
| --- | --- |
| **PNG** | Keep a visual record of the original question and answer, including displayed citations. |
| **Markdown** | Read the answer, available search queries, source links, and collected article text or captions in one document. Use it for review or pass it to another analysis tool. |
| **Excel** | Filter and compare one row per source. The separate answer sheet retains the original answer, search queries, and screenshot details. |

Downloads go into the `体系致胜GEO-信源助手` subfolder of Chrome's downloads directory. Filenames include the keyword, task date, and platform, for example `别墅电梯推荐-20261111-Doubao-问答截图.png`. Keep the Markdown and its PNGs together to see the images in a Markdown viewer that supports local files.

To save elsewhere, open **设置 → 资料文件夹** (Settings → Folders), browse to a folder in the side panel, and choose **使用当前文件夹** (Use this folder). You can also enter an existing folder's full path. Use **导出到** (Export to) to switch between Chrome downloads and your chosen folder, and **打开文件夹** (Open folder) to locate the current destination. Custom exports are grouped by task. Excel, Markdown, and PNG copies are optional; collected records remain in the local library.

### Optional source text and media collection

Export Q&A, search queries, and cited sources as soon as they are imported. For article text or video captions, select **提取原文** (Extract source text) on a source card. To collect several at once, select them and choose **提取所选信源** (Extract selected sources) under **批量补采原文与素材** (Collect source text and media). Chrome may ask for permission to read the source sites. Use **查看内容** (View content) to review the results, then export again.

To save supported video or gallery files, select **本次同时保存视频／图集** (Also save video and gallery files for this run). If a video is unavailable, open its original page, complete any required login or verification, and retry. You can also attach a local file with **导入视频** (Import video). Use the exported Markdown or Excel for later analysis.

### Find or clean up local tasks

The project's `data/` directory holds tasks, screenshots, and media. Use **任务记录** (Task history) to switch tasks or rename them. Use **管理／清理记录** (Manage / clean records) to move a task to the trash. You can restore it there or delete it permanently to free space. Manage previously exported files separately in Chrome's downloads directory.

See the [architecture guide](docs/ARCHITECTURE.md#english) for development, component boundaries, and packaging.

## 许可证 / License

本项目采用 [MIT 许可证](LICENSE)，允许使用、修改、分发和商用。分发软件副本或其中实质性部分时，须保留版权声明和许可声明。

This project is released under the [MIT License](LICENSE). Keep the copyright and permission notices in copies or substantial portions of the software.
