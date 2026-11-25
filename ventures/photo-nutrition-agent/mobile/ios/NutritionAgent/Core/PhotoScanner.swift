import Foundation
import Photos

/// Finds photos added since the last scan using PhotoKit's persistent change
/// history (iOS 16+). iOS does not wake an app when a photo is taken, so this
/// runs whenever the app gets time: the Camera-closed Shortcuts automation, a
/// background refresh, a processing task, or a foreground launch. The token
/// makes each run exact: nothing is missed between runs, nothing is re-read.
struct PhotoScanner {
    enum ScanError: Error { case notAuthorized(PHAuthorizationStatus) }

    static func authorization() -> PHAuthorizationStatus {
        PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    /// Asset local identifiers inserted since the stored token, oldest first, plus the token to store
    /// once those ids are safely recorded.
    static func newAssetIds(since tokenData: Data?) throws -> (ids: [String], token: Data?) {
        let status = authorization()
        // Limited access only exposes photos the person picked, so new Camera photos stay invisible.
        guard status == .authorized else { throw ScanError.notAuthorized(status) }
        let library = PHPhotoLibrary.shared()

        guard let tokenData,
              let token = try? NSKeyedUnarchiver.unarchivedObject(ofClass: PHPersistentChangeToken.self, from: tokenData) else {
            // First run: start from now, or from the retrospective date if one is set.
            let ids = AgentSettings.retrospectiveSince.map { fetchImageIds(createdAfter: $0) } ?? []
            return (ids, archive(library.currentChangeToken))
        }

        var inserted: [String] = []
        var lastToken: PHPersistentChangeToken = token
        do {
            let changes = try library.fetchPersistentChanges(since: token)
            for change in changes {
                if let details = try? change.changeDetails(for: .asset) {
                    inserted.append(contentsOf: details.insertedLocalIdentifiers)
                }
                lastToken = change.changeToken
            }
        } catch let error as PHPhotosError where error.code == .persistentChangeTokenExpired {
            // History was pruned past our token (long gap). Fall back to a date query from the last scan.
            let since = Calendar.current.date(byAdding: .day, value: -3, to: Date())!
            return (fetchImageIds(createdAfter: since), archive(library.currentChangeToken))
        }
        // Keep only images that still exist, in capture order.
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: Array(Set(inserted)), options: nil)
        var list: [PHAsset] = []
        assets.enumerateObjects { a, _, _ in if a.mediaType == .image { list.append(a) } }
        list.sort { ($0.creationDate ?? .distantPast) < ($1.creationDate ?? .distantPast) }
        return (list.map(\.localIdentifier), archive(lastToken))
    }

    static func fetchImageIds(createdAfter date: Date) -> [String] {
        let opts = PHFetchOptions()
        opts.predicate = NSPredicate(format: "mediaType == %d AND creationDate > %@", PHAssetMediaType.image.rawValue, date as NSDate)
        opts.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: true)]
        var ids: [String] = []
        PHAsset.fetchAssets(with: opts).enumerateObjects { a, _, _ in ids.append(a.localIdentifier) }
        return ids
    }

    static func archive(_ token: PHPersistentChangeToken) -> Data? {
        try? NSKeyedArchiver.archivedData(withRootObject: token, requiringSecureCoding: true)
    }

    static func asset(_ id: String) -> PHAsset? {
        PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject
    }

    /// The original image data (HEIC/JPEG) with its metadata, fetched from iCloud if needed.
    static func imageData(for asset: PHAsset) async throws -> Data {
        try await withCheckedThrowingContinuation { cont in
            let opts = PHImageRequestOptions()
            opts.isNetworkAccessAllowed = true
            opts.deliveryMode = .highQualityFormat
            opts.version = .current
            PHImageManager.default().requestImageDataAndOrientation(for: asset, options: opts) { data, _, _, info in
                if let data { cont.resume(returning: data) }
                else { cont.resume(throwing: (info?[PHImageErrorKey] as? Error) ?? CocoaError(.fileReadUnknown)) }
            }
        }
    }
}
