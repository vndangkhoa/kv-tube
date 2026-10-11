// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "KVTube",
    platforms: [
        .iOS(.v17),
        .macOS(.v14)
    ],
    products: [
        .library(
            name: "KVTubeCore",
            targets: ["KVTubeCore"]
        )
    ],
    targets: [
        .target(
            name: "KVTubeCore",
            path: "KVTube",
            exclude: [
                "App",
                "Assets.xcassets",
                "Config",
                "Services/Download",
                "Services/Playback",
                "Services/Storage",
                "ViewModels",
                "Views"
            ],
            sources: [
                "Models",
                "Services/Network"
            ]
        ),
        .testTarget(
            name: "KVTubeTests",
            dependencies: ["KVTubeCore"],
            path: "KVTubeTests"
        )
    ]
)
