import SwiftUI

// MARK: - Data Models

struct WidgetSchedule: Codable, Identifiable, Hashable {
    let id: String
    let company: String
    let date: String       // "2026-03-28"
    let endDate: String?   // 複数日予定の終了日（無ければ単日）
    let hour: String
    let minute: String
    let status: String
    let calendarColor: String?
    /// Webテストの登録があるか。→ボタンの遷移先をアプリ側と揃えるために持つ
    let hasWebTest: Bool

    /// 1件でも欠けたフィールドがあると配列全体のデコードが失敗し、
    /// 4つのウィジェットが同時に真っ白になる。欠損・型違いは空文字で受ける。
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func str(_ key: CodingKeys) -> String {
            if let s = try? c.decode(String.self, forKey: key) { return s }
            if let n = try? c.decode(Int.self, forKey: key) { return String(n) }
            return ""
        }
        id = str(.id)
        company = str(.company)
        date = str(.date)
        endDate = try? c.decode(String.self, forKey: .endDate)
        hour = str(.hour)
        minute = str(.minute)
        status = str(.status)
        calendarColor = try? c.decode(String.self, forKey: .calendarColor)
        hasWebTest = (try? c.decode(Bool.self, forKey: .hasWebTest)) ?? false
    }

    enum CodingKeys: String, CodingKey {
        case id, company, date, endDate, hour, minute, status, calendarColor, hasWebTest
    }

    init(id: String, company: String, date: String, endDate: String?,
         hour: String, minute: String, status: String, calendarColor: String?,
         hasWebTest: Bool = false) {
        self.id = id
        self.company = company
        self.date = date
        self.endDate = endDate
        self.hour = hour
        self.minute = minute
        self.status = status
        self.calendarColor = calendarColor
        self.hasWebTest = hasWebTest
    }

    /// 終了日（未設定・不正な場合は開始日）
    var effectiveEnd: String {
        guard let e = endDate, !e.isEmpty, e >= date else { return date }
        return e
    }

    var isMultiDay: Bool { effectiveEnd > date }

    /// 指定日にこの予定がかかっているか
    func covers(_ ymd: String) -> Bool {
        !date.isEmpty && date <= ymd && ymd <= effectiveEnd
    }
}

/// ウィジェットからのステータス変更をアプリ本体へ引き渡すためのキュー要素
struct PendingAction: Codable {
    let id: String
    let status: String
    let ts: Double
}

// MARK: - Formatters（View内で生成するとウィジェットのCPU/メモリ予算を圧迫するため static でキャッシュ）

enum Fmt {
    static let iso: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .autoupdatingCurrent
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static let monthDayWeek: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "M/d(EEE)"
        return f
    }()

    static let shortMonthDay: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "M/d"
        return f
    }()

    static let yearMonth: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "yyyy年M月"
        return f
    }()

    static let weekdaySymbol: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "ja_JP")
        f.dateFormat = "E"
        return f
    }()

    /// autoupdatingCurrent を使うこと。
    /// DST の日は 23時間 / 25時間 になるため .current だと年2回1時間ずれる。
    static let jaCalendar: Calendar = {
        var c = Calendar.autoupdatingCurrent
        c.locale = Locale(identifier: "ja_JP")
        c.timeZone = .autoupdatingCurrent
        return c
    }()
}

// MARK: - Date Utilities

enum Ymd {
    static func string(_ date: Date) -> String { Fmt.iso.string(from: date) }
    static func date(_ ymd: String) -> Date? { Fmt.iso.date(from: ymd) }
    static func today() -> String { string(Date()) }

    /// 当日の 00:00
    static func startOfToday() -> Date { Fmt.jaCalendar.startOfDay(for: Date()) }

    /// n日後の 00:00（タイムライン境界の生成に使う）
    static func midnight(daysFromToday n: Int) -> Date {
        Fmt.jaCalendar.date(byAdding: .day, value: n, to: startOfToday()) ?? Date()
    }
}

// MARK: - App Group Helper

enum AppGroupHelper {
    static let suiteName = "group.com.moritaryoga.shukatsukanri"
    static let schedulesKey = "widget_schedules_v1"
    static let pendingKey = "widget_pending_actions_v1"
    static let monthOffsetKey = "widget_month_offset_v1"
    static let monthOffsetDayKey = "widget_month_offset_day_v1"
    static let weekStartKey = "widget_week_start_v1"

