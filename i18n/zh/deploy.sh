#!/usr/bin/env bash
# 把整站（含中文标签页）导出为静态文件，发布到本仓库的 gh-pages 分支（GitHub Pages）。
#
#   i18n/zh/deploy.sh            # 只在本地导出到 $OUT，便于检查（node $OUT/serve.js 不支持 base path，可用任意静态服务器挂在 /<仓库名>/ 下看）
#   i18n/zh/deploy.sh --push     # 导出并强制推送到 origin 的 gh-pages 分支（单个提交，不累积历史）
#
# 说明：
# - docs/.mintlify 里有符号链接，mint export 处理不了，所以先把 docs 复制一份并展开链接。
# - 上游 version-warning.js 依赖托管平台的 /docs/latest 重定向判断最新版本，静态站没有这些重定向，
#   会在每页误报"旧版本"，所以导出副本里删掉它（仓库里的原文件不动）。
# - docs.json 里的 redirects 在 GitHub Pages 上不生效。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REPO_NAME="${REPO_NAME:-modelcontextprotocol}"
BASE_PATH="/${REPO_NAME}"
WORK="${WORK:-$(mktemp -d)}"
OUT="$WORK/out"

echo "工作目录：$WORK"
node "$ROOT/i18n/zh/tool.mjs" build

rm -rf "$WORK/src" "$OUT" "$WORK/site.zip"
cp -R -L "$ROOT/docs" "$WORK/src"
rm -f "$WORK/src/version-warning.js"

(cd "$WORK/src" && npx -y mint@4.3.5 export --base-path "$BASE_PATH" --output "$WORK/site.zip")
mkdir -p "$OUT"
unzip -q "$WORK/site.zip" -d "$OUT"
rm -f "$OUT/Start Docs.bat" "$OUT/Start Docs.command"
touch "$OUT/.nojekyll" # 让 GitHub Pages 发布 _mintlify/ 这类下划线开头的目录
echo "已导出到 $OUT（$(du -sh "$OUT" | cut -f1)）"

if [[ "${1:-}" == "--push" ]]; then
  SRC_COMMIT="$(git -C "$ROOT" rev-parse --short HEAD)"
  REMOTE="$(git -C "$ROOT" remote get-url --push origin)"
  cd "$OUT"
  git init -q -b gh-pages
  git add -A
  git -c user.name="$(git -C "$ROOT" config user.name)" -c user.email="$(git -C "$ROOT" config user.email)" \
    commit -q -m "Deploy site from ${SRC_COMMIT}"
  git push -f "$REMOTE" gh-pages
  echo "已推送到 gh-pages"
fi
