import XCTest
@testable import WorldClockCore

final class CityTimeFormattingTests: XCTestCase {

    /// en_GB renders a 24-hour clock, so these assertions don't depend on how a given ICU
    /// version spells or spaces "AM"/"PM".
    private let locale = Locale(identifier: "en_GB")
    private let utc = TimeZone(identifier: "UTC")!

    private func utcDate(year: Int, month: Int, day: Int, hour: Int, minute: Int = 0) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = utc
        return calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour, minute: minute))!
    }

    func testTimeStringRendersInTheCityTimeZoneRatherThanUTC() throws {
        let tokyo = try XCTUnwrap(CityCatalog.city(withID: "tokyo"))
        let losAngeles = try XCTUnwrap(CityCatalog.city(withID: "los-angeles"))
        // One instant: 12:00 UTC is 21:00 JST (UTC+9) and 04:00 PST (UTC-8).
        let instant = utcDate(year: 2026, month: 1, day: 1, hour: 12)

        XCTAssertEqual(CityTimeFormatting.timeString(for: instant, in: tokyo, locale: locale), "21:00")
        XCTAssertEqual(CityTimeFormatting.timeString(for: instant, in: losAngeles, locale: locale), "04:00")
    }

    func testDateStringFollowsTheCityDateAcrossMidnight() throws {
        let tokyo = try XCTUnwrap(CityCatalog.city(withID: "tokyo"))
        let london = try XCTUnwrap(CityCatalog.city(withID: "london"))
        // 23:30 UTC on Jan 1 is already Jan 2 in Tokyo and still Jan 1 in London.
        let instant = utcDate(year: 2026, month: 1, day: 1, hour: 23, minute: 30)

        let tokyoDate = CityTimeFormatting.dateString(for: instant, in: tokyo, locale: locale)
        let londonDate = CityTimeFormatting.dateString(for: instant, in: london, locale: locale)

        XCTAssertNotEqual(tokyoDate, londonDate)
        XCTAssertTrue(tokyoDate.contains("2026"), "unexpected date rendering: \(tokyoDate)")
    }

    func testReusedFormattersDoNotLeakAcrossCitiesOrLocales() throws {
        let tokyo = try XCTUnwrap(CityCatalog.city(withID: "tokyo"))
        let london = try XCTUnwrap(CityCatalog.city(withID: "london"))
        let instant = utcDate(year: 2026, month: 1, day: 1, hour: 12)

        let first = CityTimeFormatting.timeString(for: instant, in: tokyo, locale: locale)
        _ = CityTimeFormatting.timeString(for: instant, in: london, locale: Locale(identifier: "en_US"))
        _ = CityTimeFormatting.dateString(for: instant, in: tokyo, locale: locale)

        XCTAssertEqual(CityTimeFormatting.timeString(for: instant, in: tokyo, locale: locale), first)
    }
}
