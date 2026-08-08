import WidgetKit
import SwiftUI

// MARK: - List Widget（持ち駒一覧）

struct ListEntry: TimelineEntry {
    let date: Date
    let schedules: [WidgetSchedule]
}

/// 選考段階が進んでいるものを上に。
/// 内定・不合格などは activeSchedules の時点で除外されるので含めない。
private let STATUS_ORDER = [
    "最終面接", "2次面接", "1次面接", "GD", "Webテスト", "ES提出済", "ES締切",
    "ワークショップ", "説明会", "検討中",
    "インターン面接", "インターンES締切", "インターン確定", "🌸インターン確定",
]

struct ListProvider: TimelineProvider {

    private func makeEntry(at date: Date, schedules: [WidgetSchedule]) -> ListEntry {
        let sorted = schedules.sorted { a, b in
            let ia = STATUS_ORDER.firstIndex(of: a.status) ?? 99
            let ib = STATUS_ORDER.firstIndex(of: b.status) ?? 99
            if ia != ib { return ia < ib }
            return a.company < b.company
        }
        return ListEntry(date: date, schedules: sorted)
    }

    func placeholder(in context: Context) -> ListEntry {
        makeEntry(at: Date(), schedules: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (ListEntry) -> Void) {
        completion(makeEntry(at: Date(), schedules: AppGroupHelper.activeSchedules))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ListEntry>) -> Void) {
        // App Groupの読み込みとJSONデコードは1回で済ませる
        let schedules = AppGroupHelper.activeSchedules
        let entries = TimelinePlan.dailyBoundaries().map { makeEntry(at: $0, schedules: schedules) }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

struct ListWidgetView: View {
    let entry: ListEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.showsWidgetContainerBackground) private var showsBackground

    private var isFullColor: Bool { renderingMode == .fullColor }
    private var limit: Int { family == .systemMedium ? 5 : 10 }
    private var visible: [WidgetSchedule] { Array(entry.schedules.prefix(limit)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header.padding(.bottom, 6)
            if entry.schedules.isEmpty {
                Spacer()
                Text("持ち駒がありません")
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.5))
                    .frame(maxWidth: .infinity, alignment: .center)
                Spacer()
            } else {
                ForEach(Array(visible.enumerated()), id: \.element.id) { idx, s in
                    listRow(s)
                    if idx < visible.count - 1 {
                        Divider().background(.white.opacity(0.1)).padding(.vertical, 1)
                    }
                }
                Spacer(minLength: 0)
                if entry.schedules.count > limit {
                    Text("他 \(entry.schedules.count - limit) 社")
                        .font(.system(size: 10))
                        .foregroundStyle(.white.opacity(0.4))
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
            }
        }
        .padding(showsBackground ? 12 : 6)
        .dynamicTypeSize(.large ... .xxLarge)
    }

    private var header: some View {
        HStack {
            Image(systemName: "list.bullet.clipboard.fill")
                .font(.system(size: 11))
                .foregroundStyle(isFullColor ? TDU_ACCENT : .white)
                .widgetAccentable()
            Text("持ち駒一覧")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(.white)
            Spacer()
            Text("計 \(entry.schedules.count) 社")
                .font(.system(size: 10))
                .foregroundStyle(.white.opacity(0.6))
        }
    }

    private func listRow(_ s: WidgetSchedule) -> some View {
        let color = isFullColor ? colorForStatus(s.status, override: s.calendarColor) : Color.white
        return HStack(spacing: 6) {
            RoundedRectangle(cornerRadius: 2)
                .fill(color)
                .frame(width: 3, height: 20)

            Text(s.status)
                .font(.system(size: 8, weight: .medium))
                .foregroundStyle(color)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 3).fill(color.opacity(0.2)))
                .lineLimit(1)

            Text(s.company)
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.white)
                .lineLimit(1)

            Spacer()

            if !s.date.isEmpty {
                Text(formatDateRange(s))
                    .font(.system(size: 9))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
            }
        }
    }
}

struct ListWidget: Widget {
    let kind = "ShukatsuListWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ListProvider()) { entry in
            ListWidgetView(entry: entry)
                .containerBackground(for: .widget) { TDU_NAVY }
        }
        .configurationDisplayName("持ち駒一覧")
        .description("選考段階別に持ち駒企業を一覧表示")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
