import XCTest
@testable import RangeCoachCore

final class SwingDetectionTests: XCTestCase {
    private let detector = SwingDetector()

    func testDetectsSwing() throws {
        let event = try detector.detect(in: validSwingSamples())

        XCTAssertNotNil(event)
        XCTAssertEqual(event?.impactAt, 0.3)
        XCTAssertEqual(event?.peakAccelerationG, 4.2)
        XCTAssertGreaterThanOrEqual(event?.confidence ?? 0, 0.58)
    }

    func testRejectsOrdinaryMovement() throws {
        let samples = (0..<8).map { index in
            sample(Double(index) / 10, acceleration: 1.1, rotation: 1.0)
        }
        XCTAssertNil(try detector.detect(in: samples))
    }

    func testRejectsDroppedWatch() throws {
        var samples = (0..<8).map { index in
            sample(Double(index) / 10, acceleration: 1.0, rotation: 0.3)
        }
        samples[3] = sample(0.3, acceleration: 5.0, rotation: 0.4)
        XCTAssertNil(try detector.detect(in: samples))
    }

    func testRejectsSeparatedPeaks() throws {
        let samples = [
            sample(0.0, acceleration: 1.0, rotation: 0.2),
            sample(0.1, acceleration: 1.6, rotation: 0.5),
            sample(0.2, acceleration: 5.0, rotation: 0.4),
            sample(0.3, acceleration: 1.4, rotation: 0.5),
            sample(0.8, acceleration: 1.5, rotation: 5.0),
            sample(0.9, acceleration: 1.4, rotation: 4.0),
            sample(1.0, acceleration: 1.0, rotation: 0.2),
        ]
        XCTAssertNil(try detector.detect(in: samples))
    }

    func testValidatesSamples() {
        XCTAssertThrowsError(try detector.detect(in: Array(validSwingSamples().prefix(4)))) { error in
            XCTAssertEqual(error as? SwingDetectionError, .insufficientSamples)
        }
        var unordered = validSwingSamples()
        unordered[4] = sample(0.2, acceleration: 1.8, rotation: 3.2)
        XCTAssertThrowsError(try detector.detect(in: unordered)) { error in
            XCTAssertEqual(error as? SwingDetectionError, .nonMonotonicTimestamps)
        }
        var nonFinite = validSwingSamples()
        nonFinite[2] = sample(.nan, acceleration: 2.0, rotation: 4.0)
        XCTAssertThrowsError(try detector.detect(in: nonFinite)) { error in
            XCTAssertEqual(error as? SwingDetectionError, .invalidSample)
        }
        XCTAssertThrowsError(try SwingDetector(movementThresholdG: -1).detect(in: validSwingSamples())) { error in
            XCTAssertEqual(error as? SwingDetectionError, .invalidConfiguration)
        }
    }
}

final class CoachingEngineTests: XCTestCase {
    private let engine = CoachingEngine()

    func testPrioritizesTempo() {
        let cue = engine.cue(
            for: swing(confidence: 0.9),
            metrics: SwingMetrics(
                backswingDuration: 0.5,
                downswingDuration: 0.3,
                headMovementCentimeters: 15,
                poseConfidence: 0.95
            )
        )
        XCTAssertEqual(cue, .slowBackswing(ratio: 5.0 / 3.0))
    }

    func testRejectsLowConfidence() {
        let cue = engine.cue(
            for: swing(confidence: 0.4),
            metrics: SwingMetrics(backswingDuration: 0.8, downswingDuration: 0.25)
        )
        XCTAssertEqual(cue, .insufficientConfidence)
    }

    func testRejectsNonFiniteMetrics() {
        let cue = engine.cue(
            for: swing(confidence: 0.9),
            metrics: SwingMetrics(backswingDuration: .infinity, downswingDuration: 0.25)
        )
        XCTAssertEqual(cue, .insufficientConfidence)
    }

    func testIgnoresUncertainPose() {
        let cue = engine.cue(
            for: swing(confidence: 0.9),
            metrics: SwingMetrics(
                backswingDuration: 0.8,
                downswingDuration: 0.25,
                headMovementCentimeters: 15,
                poseConfidence: 0.5
            )
        )
        XCTAssertEqual(cue, .balancedTempo(ratio: 3.2))
    }

    func testCueLength() {
        let cues: [CoachingCue] = [
            .slowBackswing(ratio: 1.8),
            .steadyHead(movementCentimeters: 12),
            .balancedTempo(ratio: 3),
            .insufficientConfidence,
        ]
        for cue in cues {
            XCTAssertLessThanOrEqual(cue.spokenText.split(separator: " ").count, 14)
        }
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
