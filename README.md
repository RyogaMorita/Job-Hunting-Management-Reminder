# Job-Hunting-Management-Reminder

就職活動の企業管理、選考スケジュール、リマインド通知をまとめて管理する Expo / React Native アプリです。

アプリ名は「就活管理リマインダー」です。企業ごとの選考ステータスや締切日、面接日、志望度、メモ、ログイン情報などを登録し、カレンダーと一覧で確認できます。

## 主な機能

- カレンダーで選考予定を管理
- 企業ごとのステータス管理
- 志望度ランク、業種ジャンル、メモの登録
- ES提出、1次面接、2次面接、最終面接、内定のチェックリスト管理
- ステータス変更履歴の記録
- 内定承諾期限の管理
- 企業名のオートフィル候補表示
- 業種、ステータスによる絞り込み
- 登録順、直近順、五十音、志望度、ステータス、ジャンルでの並び替え
- 企業ごとの個別リマインド通知設定
- テスト通知送信
- CSV形式のデータをクリップボードにコピー
- ライトモード、ダークモード対応
- 広告表示、リワード広告による就活Tips表示

## 技術スタック

- Expo SDK 54
- React 19
- React Native 0.81
- TypeScript
- AsyncStorage
- expo-notifications
- react-native-calendars
- react-native-google-mobile-ads
- react-native-iap

## セットアップ

```bash
npm install
```

## 起動方法

```bash
npm run start
```

Androidで起動する場合:

```bash
npm run android
```

iOSで起動する場合:

```bash
npm run ios
```

Webで起動する場合:

```bash
npm run web
```

## npm scripts

| コマンド | 内容 |
| --- | --- |
| `npm run start` | Expo 開発サーバーを起動 |
| `npm run android` | Android 向けに Expo を起動 |
| `npm run ios` | iOS 向けに Expo を起動 |
| `npm run web` | Web 向けに Expo を起動 |

## ディレクトリ構成

```text
.
├── App.tsx
├── companies_v2.ts
├── app.json
├── eas.json
├── package.json
├── tsconfig.json
└── assets/
```

### 主要ファイル

- `App.tsx`: アプリ本体の画面、状態管理、通知、広告、保存処理
- `companies_v2.ts`: 企業名オートフィル用の上場企業データ
- `app.json`: Expo アプリ設定、通知、広告、iOS / Android 設定
- `assets/`: アイコン、スプラッシュ画像、タブ画像など

## データ保存

予定、ジャンル、ステータス色、通知設定などのローカルデータは `@react-native-async-storage/async-storage` に保存されます。

## 通知

選考日程に対して、何日前の何時に通知するかを企業ごとに設定できます。通知機能には `expo-notifications` を使用しています。

通知が届かない場合は、端末側の通知権限を確認してください。

## 広告

広告表示には `react-native-google-mobile-ads` を使用しています。開発環境ではテスト広告、本番環境では `app.json` と `App.tsx` に設定された AdMob ID が使用されます。

## ビルド

EAS Build の設定は `eas.json` にあります。

プレビュー用 Android APK:

```bash
eas build --profile preview --platform android
```

本番ビルド:

```bash
eas build --profile production --platform all
```

## 注意事項

- `react-native-iap` を使った広告削除購入機能は、現在コード上では「近日公開」としてコメントアウトされています。
- `companies_v2.ts` は自動生成データのため、手動編集は推奨されません。
- iOS / Android の通知や広告は、Expo Go では一部挙動が本番ビルドと異なる場合があります。
