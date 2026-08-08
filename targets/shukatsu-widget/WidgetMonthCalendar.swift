import WidgetKit
import SwiftUI
import AppIntents

// MARK: - 月間カレンダーウィジェット
//
// ウィジェットはスワイプを扱えない（タップと iOS17+ の Button/Toggle のみ）ため、
// 月の移動は ◀ ▶ ボタン（AppIntent）で行う。

struct MonthCalendarEntry: TimelineEntry {
    let date: Date
    let layout: MonthLayout
}

struct MonthCalendarProvider: TimelineProvider {

    /// 段数はウィジェットの高さに合わせる。溢れた分は "+N" にまとまる。
    private func maxLanes(for context: Context, rows: Int) -> Int {
        switch context.family {
        case .systemLarge: return rows >= 6 ? 2 : 3
        default: return 1
        }
    }

    private func makeEntry(
        at date: Date, offset: Int, context: Context, schedules: [WidgetSchedule]
    ) -> MonthCalendarEntry {
        // 段数を決めるために週数だけ先に求める（空配列なのでレーン計算は走らない）
        let probe = CalendarLayout.build(schedules: [], monthOffset: offset, maxLanes: 1, now: date)
        let lanes = maxLanes(for: context, rows: probe.weeks.count)
        let layout = CalendarLayout.build(schedules: schedules, monthOffset: offset, maxLanes: lanes, now: date)
        return MonthCalendarEntry(date: date, layout: layout)
    }

