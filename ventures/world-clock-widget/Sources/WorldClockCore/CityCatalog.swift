import Foundation

/// The fixed set of major cities the app and widget can show. Coordinates are city-center
/// approximations, which is precise enough for sunrise/sunset (accurate to within a minute or two).
public enum CityCatalog {

    public static let allCities: [City] = [
        // Europe
        City(id: "london", name: "London", country: "United Kingdom", timeZoneIdentifier: "Europe/London", latitude: 51.5074, longitude: -0.1278),
        City(id: "paris", name: "Paris", country: "France", timeZoneIdentifier: "Europe/Paris", latitude: 48.8566, longitude: 2.3522),
        City(id: "berlin", name: "Berlin", country: "Germany", timeZoneIdentifier: "Europe/Berlin", latitude: 52.5200, longitude: 13.4050),
        City(id: "madrid", name: "Madrid", country: "Spain", timeZoneIdentifier: "Europe/Madrid", latitude: 40.4168, longitude: -3.7038),
        City(id: "rome", name: "Rome", country: "Italy", timeZoneIdentifier: "Europe/Rome", latitude: 41.9028, longitude: 12.4964),
        City(id: "istanbul", name: "Istanbul", country: "Türkiye", timeZoneIdentifier: "Europe/Istanbul", latitude: 41.0082, longitude: 28.9784),
        City(id: "moscow", name: "Moscow", country: "Russia", timeZoneIdentifier: "Europe/Moscow", latitude: 55.7558, longitude: 37.6173),
        City(id: "reykjavik", name: "Reykjavík", country: "Iceland", timeZoneIdentifier: "Atlantic/Reykjavik", latitude: 64.1466, longitude: -21.9426),

        // Americas
        City(id: "new-york", name: "New York", country: "United States", timeZoneIdentifier: "America/New_York", latitude: 40.7128, longitude: -74.0060),
        City(id: "los-angeles", name: "Los Angeles", country: "United States", timeZoneIdentifier: "America/Los_Angeles", latitude: 34.0522, longitude: -118.2437),
        City(id: "chicago", name: "Chicago", country: "United States", timeZoneIdentifier: "America/Chicago", latitude: 41.8781, longitude: -87.6298),
        City(id: "denver", name: "Denver", country: "United States", timeZoneIdentifier: "America/Denver", latitude: 39.7392, longitude: -104.9903),
        City(id: "anchorage", name: "Anchorage", country: "United States", timeZoneIdentifier: "America/Anchorage", latitude: 61.2181, longitude: -149.9003),
        City(id: "honolulu", name: "Honolulu", country: "United States", timeZoneIdentifier: "Pacific/Honolulu", latitude: 21.3069, longitude: -157.8583),
        City(id: "toronto", name: "Toronto", country: "Canada", timeZoneIdentifier: "America/Toronto", latitude: 43.6532, longitude: -79.3832),
        City(id: "vancouver", name: "Vancouver", country: "Canada", timeZoneIdentifier: "America/Vancouver", latitude: 49.2827, longitude: -123.1207),
        City(id: "mexico-city", name: "Mexico City", country: "Mexico", timeZoneIdentifier: "America/Mexico_City", latitude: 19.4326, longitude: -99.1332),
        City(id: "sao-paulo", name: "São Paulo", country: "Brazil", timeZoneIdentifier: "America/Sao_Paulo", latitude: -23.5505, longitude: -46.6333),
        City(id: "buenos-aires", name: "Buenos Aires", country: "Argentina", timeZoneIdentifier: "America/Argentina/Buenos_Aires", latitude: -34.6037, longitude: -58.3816),

        // Africa
        City(id: "cairo", name: "Cairo", country: "Egypt", timeZoneIdentifier: "Africa/Cairo", latitude: 30.0444, longitude: 31.2357),
        City(id: "lagos", name: "Lagos", country: "Nigeria", timeZoneIdentifier: "Africa/Lagos", latitude: 6.5244, longitude: 3.3792),
        City(id: "nairobi", name: "Nairobi", country: "Kenya", timeZoneIdentifier: "Africa/Nairobi", latitude: -1.2921, longitude: 36.8219),
        City(id: "johannesburg", name: "Johannesburg", country: "South Africa", timeZoneIdentifier: "Africa/Johannesburg", latitude: -26.2041, longitude: 28.0473),

        // Middle East & South Asia
        City(id: "dubai", name: "Dubai", country: "United Arab Emirates", timeZoneIdentifier: "Asia/Dubai", latitude: 25.2048, longitude: 55.2708),
        City(id: "riyadh", name: "Riyadh", country: "Saudi Arabia", timeZoneIdentifier: "Asia/Riyadh", latitude: 24.7136, longitude: 46.6753),
        City(id: "tel-aviv", name: "Tel Aviv", country: "Israel", timeZoneIdentifier: "Asia/Jerusalem", latitude: 32.0853, longitude: 34.7818),
        City(id: "karachi", name: "Karachi", country: "Pakistan", timeZoneIdentifier: "Asia/Karachi", latitude: 24.8607, longitude: 67.0011),
        City(id: "mumbai", name: "Mumbai", country: "India", timeZoneIdentifier: "Asia/Kolkata", latitude: 19.0760, longitude: 72.8777),
        City(id: "new-delhi", name: "New Delhi", country: "India", timeZoneIdentifier: "Asia/Kolkata", latitude: 28.6139, longitude: 77.2090),

        // East & Southeast Asia
        City(id: "bangkok", name: "Bangkok", country: "Thailand", timeZoneIdentifier: "Asia/Bangkok", latitude: 13.7563, longitude: 100.5018),
        City(id: "jakarta", name: "Jakarta", country: "Indonesia", timeZoneIdentifier: "Asia/Jakarta", latitude: -6.2088, longitude: 106.8456),
        City(id: "singapore", name: "Singapore", country: "Singapore", timeZoneIdentifier: "Asia/Singapore", latitude: 1.3521, longitude: 103.8198),
        City(id: "hong-kong", name: "Hong Kong", country: "Hong Kong", timeZoneIdentifier: "Asia/Hong_Kong", latitude: 22.3193, longitude: 114.1694),
        City(id: "shanghai", name: "Shanghai", country: "China", timeZoneIdentifier: "Asia/Shanghai", latitude: 31.2304, longitude: 121.4737),
        City(id: "beijing", name: "Beijing", country: "China", timeZoneIdentifier: "Asia/Shanghai", latitude: 39.9042, longitude: 116.4074),
        City(id: "seoul", name: "Seoul", country: "South Korea", timeZoneIdentifier: "Asia/Seoul", latitude: 37.5665, longitude: 126.9780),
        City(id: "tokyo", name: "Tokyo", country: "Japan", timeZoneIdentifier: "Asia/Tokyo", latitude: 35.6762, longitude: 139.6503),

        // Oceania
        City(id: "sydney", name: "Sydney", country: "Australia", timeZoneIdentifier: "Australia/Sydney", latitude: -33.8688, longitude: 151.2093),
        City(id: "melbourne", name: "Melbourne", country: "Australia", timeZoneIdentifier: "Australia/Melbourne", latitude: -37.8136, longitude: 144.9631),
        City(id: "auckland", name: "Auckland", country: "New Zealand", timeZoneIdentifier: "Pacific/Auckland", latitude: -36.8485, longitude: 174.7633),
    ]

    private static let citiesByID: [String: City] = Dictionary(
        uniqueKeysWithValues: allCities.map { ($0.id, $0) }
    )

    public static func city(withID id: String) -> City? {
        citiesByID[id]
    }

    /// A spread of major cities across time zones and hemispheres, shown before a user
    /// has picked their own set. Chosen so the default widget always reads as "high information"
    /// rather than a single, mostly-empty clock face.
    public static let defaultCityIDs: [String] = [
        "london",
        "new-york",
        "los-angeles",
        "sao-paulo",
        "dubai",
        "mumbai",
        "tokyo",
        "sydney",
    ]

    public static var defaultCities: [City] {
        defaultCityIDs.compactMap(city(withID:))
    }
}
