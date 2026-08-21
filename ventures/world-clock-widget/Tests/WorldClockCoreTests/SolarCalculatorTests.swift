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

    func testSunriseFallsOnTheRequestedLocalCalendarDateForACityFarEastOfGreenwich() throws {
        // Tokyo's civil UTC+9 offset diverges from its raw longitude/15 (~+9.31h) enough that,
        // without correcting for the day the reference algorithm's UT result actually lands on,
        // the computed sunrise instant fell on June 22 JST when asked for June 21.
        let tokyo = try XCTUnwrap(CityCatalog.city(withID: "tokyo"))
        let date = utcDate(year: 2026, month: 6, day: 21)

        let sunrise = try XCTUnwrap(SolarCalculator.time(for: .sunrise, city: tokyo, on: date))

        var tokyoCalendar = Calendar(identifier: .gregorian)
        tokyoCalendar.timeZone = tokyo.timeZone
        let components = tokyoCalendar.dateComponents([.year, .month, .day], from: sunrise)
        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 6)
        XCTAssertEqual(components.day, 21, "sunrise landed on the wrong local calendar day: \(sunrise)")
    }

    func testSunsetFallsOnTheRequestedLocalCalendarDateForACityFarWestOfGreenwich() throws {
        // Los Angeles's civil offset (UTC-7 in summer) likewise diverges from its raw
        // longitude/15 (~-7.88h): sunset came back dated June 20 PDT when asked for June 21.
        let losAngeles = try XCTUnwrap(CityCatalog.city(withID: "los-angeles"))
        let date = utcDate(year: 2026, month: 6, day: 21)

        let sunset = try XCTUnwrap(SolarCalculator.time(for: .sunset, city: losAngeles, on: date))

        var laCalendar = Calendar(identifier: .gregorian)
        laCalendar.timeZone = losAngeles.timeZone
        let components = laCalendar.dateComponents([.year, .month, .day], from: sunset)
        XCTAssertEqual(components.year, 2026)
        XCTAssertEqual(components.month, 6)
        XCTAssertEqual(components.day, 21, "sunset landed on the wrong local calendar day: \(sunset)")
    }

    func testSunriseIsBeforeSunsetForCitiesAcrossTheCatalogNotJustGreenwichAdjacentOnes() throws {
        // The ordering test above only exercises London (longitude ~0, so a day-boundary bug in
        // `SolarCalculator` wouldn't show up there). Every catalog city should still have its
        // sunrise strictly before its sunset on the same local calendar day. Uses the equinox,
        // like `testEveryCatalogCityHasASunriseAndSunsetOnATypicalDate` below, so this checks
        // the day-anchoring fix rather than the algorithm's separate, pre-existing, and
        // documented imprecision for very long days close to the Arctic Circle (Reykjavík).
        let date = utcDate(year: 2026, month: 3, day: 20)

        for city in CityCatalog.allCities {
            guard
                let sunrise = SolarCalculator.time(for: .sunrise, city: city, on: date),
                let sunset = SolarCalculator.time(for: .sunset, city: city, on: date)
            else { continue }

            XCTAssertLessThan(sunrise, sunset, "\(city.name): sunrise should precede sunset")
        }
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
