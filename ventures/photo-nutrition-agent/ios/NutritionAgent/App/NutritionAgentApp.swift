import SwiftUI
import Photos

/// Deliberately not a food diary: setup, status, and controls. ChatGPT is the interface.
@main
struct NutritionAgentApp: App {
    @Environment(\.scenePhase) private var phase

    init() { BackgroundScheduler.register() }

    var body: some Scene {
        WindowGroup { StatusView() }
            .onChange(of: phase) { _, p in
                if p == .active { Task { await AgentEngine.shared.runCycle(reason: .foreground, budget: 60) } }
                if p == .background { BackgroundScheduler.schedule() }
            }
    }
}

struct StatusView: View {
    @State private var server = AgentSettings.serverURL?.absoluteString ?? ""
    @State private var token = ""
    @State private var paused = AgentSettings.paused
    @State private var photoStatus = PhotoScanner.authorization()
    @State private var last: CycleReport?
    @State private var pending = 0
    @State private var lastError: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Server") {
                    TextField("https://your-server.example", text: $server).textInputAutocapitalization(.never).keyboardType(.URL)
                    SecureField(AgentSettings.deviceToken == nil ? "Device token" : "Device token (saved)", text: $token)
                    Button("Save") {
                        AgentSettings.serverURL = URL(string: server.trimmingCharacters(in: .whitespaces))
                        if !token.isEmpty { AgentSettings.deviceToken = token; token = "" }
                    }
                }
                Section("Permissions") {
                    LabeledContent("Photos", value: photoStatus == .authorized ? "Full access" : photoStatus == .limited ? "Limited (new photos not visible)" : "Not granted")
                    Button("Allow full photo access") {
                        Task { photoStatus = await PHPhotoLibrary.requestAuthorization(for: .readWrite) }
                    }
                    Button("Allow Apple Health") { Task { try? await HealthKitSync.shared.requestAuthorization() } }
                }
                Section("Automation") {
                    Text("In Shortcuts > Automation, add \"App: Camera is Closed\" > Sync Food Photos (Trigger: camera). Turn off Ask Before Running and Notify When Run.")
                        .font(.footnote)
                    Toggle("Pause automatic processing", isOn: $paused).onChange(of: paused) { _, v in AgentSettings.paused = v }
                }
                Section("Status") {
                    LabeledContent("Waiting to upload", value: "\(pending)")
                    if let last { LabeledContent("Last run", value: last.finishedAt.formatted(date: .abbreviated, time: .shortened)); Text(last.summary).font(.footnote) }
                    if let lastError { Text(lastError).font(.footnote).foregroundStyle(.red) }
                    Button(busy ? "Running..." : "Run now") {
                        busy = true
                        Task { await AgentEngine.shared.runCycle(reason: .foreground, budget: 120); await refresh(); busy = false }
                    }.disabled(busy)
                }
                Section("Privacy") {
                    Text("Photos are classified on this iPhone. Only likely food photos are uploaded, downscaled and without location data, to the server above. Export or erase your records from the server (docs/privacy.md).")
                        .font(.footnote)
                }
            }
            .navigationTitle("Nutrition Agent")
            .task { await refresh() }
        }
    }

    private func refresh() async {
        let s = await Outbox.shared.state
        last = s.lastCycle
        pending = s.pending.count
        lastError = s.lastError
        photoStatus = PhotoScanner.authorization()
    }
}
