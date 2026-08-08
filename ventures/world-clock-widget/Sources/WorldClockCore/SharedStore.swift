import Foundation

/// Persistence shared between the app and the widget extension via an App Group, so the
/// cities a user picks in the app can seed the widget's default configuration.
///
/// The `group.com.duncanhaywood.worldclock` identifier here must match the App Group
/// registered in both targets' entitlements (see project.yml) and enabled for the App ID
/// in your Apple Developer account.
public enum SharedStore {
    public static let appGroupIdentifier = "group.com.duncanhaywood.worldclock"

    private static let selectedCityIDsKey = "selectedCityIDs"

    /// Falls back to `.standard` so the app still works (single-process only) if the App
    /// Group hasn't been provisioned yet, e.g. before signing is configured.
    public static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroupIdentifier) ?? .standard
    }

    public static var selectedCityIDs: [String] {
        get {
            let stored = defaults.stringArray(forKey: selectedCityIDsKey)
            return (stored?.isEmpty == false) ? stored! : CityCatalog.defaultCityIDs
        }
        set {
            defaults.set(newValue, forKey: selectedCityIDsKey)
        }
    }

    public static var selectedCities: [City] {
        selectedCityIDs.compactMap(CityCatalog.city(withID:))
    }
}