    static var defaults: UserDefaults? { UserDefaults(suiteName: suiteName) }

    /// react-native-shared-group-preferences は String として保存するため両方に対応する
    private static func readJSON(_ key: String) -> Data? {
        guard let d = defaults else { return nil }
        if let s = d.string(forKey: key) { return s.data(using: .utf8) }
        if let raw = d.data(forKey: key) { return raw }
        return nil
    }

    private static func writeJSON<T: Encodable>(_ value: T, key: String) {
        guard let d = defaults,
              let data = try? JSONEncoder().encode(value),
              let str = String(data: data, encoding: .utf8) else { return }
        d.set(str, forKey: key)
    }

    // MARK: Schedules

    /// App Group から読み込み、ウィジェット側の未反映操作を重ねて返す
    static func loadSchedules() -> [WidgetSchedule] {
        guard let data = readJSON(schedulesKey),
              let raw = try? JSONDecoder().decode([WidgetSchedule].self, from: data)
        else { return [] }
        return applyPending(to: raw)
    }

    // MARK: Pending actions（ウィジェット → アプリ本体）

    static func loadPending() -> [PendingAction] {
        guard let data = readJSON(pendingKey),
              let list = try? JSONDecoder().decode([PendingAction].self, from: data)
        else { return [] }
        return list
    }

    static func appendPending(id: String, status: String) {
        var list = loadPending()
        list.append(PendingAction(id: id, status: status, ts: Date().timeIntervalSince1970))
        // 同一IDは最新のみ残す（キューの肥大化を防ぐ）
        var seen = Set<String>()
        let deduped = list.reversed().filter { seen.insert($0.id).inserted }.reversed()
        writeJSON(Array(deduped), key: pendingKey)
    }

    /// 未反映の操作をスケジュールに重ねる（楽観的更新）
    private static func applyPending(to list: [WidgetSchedule]) -> [WidgetSchedule] {
        let pending = loadPending()
        guard !pending.isEmpty else { return list }
        var statusById: [String: String] = [:]
        for p in pending { statusById[p.id] = p.status }
        return list.map { s in
            guard let newStatus = statusById[s.id] else { return s }
            return WidgetSchedule(
                id: s.id, company: s.company, date: s.date, endDate: s.endDate,
                hour: s.hour, minute: s.minute, status: newStatus,
                calendarColor: statusColors[newStatus], hasWebTest: s.hasWebTest
            )
        }
    }

    // MARK: 表示月オフセット（◀▶ボタン用）

    /// 日付が変わったら 0 に戻す（前月を見たまま放置されるのを防ぐ）
    static var monthOffset: Int {
        get {
            guard let d = defaults else { return 0 }
            guard d.string(forKey: monthOffsetDayKey) == Ymd.today() else { return 0 }
            return d.integer(forKey: monthOffsetKey)
        }
        set {
            guard let d = defaults else { return }
            d.set(max(-12, min(12, newValue)), forKey: monthOffsetKey)
            d.set(Ymd.today(), forKey: monthOffsetDayKey)
        }
    }

    /// 週の開始曜日（0 = 日, 1 = 月）。アプリ本体の設定に追従する。
    static var weekStart: Int {
        guard let d = defaults else { return 0 }
        if let s = d.string(forKey: weekStartKey), let v = Int(s) { return v == 1 ? 1 : 0 }
        return d.integer(forKey: weekStartKey) == 1 ? 1 : 0
    }

    // MARK: 派生コレクション

    static var activeSchedules: [WidgetSchedule] {
        loadSchedules()
            .filter { !INACTIVE_STATUSES.contains($0.status) }
            .sorted { $0.company < $1.company }
    }
}

// MARK: - Status

/// 一覧・直近から除外するステータス（選考が動かないもの）
let INACTIVE_STATUSES: Set<String> = ["内定", "内定承諾", "内定辞退", "不合格", "完了"]

