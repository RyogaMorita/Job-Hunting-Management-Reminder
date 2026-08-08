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
ホーム画面・ロック画面対応のWidgetKit製ウィジェット（4種類）。

| ウィジェット | サイズ | 内容 |
|---|---|---|
| 就活カレンダー | Medium / Large | 月表示。複数日の予定は帯で表示。◀▶で月移動 |
| 週間スケジュール | Medium | 今後7日間の予定 |
| 直近の持ち駒 | Small / Medium / Large / ロック画面 | 日程が近い順。→ボタンで選考を次の段階へ |
| 持ち駒一覧 | Medium / Large | 選考段階順に一覧表示 |

- **インタラクティブウィジェット**（iOS 17+ AppIntent）: ウィジェット上の→ボタンでステータスを前進、◀▶で月移動
- **複数日の予定**を週をまたぐ帯として表示（`Grid` + `gridCellColumns`）
- **ディープリンク**: 日付をタップするとアプリの該当日を開く
- ダーク/ライト、iOS 18のホーム画面色変更（accented）、ロック画面（vibrant）に対応
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
├── Models.swift               # データモデル・App Group入出力・タイムライン方針
├── CalendarLayout.swift       # 月グリッドとレーン割り当ての計算
├── Intents.swift              # AppIntent（ステータス前進・月移動）
├── WidgetMonthCalendar.swift  # 就活カレンダー
├── WidgetWeek.swift           # 週間スケジュール
├── WidgetUpcoming.swift       # 直近の持ち駒
├── WidgetList.swift           # 持ち駒一覧
└── ShukatsuWidgetBundle.swift # ウィジェット登録
```

App GroupID: `group.com.moritaryoga.shukatsukanri`

### データの流れ

```
アプリ →  AsyncStorage（正本）
       └→ App Group: widget_schedules_v1  →  ウィジェット表示

ウィジェットの→ボタン
       └→ App Group: widget_pending_actions_v1（待ち行列）
              └→ 次回フォアグラウンド時にアプリが取り込み AsyncStorage を更新
```

ウィジェットは正本を直接書き換えず待ち行列に積むだけにして、
RN側の状態と二重管理にならないようにしている。

### タイムライン更新の方針

ウィジェットのリロードには日次予算（頻繁に見られるもので約40〜70回）があり、
短間隔のポーリングは予算を使い切って**かえって更新が止まる**。

そのため各Providerは「今」＋今後7日ぶんの**深夜0時のエントリ**をまとめて返し、
`policy` は `.atEnd` にしている。エントリの切り替えは `getTimeline` を呼ばないため
予算を消費せず、日付の切り替わりも正確になる。
データ変更時のみアプリから `reloadAllTimelines()` を呼ぶ。

---

## デザインシステム

| トークン | 値 |
|---|---|
| Primary (TDU_BLUE) | `#003366` |
| Accent | `#1a6bcc` |
| 基本リズム | 4 / 8 / 12 / 16 / 24 / 32 px |
| カード角丸 | 12px（リスト）/ 16px（モーダル） |
| フォント | Noto Sans JP + Inter |
