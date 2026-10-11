//
//  SponsorBlockTests.swift
//  KVTubeTests
//
//  Unit tests for SponsorBlock boundary calculations, seek computation, and category filtering.
//

import XCTest
#if canImport(KVTubeCore)
import KVTubeCore
#elseif canImport(KVTube)
@testable import KVTube
#endif

final class SponsorBlockTests: XCTestCase {

    var service: SponsorBlockService!

    override func setUp() {
        super.setUp()
        service = SponsorBlockService(enabledCategories: ["sponsor", "selfpromo", "interaction"])
    }

    // MARK: - Boundary & Seek Computation Tests

    func testComputeSeekTarget_timestampInsideSegment() {
        let segment = SponsorSegment(category: "sponsor", actionType: "skip", startTime: 30.0, endTime: 60.0)
        let target = service.computeSeekTarget(currentTime: 45.0, segments: [segment])
        XCTAssertEqual(target, 60.0)
    }

    func testComputeSeekTarget_atExactStartBoundary() {
        let segment = SponsorSegment(category: "sponsor", actionType: "skip", startTime: 10.0, endTime: 25.0)
        let target = service.computeSeekTarget(currentTime: 10.0, segments: [segment])
        XCTAssertEqual(target, 25.0)
    }

    func testComputeSeekTarget_beforeSegmentStartsReturnsNil() {
        let segment = SponsorSegment(category: "sponsor", actionType: "skip", startTime: 50.0, endTime: 80.0)
        let target = service.computeSeekTarget(currentTime: 49.5, segments: [segment])
        XCTAssertNil(target)
    }

    func testComputeSeekTarget_nearEndBoundaryReturnsNilToAvoidJitter() {
        // Default margin is 0.2s, segment is 30.0 to 60.0
        // At 59.9s, it is within 0.2s of 60.0, so no skip
        let segment = SponsorSegment(category: "sponsor", actionType: "skip", startTime: 30.0, endTime: 60.0)
        let target = service.computeSeekTarget(currentTime: 59.9, segments: [segment])
        XCTAssertNil(target)
    }

    func testComputeSeekTarget_afterSegmentReturnsNil() {
        let segment = SponsorSegment(category: "sponsor", actionType: "skip", startTime: 20.0, endTime: 40.0)
        let target = service.computeSeekTarget(currentTime: 40.5, segments: [segment])
        XCTAssertNil(target)
    }

    func testComputeSeekTarget_overlappingSegmentsExtendsToFurthestEnd() {
        let seg1 = SponsorSegment(category: "sponsor", actionType: "skip", startTime: 100.0, endTime: 140.0)
        let seg2 = SponsorSegment(category: "selfpromo", actionType: "skip", startTime: 135.0, endTime: 180.0)

        // At 110.0, inside seg1 which overlaps with seg2 ending at 180.0
        let target = service.computeSeekTarget(currentTime: 110.0, segments: [seg1, seg2])
        XCTAssertEqual(target, 180.0)
    }

    func testComputeSeekTarget_contiguousSegmentsExtendsToFurthestEnd() {
        let seg1 = SponsorSegment(category: "sponsor", actionType: "skip", startTime: 50.0, endTime: 80.0)
        let seg2 = SponsorSegment(category: "sponsor", actionType: "skip", startTime: 80.0, endTime: 110.0)

        let target = service.computeSeekTarget(currentTime: 65.0, segments: [seg1, seg2])
        XCTAssertEqual(target, 110.0)
    }

    // MARK: - Category Filtering Tests

    func testCategoryFiltering_ignoresDisabledCategories() {
        // "intro" is not in enabledCategories ["sponsor", "selfpromo", "interaction"]
        let introSeg = SponsorSegment(category: "intro", actionType: "skip", startTime: 0.0, endTime: 15.0)
        let target = service.computeSeekTarget(currentTime: 5.0, segments: [introSeg])
        XCTAssertNil(target)
    }

    func testCategoryFiltering_enablesPreviouslyDisabledCategory() {
        let introSeg = SponsorSegment(category: "intro", actionType: "skip", startTime: 0.0, endTime: 15.0)

        // Initially disabled
        XCTAssertFalse(service.isCategoryEnabled("intro"))
        XCTAssertNil(service.computeSeekTarget(currentTime: 5.0, segments: [introSeg]))

        // Enable intro
        service.enabledCategories.insert("intro")
        XCTAssertTrue(service.isCategoryEnabled("intro"))
        let target = service.computeSeekTarget(currentTime: 5.0, segments: [introSeg])
        XCTAssertEqual(target, 15.0)
    }

    func testCategoryFiltering_ignoresNonSkipActionTypes() {
        // actionType "mute" should not compute a seek target
        let muteSeg = SponsorSegment(category: "sponsor", actionType: "mute", startTime: 30.0, endTime: 60.0)
        let target = service.computeSeekTarget(currentTime: 40.0, segments: [muteSeg])
        XCTAssertNil(target)
    }

    func testFilterActiveSegments_returnsOnlyEnabledSkipSegments() {
        let segs = [
            SponsorSegment(category: "sponsor", actionType: "skip", startTime: 10.0, endTime: 20.0),
            SponsorSegment(category: "intro", actionType: "skip", startTime: 0.0, endTime: 10.0),
            SponsorSegment(category: "sponsor", actionType: "mute", startTime: 30.0, endTime: 40.0),
            SponsorSegment(category: "selfpromo", actionType: "skip", startTime: 50.0, endTime: 60.0)
        ]

        let filtered = service.filterActiveSegments(segs)
        XCTAssertEqual(filtered.count, 2)
        XCTAssertEqual(filtered.map { $0.category }, ["sponsor", "selfpromo"])
    }

    // MARK: - JSON Parsing Tests

    func testParseSponsorSegments_fromApiJson() throws {
        let json = """
        [
            {
                "category": "sponsor",
                "actionType": "skip",
                "segment": [45.12, 78.45],
                "UUID": "uuid-12345-abcde"
            },
            {
                "category": "outro",
                "actionType": "skip",
                "segment": [600.0, 630.0],
                "UUID": "uuid-67890-fghij"
            }
        ]
        """

        let data = Data(json.utf8)
        let segments = try SponsorBlockService.parseSegments(from: data)

        XCTAssertEqual(segments.count, 2)
        XCTAssertEqual(segments[0].category, "sponsor")
        XCTAssertEqual(segments[0].actionType, "skip")
        XCTAssertEqual(segments[0].startTime, 45.12)
        XCTAssertEqual(segments[0].endTime, 78.45)
        XCTAssertEqual(segments[0].uuid, "uuid-12345-abcde")
        XCTAssertEqual(segments[1].category, "outro")
        XCTAssertEqual(segments[1].startTime, 600.0)
        XCTAssertEqual(segments[1].endTime, 630.0)
    }
}
