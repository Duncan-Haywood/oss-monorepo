import AppIntents
import WorldClockCore

/// A widget-configurable, per-case wrapper around the fixed `CityCatalog`. AppIntents needs a
/// finite, statically-describable option set for its configuration UI (`AppEnum`), which the
/// catalog's ~40 cities comfortably fit; raw values are kept identical to `City.id` so lookups
/// between this type and `CityCatalog` never drift.
enum CityOption: String, AppEnum, CaseIterable {
    case london = "london"
    case paris = "paris"
    case berlin = "berlin"
    case madrid = "madrid"
    case rome = "rome"
    case istanbul = "istanbul"
    case moscow = "moscow"
    case reykjavik = "reykjavik"

    case newYork = "new-york"
    case losAngeles = "los-angeles"
    case chicago = "chicago"
    case denver = "denver"
    case anchorage = "anchorage"
    case honolulu = "honolulu"
    case toronto = "toronto"
    case vancouver = "vancouver"
    case mexicoCity = "mexico-city"
    case saoPaulo = "sao-paulo"
    case buenosAires = "buenos-aires"

    case cairo = "cairo"
    case lagos = "lagos"
    case nairobi = "nairobi"
    case johannesburg = "johannesburg"

    case dubai = "dubai"
    case riyadh = "riyadh"
    case telAviv = "tel-aviv"
    case karachi = "karachi"
    case mumbai = "mumbai"
    case newDelhi = "new-delhi"

    case bangkok = "bangkok"
    case jakarta = "jakarta"
    case singapore = "singapore"
    case hongKong = "hong-kong"
    case shanghai = "shanghai"
    case beijing = "beijing"
    case seoul = "seoul"
    case tokyo = "tokyo"

    case sydney = "sydney"
    case melbourne = "melbourne"
    case auckland = "auckland"

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "City"

    static var caseDisplayRepresentations: [CityOption: DisplayRepresentation] {
        Dictionary(uniqueKeysWithValues: allCases.compactMap { option in
            guard let city = option.city else { return nil }
            return (option, DisplayRepresentation(title: "\(city.name), \(city.country)"))
        })
    }

    var city: City? {
        CityCatalog.city(withID: rawValue)
    }

    /// The cities to show before a user has customized this widget instance: whatever the
    /// user has already picked in the app, or the catalog's global default spread.
    static var defaultSelection: [CityOption] {
        let fromApp = SharedStore.selectedCityIDs.compactMap { CityOption(rawValue: $0) }
        if !fromApp.isEmpty { return fromApp }
        return CityCatalog.defaultCityIDs.compactMap { CityOption(rawValue: $0) }
    }
}
