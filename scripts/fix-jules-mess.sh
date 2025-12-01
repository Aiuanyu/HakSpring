#!/bin/bash
# 快速修復 Jules 亂開分支的問題
# 用法：./fix-jules-mess.sh ai-collab-start-1-3 ai-collab-start-1

set -e

WRONG_BRANCH=$1
RIGHT_BRANCH=$2

if [ -z "$WRONG_BRANCH" ] || [ -z "$RIGHT_BRANCH" ]; then
    echo "用法：$0 <Jules亂開的分支> <正確的分支>"
    echo "範例：$0 ai-collab-start-1-3 ai-collab-start-1"
    exit 1
fi

echo "📥 Fetching 分支..."
git fetch origin $WRONG_BRANCH $RIGHT_BRANCH

echo ""
echo "🔍 檢查 $WRONG_BRANCH 有什麼新東西..."
COMMITS=$(git log --oneline origin/$RIGHT_BRANCH..origin/$WRONG_BRANCH)

if [ -z "$COMMITS" ]; then
    echo "❌ $WRONG_BRANCH 沒有新 commits，是垃圾分支！"
    echo "可以直接刪除："
    echo "  git push origin --delete $WRONG_BRANCH"
    exit 1
fi

echo "📝 找到以下新 commits："
echo "$COMMITS"
echo ""

FILES=$(git diff origin/$RIGHT_BRANCH...origin/$WRONG_BRANCH --name-only)
echo "📄 修改的檔案："
echo "$FILES"
echo ""

read -p "要把這些 commits 移到 $RIGHT_BRANCH 嗎？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "取消操作"
    exit 1
fi

echo ""
echo "🔀 正在合併到 $RIGHT_BRANCH..."
git checkout -B temp-fix-jules origin/$RIGHT_BRANCH
git merge --no-ff origin/$WRONG_BRANCH -m "Merge Jules' work from $WRONG_BRANCH (fixing his OCD)"

echo ""
echo "⬆️ 推送到 $RIGHT_BRANCH..."
git push origin temp-fix-jules:$RIGHT_BRANCH --force

echo ""
echo "✅ 完成！現在可以："
echo "  1. 刪除垃圾分支："
echo "     git push origin --delete $WRONG_BRANCH"
echo ""
echo "  2. 清理本地："
echo "     git checkout main"
echo "     git branch -D temp-fix-jules"
