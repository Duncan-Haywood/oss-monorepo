import WidgetKit
import WorldClockCore

struct CityTimelineEntry: TimelineEntry {
    let date: Date
    let cities: [City]
}

/// Time-zone-correct clocks can't rely on SwiftUI's built-in `Text(date:style:)` live updating
/// (it always renders in the device's own time zone), so we materialize one entry per minute
/// and let WidgetKit swap between them. 60 entries covers an hour, refreshed after that.
struct CityTimelineProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> CityTimelineEntry {
        CityTimelineEntry(date: Date(), cities: CityOption.defaultSelection.compactMap(\.city))
    }

    func snapshot(for configuration: SelectCitiesIntent, in context: Context) async -> CityTimelineEntry {
        CityTimelineEntry(date: Date(), cities: configuration.resolvedCities())
    }

    func timeline(for configuration: SelectCitiesIntent, in context: Context) async -> Timeline<CityTimelineEntry> {
        let cities = configuration.resolvedCities()
        let calendar = Calendar(identifier: .gregorian)
        let now = Date()

        let entries: [CityTimelineEntry] = (0..<60).compactMap { minuteOffset in
            guard let entryDate = calendar.date(byAdding: .minute, value: minuteOffset, to: now) else { return nil }
            return CityTimelineEntry(date: entryDate, cities: cities)
        }

        let refreshDate = calendar.date(byAdding: .minute, value: 60, to: now) ?? now.addingTimeInterval(3600)
        return Timeline(entries: entries, policy: .after(refreshDate))
    }
}
