import XCTest
@testable import WorldClockCore

final class SolarCalculatorTests: XCTestCase {

    private func utcDate(year: Int, month: Int, day: Int, hour: Int = 12) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    func testSunriseIsBeforeSunsetForATemperateCity() throws {
        let london = try XCTUnwrap(CityCatalog.city(withID: "london"))
        let date = utcDate(year: 2026, month: 6, day: 21)

        let sunrise = try XCTUnwrap(SolarCalculator.time(for: .sunrise, city: london, on: date))
        let sunset = try XCTUnwrap(SolarCalculator.time(for: .sunset, city: london, on: date))

        XCTAssertLessThan(sunrise, sunset)
    }

    func testNorthernHemisphereSummerDayIsLongerThanWinterDay() throws {
        let london = try XCTUnwrap(CityCatalog.city(withID: "london"))

        let summerLength = try dayLength(for: london, on: utcDate(year: 2026, month: 6, day: 21))
        let winterLength = try dayLength(for: london, on: utcDate(year: 2026, month: 12, day: 21))

        XCTAssertGreaterThan(summerLength, winterLength)
    }

    func testSouthernHemisphereSeasonsAreInverted() throws {
        let sydney = try XCTUnwrap(CityCatalog.city(withID: "sydney"))

        let juneLength = try dayLength(for: sydney, on: utcDate(year: 2026, month: 6, day: 21))
        let decemberLength = try dayLength(for: sydney, on: utcDate(year: 2026, month: 12, day: 21))

        // It's winter in Sydney in June and summer in December, opposite of the northern hemisphere.
        XCTAssertLessThan(juneLength, decemberLength)
    }

    func testLondonSummerSolsticeSunriseAndSunsetAreApproximatelyCorrect() throws {
        // Widely-cited reference: London's longest day (~June 21) has sunrise around 04:43 BST
        // (03:43 UTC) and sunset around 21:21 BST (20:21 UTC). The Almanac algorithm this
        // calculator implements is accurate to roughly a minute, so a generous tolerance keeps
        // this robust to both algorithmic approximation and the reference's own rounding.
        let london = try XCTUnwrap(CityCatalog.city(withID: "london"))
        let date = utcDate(year: 2026, month: 6, day: 21)

        let sunrise = try XCTUnwrap(SolarCalculator.time(for: .sunrise, city: london, on: date))
        let sunset = try XCTUnwrap(SolarCalculator.time(for: .sunset, city: london, on: date))

        let expectedSunrise = utcDate(year: 2026, month: 6, day: 21, hour: 3).addingTimeInterval(43 * 60)
        let expectedSunset = utcDate(year: 2026, month: 6, day: 21, hour: 20).addingTimeInterval(21 * 60)

        XCTAssertEqual(sunrise.timeIntervalSince(expectedSunrise), 0, accuracy: 20 * 60)
        XCTAssertEqual(sunset.timeIntervalSince(expectedSunset), 0, accuracy: 20 * 60)
    }

    func testEveryCatalogCityHasASunriseAndSunsetOnATypicalDate() throws {
        let date = utcDate(year: 2026, month: 3, day: 20) // equinox: safe for every latitude in the catalog

        for city in CityCatalog.allCities {
            let sunrise = SolarCalculator.time(for: .sunrise, city: city, on: date)
            let sunset = SolarCalculator.time(for: .sunset, city: city, on: date)
            XCTAssertNotNil(sunrise, "\(city.name) should have a sunrise near the equinox")
            XCTAssertNotNil(sunset, "\(city.name) should have a sunset near the equinox")
        }
    }

    func testPolarNightReturnsNilRatherThanCrashing() {
        // Not part of the shipped catalog, but the math must degrade gracefully at extreme
        // latitudes: north of the Arctic Circle in December, the sun never rises.
        let polarCity = City(
            id: "test-polar",
            name: "Test Polar Station",
            country: "Test",
            timeZoneIdentifier: "UTC",
            latitude: 78.0,
            longitude: 15.0
        )
        let midwinter = utcDate(year: 2026, month: 12, day: 21)

        XCTAssertNil(SolarCalculator.time(for: .sunrise, city: polarCity, on: midwinter))
        XCTAssertNil(SolarCalculator.time(for: .sunset, city: polarCity, on: midwinter))
    }

    private func dayLength(for city: City, on date: Date) throws -> TimeInterval {
        let sunrise = try XCTUnwrap(SolarCalculator.time(for: .sunrise, city: city, on: date))
        let sunset = try XCTUnwrap(SolarCalculator.time(for: .sunset, city: city, on: date))
        return sunset.timeIntervalSince(sunrise)
    }
}
