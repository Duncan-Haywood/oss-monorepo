import Foundation
import Vision
import ImageIO
import CoreGraphics
import UniformTypeIdentifiers

/// Stage 1, entirely on device: is this photo worth sending? Uses Vision's
/// built-in image classifier (no model download, no network) and, for photos
/// that look like documents, a quick text check for nutrition labels.
enum FoodClassifier {
    /// Vision taxonomy identifiers that indicate food or drink. The taxonomy has
    /// ~1,300 labels; `VNClassifyImageRequest().supportedIdentifiers()` lists them.
    /// Tune this set against your own library (docs/limitations.md, "Classifier").
    static let foodIdentifiers: Set<String> = [
        "food", "meal", "dish", "dessert", "baked_goods", "bread", "cake", "cookie", "pastry", "pizza",
        "sandwich", "burger", "salad", "soup", "pasta", "noodles", "rice", "sushi", "meat", "steak",
        "chicken", "seafood", "fish", "egg", "breakfast", "fruit", "vegetable", "berry", "cheese",
        "snack", "drink", "beverage", "coffee", "tea", "juice", "smoothie", "wine", "beer", "cocktail",
        "ice_cream", "chocolate", "candy", "taco", "burrito", "curry", "barbecue", "fries",
    ]
    static let documentIdentifiers: Set<String> = ["document", "text", "receipt", "label", "printed_page"]

    struct Verdict {
        var foodScore: Double
        var topLabels: [String]
        var looksLikeLabel: Bool
    }

    static func classify(_ image: CGImage) throws -> Verdict {
        let request = VNClassifyImageRequest()
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        try handler.perform([request])
        let obs = (request.results ?? []).filter { $0.confidence > 0.05 }
        let food = obs.filter { foodIdentifiers.contains($0.identifier) }.map { Double($0.confidence) }.max() ?? 0
        let doc = obs.filter { documentIdentifiers.contains($0.identifier) }.map { Double($0.confidence) }.max() ?? 0
        var label = false
        if food < 0.3 && doc > 0.3 { label = try looksLikeNutritionLabel(image) }
        return Verdict(foodScore: label ? max(food, 0.9) : food,
                       topLabels: obs.prefix(5).map(\.identifier),
                       looksLikeLabel: label)
    }

    static func looksLikeNutritionLabel(_ image: CGImage) throws -> Bool {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .fast
        try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
        let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string.lowercased() }.joined(separator: " ")
        let hits = ["nutrition facts", "calories", "protein", "total fat", "carbohydrate", "serving size", "energy", "kcal"].filter { text.contains($0) }
        return hits.count >= 3
    }
}

/// Image preparation: one decode of the original, a small thumbnail for
/// classification and hashing, and a metadata-free JPEG for upload.
enum ImagePrep {
    struct Prepared {
        var thumbnail: CGImage        // ~512 px, for the classifier
        var uploadJPEG: Data          // ~1024 px, EXIF/GPS stripped
        var dhash: String             // 64-bit difference hash, hex
        var hasCameraExif: Bool       // false for downloads, saved images, most screenshots
    }

    static func prepare(_ original: Data) throws -> Prepared {
        guard let src = CGImageSourceCreateWithData(original as CFData, nil) else { throw CocoaError(.fileReadCorruptFile) }
        let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any] ?? [:]
        let tiff = props[kCGImagePropertyTIFFDictionary] as? [CFString: Any] ?? [:]
        let exif = props[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
        let hasCamera = tiff[kCGImagePropertyTIFFMake] != nil && exif[kCGImagePropertyExifExposureTime] != nil

        func thumb(_ px: Int) throws -> CGImage {
            let opts: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
                                         kCGImageSourceCreateThumbnailWithTransform: true,
                                         kCGImageSourceThumbnailMaxPixelSize: px]
            guard let img = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { throw CocoaError(.fileReadCorruptFile) }
            return img
        }
        let small = try thumb(512)
        let large = try thumb(1024)

        let out = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { throw CocoaError(.fileWriteUnknown) }
        // No metadata dictionary is copied, so GPS, device and EXIF tags are not uploaded.
        CGImageDestinationAddImage(dest, large, [kCGImageDestinationLossyCompressionQuality: 0.8] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { throw CocoaError(.fileWriteUnknown) }

        return Prepared(thumbnail: small, uploadJPEG: out as Data, dhash: dhash(small), hasCameraExif: hasCamera)
    }

    /// dHash: shrink to 9x8 grayscale; each bit says whether a pixel is brighter than its right neighbour.
    static func dhash(_ image: CGImage) -> String {
        let w = 9, h = 8
        var pixels = [UInt8](repeating: 0, count: w * h)
        let ctx = CGContext(data: &pixels, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                            space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)!
        ctx.interpolationQuality = .medium
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
        var bits: UInt64 = 0
        for y in 0..<h {
            for x in 0..<(w - 1) {
                bits <<= 1
                if pixels[y * w + x] > pixels[y * w + x + 1] { bits |= 1 }
            }
        }
        return String(format: "%016llx", bits)
    }
}
