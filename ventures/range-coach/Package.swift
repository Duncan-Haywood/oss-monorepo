// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "RangeCoach",
    platforms: [
        .iOS(.v16),
        .watchOS(.v9),
        .macOS(.v13),
    ],
    products: [
        .library(name: "RangeCoachCore", targets: ["RangeCoachCore"]),
    ],
    targets: [
        .target(name: "RangeCoachCore"),
        .testTarget(name: "RangeCoachCoreTests", dependencies: ["RangeCoachCore"]),
    ]
)
