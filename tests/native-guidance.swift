import Foundation

@main struct NativeGuidanceCheck {
    static func main() throws {
        let route = GuidanceRoute(points: [GuidancePoint(lat: 48, lon: 2, at: 0, seconds: 0), GuidancePoint(lat: 48.001, lon: 2, at: 111, seconds: 20), GuidancePoint(lat: 48.002, lon: 2, at: 222, seconds: 40)], instructions: [GuidanceStep(at: 0, text: "Continuez"), GuidanceStep(at: 111, text: "Tournez à droite"), GuidanceStep(at: 222, text: "Arrivée")])
        var tracker = try GuidanceTracker(route: route)
        func fix(_ lat: Double, _ time: Double, lon: Double = 2, accuracy: Double = 5, speed: Double? = 0) -> GuidanceFix { GuidanceFix(lat: lat, lon: lon, accuracy: accuracy, timestamp: time, speed: speed, heading: nil) }
        var state = tracker.update(fix(48.0005, 100_000), now: 100_000)
        assert(state.status == "on-route" && state.nextIndex == 1 && abs(state.toTurn - 55.5) < 0.1)
        assert(!tracker.reachedWaypoint(fix(48.0005, 100_000), state: state, at: 111))
        let approach = GuidanceState(status: "approach", at: 0, seconds: 0, distance: 300, nextIndex: 0, toTurn: 0)
        assert(GuidanceTracker.acceptsReroute(approach, original: fix(48, 100_000), latest: fix(48.0001, 101_000)))
        assert(!GuidanceTracker.acceptsReroute(approach, original: fix(48, 100_000), latest: fix(48.001, 101_000)))
        assert(GuidanceTracker.voiceStage(distance: 400, speed: 30) == "near")
        assert(GuidanceTracker.voiceStage(distance: 80, speed: 30) == "now")
        assert(GuidanceTracker.voiceStage(distance: 400, speed: nil) == "far")
        let longRoute = GuidanceRoute(points: [GuidancePoint(lat: 48, lon: 2, at: 0, seconds: 0), GuidancePoint(lat: 48.01, lon: 2, at: 1000, seconds: 100), GuidancePoint(lat: 48.02, lon: 2, at: 2000, seconds: 200)], instructions: [GuidanceStep(at: 0, text: "Continuez")])
        var longTracker = try GuidanceTracker(route: longRoute)
        _ = longTracker.update(fix(48.0049, 100_000), now: 100_000)
        assert(abs(longTracker.update(fix(48.005, 101_000), now: 101_000).at - 500) < 0.01)
        var waypointTracker = try GuidanceTracker(route: route)
        let atWaypoint = waypointTracker.update(fix(48.001, 100_000), now: 100_000)
        assert(waypointTracker.reachedWaypoint(fix(48.001, 100_000), state: atWaypoint, at: 111))
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
        let parallel = GuidanceRoute(points: [GuidancePoint(lat: 48.001, lon: 2, at: 0, seconds: 0), GuidancePoint(lat: 48, lon: 2, at: 111, seconds: 10), GuidancePoint(lat: 48, lon: 2.0002, at: 126, seconds: 12), GuidancePoint(lat: 48.001, lon: 2.0002, at: 237, seconds: 22)], instructions: [GuidanceStep(at: 0, text: "Continuez")])
        var moving = try GuidanceTracker(route: parallel), stopped = try GuidanceTracker(route: parallel)
        assert(moving.update(GuidanceFix(lat: 48.0005, lon: 2, accuracy: 5, timestamp: 100_000, speed: 10, heading: 0), now: 100_000).at > 126)
        assert(stopped.update(GuidanceFix(lat: 48.0005, lon: 2, accuracy: 5, timestamp: 100_000, speed: 0, heading: 0), now: 100_000).at < 111)
        for offset in [0.0, 5.0] {
            let x = 111_195 * cos(48 * Double.pi / 180)
            func point(_ north: Double, _ east: Double, _ at: Double) -> GuidancePoint { .init(lat: 48 + north / 111_195, lon: 2 + east / x, at: at, seconds: at / 10) }
            func gps(_ north: Double, _ east: Double, _ time: Double, _ heading: Double) -> GuidanceFix { .init(lat: 48 + north / 111_195, lon: 2 + east / x, accuracy: 5, timestamp: time, speed: 10, heading: heading) }
            let loop = GuidanceRoute(points: [point(0, 0, 0), point(30, 0, 30), point(30, 10, 40), point(0, 10, 70), point(0, offset, 80 - offset), point(60, offset, 140 - offset)], instructions: [GuidanceStep(at: 0, text: "Continuez")])
            var later = try GuidanceTracker(route: loop)
            assert(abs(later.update(gps(10, 10, 100_000, 180), now: 100_000).at - 60) < 0.01)
            assert(abs(later.update(gps(15, offset, 103_500, 0), now: 103_500).at - (95 - offset)) < 0.01)
            var earlier = try GuidanceTracker(route: loop)
            _ = earlier.update(gps(10, 0, 100_000, 0), now: 100_000)
            assert(abs(earlier.update(gps(20, offset, 101_000, 0), now: 101_000).at - 20) < 0.01)
        }
        let first = #"{"type":"batch","edges":[{"key":7,"geometry":[[48,2],[48.001,2]],"length":111,"seconds":10}]}"#
        let last = #"{"type":"result","edges":[{"key":8,"geometry":[[48.001,2],[48.001,2.001]],"length":75,"seconds":20,"speedLimit":50}],"result":{"found":true,"path":[7,8],"length":186,"seconds":33,"instructions":[{"at":0,"sign":0,"text":"Continuez","name":"Rue A"},{"at":111,"sign":2,"text":"Tournez","name":"Rue B"},{"at":186,"sign":4,"text":"Arrivée","name":""}]}}"#
        let decoded = try NativeRouting.decode(Data((first + "\n" + last + "\n").utf8), contentType: "application/x-ndjson")
        assert(decoded.points.count == 3 && decoded.points[2].seconds == 33 && decoded.points[2].speedLimit == 50)
        let compact = try JSONSerialization.data(withJSONObject: ["found": true, "route": try JSONSerialization.jsonObject(with: JSONEncoder().encode(decoded))])
        let decodedCompact = try NativeRouting.decode(compact, contentType: "application/json")
        assert(decodedCompact.instructions.last?.sign == 4)
        let shifted = GuidanceRoute(points: decoded.points.map { GuidancePoint(lat: $0.lat + 0.001, lon: $0.lon + 0.001, at: $0.at, seconds: $0.seconds, speedLimit: $0.speedLimit) }, instructions: decoded.instructions, length: decoded.length, seconds: decoded.seconds)
        let combined = try NativeRouting.combine(decoded, shifted)
        assert(combined.points.count == 5 && combined.length == 372 && combined.waypointAt == 186 && combined.instructions[2].sign == 0 && combined.instructions.last?.sign == 4)
        do { _ = try NativeRouting.decode(Data((first + "\n" + last).utf8), contentType: "application/x-ndjson"); assertionFailure("Truncated stream accepted") } catch {}
        let config = NativeRouting.Config(api: "https://example.org/api", end: .init(lat: 48.001, lon: 2.001), criterion: "distance", avoidMotorways: true, avoidTolls: false)
        let request = try NativeRouting.request(config: config, fix: fix(48, 100_000), id: "test")
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        assert(body["criterion"] as? String == "distance" && body["avoidMotorways"] as? Bool == true && body["avoidTolls"] as? Bool == false && body["guidanceOnly"] as? Bool == true)
        var withWaypoint = config; withWaypoint.via = .init(lat: 48.0005, lon: 2, at: 55)
        let restored = try JSONDecoder().decode(NativeRouting.Config.self, from: JSONEncoder().encode(withWaypoint))
        assert(restored.via?.at == 55); try restored.validate()
        if let path = ProcessInfo.processInfo.environment["ECLAIRE_TEST_IOS_ROUTE"] {
            let real = try NativeRouting.decode(Data(contentsOf: URL(fileURLWithPath: path)), contentType: "application/json")
            assert(real.points.count > 1 && real.instructions.last?.sign == 4)
        }
        if let path = ProcessInfo.processInfo.environment["ECLAIRE_TEST_IOS_NDJSON"] {
            let real = try NativeRouting.decode(Data(contentsOf: URL(fileURLWithPath: path)), contentType: "application/x-ndjson")
            assert(real.points.count > 1 && real.instructions.last?.sign == 4)
        }
        if let firstPath = ProcessInfo.processInfo.environment["ECLAIRE_TEST_IOS_LEG1"], let secondPath = ProcessInfo.processInfo.environment["ECLAIRE_TEST_IOS_LEG2"] {
            let first = try NativeRouting.decode(Data(contentsOf: URL(fileURLWithPath: firstPath)), contentType: "application/json")
            let second = try NativeRouting.decode(Data(contentsOf: URL(fileURLWithPath: secondPath)), contentType: "application/json")
            let combined = try NativeRouting.combine(first, second)
            assert(combined.points.count > first.points.count && combined.waypointAt == first.length)
        }
        print("Guidage natif iOS : progression, reprise, erreurs et arrivée validées.")
    }
}
