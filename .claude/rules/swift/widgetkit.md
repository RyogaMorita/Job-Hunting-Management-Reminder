# WidgetKit 規則

対象: `targets/shukatsu-widget/*.swift`（iOS 17.0+ / SwiftUI / AppIntents）

## タイムライン更新

- **短間隔のポーリング禁止**（`.after(now + 30分)` のような書き方をしない）
  - リロードには日次予算がある（頻繁に見られるウィジェットで約40〜70回）
  - 予算を使い切るとシステムに絞られ、**かえって更新が止まる**
- 「今」＋今後7日ぶんの**深夜0時のエントリ**をまとめて返し、`policy` は `.atEnd`
  - エントリの切り替えは `getTimeline` を呼ばないので予算を消費しない
  - `.after` は「最短でもその時刻以降」の意味しかなく実測3〜10分ずれる。正確な時刻に変えたいならエントリを置く
  - 将来エントリと `.after` の併用は冗長。さらに全端末が同時刻に殺到する
- 日付計算は必ず `Fmt.jaCalendar`（`Calendar.autoupdatingCurrent`）を使う
  - DSTの日は23時間/25時間なので `.current` や `+86400` だと年2回ずれる
- データ変更時のみアプリ本体から `reloadAllTimelines()` を呼ぶ

## 背景とレンダリングモード

- 背景は **`.containerBackground(for: .widget)` に一本化**する
  - View内に `ZStack { Color(...) }` を置かない（StandBy・Tintモードで背景が抜けなくなる）
  - accessory系（ロック画面）にも必ず付ける。中身は `EmptyView()` でよい
  - `AccessoryWidgetBackground()` は `containerBackground` の中に入れると描画されない。通常の階層に置く
- **accented（iOS18のホーム画面色変更）と vibrant（ロック画面）では色がアルファチャンネル基準で白に潰れる**
  - ステータスの色分けが機能しなくなるので、**不透明度・太さ・形**で情報を伝える
  - `@Environment(\.widgetRenderingMode)` で分岐する
  - vibrant では塗りつぶし円が赤い塊になるので `strokeBorder` にする
- `widgetAccentable()` は**一方向**。付けた後に子で `false` にしても戻らないので、できるだけ下位の要素に付ける
- StandByは `systemSmall` を拡大表示する（medium/largeはStandByに出ない）

## レイアウト

- **`.dynamicTypeSize(.large ... .xxLarge)` でクランプする**
  - ウィジェットはAX5まで拡大され、スクロールで逃げられないため必ず破綻する
- 日付などの数字には `.monospacedDigit()`（列幅が揃い月をまたいでもガタつかない）
- 複数日にまたがる帯は **`Grid` + `.gridCellColumns(n)`** で描く（HTMLのcolspanと同じ）
  - `gridCellColumns` は `GridRow` の直接の子に付ける
  - 1行のセルの合計は必ず7列にする（足りないと列がずれる）
  - GeometryReaderでのセル幅手計算はしない
- HIGの推奨は最小11pt。それ未満にする場合は `minimumScaleFactor` を併用する

## パフォーマンス・安全性

- **メモリ上限は30MB**、しかも**全タイムラインエントリの合計**
  - Simulator と Debug では制限されない。Release実機でのみ落ちる
  - 画像は使わない。SF Symbols と図形で描く
- `DateFormatter` は `Fmt` の `static let` を使う（View内で生成しない）
- **View は TimelineEntry の純粋関数にする**
  - 重い計算（レーン割り当てなど）は `getTimeline` 側で済ませて Entry に載せる
  - 測ってから再描画する `@State` ループはスナップショットのarchiveと相性が悪い
- **強制アンラップ禁止**。ウィジェットのクラッシュ＝ウィジェットが真っ白になる

## AppIntent（インタラクティブウィジェット）

- プロパティには**必ず `@Parameter` を付ける**。素の `let` はプロセス境界を越えるとnilになる
- 引数なし `init()` が必須
- **システム側にデバウンスが無い**。連打で `perform()` が重複実行されるので冪等にする
  - 「変更前の値」を引数に持たせ、一致するときだけ適用する
- `perform()` の後にシステムが必ずタイムラインをリロードするので、
  中で `reloadTimelines` を呼ばない（即時反映されず遅くなるだけ）
- ウィジェットは正本（AsyncStorage）を直接書き換えられない。
  App Groupの待ち行列に積み、アプリ側のフォアグラウンド復帰時に取り込む

## データ共有

- App Group: `group.com.moritaryoga.shukatsukanri`
- `UserDefaults` の上限は4MB。件数が増えるようならJSONファイル方式に切り替える
- ロック画面ウィジェットから読むため、ファイル保護は
  `completeUntilFirstUserAuthentication` より厳しくしない
