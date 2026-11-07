# 上游 v0.9.0 版本追平方案

> 目标：把本 fork 的内容追平到上游 `AmintaCCCP/GithubStarsManager` 的 **v0.9.0**，同时满足 `AGENTS.md` 的"仅 Cloudflare Worker + Vite 前端"约束。
> 状态：方案待批准，未做任何改动（工作区干净，HEAD = `71548e66`，分支 `main`）。

## 0. 一句话结论

**"版本追平"的真实体量是 6.5 倍于 `v0.8.9 → v0.9.0` 的差额，因为本 fork 的内容基线其实停在 `v0.8.0`，而不是版本号写的 0.8.9。**

| 测量 | 数值 |
| --- | --- |
| merge-base(HEAD, upstream/main) | `b551f76f` = **v0.8.0** |
| fork HEAD | `71548e66`（`package.json` 写 0.8.9） |
| 上游 v0.9.0 | `15974e18`（tag object `5d55dda4`）；`upstream/main` = `99890a0c`（仅多 1 个 changelog commit） |
| **真实追平差额** `v0.8.0..v0.9.0` | **626 个非 merge commit**；`src/` **607 文件 +107,272 / −10,634** |
| 其中新增文件 | 394 个（148 个是 `src/locales` + `src/i18n`）；删除 2 个；修改 207 个（**195 个 fork 里已存在**） |
| 表观差额 `v0.8.9..v0.9.0` | 167 commit / 155 文件 / +15,207 −3,333（**只是 1/7**） |
| fork 自身改动 `v0.8.0..HEAD` | 206 文件，`src/` +11,706 −8,314 |
| 直接 `git merge v0.9.0` | **186 个冲突路径**（119 个在 `src/`）→ 不可用 |

校验证据：上游在 `v0.8.0..v0.8.6` 改过的 172 个文件里，fork 有 **62 个仍等于 v0.8.0 的 blob**、96 个被本地改写、**只有 2 个等于 v0.8.6**。也就是说历史上那些 "精选合并上游 0.8.x" 只是稀疏 cherry-pick，从未真正吸收上游内容。

## 1. 目标架构

```
upstream v0.9.0
  − server/            (63 文件)
  − electron/ + electron-builder.yml   (69 + 1)
  − Dockerfile* / docker-compose* / nginx.conf.template / .dockerignore / DOCKER*.md
  − WebDAV（用户明确要求整体移除）
  − telegram / xtweet / mcp / plugins 等桌面端专属功能
  + 本 fork 的 cloudflare-worker/（完整后端，非上游那个 Vectorize 代理）
  + 本 fork 的 30 个仅 fork 存在的前端文件
```

### 必须排除的上游顶层条目（fork 没有、也不能要）

`.dockerignore` `.gitattributes` `.gitleaks.toml` `DOCKER.md` `DOCKER_zh.md` `Dockerfile` `Dockerfile.fullstack` `Dockerfile.fullstack.dockerignore` `docker-compose.fullstack.yml` `docker-compose.yml` `nginx.conf.template` `electron/` `electron-builder.yml` `server/` `registry/` `examples/` `templates/` `assets/` `docs/` `vitest.eval.config.ts`

上游非 `src/` 的 310 个文件里：`electron/` 69、`server/` 63、`assets/` 39、`scripts/` 29、根目录 28、`docs/` 21、`examples/` 17、`.github/` 14、`cloudflare-worker/` 12、`tests/` 8、`registry/` 5。

### fork 仅有的顶层条目（必须保留）

`.agents/`、`AGENTS.md`、`skills-lock.json`

### ⚠️ `cloudflare-worker/` 绝对不可被上游覆盖

| | fork | 上游 v0.9.0 |
| --- | --- | --- |
| `src/index.ts` | 19,851 B —— 完整后端：`/api/health`、`/api/session`、`/api/proxy/github/*`、`/api/proxy/ai`、`/api/repositories`、`/api/releases`、`/api/configs/{ai,ai/bulk,webdav,embedding,vector-search}`、`/api/settings`、`/api/discovery-analyses`、`/api/download/rpc`、`/api/search/*` | 5,839 B —— 只有 `/upsert` `/query` `/delete` `/cleanup` `/status` 的 Vectorize 代理 |
| `src/search.ts` | 25,726 B | 不存在 |
| `migrations/` | `0001_sync_state.sql`、`0002_repository_search.sql` | 不存在（无 D1） |
| `tests/` | `githubProxy.test.ts`、`rpcDownload.test.ts` | 不存在 |
| `wrangler.toml` | 530 B，含 D1 + Assets + `[observability]` | 238 B，只有 `[[vectorize]]` |

