import WidgetKit
import SwiftUI

// MARK: - Calendar Widget

struct CalendarEntry: TimelineEntry {
    let date: Date
    let schedules: [WidgetSchedule]
}

struct CalendarProvider: TimelineProvider {
    func placeholder(in context: Context) -> CalendarEntry {
        CalendarEntry(date: Date(), schedules: [])
    }
    func getSnapshot(in context: Context, completion: @escaping (CalendarEntry) -> Void) {
        completion(CalendarEntry(date: Date(), schedules: AppGroupHelper.loadSchedules()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CalendarEntry>) -> Void) {
        let entry = CalendarEntry(date: Date(), schedules: AppGroupHelper.loadSchedules())
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct CalendarWidgetView: View {
    let entry: CalendarEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        ZStack {
            Color(hex: "#031659")
            VStack(spacing: 4) {
                calendarHeader
                calendarGrid
                if family == .systemLarge {
                    Divider().background(Color.white.opacity(0.3)).padding(.horizontal, 8)
                    upcomingList
                }
            }
            .padding(10)
        }
    }

    // MARK: Header

    private var calendarHeader: some View {
        let cal = Calendar.current
        let now = Date()
        let month = cal.component(.month, from: now)
        let year = cal.component(.year, from: now)
        return HStack {
            Image("calendarIcon")
                .resizable()
                .scaledToFit()
                .frame(width: 14, height: 14)
            Text(String(format: "%d年%d月", year, month))
                .font(.system(size: 13, weight: .bold))
                .foregroundColor(.white)
            Spacer()
            Text("就活管理")
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.6))
        }
    }

    // MARK: Calendar Grid

    private var calendarGrid: some View {
        let cal = Calendar.current
        let now = Date()
        let today = AppGroupHelper.isoToday()
        let datesWithSchedules = Set(entry.schedules.map { $0.date })

        let comps = cal.dateComponents([.year, .month], from: now)
        let firstDay = cal.date(from: comps)!
        let weekday = (cal.component(.weekday, from: firstDay) + 5) % 7 // Mon=0
        let range = cal.range(of: .day, in: .month, for: now)!
        let totalDays = range.count
        let year = cal.component(.year, from: now)
        let month = cal.component(.month, from: now)

        // 先月の末日を計算
        let prevMonthLastDay: Int
        if let prevMonth = cal.date(byAdding: .month, value: -1, to: firstDay) {
            prevMonthLastDay = cal.range(of: .day, in: .month, for: prevMonth)!.count
        } else {
            prevMonthLastDay = 30
        }

        let weekLabels = ["月", "火", "水", "木", "金", "土", "日"]
        let rows = Int(ceil(Double(weekday + totalDays) / 7.0))

        return VStack(spacing: 2) {
            // 曜日ラベル
            HStack(spacing: 0) {
                ForEach(weekLabels, id: \.self) { label in
                    Text(label)
                        .font(.system(size: 9, weight: .medium))
                        .foregroundColor(label == "土" ? Color(hex: "#4A90D9") : label == "日" ? Color(hex: "#E74C3C") : .white.opacity(0.6))
                        .frame(maxWidth: .infinity)
                }
            }

            // 日付セル
            ForEach(0..<rows, id: \.self) { row in
                HStack(spacing: 0) {
                    ForEach(0..<7, id: \.self) { col in
                        let idx = row * 7 + col
                        let day = idx - weekday + 1

                        if day < 1 {
                            // 先月の日
                            let prevDay = prevMonthLastDay + day
                            Text(String(format: "%d", prevDay))
                                .font(.system(size: 10))
                                .foregroundColor(.white.opacity(0.2))
                                .frame(maxWidth: .infinity)
                                .frame(height: 20)
                        } else if day > totalDays {
                            // 来月の日
                            let nextDay = day - totalDays
                            Text(String(format: "%d", nextDay))
                                .font(.system(size: 10))
                                .foregroundColor(.white.opacity(0.2))
                                .frame(maxWidth: .infinity)
                                .frame(height: 20)
                        } else {
                            let isoDate = String(format: "%04d-%02d-%02d", year, month, day)
                            let isToday = isoDate == today
                            let hasEvent = datesWithSchedules.contains(isoDate)
                            let isSat = col == 5
                            let isSun = col == 6

                            ZStack {
                                if isToday {
                                    Circle()
                                        .fill(Color(hex: "#4A90D9"))
                                        .frame(width: 18, height: 18)
                                }
                                Text(String(format: "%d", day))
                                    .font(.system(size: 10, weight: isToday ? .bold : .regular))
                                    .foregroundColor(
                                        isToday ? .white :
                                        isSat ? Color(hex: "#4A90D9") :
                                        isSun ? Color(hex: "#E74C3C") :
                                        .white
                                    )
                                if hasEvent && !isToday {
                                    Circle()
                                        .fill(Color(hex: "#E91E8C"))
                                        .frame(width: 4, height: 4)
                                        .offset(y: 7)
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 20)
                        }
                    }
                }
            }
        }
    }

    // MARK: Upcoming list (large only)

    private var upcomingList: some View {
        let items = AppGroupHelper.upcomingSchedules.prefix(4)
        return VStack(alignment: .leading, spacing: 3) {
            ForEach(Array(items)) { s in
                HStack(spacing: 6) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(colorForStatus(s.status, override: s.calendarColor))
                        .frame(width: 3, height: 14)
                    Text(s.company)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Spacer()
                    Text(formatDate(s.date))
                        .font(.system(size: 10))
                        .foregroundColor(.white.opacity(0.7))
                }
            }
            if items.isEmpty {
                Text("直近の予定はありません")
                    .font(.system(size: 11))
                    .foregroundColor(.white.opacity(0.5))
            }
        }
    }
}

struct CalendarWidget: Widget {
    let kind = "ShukatsuCalendarWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CalendarProvider()) { entry in
            CalendarWidgetView(entry: entry)
                .containerBackground(Color(hex: "#031659"), for: .widget)
        }
        .configurationDisplayName("就活カレンダー")
        .description("その月の選考スケジュールをカレンダーで表示")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