    func placeholder(in context: Context) -> MonthCalendarEntry {
        makeEntry(at: Date(), offset: 0, context: context, schedules: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (MonthCalendarEntry) -> Void) {
        completion(makeEntry(
            at: Date(), offset: AppGroupHelper.monthOffset,
            context: context, schedules: AppGroupHelper.loadSchedules()
        ))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MonthCalendarEntry>) -> Void) {
        let offset = AppGroupHelper.monthOffset
        // App Groupの読み込みとJSONデコードは1回で済ませる
        let schedules = AppGroupHelper.loadSchedules()

        // 先頭（＝今）だけ現在のオフセットを反映し、深夜0時以降のエントリは 0 で作る。
        // monthOffset は日付が変わると 0 に戻る仕様なので、未来ぶんを今のオフセットで
        // 焼き込むと表示とずれてしまうため。
        let entries = TimelinePlan.dailyBoundaries().enumerated().map { i, date in
            makeEntry(at: date, offset: i == 0 ? offset : 0, context: context, schedules: schedules)
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - View

struct MonthCalendarView: View {
    let entry: MonthCalendarEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var renderingMode
    @Environment(\.showsWidgetContainerBackground) private var showsBackground

    private var isLarge: Bool { family == .systemLarge }
    private var laneHeight: CGFloat { isLarge ? 11 : 4 }
    private var laneSpacing: CGFloat { isLarge ? 1.5 : 1 }

    /// 帯を描く領域の高さ。全週で同じにして行の高さを揃える。
    private var barsAreaHeight: CGFloat {
        let n = CGFloat(entry.layout.laneCount)
        return n * laneHeight + max(0, n - 1) * laneSpacing
    }

    /// accented（iOS18のホーム画面色変更）と vibrant（ロック画面）では
    /// 色がアルファチャンネル基準で白に潰れるため、不透明度で差をつける。
    private var isFullColor: Bool { renderingMode == .fullColor }

    private func barColor(_ hex: String) -> Color {
        isFullColor ? Color(hex: hex) : .white
    }

    var body: some View {
        VStack(spacing: isLarge ? 4 : 2) {
            header
            weekdayHeader
            ForEach(entry.layout.weeks) { week in
                weekRow(week)
            }
            if entry.layout.weeks.count < 6 { Spacer(minLength: 0) }
        }
        .padding(.horizontal, showsBackground ? 10 : 4)
        .padding(.vertical, showsBackground ? 8 : 2)
        // ウィジェットは AX5 まで拡大される。7列グリッドはスクロールで逃げられないため
        // クランプしないとアクセシビリティ設定次第で確実に破綻する。
        .dynamicTypeSize(.large ... .xxLarge)
    }

    // MARK: ヘッダー（月表示 + 月移動ボタン）

    private var header: some View {
        HStack(spacing: 6) {
            Text(entry.layout.title)
                .font(.system(size: isLarge ? 13 : 11, weight: .bold))
                .foregroundStyle(.white)
                .widgetAccentable()

            if entry.layout.monthOffset != 0 {
                Button(intent: ShiftMonthIntent(delta: 0)) {
                    Text("今月")
                        .font(.system(size: 9, weight: .bold))
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(Capsule().fill(.white.opacity(0.18)))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.white)
            }

            Spacer(minLength: 0)

            Button(intent: ShiftMonthIntent(delta: -1)) {
                Image(systemName: "chevron.left")
                    .font(.system(size: isLarge ? 11 : 9, weight: .bold))
                    .frame(width: 20, height: 18)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white.opacity(0.75))

            Button(intent: ShiftMonthIntent(delta: 1)) {
                Image(systemName: "chevron.right")
                    .font(.system(size: isLarge ? 11 : 9, weight: .bold))
                    .frame(width: 20, height: 18)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .foregroundStyle(.white.opacity(0.75))
        }
    }

    private var weekdayHeader: some View {
        let symbols = ["日", "月", "火", "水", "木", "金", "土"]
        // 週の開始曜日（アプリ本体の設定）に合わせてラベルを回す
        return HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { col in
                let weekday = (entry.layout.weekStartsOn + col) % 7
                Text(symbols[weekday])
                    .font(.system(size: isLarge ? 9 : 8, weight: .medium))
                    .foregroundStyle(weekdayColor(weekday).opacity(0.75))
                    .frame(maxWidth: .infinity)
            }
        }
    }

    private func weekdayColor(_ index: Int) -> Color {
        guard isFullColor else { return .white }
        if index == 0 { return SUN_COLOR }
        if index == 6 { return SAT_COLOR }
        return .white
    }

    // MARK: 週

    private func weekRow(_ week: WeekRow) -> some View {
        VStack(spacing: laneSpacing) {
            HStack(spacing: 0) {
                ForEach(week.days, id: \.ymd) { day in
                    dayNumber(day)
                        .frame(maxWidth: .infinity)
                }
            }
            // Grid の gridCellColumns が colspan として働くので、
            // セル幅の手計算なしに複数日バーが連続して描かれる。
            Grid(horizontalSpacing: 1, verticalSpacing: laneSpacing) {
                ForEach(Array(week.lanes.enumerated()), id: \.offset) { _, lane in
                    GridRow {
                        ForEach(lane) { cell in
                            // gridCellColumns は GridRow の直接の子に付ける必要があるため
                            // ViewBuilder の中ではなくここで適用する
                            laneCell(cell).gridCellColumns(cell.columns)
                        }
                    }
                }
            }
            // 予定の少ない週でも行の高さを揃える
            .frame(height: barsAreaHeight, alignment: .top)
        }
        .overlay {
            // 日付タップでその日の予定を開く
            HStack(spacing: 0) {
                ForEach(week.days, id: \.ymd) { day in
                    Group {
                        if let url = URL(string: "shukatsukanri://date/\(day.ymd)") {
                            Link(destination: url) {
                                Color.clear.contentShape(Rectangle())
                            }
                        } else {
                            Color.clear
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private func dayNumber(_ day: DayCell) -> some View {
        let size: CGFloat = isLarge ? 18 : 14
        return ZStack {
            if day.isToday {
                if renderingMode == .vibrant {
                    // vibrant では塗りつぶすと赤い塊になって数字が読めなくなる
                    Circle()
                        .strokeBorder(Color.white, lineWidth: 1.5)
                        .frame(width: size, height: size)
                } else {
                    Circle()
                        .fill(isFullColor ? TDU_ACCENT : Color.white.opacity(0.9))
                        .frame(width: size, height: size)
                }
            }
            Text("\(day.day)")
                .font(.system(size: isLarge ? 11 : 9, weight: day.isToday ? .bold : .regular))
                .monospacedDigit()   // 月をまたいでも列幅がガタつかない
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .foregroundStyle(dayNumberColor(day))
        }
        .frame(height: size)
        .opacity(day.isCurrentMonth ? 1 : 0.28)
    }

    private func dayNumberColor(_ day: DayCell) -> Color {
        if day.isToday {
            if renderingMode == .vibrant { return .white }
            return isFullColor ? .white : TDU_NAVY
        }
        guard isFullColor else { return .white }
        if day.weekdayIndex == 0 { return SUN_COLOR }
        if day.weekdayIndex == 6 { return SAT_COLOR }
        return .white
    }

    // MARK: レーンのセル

    @ViewBuilder
    private func laneCell(_ cell: LaneCell) -> some View {
        switch cell {
        case .empty:
            Color.clear.frame(height: laneHeight)

        case .more(_, let count):
            Text("+\(count)")
                .font(.system(size: 7, weight: .bold))
                .foregroundStyle(.white.opacity(0.6))
                .frame(maxWidth: .infinity, minHeight: laneHeight)

        case .event(let seg):
            eventBar(seg)
        }
    }

    private func eventBar(_ seg: EventSegment) -> some View {
        let color = barColor(seg.colorHex)
        let radius: CGFloat = 3
        return Group {
            if isLarge {
                Text(seg.title)
                    .font(.system(size: 7, weight: .bold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
                    .truncationMode(.tail)
                    .foregroundStyle(color)
                    .padding(.leading, seg.continuesLeft ? 3 : 4)
                    .padding(.trailing, 2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .frame(height: laneHeight)
                    .background(alignment: .leading) {
                        ZStack(alignment: .leading) {
                            color.opacity(isFullColor ? 0.22 : 0.28)
                            // 開始側だけ濃い縦線を入れて始点を示す
                            if !seg.continuesLeft {
                                color.frame(width: 2)
                            }
                        }
                    }
            } else {
                color.opacity(0.85)
                    .frame(maxWidth: .infinity)
                    .frame(height: laneHeight)
            }
        }
        // 週をまたぐ側の角は落として、帯が続いて見えるようにする。
        // 縦線も background に含めてから切り抜くことで角からはみ出さない。
        .clipShape(
            UnevenRoundedRectangle(cornerRadii: .init(
                topLeading: seg.continuesLeft ? 0 : radius,
                bottomLeading: seg.continuesLeft ? 0 : radius,
                bottomTrailing: seg.continuesRight ? 0 : radius,
                topTrailing: seg.continuesRight ? 0 : radius
            ))
        )
    }
}

// MARK: - Widget

struct MonthCalendarWidget: Widget {
    let kind = "ShukatsuMonthCalendarWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MonthCalendarProvider()) { entry in
            MonthCalendarView(entry: entry)
                .containerBackground(for: .widget) { TDU_NAVY }
        }
        .configurationDisplayName("就活カレンダー")
        .description("選考予定を月表示。複数日の予定は帯で表示され、◀▶で月を移動できます。")
        .supportedFamilies([.systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}
