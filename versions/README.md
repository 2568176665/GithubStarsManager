# 版本管理说明

项目版本记录保存在 `version-info.xml`，当前根版本保持 `0.8.0`。本仓库只发布前端构建产物和 Cloudflare Worker，不生成桌面安装包或容器镜像。

## 更新版本信息

使用现有脚本同步根目录版本、锁文件和版本记录：

```bash
npm run update-version -- "修复搜索功能" "优化 Worker 部署"
```

只移植上游修复时，不要为了单个修复把根版本标记为完整的上游版本；在提交说明中列出实际合并的变更即可。

## 发布检查

```bash
npm run check:boundaries
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run test:wrangler
cd cloudflare-worker
npx tsc -p tsconfig.json --noEmit
```

部署前先按 Worker 文档应用 D1 migrations，再使用带 `--keep-vars` 的 Worker 部署脚本。不要在版本记录中加入 Secret、数据库文件或本地环境信息。
