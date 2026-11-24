import BackgroundTasks
import Foundation

/// Opportunistic catch-up wakes. iOS decides when (and whether) these run,
/// based on how often the app is used, battery and network; they are a safety
/// net behind the Camera-closed automation, not the primary trigger.
enum BackgroundScheduler {
    static let refreshId = "com.example.nutritionagent.refresh"
    static let catchupId = "com.example.nutritionagent.catchup"

    /// Call from the app's init, before the app finishes launching.
    static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: refreshId, using: nil) { task in
            handle(task, reason: .appRefresh, budget: 25)
        }
        BGTaskScheduler.shared.register(forTaskWithIdentifier: catchupId, using: nil) { task in
            handle(task, reason: .processing, budget: 240)
        }
    }

    static func schedule() {
        let refresh = BGAppRefreshTaskRequest(identifier: refreshId)
        refresh.earliestBeginDate = Date(timeIntervalSinceNow: 20 * 60)
        try? BGTaskScheduler.shared.submit(refresh)

        let catchup = BGProcessingTaskRequest(identifier: catchupId)
        catchup.requiresNetworkConnectivity = true
        catchup.requiresExternalPower = false
        catchup.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 3600)
        try? BGTaskScheduler.shared.submit(catchup)
    }

    private static func handle(_ task: BGTask, reason: AgentEngine.Reason, budget: TimeInterval) {
        schedule() // always queue the next one first
        let work = Task {
            let report = await AgentEngine.shared.runCycle(reason: reason, budget: budget)
            task.setTaskCompleted(success: report.errors.isEmpty)
        }
        task.expirationHandler = { work.cancel() }
    }
}
