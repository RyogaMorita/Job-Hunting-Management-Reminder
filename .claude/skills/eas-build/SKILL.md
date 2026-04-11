---
name: eas-build
description: EAS Buildのビルド・提出手順とよくあるエラーの対処法
---

# EAS Build スキル

## 基本ビルドフロー

```bash
# 1. buildNumberをインクリメント（app.jsonを編集）
# 2. 変更をコミット・プッシュ
# 3. Mac側でpull
git stash && git pull origin claude/add-code-review-process-AFYzs && git stash pop

# 4. EASビルド
eas build --platform ios

# 5. App Store提出
eas submit --platform ios --latest
```

## buildNumber管理

| 状況 | 対応 |
|------|------|
| コード変更あり | 必ずインクリメント |
| ビルド失敗・再ビルド | インクリメント（失敗したビルドの番号も消費される） |
| 提出失敗・再提出 | `eas submit` のみ再実行（ビルドは不要） |

## EAS無料枠切れ

```bash
eas logout
eas login           # 新しいアカウントでログイン
git checkout -- app.json   # EAS initで書き換えられるため一旦リセット
eas init
eas build --platform ios
```

## 提出エラー: buildNumber重複

```
Build number X has already been used.
```
→ `app.json` の `ios.buildNumber` をインクリメントしてリビルド

## 提出エラー: Something went wrong

1. 提出詳細URLをブラウザで開いてエラー内容を確認
2. または `eas submit --platform ios --latest` で再試行
3. それでも失敗する場合はIPAを手動でTransporterからアップロード

## EAS CLIアップデート（sudoが必要）

```bash
sudo npm install -g eas-cli
```

## ビルドログ確認

ビルド失敗時はターミナルに表示される `See logs:` のURLをブラウザで開く。
