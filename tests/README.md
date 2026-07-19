# 测试覆盖矩阵

本目录的测试以 `npm test` 运行单元与集成测试，以 `npm run test:e2e` 构建应用并在系统 Edge 中运行隔离的端到端测试。E2E 使用 `.tmp/round16-e2e` 下的一次性 SQLite 数据库、海报目录和本地 AniList 假服务，结束后自动清理，不读写正式资料库。

## 第 29 章：单元与集成测试

| 要求 | 对应测试 |
| --- | --- |
| 状态仅限“在看 / 已看完” | `toolchain.test.ts`、`anime-detail-status.test.ts` |
| 重复导入 | `anime-import-api.test.ts` |
| 外部数据标准化 | `bangumi-adapter.test.ts`、`anilist-adapter.test.ts`、`tmdb-adapter.test.ts` |
| 多来源去重 | `multi-source-search.test.ts` |
| 关联分组 | `anime-detail-ui.test.ts`、三套来源适配器测试 |
| 海报优先级 | `anime-poster-management.test.ts` |
| 上传验证 | `anime-poster-management.test.ts` |
| 图片网址验证 | `anime-poster-management.test.ts` |
| API 错误 | `anime-read-api.test.ts`、`anime-import-api.test.ts`、三套来源适配器测试 |
| 状态修改 | `anime-detail-status.test.ts` |
| 删除 | `anime-delete.test.ts` |
| 本地搜索 | `anime-read-api.test.ts`、`home-library-ui.test.ts` |
| 状态筛选 | `anime-read-api.test.ts`、`home-library-ui.test.ts` |
| 排序 | `anime-read-api.test.ts`、`home-library-ui.test.ts` |

## 第 29 章：端到端测试

以下 10 条流程逐条对应 `e2e/specs/anime-library.spec.ts` 中同序号测试：

1. 空数据库首页
2. 搜索并导入
3. 点击海报打开详情弹窗
4. 关闭详情弹窗并恢复焦点
5. 修改观看状态
6. 上传并替换封面
7. 恢复默认封面
8. 删除动漫
9. 外部数据源失败时显示可重试提示
10. 重复导入被阻止
