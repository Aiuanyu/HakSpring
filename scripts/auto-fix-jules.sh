#!/bin/bash
# 自動偵測並修復 Jules 亂開的分支
# 用法：./auto-fix-jules.sh [base-branch-name]
# 範例：./auto-fix-jules.sh ai-collab-start-1

set -e

BASE_BRANCH=${1:-"ai-collab-start-1"}  # 預設處理 ai-collab-start-1

echo "🔍 自動偵測 Jules 的亂象..."
echo "基礎分支：$BASE_BRANCH"
echo ""

# Fetch 所有分支
git fetch origin --prune

# 找出所有 -1, -2, -3 等後綴分支
JULES_BRANCHES=$(git branch -r | grep "origin/$BASE_BRANCH-[0-9]" | sed 's/.*origin\///' | sort -V)

if [ -z "$JULES_BRANCHES" ]; then
    echo "✅ 沒有發現 Jules 的亂開分支！"
    exit 0
fi

echo "🚨 發現以下 Jules 分支："
echo "$JULES_BRANCHES" | nl
echo ""

# 分析每個分支
for BRANCH in $JULES_BRANCHES; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📝 分析分支：$BRANCH"
    echo ""

    # 檢查是否有新 commits
    COMMITS=$(git log --oneline origin/$BASE_BRANCH..origin/$BRANCH 2>/dev/null || echo "")

    if [ -z "$COMMITS" ]; then
        echo "❌ 這是垃圾分支（沒有新 commits）"
        echo ""
        read -p "要刪除這個垃圾分支嗎？(y/n) " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "🗑️  正在刪除 $BRANCH..."
            if git push origin --delete $BRANCH 2>/dev/null; then
                echo "✅ 已刪除 $BRANCH"
            else
                echo "❌ 刪除失敗（可能需要權限），請手動執行："
                echo "   git push origin --delete $BRANCH"
            fi
        else
            echo "⏭️  跳過，建議手動刪除：git push origin --delete $BRANCH"
        fi
        echo ""
        continue
    fi

    # 檢查是否有真的檔案改動
    FILES=$(git diff origin/$BASE_BRANCH...origin/$BRANCH --name-only 2>/dev/null || echo "")

    if [ -z "$FILES" ]; then
        echo "❌ 這是垃圾分支（只有空 commits）"
        echo "   Commits:"
        echo "$COMMITS" | sed 's/^/   /'
        echo ""
        read -p "要刪除這個垃圾分支嗎？(y/n) " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "🗑️  正在刪除 $BRANCH..."
            if git push origin --delete $BRANCH 2>/dev/null; then
                echo "✅ 已刪除 $BRANCH"
            else
                echo "❌ 刪除失敗（可能需要權限），請手動執行："
                echo "   git push origin --delete $BRANCH"
            fi
        else
            echo "⏭️  跳過，建議手動刪除：git push origin --delete $BRANCH"
        fi
        echo ""
        continue
    fi

    # 有真的改動！
    echo "✅ 發現真的改動！"
    echo ""
    echo "📝 新增的 commits："
    echo "$COMMITS" | sed 's/^/   /'
    echo ""
    echo "📄 修改的檔案："
    echo "$FILES" | sed 's/^/   /'
    echo ""

    # 詢問是否要自動修復
    read -p "要把 $BRANCH 的改動 merge 回 $BASE_BRANCH 嗎？(y/n/s=skip) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Ss]$ ]]; then
        echo "⏭️  跳過 $BRANCH"
        echo ""
        continue
    fi

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "⏭️  跳過 $BRANCH"
        echo ""
        continue
    fi

    echo ""
    echo "🔧 開始修復..."

    # 建立臨時分支
    TEMP_BRANCH="temp-fix-jules-$(date +%s)"
    git checkout -B $TEMP_BRANCH origin/$BASE_BRANCH

    # Merge
    echo "🔀 Merging $BRANCH..."
    if git merge --no-ff origin/$BRANCH -m "Merge Jules' work from $BRANCH (auto-fixed by script)"; then
        echo "✅ Merge 成功"

        # 修復可能的格式問題（換行符號）
        echo "🔧 檢查並修復格式問題..."
        for FILE in $FILES; do
            if [ -f "$FILE" ] && file "$FILE" | grep -q "text"; then
                # 檢查是否有 \n 字面字串
                if grep -q '\\n' "$FILE" 2>/dev/null; then
                    echo "   修復 $FILE 的換行符號..."
                    printf '%b' "$(cat $FILE)" > "${FILE}.fixed"
                    mv "${FILE}.fixed" "$FILE"
                    git add "$FILE"
                fi
            fi
        done

        # 如果有修復檔案，amend commit
        if ! git diff --cached --quiet; then
            echo "   更新 commit（包含格式修復）..."
            git commit --amend --no-edit
        fi

        # 推送（需要使用者權限）
        echo ""
        echo "⬆️  準備推送到 $BASE_BRANCH..."
        echo "   因為權限限制，你需要手動執行："
        echo ""
        echo "   git push origin $TEMP_BRANCH:$BASE_BRANCH --force"
        echo ""
        echo "   完成後可以刪除 Jules 的分支："
        echo "   git push origin --delete $BRANCH"
        echo ""

        # 記錄到檔案
        echo "$TEMP_BRANCH -> $BASE_BRANCH (from $BRANCH)" >> /tmp/jules-fix-pending.txt

    else
        echo "❌ Merge 失敗！可能有衝突，需要手動處理"
        git merge --abort
    fi

    echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 顯示待處理的推送指令
if [ -f /tmp/jules-fix-pending.txt ]; then
    echo "📋 待執行的推送指令："
    echo ""
    while IFS= read -r line; do
        TEMP=$(echo $line | cut -d' ' -f1)
        BASE=$(echo $line | cut -d' ' -f3)
        JULES=$(echo $line | cut -d' ' -f5 | tr -d ')')
        echo "# 修復 $JULES"
        echo "git push origin $TEMP:$BASE --force"
        echo "git push origin --delete $JULES"
        echo ""
    done < /tmp/jules-fix-pending.txt

    rm /tmp/jules-fix-pending.txt
fi

echo "✅ 分析完成！"
