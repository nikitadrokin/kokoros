// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "Kokoros",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "Kokoros",
            path: "Sources/Kokoros"
        )
    ]
)
