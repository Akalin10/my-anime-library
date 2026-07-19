# 「我的动漫库」技术架构

本文件记录第 1 轮确认的技术架构。自第 1 轮完成后架构进入锁定状态；除非发现明确缺陷或需求变化，否则后续轮次不得重新设计。任何调整必须先在 `PROGRESS.md` 说明原因、影响范围和迁移方式，经人工确认后作为单独轮次执行。

## 1. 架构目标

- 单用户、本地优先，优先保证个人电脑或带持久磁盘的私人服务器稳定运行。
- 以前后端同仓的全栈应用交付，减少部署单元和跨服务依赖。
- 首页只读取本地数据库；外部数据源仅在搜索、导入和后续明确的资料刷新流程中访问。
- 数据源、数据库、文件存储和 UI 分层，避免把业务逻辑集中在页面组件中。
- 功能边界以 `FEATURE-BOUNDARIES.md` 为准，不使用管理后台、Dashboard 或动漫网站模板。

## 2. 技术选型

| 范围 | 选型 | 决策理由 |
|---|---|---|
| 运行时 | Node.js 20.9 或更高版本 | 满足 Next.js 当前最低要求；开发环境使用 Node.js 22 |
| 全栈框架 | Next.js App Router | React 前后端同仓，Route Handlers 可承载本项目服务端接口 |
| 语言 | TypeScript 严格模式 | 统一前端、服务端、数据源和测试类型边界 |
| 数据库 | SQLite | 单用户、本地优先，数据文件便于备份和迁移 |
| ORM | Drizzle ORM + Drizzle Kit | 显式模式与迁移、较薄抽象，适合 SQLite 和可审计的数据结构 |
| SQLite 驱动 | better-sqlite3 | 直接访问本地 SQLite 文件，不引入远程数据库服务 |
| 样式 | CSS Modules + 少量全局基础样式 | 依赖少、作用域清楚，不受组件库或模板默认视觉支配 |
| 输入校验 | Zod | 在接口和环境配置边界复用 TypeScript 友好的运行时校验 |
| 服务端状态 | TanStack Query | 管理搜索、导入、详情等异步请求状态；不承担本地数据库职责 |
| 测试 | Vitest | 快速运行 TypeScript 单元与服务层测试 |
| 静态检查 | TypeScript + ESLint | 分别覆盖类型正确性与代码质量 |

依赖的精确版本由 `package-lock.json` 锁定。框架或依赖升级必须单独成轮并完成兼容性验证。

当前 Windows 执行环境无法加载 Next.js 随包提供的原生 SWC 二进制，因此开发、构建与生产启动命令固定使用同版本的官方 `@next/swc-wasm-nodejs` 包，开发和构建同时使用 Webpack 后端。该回退只影响编译工具性能，不改变应用运行架构或业务边界；后续若移除，应作为工具链调整单独验证。

新增 API 路由后，Next.js 16.2.10 的 WASM 回退会在内置 TypeScript 工作进程中发生序列化崩溃。为保持生产构建可验证，`npm run typecheck` 先执行 Next 类型生成和独立 `tsc --noEmit`，`npm run build` 必须先通过该检查，随后 Next 构建跳过重复的内置类型检查。此配置不得用于绕过真实类型错误；恢复原生 SWC 后应移除回退并重新验证。

## 3. 前端架构

- `src/app/`：App Router 路由、根布局、页面入口和后续 API Route Handlers。
- `src/components/layout/`：应用外壳、侧栏和顶部区域。
- `src/components/anime/`：海报墙、卡片、元数据和状态组件。
- `src/components/search/`：外部搜索、结果分组和导入选择组件。
- `src/components/modal/`：详情、确认和封面管理等模态窗口基础结构。
- `src/components/settings/`：需求白名单内的设置表单。
- `src/components/common/`：无业务含义、低样式的通用基础组件。
- `src/styles/`：设计令牌、共享样式和响应式规则；组件局部样式使用同目录 CSS Modules。
- `src/types/`：跨层共享的领域类型和接口响应类型。

页面组件只负责组合和交互入口。数据读取与写入通过服务端接口完成；请求状态由 TanStack Query 管理；展示组件不直接访问数据库、文件系统或第三方 API。

