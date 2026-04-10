# 就活管理リマインダー

就活の選考状況をまとめて管理し、締め切りや面接日程をリマインドするiOSアプリ。

- **App Store**: [就活管理リマインダー](https://apps.apple.com/jp/app/id6760197114)
- **Bundle ID**: `com.moritaryoga.shukatsukanri`
- **Platform**: iOS (React Native / Expo)

---

## 機能

### 企業・選考管理
- 企業ごとに選考ステータスを管理（検討中 → ES提出済 → 1次面接 → ... → 内定）
- ステータスに応じた色分けバッジ・ミニステッパー表示
- 志望度（S/A/B/C）・業種ジャンル・メモ・ESのURL管理
- 各ステージのチェックリスト（ES提出・面接・内定など）
- スワイプで削除

### カレンダー
- 月表示 / 週表示 切り替え（スプリングアニメーション付き）
- 選考日程をカレンダー上で視覚化
- 今日・締め切り近い日程をハイライト

### リスト・並び替え
- 登録順・直近順・五十音・志望度・ステータス・ジャンル・手動の7種のソート
- 手動ソート時はドラッグ&ドロップで並び替え（AsyncStorageに永続化）
- 企業名のインクリメンタル検索（マッチ部分ハイライト）

### 通知・リマインダー
- 選考締め切り・面接日程の事前通知
- `expo-notifications` によるローカル通知

### ウィジェット (iOS Widget)
- ホーム画面・ロック画面対応のWidgetKit製ウィジェット
- 「直近の持ち駒」ウィジェット：日程が近い順に選考中企業を表示
- 今日の予定を黄色でハイライト
- App Groupsでアプリとデータ共有

### 統計ダッシュボード
- 応募中・内定数・通過率をカード表示

### UX
- ダークモード対応
- ハプティクスフィードバック（`expo-haptics`）
- ぽちゃんリップルアニメーション（→ボタン）
- SVGチェックマークアニメーション（`react-native-svg` + Reanimated）
- 広告（`react-native-google-mobile-ads`）
- アプリ内課金（`react-native-iap`）
- トラッキング透明性（`expo-tracking-transparency`）

---

## 技術スタック

| カテゴリ | 使用技術 |
|---|---|
| フレームワーク | React Native / Expo SDK |
| 言語 | TypeScript |
| アニメーション | react-native-reanimated v3 |
| ジェスチャー | react-native-gesture-handler |
| D&D並び替え | react-native-draggable-flatlist |
| SVG | react-native-svg |
| ストレージ | AsyncStorage |
| 通知 | expo-notifications |
| ハプティクス | expo-haptics |
| ウィジェット | WidgetKit (Swift) + @bacons/apple-targets |
| ビルド | EAS Build (Expo Application Services) |
| 広告 | react-native-google-mobile-ads |
| 課金 | react-native-iap |

---

## ステータスフロー

```
検討中 ──────────────→ ES提出済 → 1次面接 → 2次面接 → 最終面接 → 内定
ES締切 ──────────────↗
説明会 → 完了
GD     → 完了

インターンES締切 → インターン面接 → インターン確定
```

---

## 開発セットアップ

```bash
git clone https://github.com/RyogaMorita/Job-Hunting-Management-Reminder.git
cd Job-Hunting-Management-Reminder
npm install
npx expo start
```

### ブランチ運用
- `main`: App Store提出済みの安定版
- `claude/add-code-review-process-AFYzs`: 開発ブランチ

---

## iOSビルド (EAS)

```bash
# ビルド
eas build --platform ios

# App Store提出
eas submit --platform ios --latest
```

### ビルド前チェックリスト
- [ ] `app.json` の `ios.buildNumber` をインクリメント（提出済みの番号は再利用不可）
- [ ] `app.json` の `version` を必要に応じて更新

### EAS無料枠が切れた場合
```bash
eas logout
eas login        # 新しいアカウントでログイン
git checkout -- app.json
eas init
```

---

## ウィジェット開発

ウィジェットはSwiftで実装（`targets/shukatsu-widget/`）。

```
targets/shukatsu-widget/
├── AppGroupHelper.swift      # App Groupsでアプリとデータ共有
├── WidgetUpcoming.swift      # 直近の持ち駒ウィジェット
└── ...
```

App GroupID: `group.com.moritaryoga.shukatsukanri`

データの流れ: `AsyncStorage（RN側）→ App Groups UserDefaults → Widget`

---

## デザインシステム

| トークン | 値 |
|---|---|
| Primary (TDU_BLUE) | `#003366` |
| Accent | `#1a6bcc` |
| 基本リズム | 4 / 8 / 12 / 16 / 24 / 32 px |
| カード角丸 | 12px（リスト）/ 16px（モーダル） |
| フォント | Noto Sans JP + Inter |
