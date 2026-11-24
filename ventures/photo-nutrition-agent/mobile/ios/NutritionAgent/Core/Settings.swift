import Foundation
import Security

/// Server address and device token. The token lives in the Keychain with
/// AfterFirstUnlock accessibility so background wakes can read it while locked.
enum AgentSettings {
    static let appGroup = Bundle.main.object(forInfoDictionaryKey: "PNAAppGroup") as? String ?? "group.com.example.nutritionagent"
    static var defaults: UserDefaults { UserDefaults(suiteName: appGroup) ?? .standard }

    static var serverURL: URL? {
        get { defaults.string(forKey: "serverURL").flatMap(URL.init(string:)) }
        set { defaults.set(newValue?.absoluteString, forKey: "serverURL") }
    }

    /// Paused locally: no scanning or uploads (the server can also pause).
    static var paused: Bool {
        get { defaults.bool(forKey: "paused") }
        set { defaults.set(newValue, forKey: "paused") }
    }

    /// Ingest photos taken before setup, back to this date (nil = only new photos).
    static var retrospectiveSince: Date? {
        get { defaults.object(forKey: "retrospectiveSince") as? Date }
        set { defaults.set(newValue, forKey: "retrospectiveSince") }
    }

    static var minFoodScore: Double {
        get { defaults.object(forKey: "minFoodScore") as? Double ?? 0.15 }
        set { defaults.set(newValue, forKey: "minFoodScore") }
    }

    static var deviceToken: String? {
        get { Keychain.read("deviceToken") }
        set { if let v = newValue { Keychain.write("deviceToken", v) } else { Keychain.delete("deviceToken") } }
    }
}

enum Keychain {
    private static func base(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: "nutrition-agent",
         kSecAttrAccount as String: key]
    }

    static func read(_ key: String) -> String? {
        var q = base(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }

    static func write(_ key: String, _ value: String) {
        delete(key)
        var q = base(key)
        q[kSecValueData as String] = Data(value.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    static func delete(_ key: String) {
        SecItemDelete(base(key) as CFDictionary)
    }
}
