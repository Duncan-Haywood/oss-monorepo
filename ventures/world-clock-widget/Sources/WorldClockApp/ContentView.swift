import SwiftUI
import WorldClockCore

struct ContentView: View {
    @StateObject private var store = SelectedCitiesStore()
    @State private var isPresentingAddCity = false

    var body: some View {
        NavigationStack {
            TimelineView(.periodic(from: .now, by: 1)) { timeline in
                List {
                    if store.selectedCities.isEmpty {
                        ContentUnavailableView(
                            "No Cities Yet",
                            systemImage: "globe",
                            description: Text("Add a city to see its time, sunrise, and sunset.")
                        )
                    } else {
                        ForEach(store.selectedCities) { city in
                            NavigationLink(value: city) {
                                CityRowView(snapshot: CityClockSnapshot(city: city, referenceDate: timeline.date))
                            }
                        }
                        .onDelete(perform: store.remove(at:))
                        .onMove(perform: store.move(fromOffsets:toOffset:))
                    }
                }
                .navigationDestination(for: City.self) { city in
                    CityDetailView(city: city, referenceDate: timeline.date)
                }
            }
            .navigationTitle("World Clock")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        isPresentingAddCity = true
                    } label: {
                        Label("Add City", systemImage: "plus")
                    }
                }
                #if os(iOS)
                ToolbarItem(placement: .navigationBarLeading) {
                    EditButton()
                }
                #endif
            }
            .sheet(isPresented: $isPresentingAddCity) {
                AddCityView(store: store)
            }
        }
    }
}

#Preview {
    ContentView()
}
