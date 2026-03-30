/**
 * Expo Config Plugin: WidgetKit Reload
 *
 * アプリターゲットに WidgetKitModule を追加し、
 * React Native から WidgetCenter.shared.reloadAllTimelines() を
 * 呼び出せるようにする。
 */

const { withXcodeProject } = require('@expo/config-plugins');
const { withBuildSourceFile } = require('@expo/config-plugins/build/ios/XcodeProjectFile');

// ─── Swift ネイティブモジュール ────────────────────────────────────────────

const SWIFT_MODULE = `
import Foundation
import WidgetKit

@objc(WidgetKitModule)
class WidgetKitModule: NSObject {

  @objc
  func reloadAllTimelines() {
    if #available(iOS 14.0, *) {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
`.trimStart();

// ─── Objective-C ブリッジ ─────────────────────────────────────────────────

const OBJC_BRIDGE = `
#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetKitModule, NSObject)
RCT_EXTERN_METHOD(reloadAllTimelines)
@end
`.trimStart();

// ─── Config Plugin 本体 ───────────────────────────────────────────────────

const withWidgetKitReload = (config) => {
  // 1. Swift ファイルをアプリターゲットに追加
  config = withBuildSourceFile(config, {
    filePath: 'WidgetKitModule.swift',
    contents: SWIFT_MODULE,
    overwrite: true,
  });

  // 2. ObjC ブリッジファイルをアプリターゲットに追加
  config = withBuildSourceFile(config, {
    filePath: 'WidgetKitModuleBridge.m',
    contents: OBJC_BRIDGE,
    overwrite: true,
  });

  // 3. WidgetKit.framework をアプリターゲットにリンク (Optional)
  config = withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const targets = project.pbxNativeTargetSection();
    const appTarget = Object.values(targets).find(
      (t) => t && t.productType === '"com.apple.product-type.application"'
    );
    if (!appTarget) return cfg;

    // すでにリンク済みならスキップ
    const alreadyLinked = Object.values(project.pbxFrameworksBuildPhaseObj(appTarget.uuid) || {})
      .some((f) => f && f.comment && f.comment.includes('WidgetKit'));

    if (!alreadyLinked) {
      project.addFramework('WidgetKit.framework', {
        weak: true,
        target: appTarget.uuid,
      });
    }
    return cfg;
  });

  return config;
};

module.exports = withWidgetKitReload;
