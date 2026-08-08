import AppIntents
import WidgetKit

// MARK: - AppIntent（iOS 17+ インタラクティブウィジェット）
//
// 注意点:
// ・プロパティは必ず @Parameter を付ける。素の let はプロセス境界を越えるとnilになる。
// ・引数なし init() が必須。
// ・perform() の後にシステムが必ずタイムラインをリロードするので、
//   perform() 内で reloadTimelines を呼ぶ必要はない（むしろ即時反映されず遅くなる）。
// ・システム側にデバウンスが無い。連打で perform() が重複実行されるため冪等にする。

/// ステータスを1段階進める。
///
/// 連打対策として「進める前のステータス」を持たせ、一致するときだけ適用する。
/// 2回目以降のタップは expected が古くなるため no-op になり、段飛ばしを防げる。
struct AdvanceStatusIntent: AppIntent {
    static var title: LocalizedStringResource = "選考を次の段階へ進める"
    static var description = IntentDescription("企業の選考ステータスを次の段階へ進めます。")
    /// ウィジェット内部の操作なのでショートカットAppには出さない
    static var isDiscoverable: Bool { false }

    @Parameter(title: "企業ID")
    var scheduleID: String

    @Parameter(title: "現在のステータス")
    var expectedStatus: String

    init() {}

    init(scheduleID: String, expectedStatus: String) {
        self.scheduleID = scheduleID
        self.expectedStatus = expectedStatus
    }

    func perform() async throws -> some IntentResult {
        // 楽観的更新を含めた現在値を読む
        guard let current = AppGroupHelper.loadSchedules().first(where: { $0.id == scheduleID })
        else { return .result() }

        // 連打・古いスナップショットからのタップは無視する
        guard current.status == expectedStatus else { return .result() }
        guard let next = nextStatus(current.status) else { return .result() }

        // アプリ本体が次回フォアグラウンド時に取り込むまでの待ち行列に積む
        AppGroupHelper.appendPending(id: scheduleID, status: next)
        return .result()
    }
}

/// 表示月を移動する（ウィジェットはスワイプを扱えないため ◀▶ ボタンで代替）
struct ShiftMonthIntent: AppIntent {
    static var title: LocalizedStringResource = "表示月を変える"
    static var description = IntentDescription("カレンダーウィジェットの表示月を前後に移動します。")
    /// ウィジェット内部の操作なのでショートカットAppには出さない
    static var isDiscoverable: Bool { false }

    /// -1 = 前月, +1 = 翌月, 0 = 今月へ戻す
    @Parameter(title: "移動量")
    var delta: Int

    init() {}

    init(delta: Int) {
        self.delta = delta
    }

    func perform() async throws -> some IntentResult {
        if delta == 0 {
            AppGroupHelper.monthOffset = 0
        } else {
            AppGroupHelper.monthOffset = AppGroupHelper.monthOffset + delta
        }
        return .result()
    }
}
