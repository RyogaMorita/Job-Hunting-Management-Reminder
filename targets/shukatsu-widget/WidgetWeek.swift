import WidgetKit
import SwiftUI

// MARK: - Week Widget（今週の予定）

struct WeekEntry: TimelineEntry {
    let date: Date
    let days: [String]                          // 7日ぶんのymd
    let byDay: [String: [WidgetSchedule]]
    let today: String
}

struct WeekProvider: TimelineProvider {

    private func makeEntry(at date: Date, schedules: [WidgetSchedule]) -> WeekEntry {
        let cal = Fmt.jaCalendar
        let start = cal.startOfDay(for: date)
        let days = (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: start) }.map(Ymd.string)

        var byDay: [String: [WidgetSchedule]] = [:]
        for s in schedules where !s.date.isEmpty {
            for ymd in days where s.covers(ymd) {
                byDay[ymd, default: []].append(s)
            }
        }
        return WeekEntry(date: date, days: days, byDay: byDay, today: Ymd.string(date))
    }

    func placeholder(in context: Context) -> WeekEntry {
        makeEntry(at: Date(), schedules: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (WeekEntry) -> Void) {
        completion(makeEntry(at: Date(), schedules: AppGroupHelper.loadSchedules()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WeekEntry>) -> Void) {
        // App Groupの読み込みとJSONデコードは1回で済ませる
        let schedules = AppGroupHelper.loadSchedules()
        let entries = TimelinePlan.dailyBoundaries().map { makeEntry(at: $0, schedules: schedules) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - View

struct WeekWidgetView: View {
    let entry: WeekEntry
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.showsWidgetContainerBackground) private var showsBackground

    private var isFullColor: Bool { renderingMode == .fullColor }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            weekGrid
            Spacer(minLength: 0)
        }
        .padding(showsBackground ? 12 : 6)
        .dynamicTypeSize(.large ... .xxLarge)
    }

    private var header: some View {
        HStack {
            Image(systemName: "calendar")
                .font(.system(size: 11))
                .foregroundStyle(isFullColor ? TDU_ACCENT : .white)
                .widgetAccentable()
            Text("今週の予定")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
            Spacer()
            Text(headerDateRange)
                .font(.system(size: 9))
                .foregroundStyle(.white.opacity(0.55))
        }
    }

    private var headerDateRange: String {
        guard let first = entry.days.first.flatMap(Ymd.date),
              let last = entry.days.last.flatMap(Ymd.date) else { return "" }
        return "\(Fmt.shortMonthDay.string(from: first)) 〜 \(Fmt.shortMonthDay.string(from: last))"
    }

    private var weekGrid: some View {
        HStack(spacing: 2) {
            ForEach(entry.days, id: \.self) { ymd in
                dayColumn(ymd)
            }
        }
    }

    private func dayColumn(_ ymd: String) -> some View {
        let date = Ymd.date(ymd)
        let weekdayIndex = date.map { Fmt.jaCalendar.component(.weekday, from: $0) - 1 } ?? 0
        let isToday = ymd == entry.today
        let items = entry.byDay[ymd] ?? []

        return VStack(spacing: 2) {
            Text(date.map { Fmt.weekdaySymbol.string(from: $0) } ?? "")
                .font(.system(size: 8, weight: .medium))
                .foregroundStyle(weekdayColor(weekdayIndex).opacity(0.6))

            ZStack {
                if isToday {
                    if renderingMode == .vibrant {
                        Circle().strokeBorder(.white, lineWidth: 1.5).frame(width: 20, height: 20)
                    } else {
                        Circle().fill(isFullColor ? TDU_ACCENT : .white).frame(width: 20, height: 20)
                    }
                }
                Text(date.map { "\(Fmt.jaCalendar.component(.day, from: $0))" } ?? "")
                    .font(.system(size: 11, weight: isToday ? .bold : .regular))
                    .monospacedDigit()
                    .foregroundStyle(dayColor(isToday: isToday, weekdayIndex: weekdayIndex))
            }
            .frame(width: 20, height: 20)

            VStack(spacing: 2) {
                ForEach(Array(items.prefix(2).enumerated()), id: \.offset) { _, s in
                    let c = isFullColor ? colorForStatus(s.status, override: s.calendarColor) : Color.white
                    Text(s.company)
                        .font(.system(size: 7, weight: .medium))
                        .foregroundStyle(c)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 1)
                        .frame(maxWidth: .infinity)
                        .background(RoundedRectangle(cornerRadius: 2).fill(c.opacity(0.2)))
                }
                if items.count > 2 {
                    Text("+\(items.count - 2)")
                        .font(.system(size: 7, weight: .bold))
                        .foregroundStyle(.white.opacity(0.5))
                }
                if items.isEmpty {
                    Color.clear.frame(height: 14)
                }
            }
            .frame(maxWidth: .infinity)
        }
        .frame(maxWidth: .infinity)
    }

    private func weekdayColor(_ index: Int) -> Color {
        guard isFullColor else { return .white }
        if index == 0 { return SUN_COLOR }
        if index == 6 { return SAT_COLOR }
        return .white
    }

    private func dayColor(isToday: Bool, weekdayIndex: Int) -> Color {
        if isToday {
            if renderingMode == .vibrant { return .white }
            return isFullColor ? .white : TDU_NAVY
        }
        return weekdayColor(weekdayIndex)
    }
}

// MARK: - Widget定義

struct WeekWidget: Widget {
    let kind = "ShukatsuWeekWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WeekProvider()) { entry in
            WeekWidgetView(entry: entry)
                .containerBackground(for: .widget) { TDU_NAVY }
        }
        .configurationDisplayName("週間スケジュール")
        .description("今後1週間の就活予定をコンパクトに表示")
        .supportedFamilies([.systemMedium])
    }
}
