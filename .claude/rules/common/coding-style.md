# コーディングスタイル規則

## 色・デザイントークン
- **ハードコード色禁止** — StyleSheet内に `#XXXXXX` を直接書かない
- 必ず `C.xxx`（ダーク/ライトモード対応）/ `TDU_BLUE` / `ACCENT` / `statusColors[status]` を使う
- 新しい色が必要な場合は既存トークンを再利用する。新規追加する場合は `DEFAULT_STATUS_COLORS` に追加する

## コンポーネント設計
- **汎用ヘルパーを作らない** — 1箇所でしか使わないなら直接書く
- 既存コンポーネントを再利用する:
  - `SwipeableRow` — スワイプ削除
  - `MiniStepper` — カード内進捗バー
  - `StatusStepper` — 詳細モーダル内ステッパー
  - `AnimatedCard` — アニメーション付きカード
  - `RippleButton` — ぽちゃんリップルボタン
  - `AnimatedCheckmark` — SVGチェックマーク
  - `HighlightText` — 検索ハイライトテキスト

## ステート管理
- `AsyncStorage + useState` パターンに統一する
- 新しい永続化データは既存の `loadAll` / `saveSchedules` パターンに合わせる

## 命名規則
- コンポーネント: PascalCase
- 関数・変数: camelCase
- 定数: UPPER_SNAKE_CASE
- TypeScript型: PascalCase

## 禁止事項
- `console.log` の残存（デバッグ後は必ず削除）
- `any` 型の使用（型を明示する）
- インラインStyleSheetオブジェクトの毎回生成（`StyleSheet.create` を使う）
- 使われないコードのコメントアウト残存（削除する）
