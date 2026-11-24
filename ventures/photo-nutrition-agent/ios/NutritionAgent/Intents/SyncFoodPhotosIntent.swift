import AppIntents

/// The near-real-time trigger. iOS has no "photo taken" event for third-party
/// apps, but Shortcuts has a personal automation "When Camera is closed". Point
/// it at this intent once, turn off "Ask Before Running" and "Notify When Run",
/// and every time the person leaves the Camera app the agent scans, classifies
/// and uploads, without opening this app (docs/install.md, step 5).
struct SyncFoodPhotosIntent: AppIntent {
    static var title: LocalizedStringResource = "Sync Food Photos"
    static var description = IntentDescription("Finds new food photos, logs their nutrition and updates Apple Health.")
    static var openAppWhenRun = false

    @Parameter(title: "Trigger", default: "shortcut")
    var trigger: String

    func perform() async throws -> some IntentResult & ReturnsValue<String> {
        let reason: AgentEngine.Reason = trigger == "camera" ? .cameraClosed : trigger == "charger" ? .charger : .shortcut
        // App Intent background time is short and undocumented; stay well inside it.
        // Unfinished work stays queued in the outbox for the next wake.
        let report = await AgentEngine.shared.runCycle(reason: reason, budget: 25)
        return .result(value: report.summary)
    }
}

struct NutritionShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: SyncFoodPhotosIntent(), phrases: ["Sync food photos in \(.applicationName)", "Log my meal photos with \(.applicationName)"],
                    shortTitle: "Sync Food Photos", systemImageName: "fork.knife")
    }
}
