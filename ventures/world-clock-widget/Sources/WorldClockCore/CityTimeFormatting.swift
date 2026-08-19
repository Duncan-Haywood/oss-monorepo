import Foundation

/// Locale-aware, but always rendered in the *city's* time zone rather than the device's.
public enum CityTimeFormatting {

    public static func timeString(for date: Date, in city: City, locale: Locale = .current) -> String {
        date.formatted(
            Date.FormatStyle(date: .omitted, time: .shortened, locale: locale, timeZone: city.timeZone)
        )
    }

    public static func dateString(for date: Date, in city: City, locale: Locale = .current) -> String {
        date.formatted(
            Date.FormatStyle(date: .abbreviated, time: .omitted, locale: locale, timeZone: city.timeZone)
        )
    }
}
