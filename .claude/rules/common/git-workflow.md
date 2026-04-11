# Gitワークフロー規則

## コミット前の必須チェック
1. **`app.json` の `ios.buildNumber` をインクリメントする**（コード変更を伴う場合は毎回）
2. App Store Connect提出済みのビルド番号は再利用不可
3. `git pull` の前にbuildNumberの現在値を確認する

## コミットメッセージ形式
```
build XX: 変更内容の要約（日本語OK）

- 変更点1
- 変更点2

https://claude.ai/code/session_012CSrwVdAr5fUS2XPWRsUe6
```

## ブランチ運用
- `main`: App Store提出済みの安定版
- `claude/add-code-review-process-AFYzs`: 開発ブランチ（Claude Codeはここに push）
- **mainへの直接pushは禁止**

## pushの手順
```bash
git add <specific-files>  # git add -A は避ける（.envなどを誤って含めない）
git commit -m "..."
git push -u origin claude/add-code-review-process-AFYzs
```

## Mac側での更新取り込み
```bash
git stash && git pull origin claude/add-code-review-process-AFYzs && git stash pop
```
