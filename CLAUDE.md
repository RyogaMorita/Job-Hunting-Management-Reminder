# Claude Code Instructions

## コーディング前のレビュープロセス

コーディングを開始する前に、必ず以下の手順を踏むこと：

1. **実装方針の要約を提示する**
   - 実装する内容の概要
   - 変更・作成するファイルの一覧
   - 採用するアプローチと理由
   - 想定されるリスクや注意点

2. **ユーザーの承認を得てからコーディングを開始する**
   - ユーザーが承認するまでコードの変更・作成を行わない
   - 修正が必要な場合は方針を更新して再度レビューを求める

## 逆質問のルール

要件や仕様に不明な点がある場合は、コーディングに着手する前に積極的に逆質問を行うこと：

- 要件が曖昧な場合は具体的な動作を確認する
- 複数の実装方法が考えられる場合はどのアプローチを好むか確認する
- 影響範囲が広い変更の場合は意図を確認する
- 既存の設計・命名規則と矛盾する場合は方針を確認する

一度に複数の不明点がある場合はまとめて質問すること（何度もやり取りするより効率的）。

## iOSビルドのルール

- **ビルド前に必ず `app.json` の `ios.buildNumber` を確認する**
- App Store Connectに提出済みのビルド番号は再利用不可のため、毎回インクリメントすること
- ビルド番号の確認は `git pull` の前に行い、最新の番号を把握してから作業を開始すること
- **コード変更を伴う作業のたびに必ず `buildNumber` を1つインクリメントしてからコミットすること**

## 環境制約

- **macOSのバージョンアップは不可**（これ以上上げられない）
- macOSバージョンに依存する解決策（Xcode最新版へのアップデートなど）は提案しないこと
- iOSビルドが必要な場合はEAS Build（クラウド）を使う前提で考えること
- **EASの無料枠が切れた場合は新しいEASアカウントを作成して対応する**
  - `eas logout` → `eas login`（新アカウント）→ `git checkout -- app.json` → `eas init`

## デザインシステム（Design Tokens）

アプリのカラー・タイポグラフィ・スペーシングは以下に従うこと。ハードコード値を直接使わず、必ずこれらのトークンを参照する。

### カラー
- Primary: `#003366`（TDU_BLUE）
- Accent: `#1a6bcc`（ACCENT）
- ステータス色は `DEFAULT_STATUS_COLORS` / `statusColors` オブジェクトから参照
- Dark mode は DARK オブジェクト、Light mode は LIGHT オブジェクトから `C` 経由で参照
- **新しいカラーを追加する際はハードコードせず、既存のトークンを再利用すること**

### タイポグラフィ
- 日本語: Noto Sans JP（400 / 700）
- 英数字: Inter（400 / 700）
- フォントを変更する際は `useFonts` フックと `fontFamily` スタイルを確認すること
- **Inter, Roboto, system default font をデフォルトとして使わない**

### スペーシング
- 基本リズム: 4px、8px、12px、16px、24px、32px
- カードパディング: 12〜16px
- カード角丸: 12px（リスト）、16px（詳細モーダル）

### アニメーション規則（重要）
- **`transform`（translateX/Y, scale, rotate）と `opacity` のみアニメーションする**
- `width`, `height`, `margin`, `padding` のアニメーションは極力避ける（レイアウト再計算が発生する）
- `useNativeDriver: true` を可能な限り使用する（transform/opacity は必ず true）
- `width`/`height` のアニメーションが必要な場合のみ `useNativeDriver: false`
- スプリング設定の基本値: `damping: 15, stiffness: 150`
- リストのスタガー遅延: 80〜120ms
- `react-native-reanimated` は未インストール。アニメーションは React Native 標準の `Animated` API を使用すること
  - インストールする場合は EAS ビルドが必要。事前にユーザーに確認すること

## コーディング規則

- **インラインスタイルでハードコードした色を使わない** — 必ず `C.xxx` / `TDU_BLUE` / `ACCENT` / `statusColors[status]` を参照
- **汎用ヘルパーは作らない** — 1箇所でしか使わないなら直接書く
- 既存のコンポーネント（SwipeableRow, MiniStepper, StatusStepper 等）を再利用する
- 新機能追加時は既存のステート管理パターン（AsyncStorage + useState）に合わせる
