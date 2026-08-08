import Foundation
import WidgetKit
import WorldClockCore

/// The app's editable list of cities. Every mutation writes through to the shared App Group
/// store (so a freshly added widget picks it up as its default) and nudges WidgetKit to
/// redraw immediately rather than waiting for its next scheduled refresh.
@MainActor
final class SelectedCitiesStore: ObservableObject {
    @Published private(set) var selectedCityIDs: [String]

    init() {
        selectedCityIDs = SharedStore.selectedCityIDs
    }

    var selectedCities: [City] {
        selectedCityIDs.compactMap(CityCatalog.city(withID:))
    }

    func add(_ city: City) {
        guard !selectedCityIDs.contains(city.id) else { return }
        selectedCityIDs.append(city.id)
        persist()
    }

    func remove(_ city: City) {
        selectedCityIDs.removeAll { $0 == city.id }
        persist()
    }

    func remove(at offsets: IndexSet) {
        selectedCityIDs.remove(atOffsets: offsets)
        persist()
    }

    func move(fromOffsets source: IndexSet, toOffset destination: Int) {
        selectedCityIDs.move(fromOffsets: source, toOffset: destination)
        persist()
    }

    private func persist() {
        SharedStore.selectedCityIDs = selectedCityIDs
        WidgetCenter.shared.reloadAllTimelines()
    }
}
