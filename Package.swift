// swift-tools-version: 5.9
import PackageDescription

// The package and product are named as `npx cap sync` derives them from the npm name
// (@bavrk/capacitor-game-center -> BavrkCapacitorGameCenter), so the CLI finds them by itself.
let package = Package(
    name: "BavrkCapacitorGameCenter",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "BavrkCapacitorGameCenter",
            targets: ["GameCenterPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "GameCenterPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/GameCenterPlugin")
    ]
)
