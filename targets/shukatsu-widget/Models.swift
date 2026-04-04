import SwiftUI

// MARK: - Data Models

struct WidgetSchedule: Codable, Identifiable {
    let id: String
    let company: String
    let date: String      // "2026-03-28"
    let hour: String
    let minute: String
    let status: String
    let calendarColor: String?
}

// MARK: - App Group Helper

struct AppGroupHelper {
    static let suiteName = "group.com.moritaryoga.shukatsukanri"
    static let schedulesKey = "widget_schedules_v1"

    static func loadSchedules() -> [WidgetSchedule] {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return [] }
        // react-native-shared-group-preferences はStringとして保存する
        let jsonString: String?
        if let s = defaults.string(forKey: schedulesKey) {
            jsonString = s
        } else if let d = defaults.data(forKey: schedulesKey),
                  let s = String(data: d, encoding: .utf8) {
            jsonString = s
        } else {
            return []
        }
        guard let str = jsonString,
              let data = str.data(using: .utf8),
              let schedules = try? JSONDecoder().decode([WidgetSchedule].self, from: data)
        else { return [] }
        return schedules
    }

    static var upcomingSchedules: [WidgetSchedule] {
        let inactive = ["内定辞退", "不合格", "完了", "内定"]
        let today = isoToday()
        return loadSchedules()
            .filter { !inactive.contains($0.status) && $0.date >= today }
            .sorted { $0.date < $1.date }
    }

    static var activeSchedules: [WidgetSchedule] {
        let inactive = ["内定", "内定辞退", "不合格"]
        return loadSchedules()
            .filter { !inactive.contains($0.status) }
            .sorted { $0.company < $1.company }
    }

    static func isoToday() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
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
        default: (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(.sRGB, red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255, opacity: Double(a) / 255)
    }
}

let statusColors: [String: String] = [
    "検討中": "#95A5A6",
    "説明会": "#00BCD4",
    "ES締切": "#27AE60",
    "ES提出済": "#2980B9",
    "GD": "#FF9800",
    "1次面接": "#8E44AD",
    "2次面接": "#E67E22",
    "最終面接": "#E74C3C",
    "内定": "#E91E8C",
    "インターンES締切": "#F59E0B",
    "インターン面接": "#EF6C00",
    "🌸インターン確定": "#EC407A",
    "内定辞退": "#7F8C8D",
    "不合格": "#BDC3C7",
    "完了": "#95A5A6",
]

func colorForStatus(_ status: String, override hex: String? = nil) -> Color {
    if let h = hex, !h.isEmpty { return Color(hex: h) }
    return Color(hex: statusColors[status] ?? "#95A5A6")
}

func formatDate(_ iso: String) -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: iso) else { return iso }
    let out = DateFormatter()
    out.dateFormat = "M/d(EEE)"
    out.locale = Locale(identifier: "ja_JP")
    return out.string(from: d)
}
