import Testing
@testable import RangeCoachCore

@Suite("Swing detection")
struct SwingDetectionTests {
    private let detector = SwingDetector()

    @Test("detects a motion-and-impact sequence")
    func detectsSwing() throws {
        let event = try detector.detect(in: validSwingSamples())

        #expect(event != nil)
        #expect(event?.impactAt == 0.3)
        #expect(event?.peakAccelerationG == 4.2)
        #expect(event?.confidence ?? 0 >= 0.58)
    }

    @Test("does not label ordinary movement as a swing")
    func rejectsOrdinaryMovement() throws {
        let samples = (0..<8).map { index in
            sample(Double(index) / 10, acceleration: 1.1, rotation: 1.0)
        }
        #expect(try detector.detect(in: samples) == nil)
    }

    @Test("rejects an impact spike without rotation")
    func rejectsDroppedWatch() throws {
        var samples = (0..<8).map { index in
            sample(Double(index) / 10, acceleration: 1.0, rotation: 0.3)
        }
        samples[3] = sample(0.3, acceleration: 5.0, rotation: 0.4)
        #expect(try detector.detect(in: samples) == nil)
    }

    @Test("does not fuse temporally unrelated impact and rotation peaks")
    func rejectsSeparatedPeaks() throws {
        let samples = [
            sample(0.0, acceleration: 1.0, rotation: 0.2),
            sample(0.1, acceleration: 1.6, rotation: 0.5),
            sample(0.2, acceleration: 5.0, rotation: 0.4),
            sample(0.3, acceleration: 1.4, rotation: 0.5),
            sample(0.8, acceleration: 1.5, rotation: 5.0),
            sample(0.9, acceleration: 1.4, rotation: 4.0),
            sample(1.0, acceleration: 1.0, rotation: 0.2),
        ]
        #expect(try detector.detect(in: samples) == nil)
    }

    @Test("requires enough ordered sensor evidence")
    func validatesSamples() {
        #expect(throws: SwingDetectionError.insufficientSamples) {
            try detector.detect(in: Array(validSwingSamples().prefix(4)))
        }
        var unordered = validSwingSamples()
        unordered[4] = sample(0.2, acceleration: 1.8, rotation: 3.2)
        #expect(throws: SwingDetectionError.nonMonotonicTimestamps) {
            try detector.detect(in: unordered)
        }
        var nonFinite = validSwingSamples()
        nonFinite[2] = sample(.nan, acceleration: 2.0, rotation: 4.0)
        #expect(throws: SwingDetectionError.invalidSample) {
            try detector.detect(in: nonFinite)
        }
        #expect(throws: SwingDetectionError.invalidConfiguration) {
            try SwingDetector(movementThresholdG: -1).detect(in: validSwingSamples())
        }
    }
}

@Suite("Coaching decisions")
struct CoachingEngineTests {
    private let engine = CoachingEngine()

    @Test("gives only one highest-priority cue")
    func prioritizesTempo() {
        let cue = engine.cue(
            for: swing(confidence: 0.9),
            metrics: SwingMetrics(
                backswingDuration: 0.5,
                downswingDuration: 0.3,
                headMovementCentimeters: 15,
                poseConfidence: 0.95
            )
        )
        #expect(cue == .slowBackswing(ratio: 5.0 / 3.0))
    }

    @Test("does not coach from low-confidence evidence")
    func rejectsLowConfidence() {
        let cue = engine.cue(
            for: swing(confidence: 0.4),
            metrics: SwingMetrics(backswingDuration: 0.8, downswingDuration: 0.25)
        )
        #expect(cue == .insufficientConfidence)
    }

    @Test("rejects non-finite metrics")
    func rejectsNonFiniteMetrics() {
        let cue = engine.cue(
            for: swing(confidence: 0.9),
            metrics: SwingMetrics(backswingDuration: .infinity, downswingDuration: 0.25)
        )
        #expect(cue == .insufficientConfidence)
    }

    @Test("ignores uncertain camera pose metrics")
    func ignoresUncertainPose() {
        let cue = engine.cue(
            for: swing(confidence: 0.9),
            metrics: SwingMetrics(
                backswingDuration: 0.8,
                downswingDuration: 0.25,
                headMovementCentimeters: 15,
                poseConfidence: 0.5
            )
        )
        #expect(cue == .balancedTempo(ratio: 3.2))
    }

    @Test("spoken cues are short and actionable", arguments: [
        CoachingCue.slowBackswing(ratio: 1.8),
        CoachingCue.steadyHead(movementCentimeters: 12),
        CoachingCue.balancedTempo(ratio: 3),
        CoachingCue.insufficientConfidence,
    ])
    func cueLength(cue: CoachingCue) {
        #expect(cue.spokenText.split(separator: " ").count <= 14)
    }
}

private func validSwingSamples() -> [MotionSample] {
    [
        sample(0.0, acceleration: 1.0, rotation: 0.2),
        sample(0.1, acceleration: 1.5, rotation: 2.2),
        sample(0.2, acceleration: 2.0, rotation: 4.0),
        sample(0.3, acceleration: 4.2, rotation: 6.5),
        sample(0.4, acceleration: 2.1, rotation: 5.0),
        sample(0.5, acceleration: 1.5, rotation: 2.3),
        sample(0.6, acceleration: 1.0, rotation: 0.3),
    ]
}

private func sample(_ timestamp: Double, acceleration: Double, rotation: Double) -> MotionSample {
    MotionSample(
        timestamp: timestamp,
        accelerationG: MotionVector(x: acceleration, y: 0, z: 0),
        rotationRadiansPerSecond: MotionVector(x: 0, y: rotation, z: 0)
    )
}

private func swing(confidence: Double) -> SwingEvent {
    SwingEvent(
        startedAt: 0,
        impactAt: 0.8,
        endedAt: 1,
        peakAccelerationG: 4,
        peakRotationRadiansPerSecond: 6,
        confidence: confidence
    )
}