第 1 轮的首页入口故意返回空内容，仅用于验证框架可启动；真实页面结构从对应功能轮开始实现。

## 4. 后端架构

- Next.js Route Handlers 作为 HTTP 接口边界，负责解析请求、Zod 校验、调用服务并统一响应。
- `src/server/services/`：编排导入、状态修改、删除和封面处理等用例。
- `src/server/repositories/`：封装本地数据库读写，避免服务层依赖 ORM 查询细节。
- `src/lib/db/`：数据库连接、模式定义和迁移入口。
- `src/lib/validation/`：环境变量、接口参数、上传和远程 URL 的校验模式。
- `src/lib/images/`：封面路径选择、下载、校验和本地文件操作。

接口层不直接实现跨模块业务流程；Repository 不调用外部数据源；数据源适配器不写数据库。敏感密钥仅在服务端读取，不进入浏览器代码或日志。

## 5. 数据库结构概述

数据库使用单个本地 SQLite 文件。实体边界依据 `REQUIREMENTS.md` 第十九章：

- Anime：本地动漫主记录及两种状态。
- Franchise：动漫系列。
- AnimeRelation：本地动漫之间的明确关系。
- SourceReference：同一动漫对应的外部数据源引用。
- AppSetting：非敏感的本地设置。

第 1 轮不创建数据库表、字段、索引或迁移。精确模式、唯一约束和迁移由第 2 轮单独设计并验证。

## 6. 数据源适配器结构

- `src/lib/sources/bangumi/`、`anilist/`、`tmdb/`：各来源的客户端、字段映射与错误转换，按计划逐个接入。
- `src/lib/sources/normalize/`：统一数据结构、保守去重和关系分类。
- 每个适配器最终实现统一能力：搜索、详情、关系和候选海报。
- 适配器只返回标准化数据，不直接写数据库或本地封面目录。
- 数据源按 Bangumi、AniList、TMDB 的轮次顺序接入；前一来源验证通过后才开始下一来源。
- 无法确认同一作品或关系类型时不强制合并、也不猜测分类。

## 7. 海报本地存储

- 默认根目录由 `POSTER_STORAGE_PATH` 指定，开发默认值为 `./data/posters`。
- 数据源封面保存到 `data/posters/default/`，用户封面保存到 `data/posters/custom/`。
- 数据库只记录受控的相对路径与必要的来源 URL，不把不受控制的远程 URL 作为唯一封面来源。
- 显示优先级固定为：用户自定义本地封面、已下载默认本地封面、数据源远程封面、中性占位图。
- 文件命名、类型/大小校验、目录穿越防护、SSRF 防护和清理策略在第 12 轮实现；此前不提前加入上传功能。

SQLite 与本地封面要求持久磁盘，不适合默认部署到无持久磁盘的 Serverless 环境。

## 8. 目录结构

```text
src/
  app/
  components/
    layout/
    anime/
    search/
    modal/
    settings/
    common/
  lib/
    db/
    sources/
      bangumi/
      anilist/
      tmdb/
      normalize/
    images/
    validation/
  server/
    services/
    repositories/
  types/
  styles/
data/
  posters/
    default/
    custom/
public/
  placeholders/
tests/
```

## 9. 配置与运行

- `.env.example` 只声明需求允许的变量，不包含真实密钥。
- `DATABASE_URL` 指向本地 SQLite 文件；`POSTER_STORAGE_PATH` 指向本地海报根目录。
- `npm run dev` 启动开发服务器。
- `npm run typecheck`、`npm run lint`、`npm test` 分别执行类型检查、代码检查和测试。
- `npm run build` 生成生产构建，`npm start` 启动生产服务器。

## 10. 架构边界

- 不引入独立后端服务、云数据库、云存储、认证系统或管理后台。
- 不在组件中直接执行 ORM 查询、文件系统操作或外部 API 请求。
- 不在数据库中存储 API 密钥；密钥只从服务端环境变量读取。
- 不在未到对应轮次时提前创建数据库表、外部请求、业务页面或业务组件。
- 不加入 `FEATURE-BOUNDARIES.md` 白名单之外的功能。
