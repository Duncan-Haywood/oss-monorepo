import Foundation

/// Durable on-device state, one JSON file in the App Group container, written
/// atomically. The persistent-change token only advances after the assets it
/// covers are recorded here, so a crash or kill between steps re-scans rather
/// than loses a photo (the server dedupes by asset id).
struct AgentState: Codable {
    struct PendingAsset: Codable, Hashable {
        var assetId: String
        var discoveredAt: Date
        var attempts: Int = 0
        var lastError: String?
    }
    var changeToken: Data?             // NSKeyedArchiver-encoded PHPersistentChangeToken
    var lastScanAt: Date?
    var pending: [PendingAsset] = []   // likely-food assets not yet accepted by the server
    var processed: Set<String> = []    // asset ids handled (uploaded, or classified as not food); capped
    var healthCursor: Int = 0          // server seq already applied to HealthKit
    var lastError: String?
    var lastCycle: CycleReport?
}

struct CycleReport: Codable {
    var reason: String
    var startedAt: Date
    var finishedAt: Date
    var scanned = 0
    var candidates = 0
    var uploaded = 0
    var healthApplied = 0
    var errors: [String] = []
    var summary: String {
        "\(reason): scanned \(scanned), food \(candidates), uploaded \(uploaded), Health \(healthApplied)" + (errors.isEmpty ? "" : ", \(errors.count) error(s)")
    }
}

actor Outbox {
    static let shared = Outbox()
    private let url: URL
    private(set) var state: AgentState

    init() {
        let dir = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: AgentSettings.appGroup)
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        url = dir.appendingPathComponent("agent-state.json")
        if let d = try? Data(contentsOf: url), let s = try? JSONDecoder().decode(AgentState.self, from: d) {
            state = s
        } else {
            state = AgentState()
        }
    }

    func update(_ body: (inout AgentState) -> Void) throws {
        body(&state)
        if state.processed.count > 20_000 { state.processed = Set(state.processed.suffix(10_000)) }
        let data = try JSONEncoder().encode(state)
        // completeUntilFirstUserAuthentication: readable by background wakes after the first unlock.
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
