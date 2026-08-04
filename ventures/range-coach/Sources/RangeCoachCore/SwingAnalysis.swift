public typealias TimeInterval = Double

public struct MotionVector: Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let z: Double

    public init(x: Double, y: Double, z: Double) {
        self.x = x
        self.y = y
        self.z = z
    }

    public var magnitude: Double {
        (x * x + y * y + z * z).squareRoot()
    }
}

public struct MotionSample: Equatable, Sendable {
    public let timestamp: TimeInterval
    public let accelerationG: MotionVector
    public let rotationRadiansPerSecond: MotionVector

    public init(
        timestamp: TimeInterval,
        accelerationG: MotionVector,
        rotationRadiansPerSecond: MotionVector
    ) {
        self.timestamp = timestamp
        self.accelerationG = accelerationG
        self.rotationRadiansPerSecond = rotationRadiansPerSecond
    }
}

public struct SwingEvent: Equatable, Sendable {
    public let startedAt: TimeInterval
    public let impactAt: TimeInterval
    public let endedAt: TimeInterval
    public let peakAccelerationG: Double
    public let peakRotationRadiansPerSecond: Double
    public let confidence: Double

    public init(
        startedAt: TimeInterval,
        impactAt: TimeInterval,
        endedAt: TimeInterval,
        peakAccelerationG: Double,
        peakRotationRadiansPerSecond: Double,
        confidence: Double
    ) {
        self.startedAt = startedAt
        self.impactAt = impactAt
        self.endedAt = endedAt
        self.peakAccelerationG = peakAccelerationG
        self.peakRotationRadiansPerSecond = peakRotationRadiansPerSecond
        self.confidence = confidence
    }
}

public enum SwingDetectionError: Error, Equatable {
    case insufficientSamples
    case nonMonotonicTimestamps
    case invalidSample
    case invalidConfiguration
}

public struct SwingDetector: Sendable {
    public var movementThresholdG: Double
    public var impactThresholdG: Double
    public var rotationThreshold: Double

    public init(
        movementThresholdG: Double = 1.35,
        impactThresholdG: Double = 2.8,
        rotationThreshold: Double = 3.5
    ) {
        self.movementThresholdG = movementThresholdG
        self.impactThresholdG = impactThresholdG
        self.rotationThreshold = rotationThreshold
    }

    public func detect(in samples: [MotionSample]) throws -> SwingEvent? {
        guard movementThresholdG.isFinite, movementThresholdG > 0,
              impactThresholdG.isFinite, impactThresholdG > movementThresholdG,
              rotationThreshold.isFinite, rotationThreshold > 0 else {
            throw SwingDetectionError.invalidConfiguration
        }
        guard samples.count >= 5 else { throw SwingDetectionError.insufficientSamples }
        guard samples.allSatisfy({ sample in
            sample.timestamp.isFinite &&
                sample.accelerationG.x.isFinite && sample.accelerationG.y.isFinite &&
                sample.accelerationG.z.isFinite &&
                sample.rotationRadiansPerSecond.x.isFinite &&
                sample.rotationRadiansPerSecond.y.isFinite &&
                sample.rotationRadiansPerSecond.z.isFinite
        }) else { throw SwingDetectionError.invalidSample }
        guard zip(samples, samples.dropFirst()).allSatisfy({ $0.timestamp < $1.timestamp }) else {
            throw SwingDetectionError.nonMonotonicTimestamps
        }

        guard let impact = samples.max(by: {
            $0.accelerationG.magnitude < $1.accelerationG.magnitude
        }) else { return nil }

        let peakAcceleration = impact.accelerationG.magnitude
        // Acceleration and rotation must describe the same motion. Combining a
        // dropped-Watch impact with unrelated rotation elsewhere in a transfer
        // batch creates a dangerous confident false positive.
        let coincidenceWindow = samples.filter { abs($0.timestamp - impact.timestamp) <= 0.2 }
        let peakRotation = coincidenceWindow.map(\.rotationRadiansPerSecond.magnitude).max() ?? 0
        guard peakAcceleration >= impactThresholdG, peakRotation >= rotationThreshold else {
            return nil
        }

        let moving = samples.filter {
            abs($0.timestamp - impact.timestamp) <= 1.5 &&
                ($0.accelerationG.magnitude >= movementThresholdG ||
                 $0.rotationRadiansPerSecond.magnitude >= rotationThreshold * 0.5)
        }
        guard let start = moving.first, let end = moving.last,
              start.timestamp < impact.timestamp, impact.timestamp < end.timestamp else {
            return nil
        }

        let accelerationScore = min(1, peakAcceleration / (impactThresholdG * 1.8))
        let rotationScore = min(1, peakRotation / (rotationThreshold * 1.8))
        let confidence = 0.5 * accelerationScore + 0.5 * rotationScore

        return SwingEvent(
            startedAt: start.timestamp,
            impactAt: impact.timestamp,
            endedAt: end.timestamp,
            peakAccelerationG: peakAcceleration,
            peakRotationRadiansPerSecond: peakRotation,
            confidence: confidence
        )
    }
}