**上游的 Worker 是另一个程序，追平只作用于 `src/`。** `cloudflare-worker/`、`wrangler.toml`、D1 migrations 全部保持 fork 现状。

## 2. 后端契约缺口（追平的真正隐藏成本）

上游 0.9.0 前端共调用 **37 个** `${backendUrl}/...` 端点；fork 的 Worker 覆盖 24 个，**缺 12 个**：

| 缺失端点 | 唯一调用方 | 处置 |
| --- | --- | --- |
| `/mcp/config` `/mcp/status` | `backendAdapter.ts` | **删除**（MCP 是桌面能力） |
| `/proxy/webdav` | `backendAdapter.ts`、`webdavService.ts` | **删除**（WebDAV 整体移除） |
| `/telegram/channel/*` | `telegramService.ts` | **删除** |
| `/xtweet/graphql` `/xtweet/profile/*` | `xTweetService.ts` | **删除** |
| `/sync/auth` `/sync/export` `/sync/import` | `backendAdapter.ts` | **改接** fork 的 `/api/session` + `features/settings/backup/backupService.ts` |
| `/releases/mark-all-read` | `backendAdapter.ts` | **改接** 本地 store 标记（fork 无此服务端语义） |
| `/v1/rerank` | `crossEncoderReranker.ts` | **直连**（浏览器直连 rerank 服务；或加 `/api/proxy/rerank`） |
| `/v1beta/models/*` | `vectorSearchService.ts` | **直连** Gemini（支持 CORS） |

净结果：4 组服务删除，3 处改接，2 处转直连，**不需要给 Worker 加新端点**。

## 3. 必须一起搬的强耦合

| 耦合 | 说明 |
| --- | --- |
| **Tailwind 3 → 4** | 上游 `src/index.css` **7,098 行** vs fork 1,149 行；`@import "tailwindcss"; @config "../tailwind.config.js";` + `postcss.config.js` 走 `@tailwindcss/postcss`。上游补丁大量使用 `focus:ring-(--ui-focus-ring/55)` 等 v4 语法，**v4 不先上，UI 补丁无法编译** |
| **react 18 → 19 / zustand 4 → 5** | 上游 hook 形态依赖 zustand 5；react 19 影响 `@testing-library/react` 14 → 16 |
| **i18next 引入** | 上游有 `src/i18n/`（8 文件）+ `src/locales/`（140 文件 / 10 语言）。fork 现在用 21 个文件里的 `t: (zh,en)=>string` 闭包。上游 `useTPair()`/`makeTPair()` 是其等价物 → 21 个文件是转换目标 |
| **`src/services/chat/`** | 11 文件 / 6,192 行（`loop.ts` 1,827、`fastPath.ts` 564、`retrieval.ts` 549、`citations.ts` 477）。fork 的 `repositoryChatService.ts` 1,787 行要变成上游那个 64 行 re-export |
| **主题预设回潮** | fork `5a296430` 删掉了主题配色；上游 0.9.0 有 `src/lib/themePresets.ts` + `constants/themePresets.generated.ts`（9 文件 / 81 KiB，14 个预设）→ 追平会**自动带回**；已定：不带回，只保留浅色/深色/跟随系统 |
| **`react-router-dom` 反向删除** | fork 用 `BrowserRouter` + 5 条路由（`App.tsx` 288–316）；**上游 0.9.0 完全没有 react-router-dom** → 追平会删掉它，得按上游方式重写导航 |
| **`@tanstack/react-virtual` 反向删除** | fork 的虚拟列表只有 `VirtualizedRepositoryRows.tsx` 用；**上游零使用** → `VirtualizedRepositoryRows` 等 fork-only 文件要自己改回非虚拟实现 |

## 4. fork-only 前端文件（30 个，追平后必须重新落地）

