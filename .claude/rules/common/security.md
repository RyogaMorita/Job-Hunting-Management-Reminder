# セキュリティ規則

## 絶対禁止
- ソースコードへのAPIキー・シークレット・パスワードのハードコード
- HTTP通信（HTTPSのみ使用）
- ユーザー入力を検証なしにURLやコマンドに渡す

## データ保護
- AsyncStorageには個人情報・認証情報を平文で保存しない
- シークレット情報はEASの `eas secret` を使う（`app.json` には書かない）
- `.env` ファイルをgitにコミットしない（`.gitignore` に含まれているか確認）

## iOS固有
- `ITSAppUsesNonExemptEncryption: false` は `app.json` の `infoPlist` に設定済み（変更しない）
- App Groupsの識別子: `group.com.moritaryoga.shukatsukanri`（変更しない）
- 通知ペイロードに個人情報を含めない

## 依存関係
- 新しいnpmパッケージを追加する前に `npm audit` で脆弱性を確認
- 既知の脆弱性があるパッケージはアップデートする

## レビュー
- セキュリティに関わる変更は `security-reviewer` エージェントでレビューする
