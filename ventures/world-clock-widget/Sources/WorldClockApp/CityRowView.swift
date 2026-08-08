import SwiftUI
import WorldClockCore

struct CityRowView: View {
    let snapshot: CityClockSnapshot

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: snapshot.isDaytime ? "sun.max.fill" : "moon.stars.fill")
                .foregroundStyle(snapshot.isDaytime ? .yellow : .indigo)
                .font(.title3)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(snapshot.city.name)
                        .font(.headline)
                    if let dayOffsetLabel = snapshot.dayOffsetLabel {
                        Text(dayOffsetLabel)
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(.secondary.opacity(0.15), in: Capsule())
                    }
                }
                Text(snapshot.city.country)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                HStack(spacing: 10) {
                    if let sunrise = snapshot.sunrise {
                        Label(CityTimeFormatting.timeString(for: sunrise, in: snapshot.city), systemImage: "sunrise.fill")
                    }
                    if let sunset = snapshot.sunset {
                        Label(CityTimeFormatting.timeString(for: sunset, in: snapshot.city), systemImage: "sunset.fill")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            Spacer()

            Text(CityTimeFormatting.timeString(for: snapshot.referenceDate, in: snapshot.city))
                .font(.title2.monospacedDigit())
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .padding(.vertical, 4)
    }
}
