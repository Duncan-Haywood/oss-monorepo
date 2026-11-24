import Foundation
import Photos
import UIKit

/// One wake cycle: scan -> classify -> upload -> apply HealthKit feed -> send
/// metrics -> heartbeat. Every step is resumable; the time budget is checked
/// between steps and between photos, so a short background window still makes
/// progress and the next wake continues where this one stopped.
actor AgentEngine {
    static let shared = AgentEngine()
    private var running = false
    private let api = APIClient()

    enum Reason: String { case cameraClosed = "camera_closed", shortcut, appRefresh = "app_refresh", processing, foreground, charger }

    @discardableResult
    func runCycle(reason: Reason, budget: TimeInterval) async -> CycleReport {
        let started = Date()
        var report = CycleReport(reason: reason.rawValue, startedAt: started, finishedAt: started)
        guard !running else { report.errors.append("a cycle is already running"); return report }
        running = true
        defer { running = false }
        let deadline = started.addingTimeInterval(budget)
        func timeLeft() -> Bool { Date() < deadline.addingTimeInterval(-3) }

        if AgentSettings.paused {
            report.errors.append("paused on this iPhone")
        } else {
            do {
                try await scan(&report)
                if timeLeft() { try await uploadPending(&report, until: deadline) }
            } catch {
                report.errors.append("photos: \(error)")
            }
        }
        if timeLeft() {
            do { try await applyHealthFeed(&report, until: deadline) } catch { report.errors.append("health: \(error)") }
        }
        if timeLeft(), reason != .cameraClosed { // metrics are not urgent; skip them on the latency-sensitive wake
            let days = await HealthKitSync.shared.dailyMetrics()
            if !days.isEmpty { do { try await api.metrics(days) } catch { report.errors.append("metrics: \(error)") } }
        }
        let state = await Outbox.shared.state
        let osVersion = await MainActor.run { UIDevice.current.systemVersion }
        let hb: [String: Any] = [
            "time_zone": TimeZone.current.identifier,
            "wake_reason": reason.rawValue,
            "app_version": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "?",
            "os_version": osVersion,
            "photo_authorization": PhotoScanner.authorization() == .authorized ? "full" : "not_full",
            "pending_uploads": state.pending.count,
            "last_scan_at": state.lastScanAt.map { APIClient.iso.string(from: $0) } ?? NSNull(),
            "last_error": report.errors.first ?? NSNull(),
        ]
        if let h = try? await api.heartbeat(hb) {
            AgentSettings.minFoodScore = h.min_food_score
        }
        report.finishedAt = Date()
        let finished = report
        try? await Outbox.shared.update { $0.lastCycle = finished; $0.lastError = finished.errors.first }
        return report
    }

    /// Record new likely-food asset ids, then advance the change token.
    private func scan(_ report: inout CycleReport) async throws {
        let state = await Outbox.shared.state
        let (ids, token) = try PhotoScanner.newAssetIds(since: state.changeToken)
        report.scanned = ids.count
        let fresh = ids.filter { !state.processed.contains($0) && !state.pending.contains(where: { p in p.assetId == $0 }) }
        let now = Date()
        try await Outbox.shared.update { s in
            s.pending.append(contentsOf: fresh.map { AgentState.PendingAsset(assetId: $0, discoveredAt: now) })
            if let token { s.changeToken = token }
            s.lastScanAt = now
        }
    }

    /// Classify each pending asset on device; upload only likely food.
    private func uploadPending(_ report: inout CycleReport, until deadline: Date) async throws {
        let pending = await Outbox.shared.state.pending
        if pending.isEmpty { return }
        let known = (try? await api.knownAssets(pending.map(\.assetId))) ?? []
        for item in pending {
            if Date() > deadline.addingTimeInterval(-10) { break }
            if known.contains(item.assetId) { try await finish(item.assetId); continue }
            guard let asset = PhotoScanner.asset(item.assetId) else { try await finish(item.assetId); continue } // deleted
            do {
                let data = try await PhotoScanner.imageData(for: asset)
                let prepared = try ImagePrep.prepare(data)
                let verdict = try FoodClassifier.classify(prepared.thumbnail)
                if verdict.foodScore < AgentSettings.minFoodScore {
                    try await finish(item.assetId) // not food: never leaves the phone
                    continue
                }
                report.candidates += 1
                let tz = TimeZone.current
                let captured = asset.creationDate ?? Date()
                let upload = APIClient.PhotoUpload(
                    asset_id: item.assetId,
                    captured_at: APIClient.iso.string(from: captured),
                    tz_offset_min: tz.secondsFromGMT(for: captured) / 60,
                    time_zone: tz.identifier,
                    is_screenshot: asset.mediaSubtypes.contains(.photoScreenshot),
                    has_camera_exif: prepared.hasCameraExif,
                    food_score: verdict.foodScore,
                    food_labels: verdict.topLabels,
                    dhash: prepared.dhash,
                    image_base64: prepared.uploadJPEG.base64EncodedString())
                _ = try await api.upload(upload)
                report.uploaded += 1
                try await finish(item.assetId)
            } catch APIClient.APIError.paused {
                return // keep everything pending until the server resumes
            } catch {
                report.errors.append("asset: \(error)")
                try await Outbox.shared.update { s in
                    if let i = s.pending.firstIndex(where: { $0.assetId == item.assetId }) {
                        s.pending[i].attempts += 1
                        s.pending[i].lastError = String(describing: error)
                        // A photo that keeps failing on device (corrupt, unavailable in iCloud) is dropped after 20 tries.
                        if s.pending[i].attempts >= 20 { s.processed.insert(item.assetId); s.pending.remove(at: i) }
                    }
                }
            }
        }
    }

    private func finish(_ assetId: String) async throws {
        try await Outbox.shared.update { s in
            s.pending.removeAll { $0.assetId == assetId }
            s.processed.insert(assetId)
        }
    }

    private func applyHealthFeed(_ report: inout CycleReport, until deadline: Date) async throws {
        var cursor = await Outbox.shared.state.healthCursor
        while Date() < deadline.addingTimeInterval(-5) {
            let feed = try await api.healthChanges(since: cursor)
            var acks: [APIClient.Ack] = []
            var blocked = false
            for change in feed.changes {
                switch await HealthKitSync.shared.apply(change) {
                case .written(let uuids):
                    acks.append(.init(meal_id: change.meal_id, version: change.version, ok: true, sample_uuids: uuids, error: nil))
                    report.healthApplied += 1
                case .failed(let msg):
                    acks.append(.init(meal_id: change.meal_id, version: change.version, ok: false, sample_uuids: nil, error: msg))
                case .deferred(let msg):
                    report.errors.append(msg)
                    blocked = true
                }
                if blocked { break }
            }
            if !acks.isEmpty { try await api.ack(acks) }
            // Only advance past changes that were all handled; a deferred one is retried next wake.
            if blocked { break }
            cursor = feed.cursor
            let c = cursor
            try await Outbox.shared.update { $0.healthCursor = c }
            if !feed.more { break }
        }
    }
}
