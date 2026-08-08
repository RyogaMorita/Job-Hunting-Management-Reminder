/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",
  name: "ShukatsuWidget",
  displayName: "就活管理",
  deploymentTarget: "17.0",
  bundleIdentifier: ".shukatsuwidget",
  // AppIntents はインタラクティブウィジェット（→ボタン・月移動）に必要
  frameworks: ["SwiftUI", "WidgetKit", "AppIntents"],
  entitlements: {
    "com.apple.security.application-groups": ["group.com.moritaryoga.shukatsukanri"],
  },
  colors: {
    $widgetBackground: { color: "#031659", darkColor: "#031659" },
    $widgetAccent: { color: "#4A90D9", darkColor: "#4A90D9" },
  },
  // 画像は使わない（ウィジェットのメモリ上限30MBは全タイムラインエントリの合計。
  // アイコンはすべて SF Symbols と図形で描いている）
};
