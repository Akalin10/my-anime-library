# 我的动漫库

单用户、本地优先的私人动漫收藏网站。项目已具备本地数据库、Bangumi / AniList / TMDB 三源并行搜索、保守去重、单源失败隔离、批量导入与默认海报落盘后端闭环、读取真实本地数据的首页海报墙、搜索导入界面，以及支持查看资料、切换观看状态、安全删除本地收藏和管理自定义封面的详情模态窗口；侧栏设置页可管理非敏感的本机运行配置。

## 环境要求

- Node.js 20.9 或更高版本
- npm 10 或兼容版本
- Windows、macOS 或 Linux

## Windows 一键启动

安装好 Node.js 后，直接双击项目根目录中的 `一键启动.cmd`；也可在 PowerShell 中执行 `.\一键启动.cmd`。脚本会自动检查 Node.js、npm 和 PowerShell，按需创建本地环境文件、安装或更新依赖、执行数据库迁移、构建正式用户版本、在 3000–3010 中选择可用端口，随后启动应用并在服务就绪后打开浏览器。正式用户版本不会显示 Next.js 的开发调试浮窗；首次启动或代码更新后，构建需要稍等片刻。

首次自动创建的 `.env.local` 会立即启用无需凭据的 AniList。Bangumi 和 TMDB 凭据不是启动必需项，需要对应数据源时再填入 `.env.local`；脚本不会覆盖已有配置。启动窗口需要保持开启，按 `Ctrl+C` 可停止应用。

## 从零开始本地运行

1. 安装依赖：`npm install`
2. 复制 `.env.example` 为 `.env.local`。Windows PowerShell 可运行 `Copy-Item .env.example .env.local`；macOS / Linux 可运行 `cp .env.example .env.local`。
3. 编辑 `.env.local`：至少把示例 `BANGUMI_USER_AGENT` 替换为符合 Bangumi 规范的实际开发者标识；AniList 默认公开地址可以直接使用。需要启用 TMDB 时再填写 `TMDB_API_KEY`。不得提交真实密钥。
4. 初始化数据库：`npm run db:migrate`
5. 启动开发服务器：`npm run dev`
6. 浏览器访问 `http://localhost:3000`

生产方式运行时，先执行 `npm run build`，成功后执行 `npm start`，再访问 `http://localhost:3000`。SQLite 数据库文件和海报目录必须位于持久磁盘。

首页提供全部/在看/已看完状态筛选、最近添加/标题/上映年份排序、本地搜索、真实计数、2:3 海报墙和空库状态。“添加动漫”会打开全屏搜索导入窗口，支持 500ms 防抖搜索、真实结果分组、多选、统一或逐项设置在看/已看完状态、批量导入，以及成功/失败逐项反馈；导入成功后首页海报和侧栏计数会自动刷新。点击任一收藏卡片会打开详情模态窗口，可查看元数据、简介、系列和按明确关系分组的相关作品，并即时保存观看状态；关联作品已导入时可在当前窗口切换，未导入时会先要求确认。“更换封面”支持在保存前预览 JPG/JPEG/PNG/WebP 本地图片、从受控网址下载图片到本地，以及恢复数据源默认封面；自定义封面保存后首页和详情会立即同步。删除收藏同样必须先确认，只会移除该条本地记录、关联记录及确认归属于它且未被其他条目使用的本地自定义封面，不会删除默认封面或操作外部数据源。

当前 Windows 执行环境不能加载 Next.js 原生 SWC 二进制，因此 `dev`、`build` 与 `start` 命令已使用同版本官方 WASM 编译包，开发与构建同时使用 Webpack 后端，命令无需额外手工配置。WASM 的 Next 内置类型检查工作进程存在兼容问题，所以 `build` 会先强制运行 `next typegen` 和独立 TypeScript 检查；只有检查通过后才继续生产构建。

