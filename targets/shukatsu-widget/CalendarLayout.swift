import Foundation

// MARK: - カレンダーのレイアウト計算
//
// ウィジェットのViewは「TimelineEntryの純粋関数」でなければならない。
// GeometryReader で測ってから再描画する方式は @State の変更を伴い、
// ウィジェットのスナップショット archive と相性が悪い。
// そのためレーン割り当てはすべてここで済ませ、計算済みの結果を Entry に載せる。
//
// 描画側は Grid + .gridCellColumns(cols) を使う（HTMLのcolspanと同じ）。
// 列幅は Grid が自動で揃えるので、セル幅の手計算は不要。

/// 1つのイベントバー（週の途中で切られている場合がある）
struct EventSegment: Hashable {
    let scheduleID: String
    let title: String
    let colorHex: String
    let status: String
    let cols: Int              // 何列ぶんまたぐか
    let continuesLeft: Bool    // 前の週から続いている
    let continuesRight: Bool   // 次の週へ続く
}

/// 週の1レーン（＝1段）を構成するセル
enum LaneCell: Identifiable, Hashable {
    case event(EventSegment)
    case empty(index: Int)

    var id: String {
        switch self {
        case .event(let s): return "e_\(s.scheduleID)_\(s.cols)"
        case .empty(let i): return "x_\(i)"
        }
    }

    var columns: Int {
        if case .event(let s) = self { return s.cols }
        return 1
    }
}

/// カレンダーの1日
struct DayCell: Hashable {
    let ymd: String
    let day: Int
    let isCurrentMonth: Bool
    let isToday: Bool
    let weekdayIndex: Int   // 0 = 日曜
}

/// カレンダーの1週
struct WeekRow: Identifiable, Hashable {
    let id: String          // 週頭のymd
    let days: [DayCell]     // 常に7件
    let lanes: [[LaneCell]] // レーン（段）ごとのセル列
    /// 段に入りきらず描けなかった件数（列ごと・常に7件）。日付の横に "+N" として出す
    let overflow: [Int]
}

/// 1ヶ月ぶんのレイアウト結果
struct MonthLayout: Hashable {
    let title: String       // "2026年5月"
    let weeks: [WeekRow]
    let monthOffset: Int
    /// 全週で最も多い段数。週ごとの行の高さを揃えるために使う（最低1）
    let laneCount: Int
    /// 週の開始曜日（0 = 日, 1 = 月）。曜日ラベルの並べ替えに使う
    let weekStartsOn: Int
}

enum CalendarLayout {

    /// その月がカレンダー上で何行になるか（段数を決めるために先に必要）
    static func weekCount(monthOffset: Int, now: Date = Date()) -> Int {
        let cal = Fmt.jaCalendar
        let base = cal.date(byAdding: .month, value: monthOffset, to: now) ?? now
        guard let firstOfMonth = cal.date(from: cal.dateComponents([.year, .month], from: base))
        else { return 6 }
        let firstWeekday = cal.component(.weekday, from: firstOfMonth) - 1
        let leadingBlanks = (firstWeekday - AppGroupHelper.weekStart + 7) % 7
        let daysInMonth = cal.range(of: .day, in: .month, for: firstOfMonth)?.count ?? 30
        return Int(ceil(Double(leadingBlanks + daysInMonth) / 7.0))
    }

    static func build(
        schedules: [WidgetSchedule],
        monthOffset: Int,
        maxLanes: Int,
        now: Date = Date()
    ) -> MonthLayout {
        let cal = Fmt.jaCalendar
        // 週の開始曜日はアプリ本体の設定に追従する
        let weekStartsOn = AppGroupHelper.weekStart
        let base = cal.date(byAdding: .month, value: monthOffset, to: now) ?? now
        let comps = cal.dateComponents([.year, .month], from: base)
        guard let firstOfMonth = cal.date(from: comps) else {
            return MonthLayout(title: "", weeks: [], monthOffset: monthOffset, laneCount: 1, weekStartsOn: weekStartsOn)
        }

        let todayYmd = Ymd.string(now)
        let month = cal.component(.month, from: firstOfMonth)

        // グリッドの左上（最初の週の週頭）
        let firstWeekday = cal.component(.weekday, from: firstOfMonth) - 1 // 0 = 日曜
        let leadingBlanks = (firstWeekday - weekStartsOn + 7) % 7
        guard let gridStart = cal.date(byAdding: .day, value: -leadingBlanks, to: firstOfMonth) else {
            return MonthLayout(title: "", weeks: [], monthOffset: monthOffset, laneCount: 1, weekStartsOn: weekStartsOn)
        }

        let daysInMonth = cal.range(of: .day, in: .month, for: firstOfMonth)?.count ?? 30
        let rowCount = Int(ceil(Double(leadingBlanks + daysInMonth) / 7.0))

        // 日付なしの予定はカレンダーに出せない
        let dated = schedules.filter { !$0.date.isEmpty }

        var weeks: [WeekRow] = []
        for row in 0..<rowCount {
            var days: [DayCell] = []
            for col in 0..<7 {
                guard let d = cal.date(byAdding: .day, value: row * 7 + col, to: gridStart) else { continue }
                let ymd = Ymd.string(d)
                days.append(DayCell(
                    ymd: ymd,
                    day: cal.component(.day, from: d),
                    isCurrentMonth: cal.component(.month, from: d) == month,
                    isToday: ymd == todayYmd,
                    weekdayIndex: (cal.component(.weekday, from: d) - 1)
                ))
            }
            guard days.count == 7 else { continue }
            let packed = packLanes(weekDays: days.map(\.ymd), schedules: dated, maxLanes: maxLanes)
            weeks.append(WeekRow(
                id: days[0].ymd,
                days: days,
                lanes: packed.lanes,
                overflow: packed.overflow
            ))
        }

        return MonthLayout(
            title: Fmt.yearMonth.string(from: firstOfMonth),
            weeks: weeks,
            monthOffset: monthOffset,
            laneCount: max(1, weeks.map(\.lanes.count).max() ?? 1),
            weekStartsOn: weekStartsOn
        )
    }

