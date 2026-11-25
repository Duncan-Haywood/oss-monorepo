import Foundation
import HealthKit

/// Applies the server's HealthKit feed. Each meal is one sample per nutrient
/// with HKMetadataKeySyncIdentifier = "pna:<meal>:<nutrient>" and
/// HKMetadataKeySyncVersion = meal version: HealthKit itself replaces a
/// lower-version sample with the same identifier, so a corrected meal never
/// double-counts, and a retried write of the same version is skipped.
final class HealthKitSync {
    static let shared = HealthKitSync()
    let store = HKHealthStore()

    static let writeTypes: [String: HKQuantityTypeIdentifier] = [
        "dietaryEnergyConsumed": .dietaryEnergyConsumed,
        "dietaryProtein": .dietaryProtein,
        "dietaryCarbohydrates": .dietaryCarbohydrates,
        "dietaryFatTotal": .dietaryFatTotal,
        "dietaryFiber": .dietaryFiber,
        "dietarySugar": .dietarySugar,
        "dietaryFatSaturated": .dietaryFatSaturated,
        "dietarySodium": .dietarySodium,
    ]
    static let unitFor: [String: HKUnit] = ["kcal": .kilocalorie(), "g": .gram(), "mg": .gramUnit(with: .milli)]

    var shareTypes: Set<HKSampleType> { Set(Self.writeTypes.values.map { HKQuantityType($0) }) }
    var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = Set([HKQuantityTypeIdentifier.bodyMass, .bodyFatPercentage, .leanBodyMass, .activeEnergyBurned,
                                        .basalEnergyBurned, .stepCount, .appleExerciseTime, .dietaryEnergyConsumed].map { HKQuantityType($0) })
        s.insert(HKCategoryType(.sleepAnalysis))
        s.insert(HKObjectType.workoutType())
        return s
    }

    func requestAuthorization() async throws {
        guard HKHealthStore.isHealthDataAvailable() else { return }
        try await store.requestAuthorization(toShare: shareTypes, read: readTypes)
    }

    enum ApplyOutcome { case written([String]), deferred(String), failed(String) }

    /// Apply one change. `deferred` means try again later (device locked, no permission yet) without
    /// telling the server it failed; `failed` is reported so it shows in get_sync_status.
    func apply(_ change: APIClient.HealthChange) async -> ApplyOutcome {
        do {
            if change.action == "delete" {
                try await delete(syncIds: change.sync_identifiers ?? [])
                return .written([])
            }
            guard let startStr = change.start, let start = APIClient.iso.date(from: startStr) else { return .failed("missing start time") }
            let samples = change.samples ?? []
            let existing = try await existingVersions(syncIds: samples.map(\.sync_identifier))
            var toSave: [HKQuantitySample] = []
            for s in samples {
                if let v = existing[s.sync_identifier], v >= change.version { continue } // already written: partial-write recovery
                guard let id = Self.writeTypes[s.type], let unit = Self.unitFor[s.unit] else { continue }
                var meta: [String: Any] = [
                    HKMetadataKeySyncIdentifier: s.sync_identifier,
                    HKMetadataKeySyncVersion: NSNumber(value: change.version),
                    "PNAMealID": change.meal_id,
                ]
                if let food = change.food_type { meta[HKMetadataKeyFoodType] = food }
                if let tz = change.time_zone { meta[HKMetadataKeyTimeZone] = tz }
                if change.provisional == true { meta["PNAProvisional"] = true }
                toSave.append(HKQuantitySample(type: HKQuantityType(id), quantity: HKQuantity(unit: unit, doubleValue: s.value),
                                               start: start, end: start, metadata: meta))
            }
            if !toSave.isEmpty { try await store.save(toSave) }
            if let gone = change.delete_sync_identifiers, !gone.isEmpty { try await delete(syncIds: gone) }
            return .written(toSave.map { $0.uuid.uuidString })
        } catch let e as HKError where e.code == .errorDatabaseInaccessible {
            return .deferred("Health database locked (device locked)")
        } catch let e as HKError where e.code == .errorAuthorizationNotDetermined || e.code == .errorAuthorizationDenied {
            return .deferred("Health permission missing")
        } catch {
            return .failed(String(describing: error))
        }
    }

    /// Our own samples by sync identifier -> highest stored sync version.
    private func existingVersions(syncIds: [String]) async throws -> [String: Int] {
        guard !syncIds.isEmpty else { return [:] }
        var out: [String: Int] = [:]
        let predicate = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: syncIds)
        for id in Set(Self.writeTypes.values) {
            let d = HKSampleQueryDescriptor(predicates: [.quantitySample(type: HKQuantityType(id), predicate: predicate)], sortDescriptors: [])
            for s in try await d.result(for: store) {
                guard let key = s.metadata?[HKMetadataKeySyncIdentifier] as? String else { continue }
                let v = (s.metadata?[HKMetadataKeySyncVersion] as? NSNumber)?.intValue ?? 0
                out[key] = max(out[key] ?? 0, v)
            }
        }
        return out
    }

    private func delete(syncIds: [String]) async throws {
        guard !syncIds.isEmpty else { return }
        let predicate = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: syncIds)
        for id in Set(Self.writeTypes.values) {
            _ = try await store.deleteObjects(of: HKQuantityType(id), predicate: predicate)
        }
    }

    // MARK: - Reading daily metrics for the server's longitudinal analysis

    func dailyMetrics(days: Int = 14) async -> [[String: Any]] {
        let cal = Calendar.current
        let end = cal.startOfDay(for: Date()).addingTimeInterval(86400)
        let start = cal.date(byAdding: .day, value: -days, to: end)!
        var byDay: [String: [String: Any]] = [:]
        let fmt = DateFormatter()
        fmt.calendar = cal
        fmt.dateFormat = "yyyy-MM-dd"

        func collect(_ id: HKQuantityTypeIdentifier, _ key: String, _ unit: HKUnit, cumulative: Bool, scale: Double = 1) async {
            let type = HKQuantityType(id)
            let q = HKStatisticsCollectionQueryDescriptor(
                predicate: .quantitySample(type: type, predicate: HKQuery.predicateForSamples(withStart: start, end: end)),
                options: cumulative ? .cumulativeSum : .mostRecent, anchorDate: start, intervalComponents: DateComponents(day: 1))
            guard let coll = try? await q.result(for: store) else { return }
            coll.enumerateStatistics(from: start, to: end) { stat, _ in
                let qty = cumulative ? stat.sumQuantity() : stat.mostRecentQuantity()
                guard let v = qty?.doubleValue(for: unit) else { return }
                byDay[fmt.string(from: stat.startDate), default: ["date": fmt.string(from: stat.startDate)]][key] = v * scale
            }
        }
        await collect(.bodyMass, "body_mass_kg", .gramUnit(with: .kilo), cumulative: false)
        await collect(.bodyFatPercentage, "body_fat_pct", .percent(), cumulative: false, scale: 100)
        await collect(.leanBodyMass, "lean_mass_kg", .gramUnit(with: .kilo), cumulative: false)
        await collect(.activeEnergyBurned, "active_kcal", .kilocalorie(), cumulative: true)
        await collect(.basalEnergyBurned, "resting_kcal", .kilocalorie(), cumulative: true)
        await collect(.stepCount, "steps", .count(), cumulative: true)
        await collect(.appleExerciseTime, "exercise_minutes", .minute(), cumulative: true)

        // Sleep: hours asleep (any asleep stage), attributed to the day the sleep ended.
        let sleep = HKSampleQueryDescriptor(predicates: [.categorySample(type: HKCategoryType(.sleepAnalysis), predicate: HKQuery.predicateForSamples(withStart: start, end: end))], sortDescriptors: [])
        if let samples = try? await sleep.result(for: store) {
            for s in samples where HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue).contains(s.value) {
                let k = fmt.string(from: s.endDate)
                let prev = byDay[k]?["sleep_hours"] as? Double ?? 0
                byDay[k, default: ["date": k]]["sleep_hours"] = prev + s.endDate.timeIntervalSince(s.startDate) / 3600
            }
        }
        // Resistance training minutes.
        let workouts = HKSampleQueryDescriptor(predicates: [.workout(HKQuery.predicateForWorkouts(with: .traditionalStrengthTraining))], sortDescriptors: [])
        if let ws = try? await workouts.result(for: store) {
            for w in ws where w.startDate >= start {
                let k = fmt.string(from: w.startDate)
                let prev = byDay[k]?["strength_minutes"] as? Double ?? 0
                byDay[k, default: ["date": k]]["strength_minutes"] = prev + w.duration / 60
            }
        }
        return byDay.values.sorted { ($0["date"] as! String) < ($1["date"] as! String) }
    }
}
