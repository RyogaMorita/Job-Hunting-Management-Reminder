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
        let nextUpdate = Calendar.current.startOfDay(for: Calendar.current.date(byAdding: .day, value: 1, to: Date())!)
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct UpcomingWidgetView: View {
    let entry: UpcomingEntry
    @Environment(\.widgetFamily) var family

    private var limit: Int { family == .systemSmall ? 3 : 6 }

    var body: some View {
        ZStack {
            Color(hex: "#031659")
            VStack(alignment: .leading, spacing: 0) {
                header
                    .padding(.bottom, 6)
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
                    Spacer()
                }
            }
            .padding(12)
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
        HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2)
                .fill(colorForStatus(s.status, override: s.calendarColor))
                .frame(width: 3, height: family == .systemSmall ? 28 : 22)

            VStack(alignment: .leading, spacing: 1) {
                Text(s.company)
                    .font(.system(size: family == .systemSmall ? 11 : 12, weight: .semibold))
                    .foregroundColor(.white)
                    .lineLimit(1)
                HStack(spacing: 4) {
                    Text(s.status)
                        .font(.system(size: 9))
                        .foregroundColor(colorForStatus(s.status, override: s.calendarColor))
                    if family != .systemSmall {
                        Text("·")
                            .font(.system(size: 9))
                            .foregroundColor(.white.opacity(0.4))
                        Text(formatDate(s.date))
                            .font(.system(size: 9))
                            .foregroundColor(.white.opacity(0.7))
                    }
                }
            }

            Spacer()

            if family == .systemSmall {
                Text(formatDate(s.date))
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.7))
            } else {
                if !s.hour.isEmpty && s.hour != "0" {
                    Text(String(format: "%@:%@", s.hour, s.minute.isEmpty ? "00" : s.minute))
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                }
            }
        }
    }
}

struct UpcomingWidget: Widget {
    let kind = "ShukatsuUpcomingWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: UpcomingProvider()) { entry in
            UpcomingWidgetView(entry: entry)
                .containerBackground(Color(hex: "#031659"), for: .widget)
        }
        .configurationDisplayName("直近の持ち駒")
        .description("日程が近い順に選考中の企業を表示")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
