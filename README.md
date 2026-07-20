# 我的动漫库

本地优先的私人动漫收藏工具，支持多数据源搜索、批量导入和海报管理。

## 功能

- **多源搜索** — 并行搜索 Bangumi、AniList、TMDB，智能去重合并
- **本地收藏** — SQLite 数据库，数据完全属于你自己
- **海报墙** — 2:3 比例海报网格，支持全部/在看/已看完筛选
- **批量导入** — 搜索后勾选多部作品一键导入，支持逐项状态设置
- **自定义封面** — 上传本地图片或从 URL 下载替换封面
- **深色模式** — 浅色/深色/跟随系统三种主题
- **数据源配置** — 可自定义第三方 API 数据源

## 快速开始

**Windows 用户：** 安装 Node.js 后双击 `一键启动.cmd`，脚本会自动完成安装、构建和启动。

**其他系统：**

```bash
# 1. 安装依赖
npm install

# 2. 复制环境配置（按需填写 API 密钥）
cp .env.example .env.local

# 3. 初始化数据库
npm run db:migrate

# 4. 启动
npm run dev
```

浏览器访问 `http://localhost:3000`。

> AniList 无需密钥即可使用。Bangumi 需要填写 `BANGUMI_USER_AGENT`，TMDB 需要 `TMDB_API_KEY`。不填也不影响启动，只是对应的数据源暂时不可用。

## 命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |
| `npm start` | 启动生产服务器 |
| `npm test` | 运行测试 |
| `npm run db:migrate` | 数据库迁移 |

## 技术栈

Next.js · SQLite (Drizzle ORM) · TanStack Query · Zod · CSS Modules

## 许可证

MIT
