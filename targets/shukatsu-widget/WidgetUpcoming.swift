import WidgetKit
import SwiftUI
import AppIntents

// MARK: - Upcoming Widget（直近順持ち駒）

struct UpcomingEntry: TimelineEntry {
    let date: Date
    let schedules: [WidgetSchedule]
    let today: String
}

struct UpcomingProvider: TimelineProvider {

    private func makeEntry(at date: Date, schedules: [WidgetSchedule]) -> UpcomingEntry {
        let today = Ymd.string(date)
        let list = schedules
            .filter { !INACTIVE_STATUSES.contains($0.status) && !$0.date.isEmpty && $0.effectiveEnd >= today }
            .sorted { $0.date < $1.date }
        return UpcomingEntry(date: date, schedules: list, today: today)
    }

    func placeholder(in context: Context) -> UpcomingEntry {
        makeEntry(at: Date(), schedules: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (UpcomingEntry) -> Void) {
        completion(makeEntry(at: Date(), schedules: AppGroupHelper.loadSchedules()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<UpcomingEntry>) -> Void) {
        // App Groupの読み込みとJSONデコードは1回で済ませる
        let schedules = AppGroupHelper.loadSchedules()
        let entries = TimelinePlan.dailyBoundaries().map { makeEntry(at: $0, schedules: schedules) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - 全サイズ対応View

struct UpcomingAllView: View {
    let entry: UpcomingEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        switch family {
        case .accessoryRectangular:
            UpcomingRectangularView(entry: entry)
                .containerBackground(for: .widget) { EmptyView() }
        case .accessoryCircular:
            UpcomingCircularView(entry: entry)
                .containerBackground(for: .widget) { EmptyView() }
        default:
            UpcomingHomeView(entry: entry)
                .containerBackground(for: .widget) { TDU_NAVY }
        }
    }
}

// MARK: - ホーム画面View

struct UpcomingHomeView: View {
    let entry: UpcomingEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.showsWidgetContainerBackground) private var showsBackground

    private var isFullColor: Bool { renderingMode == .fullColor }
    private var isSmall: Bool { family == .systemSmall }

    private var limit: Int {
        switch family {
        case .systemSmall: return 3
        case .systemLarge: return 8
        default: return 5
        }
    }

    private var visible: [WidgetSchedule] { Array(entry.schedules.prefix(limit)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.padding(.bottom, 6)
            if entry.schedules.isEmpty {
                Spacer()
                Text("直近の予定はありません")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
                    .frame(maxWidth: .infinity, alignment: .center)
                Spacer()
            } else {
                ForEach(Array(visible.enumerated()), id: \.element.id) { idx, s in
                    scheduleRow(s)
                    if idx < visible.count - 1 {
                        Divider().background(.white.opacity(0.1)).padding(.vertical, 2)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .padding(showsBackground ? 12 : 6)
        .dynamicTypeSize(.large ... .xxLarge)
    }

    private var header: some View {
        HStack {
            Image(systemName: "clock.fill")
                .font(.system(size: 11))
                .foregroundStyle(isFullColor ? TDU_ACCENT : .white)
                .widgetAccentable()
            Text("直近の持ち駒")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
            Spacer()
            Text("\(entry.schedules.count)社")
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.6))
        }
    }

    private func scheduleRow(_ s: WidgetSchedule) -> some View {
        let isToday = s.covers(entry.today)
        let color = isFullColor
            ? (isToday ? Color.yellow : colorForStatus(s.status, override: s.calendarColor))
            : Color.white

        return HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(width: 3, height: 18)

            Text(s.status)
                .font(.system(size: 9))
                .foregroundStyle(color)
                .lineLimit(1)
                .fixedSize()
                // →ボタン押下後、新しいタイムラインが届くまでシステムが淡く表示する
                .invalidatableContent()

            Text(s.company)
                .font(.system(size: isSmall ? 10 : 11, weight: isToday ? .bold : .semibold))
                .foregroundStyle(.white.opacity(isToday ? 1 : 0.85))
                .lineLimit(1)

            Spacer(minLength: 2)

            Text(formatDateRange(s) + (s.hour.isEmpty ? "" : " \(s.hour):\(s.minute)"))
                .font(.system(size: 9, weight: isToday ? .bold : .regular))
                .foregroundStyle(isToday ? color : .white.opacity(0.7))
                .lineLimit(1)
                .fixedSize()

            // 小サイズは幅が足りないのでボタンを出さない
            if !isSmall, let next = nextStatus(s.status) {
                Button(intent: AdvanceStatusIntent(scheduleID: s.id, expectedStatus: s.status)) {
                    Image(systemName: "arrow.right.circle.fill")
                        .font(.system(size: 14))
                        .frame(width: 20, height: 20)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(color.opacity(0.85))
                .accessibilityLabel("\(s.company) を \(next) へ進める")
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
                Text("直近の予定なし").font(.system(size: 12))
            } else {
                ForEach(Array(entry.schedules.prefix(2))) { s in
                    HStack(spacing: 4) {
                        Text(formatDateRange(s))
                            .font(.system(size: 11, weight: .semibold))
                            .widgetAccentable()
                        Text(s.company)
                            .font(.system(size: 11))
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
            AccessoryWidgetBackground()
            if let next = entry.schedules.first {
                VStack(spacing: -1) {
                    Text(daysUntil(next.date))
                        .font(.system(size: 19, weight: .bold))
                        .monospacedDigit()
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                    Text("日後")
                        .font(.system(size: 9))
                }
            } else {
                Image(systemName: "checkmark.circle.fill").font(.system(size: 22))
            }
        }
    }

    private func daysUntil(_ iso: String) -> String {
        guard let target = Ymd.date(iso) else { return "-" }
        let days = Fmt.jaCalendar.dateComponents(
            [.day], from: Fmt.jaCalendar.startOfDay(for: entry.date), to: target
        ).day ?? 0
        return String(max(0, days))
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
        .description("日程が近い順に選考中の企業を表示。→ボタンで選考を次の段階へ進められます。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryCircular])
    }
}
