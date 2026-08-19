// swift-tools-version:5.9
// SPM manifest for WorldClockCore only — the platform-agnostic Foundation module (city
// catalog, sunrise/sunset math, formatting, shared-store). It builds and tests on Linux CI,
// unlike WorldClockApp/WorldClockWidget, which depend on SwiftUI/WidgetKit/AppIntents and are
// still built and tested only via the XcodeGen project (see README.md). This file is a CI
// convenience alongside project.yml, not a replacement for it.
import PackageDescription

let package = Package(
    name: "WorldClockCore",
    products: [
        .library(name: "WorldClockCore", targets: ["WorldClockCore"])
    ],
    targets: [
        .target(name: "WorldClockCore", path: "Sources/WorldClockCore"),
        .testTarget(
            name: "WorldClockCoreTests",
            dependencies: ["WorldClockCore"],
            path: "Tests/WorldClockCoreTests"
        )
    ]
)
