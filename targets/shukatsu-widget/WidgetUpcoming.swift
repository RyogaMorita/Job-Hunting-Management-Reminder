import WidgetKit
import SwiftUI

// MARK: - Upcoming Widget（直近順持ち駒）

struct UpcomingEntry: TimelineEntry {
    let date: Date
    let schedules: [WidgetSchedule]
}

struct UpcomingProvider: TimelineProvider {
    func placeholder(in context: Context) -> UpcomingEntry {
        UpcomingEntry(date: Date(), schedules: [])
    }
    func getSnapshot(in context: Context, completion: @escaping (UpcomingEntry) -> Void) {
        completion(UpcomingEntry(date: Date(), schedules: AppGroupHelper.upcomingSchedules))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<UpcomingEntry>) -> Void) {
        let entry = UpcomingEntry(date: Date(), schedules: AppGroupHelper.upcomingSchedules)
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

// MARK: - 全サイズ対応View

struct UpcomingAllView: View {
    let entry: UpcomingEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .accessoryRectangular:
            UpcomingRectangularView(entry: entry)
        case .accessoryCircular:
            UpcomingCircularView(entry: entry)
        default:
            UpcomingHomeView(entry: entry)
                .containerBackground(Color(hex: "#031659"), for: .widget)
        }
    }
}

// MARK: - ホーム画面View

struct UpcomingHomeView: View {
    let entry: UpcomingEntry
    @Environment(\.widgetFamily) var family

    private var limit: Int {
        switch family {
        case .systemSmall: return 3
        case .systemLarge: return 8
        default: return 5 // systemMedium
        }
    }

    var body: some View {
        ZStack {
            Color(hex: "#031659")
            VStack(alignment: .leading, spacing: 0) {
                header.padding(.bottom, 6)
                if entry.schedules.isEmpty {
                    Spacer()
                    Text("直近の予定はありません")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.5))
                        .frame(maxWidth: .infinity, alignment: .center)
                    Spacer()
                } else {
                    ForEach(Array(entry.schedules.prefix(limit))) { s in
                        scheduleRow(s)
                        if s.id != entry.schedules.prefix(limit).last?.id {
                            Divider()
                                .background(Color.white.opacity(0.1))
                                .padding(.vertical, 2)
                        }
                    }
                    Spacer(minLength: 0)
                }
            }
            .padding(12)
            .clipped()
        }
    }

    private var header: some View {
        HStack {
            Image(systemName: "clock.fill")
                .font(.system(size: 11))
                .foregroundColor(Color(hex: "#4A90D9"))
            Text("直近の持ち駒")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
            Spacer()
            Text("\(entry.schedules.count)社")
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.6))
        }
    }

    private func scheduleRow(_ s: WidgetSchedule) -> some View {
        HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2)
                .fill(colorForStatus(s.status, override: s.calendarColor))
                .frame(width: 3, height: 18)
            Text(s.status)
                .font(.system(size: 9))
                .foregroundColor(colorForStatus(s.status, override: s.calendarColor))
                .lineLimit(1)
                .fixedSize()
            Text(s.company)
                .font(.system(size: family == .systemSmall ? 10 : 11, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(1)
            Spacer(minLength: 2)
            if !s.date.isEmpty {
                Text(formatDate(s.date) + (s.hour.isEmpty ? "" : " \(s.hour):\(s.minute)"))
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(1)
                    .fixedSize()
            }
        }
    }
}

// MARK: - ロック画面 横長View

struct UpcomingRectangularView: View {
    let entry: UpcomingEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            if entry.schedules.isEmpty {
                Text("直近の予定なし")
                    .font(.system(size: 11))
            } else {
                ForEach(Array(entry.schedules.prefix(2))) { s in
                    HStack(spacing: 4) {
                        Text(formatDate(s.date))
                            .font(.system(size: 10, weight: .semibold))
                        Text(s.company)
                            .font(.system(size: 10))
                            .lineLimit(1)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - ロック画面 円形View

struct UpcomingCircularView: View {
    let entry: UpcomingEntry

    var body: some View {
        ZStack {
            if let next = entry.schedules.first {
                VStack(spacing: 0) {
                    Text(daysUntil(next.date))
                        .font(.system(size: 18, weight: .bold))
                        .minimumScaleFactor(0.6)
                    Text("日後")
                        .font(.system(size: 9))
                }
            } else {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 22))
            }
        }
    }

    private func daysUntil(_ iso: String) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        guard let target = f.date(from: iso) else { return "-" }
        let days = Calendar.current.dateComponents(
            [.day],
            from: Calendar.current.startOfDay(for: Date()),
            to: target
        ).day ?? 0
        return String(days)
    }
}

// MARK: - Widget定義

struct UpcomingWidget: Widget {
    let kind = "ShukatsuUpcomingWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UpcomingProvider()) { entry in
            UpcomingAllView(entry: entry)
        }
        .configurationDisplayName("直近の持ち駒")
        .description("日程が近い順に選考中の企業を表示")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryCircular])
    }
}