let statusColors: [String: String] = [
    "検討中": "#95A5A6",
    "説明会": "#00BCD4",
    "ワークショップ": "#26A69A",
    "ES締切": "#27AE60",
    "ES提出済": "#2980B9",
    "Webテスト": "#5C6BC0",
    "GD": "#FF9800",
    "1次面接": "#8E44AD",
    "2次面接": "#E67E22",
    "最終面接": "#E74C3C",
    "内定": "#E91E8C",
    "内定承諾": "#C2185B",
    "インターンES締切": "#F59E0B",
    "インターン面接": "#EF6C00",
    "インターン確定": "#EC407A",
    "🌸インターン確定": "#EC407A",
    "内定辞退": "#7F8C8D",
    "不合格": "#BDC3C7",
    "完了": "#95A5A6",
]

/// lib/schedule.ts の PROGRESS_FLOW / INTERN_FLOW と同一に保つこと
private let PROGRESS_FLOW = ["検討中", "ES提出済", "Webテスト", "1次面接", "2次面接", "最終面接", "内定"]
private let INTERN_FLOW = ["インターンES締切", "インターン面接", "インターン確定"]

/// 次の選考段階。これ以上進めないものは nil。
///
/// ES提出済の次は常に Webテスト（lib/schedule.ts と揃えること）。
/// hasWebTest は互換のため残してあるが遷移先には影響しない。
func nextStatus(_ current: String, hasWebTest: Bool = false) -> String? {
    if current == "ES締切" { return "ES提出済" }
    if let i = PROGRESS_FLOW.firstIndex(of: current), i < PROGRESS_FLOW.count - 1 {
        return PROGRESS_FLOW[i + 1]
    }
    if let i = INTERN_FLOW.firstIndex(of: current), i < INTERN_FLOW.count - 1 {
        return INTERN_FLOW[i + 1]
    }
    return nil
}

func colorForStatus(_ status: String, override hex: String? = nil) -> Color {
    if let h = hex, !h.isEmpty { return Color(hex: h) }
    return Color(hex: statusColors[status] ?? "#95A5A6")
}

// MARK: - Utilities

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        // 想定外の文字列は透明にせずグレー（#95A5A6）で描く。
        // 透明にすると帯が消えて予定が無いように見えてしまうため。
        default: (a, r, g, b) = (255, 149, 165, 166)
        }
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: Double(a) / 255)
    }
}

let TDU_NAVY = Color(hex: "#031659")
let TDU_ACCENT = Color(hex: "#4A90D9")
let SAT_COLOR = Color(hex: "#4A90D9")
let SUN_COLOR = Color(hex: "#E74C3C")

/// 複数日なら "5/9〜5/12"、単日なら "5/9(土)"
func formatDateRange(_ s: WidgetSchedule) -> String {
    guard let start = Ymd.date(s.date) else { return s.date }
    guard s.isMultiDay, let end = Ymd.date(s.effectiveEnd) else {
        return Fmt.monthDayWeek.string(from: start)
    }
    return "\(Fmt.shortMonthDay.string(from: start))〜\(Fmt.shortMonthDay.string(from: end))"
}

// MARK: - Timeline 生成
//
// 30分ごとのポーリングは1日48回のリロードを要求し、システムの日次予算
// （頻繁に閲覧されるウィジェットで約40〜70回）を食い潰して逆に更新が止まる。
//
// 代わりに「日付が変わる瞬間」のエントリを事前に複数返す。
// エントリの切り替えは getTimeline を呼ばないため予算を消費せず、
// かつ .after と違って時刻が正確（.after は「最短でもこの時刻以降」の意味しかなく
// 実測3〜10分の遅延がある）。Apple も「正確な時刻に変えたいならエントリを置け」としている。
//
// policy は .atEnd。将来エントリと .after の併用は冗長なうえ、
// 全端末が同じ深夜0時に殺到する thundering herd になる。
// データ変更時はアプリ本体から reloadAllTimelines() が呼ばれる。

enum TimelinePlan {
    static let horizonDays = 7

    /// 「今」＋今後7日分の各深夜0時
    static func dailyBoundaries(days: Int = horizonDays) -> [Date] {
        var dates: [Date] = [Date()]
        for i in 1...days {
            dates.append(Ymd.midnight(daysFromToday: i))
        }
        return dates
    }
}