```
src/components/SubscriptionRepoCard.test.tsx
src/components/VirtualizedRepositoryRows.tsx (+ .test.tsx)
src/components/virtualizedRepositoryRowsUtils.ts
src/components/settings/BackupPanel.test.tsx
src/components/settings/GeneralPanel.test.tsx
src/features/lifecycle/useAuthSessionGeneration.ts
src/features/lifecycle/useBackendLifecycle.ts (+ .test.tsx)
src/features/releases/hooks/useReleaseTimelineActions.test.tsx
src/features/repositories/application/batchStarImport.ts (+ .test.ts)
src/features/repository-chat/repositories/sessionRepository.ts (+ .test.ts)
src/features/settings/backup/backupService.ts (+ .test.ts)
src/features/settings/hooks/useBackupActions.test.tsx
src/features/settings/translation.ts
src/hooks/useSearchShortcuts.test.tsx
src/services/appStateSnapshot.ts (+ .test.ts)
src/services/autoSync.visibility.test.ts
src/services/discoveryAnalysisStorage.test.ts
src/services/rpcDownloadService.test.ts
src/store/persistence/storage.lifecycle.test.ts
src/store/slices/discoverySlice.test.ts
src/utils/aiConfig.ts (+ .test.ts)
src/utils/discoveryAnalysisMerge.ts (+ .test.ts)
```

另有 `src/constants/viewPaths.ts`（fork 与上游都没有，但 fork 代码引用）—— 属死引用，顺手清掉。

## 5. 分阶段执行

### Stage 0 · 冻结与建支（10 分钟）

```bash
git tag pre-0.9.0-rebase 71548e66
git switch -c rebase/0.9.0 15974e18
```

### Stage 1 · 上游树 + 排除清单（半天）

不要 `git merge`。以 v0.9.0 树为底，先删掉排除清单，再逐类接回 fork 资产：

1. 检出 v0.9.0 的 `src/`、`index.html`、`vite.config.ts`、`vitest.config.ts`、`tsconfig*.json`、`eslint.config.js`、`tailwind.config.js`、`postcss.config.js`、`package.json`
2. **保留** fork 的 `cloudflare-worker/`（整目录）、`AGENTS.md`、`.agents/`、`skills-lock.json`、`scripts/check-boundaries.cjs`、`scripts/check-bundle-size.cjs`、`scripts/update-version.cjs` 及测试
3. 删除 `electron/`、`server/`、`registry/`、`examples/`、`templates/`、`assets/`、`docs/`、`Dockerfile*`、`docker-compose*`、`nginx.conf.template`、`.dockerignore`、`DOCKER*.md`

### Stage 2 · 桌面端剥离（1 天）

上游 0.9.0 有 **20 个非测试 `src` 文件**直接 import electron/node：

```
src/App.tsx
src/components/SettingsPanel.tsx
src/components/XTweetSettingsModal.tsx
src/components/settings/{DiagnosticLogsPanel,McpSettingsPanel}.tsx  (及 Plugin* 面板)
src/features/settings/hooks/{useDesktopActions,useMcpActions,useNetworkActions}.ts
src/services/{electronProxy,diagnosticsBridge,mcpElectronBridge,mcpSnapshot,scrapeSupport,telegramService,xTweetService,pluginMarketplaceService,pluginRegistryService,webdavService}.ts
src/plugins/{pluginClient,pluginSnapshotBridge}.ts
src/test/{setup,fixtureIo}.ts
```

动作：
- 删除 `electronProxy` 及其调用点，`App.tsx` 的 `isElectron` / `loadEncryptedXAuthViaDesktop` 分支改为浏览器分支
- 删除 plugins / MCP / Telegram / XTweet / diagnostics 面板与 hooks（30 文件 / 231 KiB + `src/plugins` 16 文件 / 37 KiB）
- 落实第 2 节的 12 个端点处置
- 同步清理 `vitest.config.ts` 里的 electron 测试项目、`scripts/test:electron:*`、`test:node`

### Stage 3 · WebDAV 整体移除（半天）

追平把上游的 WebDAV 接线（**57 个文件**）一起带进来，必须在 Stage 2/3 全部拆掉：

```
src/services/webdavService.ts (+ .test)
src/services/electronProxy.ts / backendAdapter.ts（/configs/webdav*, /proxy/webdav）
src/services/autoSync.ts (+ .repoHash.test) / fetchCapture.ts
src/components/SettingsPanel.tsx / settings/{BackendPanel,BackupPanel,DataManagementPanel,IncludeKeysToggle,WebDAVPanel,index}.tsx
src/features/settings/hooks/{useBackendSettingsActions,useBackupActions,useWebDAVActions}
src/store/{initialState,schema,types}.ts / normalizers/persistedState.ts / persistence/{options,shards}.ts / slices/configurationSlice.ts
src/types/index.ts / utils/{backendErrors,logEventTypes}.ts
20 个 locale JSON（{app,settings}.json × 10 语言）
```