    // MARK: - レーン割り当て
    //
    // 週ごとに、重ならないイベントを同じ段へ詰めていく貪欲法。
    // 段を跨いだ位置合わせのため「その週で既に描いたイベント」を記録し、
    // 複数日イベントは開始列でのみ描画して cols で伸ばす。

    static func packLanes(
        weekDays: [String], schedules: [WidgetSchedule], maxLanes: Int
    ) -> (lanes: [[LaneCell]], overflow: [Int]) {
        let noOverflow = [Int](repeating: 0, count: 7)
        guard weekDays.count == 7, maxLanes > 0 else { return ([], noOverflow) }
        let weekStart = weekDays[0]
        let weekEnd = weekDays[6]

        // 各日にかかる予定を集める
        var byDay: [String: [WidgetSchedule]] = [:]
        for s in schedules where s.effectiveEnd >= weekStart && s.date <= weekEnd {
            for ymd in weekDays where s.covers(ymd) {
                byDay[ymd, default: []].append(s)
            }
        }
        guard !byDay.isEmpty else { return ([], noOverflow) }

        // 長い予定を上の段に寄せると見た目が安定する
        for key in byDay.keys {
            byDay[key]?.sort { a, b in
                let la = dayCount(from: max(a.date, weekStart), to: min(a.effectiveEnd, weekEnd))
                let lb = dayCount(from: max(b.date, weekStart), to: min(b.effectiveEnd, weekEnd))
                if la != lb { return la > lb }
                if a.date != b.date { return a.date < b.date }
                return a.id < b.id
            }
        }

        var placed = Set<String>()
        var lanes: [[LaneCell]] = []

        // 各周回で必ず「列が進む」か「byDayの要素が1つ減る」ので終了は保証されている。
        // これは無限ループの保険で、正常時に到達することはない。
        let guardLimit = 7 + schedules.count * 7 + 8

        for lane in 0..<maxLanes {
            var cells: [LaneCell] = []
            var col = 0
            var guardCounter = 0

            while col < 7 && guardCounter < guardLimit {
                guardCounter += 1
                let ymd = weekDays[col]

                // 上の段で既に帯を描いた予定を取り除く
                var bucket = byDay[ymd] ?? []
                bucket.removeAll { placed.contains($0.id) }

                guard let candidate = bucket.first else {
                    byDay[ymd] = bucket
                    cells.append(.empty(index: col))
                    col += 1
                    continue
                }

                // この列で始まらない予定（前の列から続く帯）は、この段では描けない。
                // 取り除いて同じ列をもう一度見る（列は進めない）。
                if !cells.isEmpty && candidate.date != ymd {
                    bucket.removeFirst()
                    byDay[ymd] = bucket
                    continue
                }

                bucket.removeFirst()
                byDay[ymd] = bucket
                let event = candidate

                let segEnd = min(event.effectiveEnd, weekEnd)
                let cols = min(dayCount(from: ymd, to: segEnd), 7 - col)
                cells.append(.event(EventSegment(
                    scheduleID: event.id,
                    title: event.company,
                    colorHex: event.calendarColor ?? statusColors[event.status] ?? "#95A5A6",
                    status: event.status,
                    cols: max(1, cols),
                    continuesLeft: event.date < ymd,
                    continuesRight: event.effectiveEnd > segEnd
                )))
                placed.insert(event.id)
                col += max(1, cols)
            }

            // Grid の1行は必ず7列ぶんでなければ列がずれる。
            // 打ち切りなどで足りない場合は空セルで埋める。
            var total = cells.reduce(0) { $0 + $1.columns }
            while total < 7 {
                cells.append(.empty(index: 100 + total))
                total += 1
            }

            // 空だけの段は捨てる（下の段に中身が来ることはない）
            if cells.contains(where: { if case .empty = $0 { return false } else { return true } }) {
                lanes.append(cells)
            } else {
                break
            }
        }

        // 段に入りきらなかったぶんを列ごとに数える。
        // 帯の下に埋もれて描けなかった予定もここに含まれるので、取りこぼしが出ない。
        let overflow = weekDays.map { ymd in
            (byDay[ymd] ?? []).filter { !placed.contains($0.id) }.count
        }

        return (lanes, overflow)
    }

    /// 両端を含む日数（同日なら1）
    static func dayCount(from: String, to: String) -> Int {
        guard let a = Ymd.date(from), let b = Ymd.date(to) else { return 1 }
        let d = Fmt.jaCalendar.dateComponents([.day], from: a, to: b).day ?? 0
        return max(1, d + 1)
    }
}
