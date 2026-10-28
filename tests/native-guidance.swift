import Foundation

@main struct NativeGuidanceCheck {
    static func main() throws {
        let route = GuidanceRoute(points: [GuidancePoint(lat: 48, lon: 2, at: 0, seconds: 0), GuidancePoint(lat: 48.001, lon: 2, at: 111, seconds: 20), GuidancePoint(lat: 48.002, lon: 2, at: 222, seconds: 40)], instructions: [GuidanceStep(at: 0, text: "Continuez"), GuidanceStep(at: 111, text: "Tournez à droite"), GuidanceStep(at: 222, text: "Arrivée")])
        var tracker = try GuidanceTracker(route: route)
        func fix(_ lat: Double, _ time: Double, lon: Double = 2, accuracy: Double = 5, speed: Double? = 0) -> GuidanceFix { GuidanceFix(lat: lat, lon: lon, accuracy: accuracy, timestamp: time, speed: speed, heading: nil) }
        var state = tracker.update(fix(48.0005, 100_000), now: 100_000)
        assert(state.status == "on-route" && state.nextIndex == 1 && abs(state.toTurn - 55.5) < 0.1)
        assert(tracker.update(fix(48.001, 100_000), now: 100_000).status == "uncertain")
        assert(tracker.update(fix(48.001, 102_000, accuracy: 100), now: 102_000).status == "uncertain")
        assert(tracker.update(fix(48.001, 103_000), now: 130_000).status == "uncertain")
        assert(tracker.update(fix(48.001, 140_000, lon: 2.01), now: 140_000).status == "off-route")
        state = tracker.update(fix(48.0015, 180_000), now: 180_000)
        assert(state.status == "on-route" && state.nextIndex == 2)
        assert(tracker.update(fix(48.002, 182_000), now: 182_000).status == "on-route")
        assert(tracker.update(fix(48.002, 186_000), now: 186_000).status == "arrived")
        tracker = try GuidanceTracker(route: route)
        assert(tracker.update(fix(48, 100_000, lon: 2.005), now: 100_000).status == "approach")
        assert(tracker.update(fix(48.002, 104_000, speed: 15), now: 104_000).status == "on-route")
        assert(tracker.update(fix(48.002, 108_000, speed: 15), now: 108_000).status == "on-route")
        assert(tracker.update(fix(48.002, 110_000, speed: nil), now: 110_000).status == "on-route")
        assert(tracker.update(fix(48.002, 114_000, speed: nil), now: 114_000).status == "arrived")
        print("Guidage natif iOS : progression, reprise, erreurs et arrivée validées.")
    }
}
