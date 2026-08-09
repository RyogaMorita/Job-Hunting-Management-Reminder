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
        // 同着の並びが揺れるとタイムラインのエントリごとに並び替わって見えるので、
        // 時刻・企業名・IDまで見て順序を確定させる
        let list = schedules
            .filter { !INACTIVE_STATUSES.contains($0.status) && !$0.date.isEmpty && $0.effectiveEnd >= today }
            .sorted { a, b in
                if a.date != b.date { return a.date < b.date }
                let ta = a.hour + a.minute, tb = b.hour + b.minute
                if ta != tb { return ta < tb }
                if a.company != b.company { return a.company < b.company }
                return a.id < b.id
            }
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
            // ロック画面のウィジェットもDynamic Typeで拡大され、スクロールで逃げられない
            UpcomingRectangularView(entry: entry)
                .dynamicTypeSize(.large ... .xxLarge)
                .containerBackground(for: .widget) { EmptyView() }
        case .accessoryCircular:
            UpcomingCircularView(entry: entry)
                .dynamicTypeSize(.large ... .xxLarge)
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
        // small は heroBody を使うのでここには来ない
        family == .systemLarge ? 8 : 5
    }

    private var visible: [WidgetSchedule] { Array(entry.schedules.prefix(limit)) }

    @ViewBuilder
    var body: some View {
        // 小サイズは一覧にすると1行が9ptになり結局読めない。
        // 「次に何があるか」だけを大きく出す。
        if isSmall {
            heroBody
        } else {
            listBody
        }
    }

    /// 次の予定を1件だけ大きく見せる
    private var heroBody: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Image(systemName: "clock.fill")
                    .font(.system(size: 10))
                    .foregroundStyle(isFullColor ? TDU_ACCENT : .white)
                    .widgetAccentable()
                Text("次の予定")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white.opacity(0.7))
            }
            Spacer(minLength: 4)
            if let s = entry.schedules.first {
                let color = isFullColor ? colorForStatus(s.status, override: s.calendarColor) : Color.white
                Text(s.company)
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                Text(s.status)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(color)
                    .lineLimit(1)
                    .invalidatableContent()
                Spacer(minLength: 4)
                if let rel = relativeDayLabel(s.date, from: entry.today) {
                    Text(rel)
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.white)
                        .monospacedDigit()
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                }
                HStack(spacing: 4) {
                    Text(formatDateRange(s))
                    if !s.hour.isEmpty {
                        Text("\(s.hour):\(s.minute.isEmpty ? "00" : s.minute)")
                            .monospacedDigit()
                    }
                }
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.6))
                .lineLimit(1)
            } else {
                Spacer()
                Text("予定はありません")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
                Spacer()
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(showsBackground ? 12 : 6)
        .dynamicTypeSize(.large ... .xxLarge)
    }

    private var listBody: some View {
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

            // 小サイズは幅が足りない。時刻を省き、fixedSize も外して企業名を残す
            Text(formatDateRange(s) + (isSmall || s.hour.isEmpty ? "" : " \(s.hour):\(s.minute)"))
                .font(.system(size: 9, weight: isToday ? .bold : .regular))
                .foregroundStyle(isToday ? color : .white.opacity(0.7))
                .lineLimit(1)
                .minimumScaleFactor(isSmall ? 0.8 : 1)
                .layoutPriority(isSmall ? 0 : 1)

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
        .description("小サイズは次の予定を1件だけ大きく表示。中・大サイズは日程が近い順に一覧表示し、→ボタンで選考を次の段階へ進められます。")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryRectangular, .accessoryCircular])
    }
}
