import WidgetKit
import SwiftUI

@main
struct ShukatsuWidgetBundle: WidgetBundle {
    var body: some Widget {
        WeekWidget()
        UpcomingWidget()
        ListWidget()
    }
}
