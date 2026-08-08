import WidgetKit
import SwiftUI

@main
struct ShukatsuWidgetBundle: WidgetBundle {
    var body: some Widget {
        MonthCalendarWidget()
        WeekWidget()
        UpcomingWidget()
        ListWidget()
    }
}
