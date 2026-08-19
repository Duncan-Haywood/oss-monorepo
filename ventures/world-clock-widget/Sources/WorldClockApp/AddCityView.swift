import SwiftUI
import WorldClockCore

struct AddCityView: View {
    @ObservedObject var store: SelectedCitiesStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var availableCities: [City] {
        let selectedIDs = Set(store.selectedCityIDs)
        return CityCatalog.allCities
            .filter { !selectedIDs.contains($0.id) }
            .filter {
                query.isEmpty
                    || $0.name.localizedCaseInsensitiveContains(query)
                    || $0.country.localizedCaseInsensitiveContains(query)
            }
            .sorted { $0.name < $1.name }
    }

    var body: some View {
        NavigationStack {
            List(availableCities) { city in
                Button {
                    store.add(city)
                    dismiss()
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(city.name)
                            .foregroundStyle(.primary)
                        Text(city.country)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .overlay {
                if availableCities.isEmpty {
                    if query.isEmpty {
                        ContentUnavailableView("All Cities Added", systemImage: "checkmark.circle")
                    } else {
                        ContentUnavailableView.search(text: query)
                    }
                }
            }
            .searchable(text: $query, prompt: "Search cities")
            .navigationTitle("Add City")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
