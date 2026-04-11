# React Native / TypeScript 規則

## アニメーション
- アニメーションするのは `transform`（translateX/Y, scale, rotate）と `opacity` のみ
- `width`, `height`, `margin`, `padding` のアニメーションは禁止（レイアウト再計算が発生）
- transform/opacity には必ず `useNativeDriver: true`
- width/height のアニメーションが必要な場合のみ `useNativeDriver: false`
- スプリング設定の基本値: `damping: 15, stiffness: 150`
- `react-native-reanimated` v3 を使用（`withSpring`, `withTiming`, `withSequence`, `useSharedValue`, `useAnimatedStyle`）

## スタイリング
- `StyleSheet.create()` を使う（インラインオブジェクトの毎回生成を避ける）
- スペーシングの基本リズム: 4 / 8 / 12 / 16 / 24 / 32 px
- カードパディング: 12〜16px
- カード角丸: 12px（リスト）/ 16px（モーダル）

## フォント
- 日本語: Noto Sans JP（400 / 700）
- 英数字: Inter（400 / 700）
- Inter, Roboto, システムデフォルトフォントをデフォルトとして使わない

## TypeScript
- `any` 型の使用を避ける
- `interface` よりも `type` を優先（既存コードに合わせる）
- `Record<string, T>` を適切に使う

## React Native固有
- `TouchableOpacity` の代わりに `RippleButton`（ぽちゃんアニメーション）を使う
- リストは `Animated.ScrollView` + `map` または `DraggableFlatList`（手動ソート時）
- ダークモード: `useColorScheme()` → `C` オブジェクト経由で色を参照

## ネイティブライブラリ（EASビルドが必要）
- `react-native-reanimated` v3
- `react-native-gesture-handler`
- `react-native-draggable-flatlist`
- `react-native-svg`
- `expo-haptics`
- 新しいネイティブライブラリを追加する場合はEASビルドが必要（ユーザーに確認する）
