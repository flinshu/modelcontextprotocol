# MCP 文档中文译本（非官方）

本目录是社区维护的非官方中文译本工具与译文，不代表 Model Context Protocol 官方。
上游：<https://github.com/modelcontextprotocol/modelcontextprotocol>

## 许可

- 规范（`docs/specification/**`）的译文按 Apache-2.0 发布；文档（不含规范）的译文按 CC-BY-4.0 发布；
  上游仍为 MIT 的部分按 MIT。详见仓库根目录 `LICENSE`。
- 每个生成的中文页面开头都注明了"非官方译文"、英文原文链接、上游提交和许可，作为修改说明。

## 目录

- `pages.json`：要翻译的页面清单和中文导航分组。字符串是要翻译的英文页面；
  `{ "original": "路径" }` 是 `docs/zh/` 下手写的原创页（如解读页），只进导航，`build` 不会覆盖它。
  **中文标签页的导航以这个文件为准，不要直接改 `docs.json`，否则下次 `build` 会被覆盖。**
- `segments/<页面路径>.txt`：英文段落 → 中文译文 的对照文件（只改 `@@ zh` 下面的内容）
- `tool.mjs`：抽取 / 生成脚本（只依赖 Node 内置模块）
- 生成结果：`docs/zh/<页面路径>.mdx`，并在 `docs/docs.json` 里加一个「中文（非官方）」标签页

## 工作流程

```bash
node i18n/zh/tool.mjs extract   # 按英文原文刷新对照文件
# 编辑 segments/**/*.txt，填写空着的译文
node i18n/zh/tool.mjs build     # 生成中文页面 + 更新 docs.json
cd docs && npx mint@4.3.5 dev   # 本地预览
```

## 同步上游

```bash
git fetch upstream && git merge upstream/main
# docs.json 冲突时：先采用上游版本，再运行 build，它会重新加回中文标签页
node i18n/zh/tool.mjs extract   # 改动过的段落会变成待译，旧译文移到文件末尾标记 stale，供参考
node i18n/zh/tool.mjs status
```

段落 id 取自英文段落（空白折叠后）的 sha1，所以只有真正改过的段落需要重译。

## 约定

- 英文源文件有硬换行，按段落（空行分隔）整段翻译，不逐行翻译。
- 代码块、JSON 示例、Mermaid 图保持英文原样。
- 标题译成中文后，生成脚本会补一个英文锚点（`<a id="scope" />`），保证 `#scope` 这类链接可用。
- 链接指向已翻译的页面时自动改成 `/zh/...`，否则保留英文页链接。

## 术语表

| 英文 | 中文 |
| --- | --- |
| Host | 宿主 |
| Client / Server | 客户端 / 服务器 |
| Tools / Resources | 工具 / 资源 |
| Prompts（原语） | 提示词模板 |
| Sampling | 采样 |
| Elicitation | 征询 |
| Roots | 根目录 |
| Tasks（扩展） | 任务 |
| Primitives | 原语 |
| Capabilities | 能力 |
| Transport | 传输 |
| Data layer / Transport layer | 数据层 / 传输层 |
| Discovery | 发现 |
| Notifications | 通知 |
| Subscription | 订阅 |
| Multi Round-Trip Requests (MRTR) | 多轮往返请求 |
| Stateless | 无状态 |
| Extensions | 扩展 |
| Streamable HTTP、STDIO、JSON-RPC、SDK、LLM | 保留英文 |
| MUST / SHOULD / MAY（规范关键词） | 保留英文 |