## 可用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 创建生产构建 |
| `npm start` | 启动生产服务器 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint 代码检查 |
| `npm run db:generate` | 根据锁定的 Drizzle schema 生成迁移 |
| `npm run db:migrate` | 将尚未执行的迁移应用到本地 SQLite 数据库 |
| `npm run db:check` | 检查迁移文件一致性 |
| `npm test` | 运行一次 Vitest 测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:e2e` | 先生产构建，再使用系统 Microsoft Edge 和隔离数据库运行 10 条端到端测试 |

## 配置

`.env.example` 声明以下变量：

- `BANGUMI_API_TOKEN`
- `BANGUMI_USER_AGENT`
- `ANILIST_API_URL`
- `TMDB_API_KEY`
- `POSTER_STORAGE_PATH`
- `DATABASE_URL`

API 密钥只能由服务端环境变量提供。SQLite 和本地海报目录要求持久磁盘，不适合默认部署到无持久磁盘的 Serverless 环境。

`DATABASE_URL` 指向 SQLite 文件，默认 `./data/anime.db`；`POSTER_STORAGE_PATH` 指向海报根目录，默认 `./data/posters`。这两个目录由本机进程读写。`ANILIST_API_URL` 默认使用 AniList 公开 GraphQL 地址。没有配置或没有启用的来源会被隔离为该来源不可用，不会由假数据代替。

Bangumi 请求使用当前 v0 API。`BANGUMI_API_TOKEN` 可留空；如配置，只能放在服务端环境中。`BANGUMI_USER_AGENT` 必填，并须按 Bangumi 官方规范包含开发者 ID 与应用名，例如 `your-bangumi-id/my-anime-library/0.1.0`。AniList 使用 `ANILIST_API_URL` 指向的公开 GraphQL 接口，动漫搜索、详情和关系查询不需要令牌。TMDB 使用官方 v3 电影搜索和详情接口，`TMDB_API_KEY` 可填写 32 位 v3 API Key 或 API Read Access Token，且只在服务端发送。三个适配器都对搜索缓存 5 分钟，对详情缓存 30 分钟，最多保存 100 个请求结果；超时、限流和数据源不可用会返回可区分的错误类型。

## 数据库初始化

默认数据库路径为 `./data/anime.db`。首次安装依赖并准备好环境变量后，运行：

```text
npm run db:migrate
```

该命令按顺序执行 `drizzle/` 中尚未应用的迁移。数据库只包含需求规定的 Anime、Franchise、AnimeRelation、SourceReference、AppSetting 五张业务表；Drizzle 会另外维护内部迁移日志表。

## 验证

- `npm test`：运行单元与集成测试。
- `npm run typecheck`：生成 Next 路由类型并执行严格 TypeScript 检查。
- `npm run lint`：执行 ESLint。
- `npm run test:e2e`：生产构建后，在系统 Microsoft Edge 中启动一次性 SQLite、海报目录和本地 AniList 测试服务，执行 10 条关键流程；结束后自动删除隔离资料。该命令不写入 `data/anime.db`，也不需要外部 API 凭据。

## 本地读取 API

- `GET /api/anime`：读取本地动漫列表及真实状态计数。
  - `status`：`ALL`（默认）、`WATCHING`、`COMPLETED`
  - `sort`：`RECENT`（默认）、`TITLE`、`YEAR`
  - `query`：可选，本地匹配中文标题、原始标题、英文标题和别名，最长 200 个字符
- `GET /api/anime/:id`：按正整数 ID 读取本地动漫详情、系列及相关作品；不存在时返回 404。外部数据源暂时不可用时仍返回已有本地资料。
- `PATCH /api/anime/:id/status`：把本地条目的观看状态即时更新为 `WATCHING` 或 `COMPLETED`；不存在时返回 404。
- `DELETE /api/anime/:id`：删除指定本地收藏及其本地关系/来源引用，并安全清理未被其他条目使用的本地自定义封面；路径不安全时拒绝整个请求。
- `POST /api/anime/:id/poster/upload`：以 `multipart/form-data` 的 `file` 字段上传 JPG/JPEG/PNG/WebP 自定义封面，文件上限 10 MiB；服务端验证声明类型、文件签名和总请求大小，并生成文件名后保存。
- `POST /api/anime/:id/poster/url`：请求体为 `{ "url": "https://…" }`；服务端拒绝本机、内网、保留地址和不安全重定向，限制端口、超时、响应类型及下载大小，验证图片内容后写入本地自定义封面目录。
- `DELETE /api/anime/:id/poster/custom`：移除当前本地自定义封面并恢复数据源默认封面；不删除默认封面文件或默认远程地址。

封面显示优先级固定为：自定义本地封面 → 已落盘的数据源默认封面 → 已保存的远程默认地址 → 中性占位图。上传文件的原始文件名不会用于磁盘路径；自定义文件只存放在 `POSTER_STORAGE_PATH/custom/`。

所有接口统一返回 `{ data, error }`。成功时 `error` 为 `null`；失败时 `data` 为 `null`，并返回可读错误代码和中文消息。

## 设置与数据源状态 API

- `GET /api/settings`：读取已启用数据源、默认来源优先级、当前海报目录和只读数据库位置。
- `PATCH /api/settings`：持久化已启用数据源、包含全部三来源且不重复的优先级，以及可写的海报本地目录。海报目录变化会立即用于后续导入、上传、删除和图片读取。
- `DELETE /api/settings/cache`：清理三个数据源适配器的内存搜索缓存；相同关键词的下一次搜索会重新请求已启用来源。
- `GET /api/sources`：返回 Bangumi、AniList、TMDB 的启用状态、当前配置可用状态和环境变量名称/是否已配置；不会返回任何环境变量值或 API 密钥。

设置页不会接收或保存密钥明文。`BANGUMI_API_TOKEN` 与 `TMDB_API_KEY` 等配置仍只能写入服务端环境文件；数据库 `AppSetting` 只保存 `enabled_sources`、`source_priority` 和 `poster_storage_path` 三项非敏感值。

## 外部搜索与导入 API

- `GET /api/search?query=动漫名称`：并行调用已启用的 Bangumi、AniList 与 TMDB，返回标准化、保守去重后的条目以及逐数据源状态；一个来源失败时仍返回其他来源结果和可重试的来源错误。每项包含全部来源引用及基于本地数据库的 `isImported`。
- `POST /api/anime/import`：导入一部或多部 Bangumi / AniList 动漫或 TMDB 电影条目。合并结果会把全部来源引用写入 `SourceReference`。请求体：

```json
{
  "status": "WATCHING",
  "items": [
    {
      "source": "bangumi",
      "sourceId": "55770",
      "sourceReferences": [
        { "source": "bangumi", "sourceId": "55770" },
        { "source": "anilist", "sourceId": "16498" },
        { "source": "tmdb", "sourceId": "129" }
      ],
      "status": "COMPLETED"
    }
  ]
}
```

顶层 `status` 可省略，默认 `WATCHING`；每项状态可覆盖顶层状态。一次最多处理 100 项。每项独立获取完整资料、候选海报和明确关系，查重后把默认海报写入 `POSTER_STORAGE_PATH/default/`，再以事务保存 Anime、SourceReference、Franchise 及当前可关联到本地条目的 AnimeRelation。批量中单项失败不会撤销其他成功项，响应会返回真实成功数、失败数与逐项原因。

去重只在外部 ID 明确一致，或非中文标题、年份、类型和集数等证据共同吻合时合并；电影条目的集数为空或 1 可视为相容证据，但仍必须同时满足标题、年份和类型。不会仅凭中文标题相同合并，证据不足的结果保持独立。合并时主数据优先级为 Bangumi → AniList → TMDB；关系分类只使用 Bangumi / AniList 明确返回的关系类型，TMDB 不参与动画系列关系判断。无法精确映射时保存为 `OTHER`，不会根据标题中的季度、数字、OVA 或 Part 等字样推断。

## 项目结构

目录职责和锁定的技术决策见 `ARCHITECTURE.md`。功能允许范围与禁止范围见 `FEATURE-BOUNDARIES.md`，原始事实来源见 `REQUIREMENTS.md`。