外加：`scripts/check-boundaries.cjs` 的 `webdavService` 条目保持（防回归）、Worker 侧 `configs/webdav` 读写路径（`cloudflare-worker/src/index.ts:251` 的 collection 正则）移除。

### Stage 4 · 依赖升级（半天）

按上游 `package.json` 对齐，但剔除桌面依赖：

| 包 | fork | 上游 0.9.0 |
| --- | --- | --- |
| react / react-dom | ^18.3.1 | ^19.3.1 |
| zustand | ^4.5.0 | ^5.0.16 |
| tailwindcss | ^3.4.1 | ^4.3.3（+ `@tailwindcss/postcss`） |
| vite | — | ^8.3.5 |
| vitest | — | ^5.0.5 |
| eslint | — | ^10.14.0 |
| i18next | 无 | ^26.7.1 |
| @testing-library/react | ^14.2.1 | ^16.3.3 |
| @testing-library/jest-dom | ^6.4.2 | ^7.0.1 |

注意上游把所有运行时依赖整体挪到 `devDependencies`（Vite 打包，`dependencies` 只剩 `undici`）。Worker 侧 `cloudflare-worker/package.json` **只升 `wrangler` / `@cloudflare/workers-types`，不要跟 `typescript ^7`**（fork 的 Worker 类型依赖 `worker-configuration.d.ts`）。

### Stage 5 · 功能回填（2–3 天，最大头）

按依赖顺序：

1. **`src/constants/viewPaths.ts` 死引用清理** + 导航改写（去掉 `react-router-dom`）
2. **`139ba085`：`apiUrlBuilder.ts` 的 `/v1` → `/chat/completions` 自动补全**（用户已确认"要"，整段照搬；当前 bug：填 `https://host/v1` 会直接打到 `/v1`）
3. **30 个 fork-only 文件逐个重新落地**（每个都要针对上游新 API 改：zustand 5 selector、i18next、新 store 结构）
4. **fork 本地改写重新打补丁**（96 个被本地改写过、且上游也改过的文件）—— 逐个三向对比，保留 fork 语义
5. **`src/index.css` 复核**：上游 7,098 行的 v4 样式表 vs fork 的本地定制（主题收窄、focus-ring 变量），需要人工过一遍

### Stage 6 · 验证门（必须全绿再谈部署）

```bash
npm ci
npm run lint
npm run typecheck
npm run check:boundaries
npm run test:run
npm run test:wrangler
npm run build          # 含 bundle-size 门禁
cd cloudflare-worker && npx tsc -p tsconfig.json --noEmit
```

然后 preview 部署验证，最后才 `npx wrangler deploy --config=wrangler.toml --keep-vars`。

## 6. 工作量估计

| Stage | 内容 | 估时 |
| --- | --- | --- |
| 0 | 冻结建支 | 10 分钟 |
| 1 | 上游树 + 排除 | 半天 |
| 2 | 桌面剥离 | 1 天 |
| 3 | WebDAV 移除 | 半天 |
| 4 | 依赖升级 | 半天 |
| 5 | 功能回填 | **2–3 天** |
| 6 | 验证修复 | 1–2 天 |
| | **合计** | **5–7 个工作日** |

风险最高的三处：`src/index.css`（1,149 → 7,098 行）、`src/services/chat/` 6,192 行整体替换、30 个 fork-only 文件在新架构下的重新接线。

## 7. 待决事项

1. **`react-router-dom` 去留**（已定：保留路由）—— 上游没有它。是接受上游方式重写导航（省维护），还是把 fork 的路由模式重新加回 0.9.0 之上（保留 `/repositories` 等顶层路径）？
2. **主题预设是否随追平带回**（已定：不带回）—— fork 当初主动删掉了 14 个预设，追平引入后已再次移除，主题只保留 `themeMode`/`systemTheme`。
3. **30 个 fork-only 功能全部保留，还是有取舍** —— 尤其是虚拟列表（上游无 `@tanstack/react-virtual`）和 `appStateSnapshot`/`discoveryAnalysisMerge`。
4. **是否分步发布** —— 建议 `rebase/0.9.0` 上按 Stage 打 checkpoint（阶段 1/2/3 各一个 commit），先在 preview 验证 Worker 契约再合并 `main`，避免一次性大爆炸。
