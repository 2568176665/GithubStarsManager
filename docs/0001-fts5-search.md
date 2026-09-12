# ADR 0002 — 用 SQLite FTS5 重做仓库搜索

Status: Proposed（讨论稿，未实施）
Date: 2026-06-XX（待定稿时补日期）
Supersedes: none
Applies to: `server/src/routes/repositories.ts`, `server/src/db/schema.ts`, `server/src/mcp/provider.ts`, `src/utils/repoSearch.ts`, `src/components/SearchBar.tsx`, `src/features/repositories/hooks/useSearchActions.ts`, `src/services/backendAdapter.ts`

> 本文是「搜索改为只使用 SQLite FTS5」的可行性分析记录，方案尚未实施。

## 背景（Context）

目标：将搜索功能改为只依赖 SQLite 的 FTS5 扩展。分析现有搜索链路后确认其可行性与边界。

### 现状：搜索实际发生在三个地方

| 路径 | 位置 | 现状 |
|---|---|---|
| 主搜索（用户输入框） | 浏览器内存 | `performBasicTextSearch`（`src/utils/repoSearch.ts`）纯 JS `includes()`；外加 AI 语义链（向量检索 / HyDE / LLM 精选 / rerank）。数据源全部是内存里的 `repositories` 数组 |
| 后端 API `GET /api/repositories?search=` | `server/src/routes/repositories.ts` | 5 个字段 `LIKE '%kw%'`（name / full_name / description / ai_summary / ai_tags）。但前端有后端时也是全量拉回（`limit=10000`）后在内存里搜，该参数实际未被前端使用 |
| MCP 工具（`gsm_vector_search` 等） | `server/src/mcp/provider.ts` | `SELECT * FROM repositories` 全表拉出后 JS 内存过滤（`src/mcp/repoSearch.ts`） |

前端仓库数据存 IndexedDB，浏览器端没有 SQLite；后端为 better-sqlite3（Express + SQLite）。

## 可行性评估

- **server 端：完全可行。** better-sqlite3 默认编译启用 `SQLITE_ENABLE_FTS5`（见其 `docs/compilation.md`），无需自定义编译选项。FTS5 表可用 external content + 触发器挂在现有 `repositories` 表上，`PUT /api/repositories` 的 bulk upsert 经触发器自动维护索引，无需额外同步代码。
- **浏览器端：不现实。** 前端没有 SQLite，要上 FTS5 需引入 sql.js / wa-sqlite 等 WASM SQLite（数 MB 依赖 + 自建索引重建），与项目 worker 优先、轻量的方向冲突。**若目标是"搜索只走 FTS5"，主搜索必须改为调用后端 API。**
- **Cloudflare D1：支持 FTS5 模块**（见 D1 文档 SQL statements 页），但本项目 Worker 只存 `sync_state`，与本需求无关。

## 两个必须先解决的坑

### 1. 中文分词（最大风险）

`ai_summary` / `custom_description` 大量中文。FTS5 默认 unicode61 tokenizer 将连续中文切成一整个 token，搜「编辑器」匹配不到「markdown 编辑器神器」。候选方案：

- **trigram tokenizer（推荐）**：SQLite ≥3.34，支持子串匹配，语义最接近现有 `includes()`，CJK 友好；缺点是查询必须 ≥3 字符，短查询（如 "go"、"js"、两个汉字）需回退 `LIKE`。
- 伪分词：写入时在汉字间插空格、查询时 phrase 化。可用但属持久化 hack。
- unicode61 + 前缀 `*`：中文场景基本无效，排除。

### 2. 语义变化

现行为是 AND 子串匹配；FTS5 默认 BM25 相关性排序 + token 匹配，结果集与顺序都会变化，`src/utils/repoSearch.test.ts` 既有断言需按新语义重写。另 AI 搜索链（LLM 精选、向量 rerank）输入是仓库数组——FTS5 可承担「召回 top-N 再喂给 LLM」的角色，比现在全量数组灌词法兜底更合理，但该链路需一并设计。

## 决策候选（Decision options）

- **方案 A — 最小改动（推荐起步）**：只改 server。建 FTS5(trigram) external-content 表 + 触发器；`GET /api/repositories?search=` 与 MCP `searchRepos` 查询走 FTS5（短查询回退 `LIKE`）。前端不动。收益：MCP 工具不再全表扫描、API 获得相关度排序。
- **方案 B — 完整版**：主搜索也改为后端 API 调用（前端删除内存搜索路径），真正实现「只用 FTS5」。改动面：`SearchBar.tsx` / `useSearchActions.ts` / `backendAdapter.ts` 及 AI 搜索链。

## 备注

以本仓库量级（数千~数万 star），前端内存 `includes()` 本就毫秒级完成，FTS5 的主要收益是架构归一与 MCP/API 端效率，而非用户可感知的性能提升，故方案 A 性价比最高。

## 待定问题（Open questions）

1. 采用方案 A 还是 B？
2. 短查询（<3 字符）回退 `LIKE`，还是接受 FTS5 trigram 的 ≥3 字符限制？
