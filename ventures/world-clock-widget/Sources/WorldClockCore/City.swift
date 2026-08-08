import Foundation

/// A place the app can show a clock for.
public struct City: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let country: String
    public let timeZoneIdentifier: String
    public let latitude: Double
    public let longitude: Double

    public init(
        id: String,
        name: String,
        country: String,
        timeZoneIdentifier: String,
        latitude: Double,
        longitude: Double
    ) {
        self.id = id
        self.name = name
        self.country = country
        self.timeZoneIdentifier = timeZoneIdentifier
        self.latitude = latitude
        self.longitude = longitude
    }

    /// Falls back to the device's current time zone if the identifier is somehow invalid,
    /// which keeps callers from having to unwrap an optional for every read.
    public var timeZone: TimeZone {
        TimeZone(identifier: timeZoneIdentifier) ?? .current
    }
}
