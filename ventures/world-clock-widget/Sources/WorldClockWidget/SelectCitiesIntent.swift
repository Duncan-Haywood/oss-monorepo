import AppIntents
import WorldClockCore

struct SelectCitiesIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Choose Cities"
    static var description = IntentDescription(
        "Pick which cities appear in the World Clock widget, in display order. Larger widget sizes show more of them."
    )

    @Parameter(title: "Cities", default: CityOption.defaultSelection)
    var cities: [CityOption]

    /// Resolves the configured cities, falling back to the default spread if the user somehow
    /// ends up with an empty selection (e.g. removed every configured city).
    func resolvedCities() -> [City] {
        let resolved = cities.compactMap(\.city)
        return resolved.isEmpty ? CityOption.defaultSelection.compactMap(\.city) : resolved
    }
}
