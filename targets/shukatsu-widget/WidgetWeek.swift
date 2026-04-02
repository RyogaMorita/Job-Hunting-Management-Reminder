import WidgetKit
import SwiftUI

// MARK: - Week Widget（2週間カレンダー）

struct WeekEntry: TimelineEntry {
    let date: Date
    let schedules: [WidgetSchedule]
}

struct WeekProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeekEntry {
        WeekEntry(date: Date(), schedules: [])
    }
    func getSnapshot(in context: Context, completion: @escaping (WeekEntry) -> Void) {
        completion(WeekEntry(date: Date(), schedules: AppGroupHelper.loadSchedules()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WeekEntry>) -> Void) {
        let entry = WeekEntry(date: Date(), schedules: AppGroupHelper.loadSchedules())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

// MARK: - View

struct WeekWidgetView: View {
    let entry: WeekEntry
    @Environment(\.widgetFamily) var family

    private var dayCount: Int { 7 }

    private var days: [Date] {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        return (0..<dayCount).compactMap { cal.date(byAdding: .day, value: $0, to: today) }
    }

    private var schedulesMap: [String: [WidgetSchedule]] {
        var map: [String: [WidgetSchedule]] = [:]
        for s in entry.schedules {
            map[s.date, default: []].append(s)
        }
        return map
    }

    var body: some View {
        ZStack {
            Color(hex: "#031659")
            VStack(alignment: .leading, spacing: 6) {
                header
                weekGrid
                Spacer(minLength: 0)
            }
            .padding(12)
        }
    }

    // MARK: Header

    private var header: some View {
        HStack {
            Image(systemName: "calendar")
                .font(.system(size: 11))
                .foregroundColor(Color(hex: "#4A90D9"))
            Text(family == .systemLarge ? "2週間の予定" : "今週の予定")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
            Spacer()
            Text(headerDateRange)
                .font(.system(size: 9))
                .foregroundColor(.white.opacity(0.5))
        }
    }

    private var headerDateRange: String {
        guard let first = days.first, let last = days.last else { return "" }
        let f = DateFormatter()
        f.dateFormat = "M/d"
        f.locale = Locale(identifier: "ja_JP")
        return "\(f.string(from: first)) 〜 \(f.string(from: last))"
    }

    // MARK: Week Grid

    private var weekGrid: some View {
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        let isoFormatter = DateFormatter()
        isoFormatter.dateFormat = "yyyy-MM-dd"

        let weekdays = ["月", "火", "水", "木", "金", "土", "日"]
        let dayFormatter = DateFormatter()
        dayFormatter.dateFormat = "d"
        dayFormatter.locale = Locale(identifier: "ja_JP")

        let weekdayFormatter = DateFormatter()
        weekdayFormatter.dateFormat = "E"
        weekdayFormatter.locale = Locale(identifier: "ja_JP")

        return HStack(spacing: 2) {
            ForEach(days, id: \.self) { day in
                let iso = isoFormatter.string(from: day)
                let isToday = cal.isDate(day, inSameDayAs: today)
                let items = schedulesMap[iso] ?? []
                let weekdayStr = weekdayFormatter.string(from: day)
                let isSat = weekdayStr == "土"
                let isSun = weekdayStr == "日"

                VStack(spacing: 2) {
                    // 曜日
                    Text(weekdayStr)
                        .font(.system(size: 8, weight: .medium))
                        .foregroundColor(
                            isSat ? Color(hex: "#4A90D9") :
                            isSun ? Color(hex: "#E74C3C") :
                            .white.opacity(0.5)
                        )

                    // 日付
                    ZStack {
                        if isToday {
                            Circle()
                                .fill(Color(hex: "#4A90D9"))
                                .frame(width: 20, height: 20)
                        }
                        Text(dayFormatter.string(from: day))
                            .font(.system(size: 11, weight: isToday ? .bold : .regular))
                            .foregroundColor(
                                isToday ? .white :
                                isSat ? Color(hex: "#4A90D9") :
                                isSun ? Color(hex: "#E74C3C") :
                                .white
                            )
                    }
                    .frame(width: 20, height: 20)

                    // 企業名ラベル（最大2件）
                    VStack(spacing: 2) {
                        ForEach(Array(items.prefix(2).enumerated()), id: \.offset) { _, s in
                            Text(s.company)
                                .font(.system(size: 7, weight: .medium))
                                .foregroundColor(colorForStatus(s.status, override: s.calendarColor))
                                .lineLimit(1)
                                .truncationMode(.tail)
                                .padding(.horizontal, 3)
                                .padding(.vertical, 1)
                                .background(
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(colorForStatus(s.status, override: s.calendarColor).opacity(0.2))
                                )
                        }
                        if items.isEmpty {
                            Color.clear.frame(height: 14)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                .frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: Upcoming list (large only)

    private var upcomingList: some View {
        let isoFormatter = DateFormatter()
        isoFormatter.dateFormat = "yyyy-MM-dd"
        let endIso = isoFormatter.string(from: Calendar.current.date(byAdding: .day, value: dayCount, to: Date())!)
        let todayIso = AppGroupHelper.isoToday()
        let items = entry.schedules
            .filter { $0.date >= todayIso && $0.date < endIso }
            .sorted { $0.date < $1.date }
            .prefix(5)

        return VStack(alignment: .leading, spacing: 3) {
            if items.isEmpty {
                Text("この期間に予定はありません")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.4))
                    .padding(.top, 4)
            } else {
                ForEach(Array(items)) { s in
                    HStack(spacing: 6) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(colorForStatus(s.status, override: s.calendarColor))
                            .frame(width: 3, height: 14)
                        Text(formatDate(s.date))
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                            .frame(width: 52, alignment: .leading)
                        Text(s.company)
                            .font(.system(size: 11))
                            .foregroundColor(.white)
                            .lineLimit(1)
                        Spacer()
                        Text(s.status)
                            .font(.system(size: 9))
                            .foregroundColor(colorForStatus(s.status, override: s.calendarColor))
                            .lineLimit(1)
                    }
                }
            }
        }
    }
}

// MARK: - Widget定義

struct WeekWidget: Widget {
    let kind = "ShukatsuWeekWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WeekProvider()) { entry in
            WeekWidgetView(entry: entry)
                .containerBackground(Color(hex: "#031659"), for: .widget)
        }
        .configurationDisplayName("週間スケジュール")
        .description("今後1週間の就活予定をコンパクトに表示")
        .supportedFamilies([.systemMedium])
    }
}
