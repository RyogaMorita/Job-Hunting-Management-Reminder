import WidgetKit
import SwiftUI

// MARK: - List Widget（持ち駒一覧）

struct ListEntry: TimelineEntry {
    let date: Date
    let schedules: [WidgetSchedule]
}

struct ListProvider: TimelineProvider {
    func placeholder(in context: Context) -> ListEntry {
        ListEntry(date: Date(), schedules: [])
    }
    func getSnapshot(in context: Context, completion: @escaping (ListEntry) -> Void) {
        completion(ListEntry(date: Date(), schedules: AppGroupHelper.activeSchedules))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ListEntry>) -> Void) {
        let entry = ListEntry(date: Date(), schedules: AppGroupHelper.activeSchedules)
        let nextUpdate = Calendar.current.startOfDay(for: Calendar.current.date(byAdding: .day, value: 1, to: Date())!)
        completion(Timeline(entries: [entry], policy: .after(nextUpdate)))
    }
}

struct ListWidgetView: View {
    let entry: ListEntry
    @Environment(\.widgetFamily) var family

    private var limit: Int { family == .systemMedium ? 5 : 10 }

    // ステータス優先度（選考段階が進んでいるものを上に）
    private let statusOrder = ["最終面接", "2次面接", "1次面接", "GD", "ES締切", "ES提出済", "説明会", "検討中", "内定"]

    private var sortedSchedules: [WidgetSchedule] {
        entry.schedules.sorted { a, b in
            let ia = statusOrder.firstIndex(of: a.status) ?? 99
            let ib = statusOrder.firstIndex(of: b.status) ?? 99
            if ia != ib { return ia < ib }
            return a.company < b.company
        }
    }

    var body: some View {
        ZStack {
            Color(hex: "#031659")
            VStack(alignment: .leading, spacing: 0) {
                header
                    .padding(.bottom, 6)
                if entry.schedules.isEmpty {
                    Spacer()
                    Text("持ち駒がありません")
                        .font(.system(size: 12))
                        .foregroundColor(.white.opacity(0.5))
                        .frame(maxWidth: .infinity, alignment: .center)
                    Spacer()
                } else {
                    ForEach(Array(sortedSchedules.prefix(limit).enumerated()), id: \.element.id) { idx, s in
                        listRow(s, index: idx)
                        if idx < min(limit, sortedSchedules.count) - 1 {
                            Divider()
                                .background(Color.white.opacity(0.1))
                                .padding(.vertical, 1)
                        }
                    }
                    Spacer()
                    if sortedSchedules.count > limit {
                        Text("他 \(sortedSchedules.count - limit) 社")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.4))
                            .frame(maxWidth: .infinity, alignment: .trailing)
                    }
                }
            }
            .padding(12)
        }
    }

    private var header: some View {
        HStack {
            Image(systemName: "list.bullet.clipboard.fill")
                .font(.system(size: 11))
                .foregroundColor(Color(hex: "#4A90D9"))
            Text("持ち駒一覧")
                .font(.system(size: 12, weight: .bold))
                .foregroundColor(.white)
            Spacer()
            Text("計 \(entry.schedules.count) 社")
                .font(.system(size: 10))
                .foregroundColor(.white.opacity(0.6))
        }
    }

    private func listRow(_ s: WidgetSchedule, index: Int) -> some View {
        HStack(spacing: 6) {
            // ステータスカラーバー
            RoundedRectangle(cornerRadius: 2)
                .fill(colorForStatus(s.status, override: s.calendarColor))
                .frame(width: 3, height: 20)

            // ステータスバッジ
            Text(s.status)
                .font(.system(size: 8, weight: .medium))
                .foregroundColor(colorForStatus(s.status, override: s.calendarColor))
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 3)
                        .fill(colorForStatus(s.status, override: s.calendarColor).opacity(0.2))
                )
                .lineLimit(1)

            // 企業名
            Text(s.company)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .lineLimit(1)

            Spacer()

            // 日付
            if !s.date.isEmpty {
                Text(formatDate(s.date))
                    .font(.system(size: 9))
                    .foregroundColor(.white.opacity(0.6))
            }
        }
    }
}

struct ListWidget: Widget {
    let kind = "ShukatsuListWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ListProvider()) { entry in
            ListWidgetView(entry: entry)
                .containerBackground(Color(hex: "#031659"), for: .widget)
        }
        .configurationDisplayName("持ち駒一覧")
        .description("選考段階別に持ち駒企業を一覧表示")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
