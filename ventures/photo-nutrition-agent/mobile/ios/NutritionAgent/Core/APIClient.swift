import Foundation

/// Talks to your own backend (server/). Every call is idempotent on the server,
/// so any of them can be retried after a timeout without creating duplicates.
struct APIClient {
    enum APIError: Error, CustomStringConvertible {
        case notConfigured, http(Int, String), paused
        var description: String {
            switch self {
            case .notConfigured: return "server URL or device token not set"
            case .paused: return "processing is paused on the server"
            case let .http(code, body): return "HTTP \(code): \(body.prefix(200))"
            }
        }
    }

    struct PhotoUpload: Encodable {
        var asset_id: String
        var captured_at: String
        var tz_offset_min: Int
        var time_zone: String
        var is_screenshot: Bool
        var has_camera_exif: Bool
        var food_score: Double
        var food_labels: [String]
        var dhash: String
        var image_base64: String
        var image_mime = "image/jpeg"
    }

    struct PhotoResult: Decodable { var id: String; var state: String; var meal_id: String? }

    struct HealthSample: Decodable { var type: String; var unit: String; var value: Double; var sync_identifier: String }
    struct HealthChange: Decodable {
        var meal_id: String
        var version: Int
        var action: String                 // "upsert" | "delete"
        var start: String?
        var end: String?
        var time_zone: String?
        var food_type: String?
        var provisional: Bool?
        var samples: [HealthSample]?
        var delete_sync_identifiers: [String]?
        var sync_identifiers: [String]?
    }
    struct HealthFeed: Decodable { var cursor: Int; var changes: [HealthChange]; var more: Bool }

    struct Ack: Encodable { var meal_id: String; var version: Int; var ok: Bool; var sample_uuids: [String]?; var error: String? }

    static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func request(_ method: String, _ path: String, body: Data? = nil, timeout: TimeInterval = 30) throws -> URLRequest {
        guard let base = AgentSettings.serverURL, let token = AgentSettings.deviceToken else { throw APIError.notConfigured }
        // appendingPathComponent would percent-encode a "?", so split the query off first.
        let parts = path.split(separator: "?", maxSplits: 1).map(String.init)
        var comps = URLComponents(url: base.appendingPathComponent(parts[0]), resolvingAgainstBaseURL: false)!
        if parts.count > 1 { comps.percentEncodedQuery = parts[1] }
        var r = URLRequest(url: comps.url!, timeoutInterval: timeout)
        r.httpMethod = method
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body { r.httpBody = body; r.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        return r
    }

    private func send<T: Decodable>(_ r: URLRequest, as: T.Type) async throws -> T {
        let (data, resp) = try await URLSession.shared.data(for: r)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        if code == 503 { throw APIError.paused }
        guard (200..<300).contains(code) else { throw APIError.http(code, String(decoding: data, as: UTF8.self)) }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func knownAssets(_ ids: [String]) async throws -> Set<String> {
        struct R: Decodable { var known: [String] }
        let body = try JSONSerialization.data(withJSONObject: ["asset_ids": ids])
        return Set(try await send(request("POST", "v1/device/photos/known", body: body), as: R.self).known)
    }

    /// The server analyses synchronously (a few seconds); 90 s covers a slow model.
    func upload(_ p: PhotoUpload) async throws -> PhotoResult {
        try await send(request("POST", "v1/device/photos", body: JSONEncoder().encode(p), timeout: 90), as: PhotoResult.self)
    }

    func healthChanges(since: Int) async throws -> HealthFeed {
        try await send(request("GET", "v1/device/healthkit/changes?since=\(since)"), as: HealthFeed.self)
    }

    func ack(_ results: [Ack]) async throws {
        struct R: Decodable { var acknowledged: Int }
        _ = try await send(request("POST", "v1/device/healthkit/ack", body: JSONEncoder().encode(["results": results])), as: R.self)
    }

    func metrics(_ days: [[String: Any]]) async throws {
        struct R: Decodable { var stored: Int }
        _ = try await send(request("POST", "v1/device/metrics", body: JSONSerialization.data(withJSONObject: ["days": days])), as: R.self)
    }

    struct Heartbeat: Decodable { var paused: Bool; var min_food_score: Double; var non_camera_images: String }
    func heartbeat(_ info: [String: Any]) async throws -> Heartbeat {
        try await send(request("POST", "v1/device/heartbeat", body: JSONSerialization.data(withJSONObject: info)), as: Heartbeat.self)
    }
}
