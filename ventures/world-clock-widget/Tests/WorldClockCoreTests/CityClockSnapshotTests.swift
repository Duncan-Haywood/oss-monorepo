import XCTest
@testable import WorldClockCore

final class CityClockSnapshotTests: XCTestCase {

    private let utc = TimeZone(identifier: "UTC")!

    private func utcDate(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute))!
    }

    func testIsDaytimeShortlyAfterSunriseAndNighttimeShortlyAfterSunset() throws {
        let london = try XCTUnwrap(CityCatalog.city(withID: "london"))
        let date = utcDate(year: 2026, month: 6, day: 21, hour: 12) // well into the day

        let midday = CityClockSnapshot(city: london, referenceDate: date, deviceTimeZone: utc)
        XCTAssertTrue(midday.isDaytime)

        let midnight = CityClockSnapshot(
            city: london,
            referenceDate: utcDate(year: 2026, month: 6, day: 21, hour: 1),
            deviceTimeZone: utc
        )
        XCTAssertFalse(midnight.isDaytime)
    }

    func testDayOffsetLabelIsNilWhenCityAndDeviceShareACalendarDate() throws {
        let losAngeles = try XCTUnwrap(CityCatalog.city(withID: "los-angeles"))
        // 15:30 UTC is 07:30 in Los Angeles (UTC-8 standard time) — same calendar date as UTC.
        let date = utcDate(year: 2026, month: 1, day: 1, hour: 15, minute: 30)

        let snapshot = CityClockSnapshot(city: losAngeles, referenceDate: date, deviceTimeZone: utc)
        XCTAssertNil(snapshot.dayOffsetLabel)
    }

    func testDayOffsetLabelIsPositiveWhenCityIsAheadIntoTomorrow() throws {
        let tokyo = try XCTUnwrap(CityCatalog.city(withID: "tokyo"))
        // 23:30 UTC on Jan 1 is 08:30 JST (UTC+9) on Jan 2 — a day ahead of the UTC device.
        let date = utcDate(year: 2026, month: 1, day: 1, hour: 23, minute: 30)

        let snapshot = CityClockSnapshot(city: tokyo, referenceDate: date, deviceTimeZone: utc)
        XCTAssertEqual(snapshot.dayOffsetLabel, "+1d")
    }

    func testDayOffsetLabelIsNegativeWhenCityIsBehindIntoYesterday() throws {
        let honolulu = try XCTUnwrap(CityCatalog.city(withID: "honolulu"))
        // 05:00 UTC on Jan 2 is 19:00 HST (UTC-10) on Jan 1 — a day behind the UTC device.
        let date = utcDate(year: 2026, month: 1, day: 2, hour: 5)

        let snapshot = CityClockSnapshot(city: honolulu, referenceDate: date, deviceTimeZone: utc)
        XCTAssertEqual(snapshot.dayOffsetLabel, "-1d")
    }
}
