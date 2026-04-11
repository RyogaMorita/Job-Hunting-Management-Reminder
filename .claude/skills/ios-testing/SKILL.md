---
name: ios-testing
description: iOSシミュレーターでアクセシビリティツリーを使って自律テストを行う。Claude Codeのios-simulator-mcpを使う。
---

# iOS Testing スキル

## セットアップ（Mac側で一度だけ実行）

```bash
# 1. Facebook IDB（シミュレーター操作ライブラリ）
brew install idb-companion

# 2. Claude CodeにMCPサーバーを追加
claude mcp add ios-simulator npx ios-simulator-mcp

# 3. Claude Codeを再起動
```

## 使い方

シミュレーターを起動した状態でClaude Codeに以下のように指示する:

```
シミュレーターで就活管理リマインダーの全機能をテストして
```

```
「企業追加」フローをテストして。アクセシビリティツリーを使って
```

## テスト対象フロー

### 企業追加フロー
1. FAB（+ボタン）をタップ
2. 企業名・ステータス・日付を入力
3. 保存
4. リストに表示されることを確認

### ステータス進行フロー
1. 企業カードの → ボタンをタップ
2. ステータスが正しく変わることを確認（検討中 → ES提出済）
3. ハプティクスとリップルアニメーションを確認

### カレンダーフロー
1. カレンダータブを開く
2. 週/月切り替えボタンをタップ
3. 日付をタップして企業が表示されることを確認

### 検索フロー
1. 検索バーに文字を入力
2. ハイライト表示を確認

### ソート・並び替えフロー
1. ソートオプションを切り替え
2. 手動ソートで長押しD&Dを実行

## 代替ツール（より高機能）

```bash
# ios-simulator-skill（Pythonスクリプト群）
git clone https://github.com/conorluddy/ios-simulator-skill.git ~/.claude/skills/ios-simulator-skill
```

## 注意事項
- シミュレーターのみ対応（実機は非対応）
- macOSが必要（Linuxでは動作しない）
- 実行中のMetro devサーバーが必要（`npx expo start`）
