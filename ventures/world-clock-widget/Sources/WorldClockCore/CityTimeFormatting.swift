import Foundation

/// Locale-aware, but always rendered in the *city's* time zone rather than the device's.
///
/// Deliberately `DateFormatter` rather than `Date.FormatStyle`: `FormatStyle` ships only in
/// Apple's Foundation, so a `FormatStyle` implementation cannot compile against
/// swift-corelibs-foundation and takes the whole of `WorldClockCore` — the module the Linux
/// CI job exists to cover — down with it.
public enum CityTimeFormatting {

    public static func timeString(for date: Date, in city: City, locale: Locale = .current) -> String {
        string(for: date, in: city, locale: locale, dateStyle: .none, timeStyle: .short)
    }

    public static func dateString(for date: Date, in city: City, locale: Locale = .current) -> String {
        string(for: date, in: city, locale: locale, dateStyle: .medium, timeStyle: .none)
    }

    private struct FormatterKey: Hashable {
        let localeIdentifier: String
        let timeZoneIdentifier: String
        let dateStyle: DateFormatter.Style
        let timeStyle: DateFormatter.Style
    }

    private static let cacheLock = NSLock()
    private static var cache: [FormatterKey: DateFormatter] = [:]

    /// WidgetKit renders every entry of the hour-long timeline up front, so this runs on the
    /// order of a thousand times per refresh and a fresh `DateFormatter` per call is the one
    /// part of that which is genuinely expensive. The lock is what makes reuse safe, since a
    /// `DateFormatter` may not be used concurrently.
    private static func string(
        for date: Date,
        in city: City,
        locale: Locale,
        dateStyle: DateFormatter.Style,
        timeStyle: DateFormatter.Style
    ) -> String {
        let timeZone = city.timeZone
        let key = FormatterKey(
            localeIdentifier: locale.identifier,
            timeZoneIdentifier: timeZone.identifier,
            dateStyle: dateStyle,
            timeStyle: timeStyle
        )

        cacheLock.lock()
        defer { cacheLock.unlock() }

        if let cached = cache[key] {
            return cached.string(from: date)
        }

        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.dateStyle = dateStyle
        formatter.timeStyle = timeStyle
        cache[key] = formatter
        return formatter.string(from: date)
    }
}
