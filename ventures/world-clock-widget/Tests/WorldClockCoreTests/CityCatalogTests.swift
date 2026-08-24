import XCTest
@testable import WorldClockCore

final class CityCatalogTests: XCTestCase {

    func testCityIDsAreUnique() {
        let ids = CityCatalog.allCities.map(\.id)
        let uniqueIDs = Set(ids)
        XCTAssertEqual(
            ids.count, uniqueIDs.count,
            "Duplicate city id would crash citiesByID's Dictionary(uniqueKeysWithValues:) at load time"
        )
    }

    func testCatalogIsNotEmpty() {
        XCTAssertFalse(CityCatalog.allCities.isEmpty)
    }

    func testEveryTimeZoneIdentifierIsValid() {
        for city in CityCatalog.allCities {
            XCTAssertNotNil(
                TimeZone(identifier: city.timeZoneIdentifier),
                "\(city.id) has an unrecognized timeZoneIdentifier '\(city.timeZoneIdentifier)' " +
                "and would silently fall back to the device's current time zone"
            )
        }
    }

    func testEveryCoordinateIsWithinValidRange() {
        for city in CityCatalog.allCities {
            XCTAssertTrue(
                (-90...90).contains(city.latitude),
                "\(city.id) has an out-of-range latitude \(city.latitude)"
            )
            XCTAssertTrue(
                (-180...180).contains(city.longitude),
                "\(city.id) has an out-of-range longitude \(city.longitude)"
            )
        }
    }

    func testEveryDefaultCityIDResolves() {
        for id in CityCatalog.defaultCityIDs {
            XCTAssertNotNil(CityCatalog.city(withID: id), "defaultCityIDs contains unknown id '\(id)'")
        }
        XCTAssertEqual(CityCatalog.defaultCities.count, CityCatalog.defaultCityIDs.count)
    }

    func testDefaultCityIDsAreUnique() {
        let ids = CityCatalog.defaultCityIDs
        XCTAssertEqual(ids.count, Set(ids).count, "Duplicate entry in defaultCityIDs")
    }

    func testCityLookupByIDReturnsMatchingCity() throws {
        let city = try XCTUnwrap(CityCatalog.city(withID: "tokyo"))
        XCTAssertEqual(city.name, "Tokyo")
        XCTAssertEqual(city.timeZoneIdentifier, "Asia/Tokyo")
    }

    func testCityLookupByUnknownIDReturnsNil() {
        XCTAssertNil(CityCatalog.city(withID: "not-a-real-city"))
    }
}
