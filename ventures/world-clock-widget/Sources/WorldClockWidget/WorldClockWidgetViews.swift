import SwiftUI
import WidgetKit
import WorldClockCore

struct WorldClockWidgetView: View {
    let entry: CityTimelineEntry
    @Environment(\.widgetFamily) private var family

    private var snapshots: [CityClockSnapshot] {
        entry.cities.map { CityClockSnapshot(city: $0, referenceDate: entry.date) }
    }

    var body: some View {
        Group {
            switch family {
            case .systemSmall:
                SmallWorldClockView(snapshot: snapshots.first)
            case .systemMedium:
                CityListWorldClockView(snapshots: Array(snapshots.prefix(3)), showsDate: false)
            case .systemLarge:
                CityListWorldClockView(snapshots: Array(snapshots.prefix(6)), showsDate: false)
            case .systemExtraLarge:
                ExtraLargeWorldClockView(snapshots: Array(snapshots.prefix(8)))
            case .accessoryRectangular:
                AccessoryRectangularClockView(snapshot: snapshots.first)
            case .accessoryInline:
                AccessoryInlineClockView(snapshot: snapshots.first)
            default:
                CityListWorldClockView(snapshots: Array(snapshots.prefix(3)), showsDate: false)
            }
        }
        .worldClockBackground(isDaytime: snapshots.first?.isDaytime ?? true, family: family)
    }
}

// MARK: - System family layouts

private struct SmallWorldClockView: View {
    let snapshot: CityClockSnapshot?

    var body: some View {
        if let snapshot {
            VStack(alignment: .leading, spacing: 4) {
                Text(snapshot.city.name)
                    .font(.caption)
                    .fontWeight(.semibold)
                    .lineLimit(1)
                Text(CityTimeFormatting.timeString(for: snapshot.referenceDate, in: snapshot.city))
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(CityTimeFormatting.dateString(for: snapshot.referenceDate, in: snapshot.city))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Spacer(minLength: 2)
                SunTimesRow(snapshot: snapshot)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            EmptyStateView()
        }
    }
}

private struct CityListWorldClockView: View {
    let snapshots: [CityClockSnapshot]
    let showsDate: Bool

    var body: some View {
        if snapshots.isEmpty {
            EmptyStateView()
        } else {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(snapshots.enumerated()), id: \.element.city.id) { index, snapshot in
                    CityRow(snapshot: snapshot, showsDate: showsDate)
                    if index != snapshots.count - 1 {
                        Divider().overlay(.white.opacity(0.15))
                    }
                }
            }
        }
    }
}

private struct ExtraLargeWorldClockView: View {
    let snapshots: [CityClockSnapshot]

    private var columns: [[CityClockSnapshot]] {
        let half = (snapshots.count + 1) / 2
        return [Array(snapshots.prefix(half)), Array(snapshots.dropFirst(half))]
    }

    var body: some View {
        if snapshots.isEmpty {
            EmptyStateView()
        } else {
            HStack(alignment: .top, spacing: 24) {
                ForEach(columns.indices, id: \.self) { index in
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(columns[index], id: \.city.id) { snapshot in
                            CityRow(snapshot: snapshot, showsDate: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }
}

// MARK: - Lock screen accessories (iOS only)

private struct AccessoryRectangularClockView: View {
    let snapshot: CityClockSnapshot?

    var body: some View {
        if let snapshot {
            VStack(alignment: .leading, spacing: 1) {
                Text(snapshot.city.name)
                    .font(.caption2.weight(.semibold))
                    .lineLimit(1)
                Text(CityTimeFormatting.timeString(for: snapshot.referenceDate, in: snapshot.city))
                    .font(.title3.weight(.bold))
                    .monospacedDigit()
                SunTimesRow(snapshot: snapshot)
            }
        } else {
            EmptyStateView()
        }
    }
}

private struct AccessoryInlineClockView: View {
    let snapshot: CityClockSnapshot?

    var body: some View {
        if let snapshot {
            Label(
                "\(snapshot.city.name) \(CityTimeFormatting.timeString(for: snapshot.referenceDate, in: snapshot.city))",
                systemImage: snapshot.isDaytime ? "sun.max.fill" : "moon.stars.fill"
            )
        } else {
            Text("World Clock")
        }
    }
}

// MARK: - Shared pieces

private struct CityRow: View {
    let snapshot: CityClockSnapshot
    let showsDate: Bool

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(snapshot.city.name)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                    if let dayOffsetLabel = snapshot.dayOffsetLabel {
                        Text(dayOffsetLabel)
                            .font(.caption2.weight(.semibold))
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(.white.opacity(0.18), in: Capsule())
                    }
                }
                if showsDate {
                    Text(CityTimeFormatting.dateString(for: snapshot.referenceDate, in: snapshot.city))
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                SunTimesRow(snapshot: snapshot)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 1) {
                Image(systemName: snapshot.isDaytime ? "sun.max.fill" : "moon.stars.fill")
                    .font(.caption)
                    .foregroundStyle(snapshot.isDaytime ? .yellow : .indigo)
                Text(CityTimeFormatting.timeString(for: snapshot.referenceDate, in: snapshot.city))
                    .font(.title3.weight(.semibold))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
    }
}

private struct SunTimesRow: View {
    let snapshot: CityClockSnapshot

    var body: some View {
        HStack(spacing: 6) {
            if let sunrise = snapshot.sunrise {
                Label(CityTimeFormatting.timeString(for: sunrise, in: snapshot.city), systemImage: "sunrise.fill")
            }
            if let sunset = snapshot.sunset {
                Label(CityTimeFormatting.timeString(for: sunset, in: snapshot.city), systemImage: "sunset.fill")
            }
        }
        .labelStyle(.titleAndIcon)
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
}

private struct EmptyStateView: View {
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "globe")
                .font(.title2)
            Text("Pick cities in Edit Widget")
                .font(.caption2)
                .multilineTextAlignment(.center)
        }
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Background

private extension View {
    func worldClockBackground(isDaytime: Bool, family: WidgetFamily) -> some View {
        Group {
            switch family {
            case .accessoryRectangular, .accessoryInline, .accessoryCircular:
                // Lock screen accessories render on whatever the system's own material is;
                // they shouldn't paint their own background.
                self
            default:
                self.containerBackground(for: .widget) {
                    LinearGradient(
                        colors: isDaytime
                            ? [Color(red: 0.36, green: 0.62, blue: 0.98), Color(red: 0.16, green: 0.32, blue: 0.62)]
                            : [Color(red: 0.06, green: 0.08, blue: 0.22), Color(red: 0.02, green: 0.02, blue: 0.08)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
                .foregroundStyle(.white)
            }
        }
    }
}