public struct SwingMetrics: Equatable, Sendable {
    public let backswingDuration: TimeInterval
    public let downswingDuration: TimeInterval
    public let headMovementCentimeters: Double?
    public let poseConfidence: Double?

    public init(
        backswingDuration: TimeInterval,
        downswingDuration: TimeInterval,
        headMovementCentimeters: Double? = nil,
        poseConfidence: Double? = nil
    ) {
        self.backswingDuration = backswingDuration
        self.downswingDuration = downswingDuration
        self.headMovementCentimeters = headMovementCentimeters
        self.poseConfidence = poseConfidence
    }
}

public enum CoachingCue: Equatable, Sendable {
    case slowBackswing(ratio: Double)
    case steadyHead(movementCentimeters: Double)
    case balancedTempo(ratio: Double)
    case insufficientConfidence

    public var spokenText: String {
        switch self {
        case .slowBackswing:
            "Smooth the takeaway; let the backswing take more time."
        case .steadyHead:
            "Keep your head steadier through impact."
        case .balancedTempo:
            "Good tempo. Repeat that rhythm."
        case .insufficientConfidence:
            "I couldn't read that swing clearly. Check the camera and Watch fit."
        }
    }
}

public struct CoachingEngine: Sendable {
    public let minimumSwingConfidence: Double
    public let minimumPoseConfidence: Double

    public init(minimumSwingConfidence: Double = 0.58, minimumPoseConfidence: Double = 0.7) {
        self.minimumSwingConfidence = minimumSwingConfidence
        self.minimumPoseConfidence = minimumPoseConfidence
    }

    public func cue(for swing: SwingEvent, metrics: SwingMetrics) -> CoachingCue {
        guard minimumSwingConfidence.isFinite, (0...1).contains(minimumSwingConfidence),
              minimumPoseConfidence.isFinite, (0...1).contains(minimumPoseConfidence),
              swing.confidence.isFinite, (0...1).contains(swing.confidence),
              swing.confidence >= minimumSwingConfidence,
              metrics.backswingDuration.isFinite, metrics.backswingDuration > 0,
              metrics.downswingDuration.isFinite, metrics.downswingDuration > 0 else {
            return .insufficientConfidence
        }

        let tempoRatio = metrics.backswingDuration / metrics.downswingDuration
        if tempoRatio < 2.2 {
            return .slowBackswing(ratio: tempoRatio)
        }

        if let movement = metrics.headMovementCentimeters, movement.isFinite,
           let poseConfidence = metrics.poseConfidence,
           poseConfidence.isFinite, (0...1).contains(poseConfidence),
           poseConfidence >= minimumPoseConfidence,
           movement > 9 {
            return .steadyHead(movementCentimeters: movement)
        }

        return .balancedTempo(ratio: tempoRatio)
    }
}
