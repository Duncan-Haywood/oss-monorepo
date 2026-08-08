import SwiftUI
import WorldClockCore

struct CityDetailView: View {
    let city: City
    let referenceDate: Date

    private var snapshot: CityClockSnapshot {
        CityClockSnapshot(city: city, referenceDate: referenceDate)
    }

    var body: some View {
        List {
            Section {
                VStack(spacing: 6) {
                    Text(CityTimeFormatting.timeString(for: snapshot.referenceDate, in: city))
                        .font(.system(size: 56, weight: .bold, design: .rounded))
                        .monospacedDigit()
                    Text(CityTimeFormatting.dateString(for: snapshot.referenceDate, in: city))
                        .foregroundStyle(.secondary)
                    if let dayOffsetLabel = snapshot.dayOffsetLabel {
                        Text("\(dayOffsetLabel) vs. your local date")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .listRowBackground(Color.clear)
            }

            Section("Sun") {
                if let sunrise = snapshot.sunrise {
                    LabeledContent("Sunrise", value: CityTimeFormatting.timeString(for: sunrise, in: city))
                }
                if let sunset = snapshot.sunset {
                    LabeledContent("Sunset", value: CityTimeFormatting.timeString(for: sunset, in: city))
                }
                LabeledContent("Right now") {
                    Label(
                        snapshot.isDaytime ? "Daytime" : "Nighttime",
                        systemImage: snapshot.isDaytime ? "sun.max.fill" : "moon.stars.fill"
                    )
                }
            }

            Section("Location") {
                LabeledContent("Country", value: city.country)
                LabeledContent("Time Zone", value: city.timeZoneIdentifier)
                LabeledContent("Coordinates", value: String(format: "%.2f, %.2f", city.latitude, city.longitude))
            }
        }
        .navigationTitle(city.name)
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}
