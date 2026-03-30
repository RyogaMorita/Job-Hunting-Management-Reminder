import WidgetKit
import SwiftUI

@main
struct ShukatsuWidgetBundle: WidgetBundle {
    var body: some Widget {
        CalendarWidget()
        WeekWidget()
        UpcomingWidget()
        ListWidget()
    }
}
