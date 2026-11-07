import Foundation

@main struct NativeGuidanceCheck {
    static func main() throws {
        let route = GuidanceRoute(points: [GuidancePoint(lat: 48, lon: 2, at: 0, seconds: 0), GuidancePoint(lat: 48.001, lon: 2, at: 111, seconds: 20), GuidancePoint(lat: 48.002, lon: 2, at: 222, seconds: 40)], instructions: [GuidanceStep(at: 0, text: "Continuez"), GuidanceStep(at: 111, text: "Tournez à droite"), GuidanceStep(at: 222, text: "Arrivée")])
        var tracker = try GuidanceTracker(route: route)
        func fix(_ lat: Double, _ time: Double, lon: Double = 2, accuracy: Double = 5, speed: Double? = 0) -> GuidanceFix { GuidanceFix(lat: lat, lon: lon, accuracy: accuracy, timestamp: time, speed: speed, heading: nil) }
        // Shared tracking/voice/reroute scenarios run in native-guidance-fixtures.swift.
        let state = tracker.update(fix(48.0005, 100_000), now: 100_000)
        assert(!tracker.reachedWaypoint(fix(48.0005, 100_000), state: state, at: 111))
        var waypointTracker = try GuidanceTracker(route: route)
        let atWaypoint = waypointTracker.update(fix(48.001, 100_000), now: 100_000)
        assert(waypointTracker.reachedWaypoint(fix(48.001, 100_000), state: atWaypoint, at: 111))
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
        let third = GuidanceRoute(points: decoded.points.map { GuidancePoint(lat: $0.lat + 0.002, lon: $0.lon + 0.002, at: $0.at, seconds: $0.seconds, speedLimit: $0.speedLimit) }, instructions: decoded.instructions, length: decoded.length, seconds: decoded.seconds)
        let triple = try NativeRouting.combine(combined, third)
        assert(triple.waypointAts == [186, 372] && triple.waypointAt == 186 && triple.length == 558)
        do { _ = try NativeRouting.decode(Data((first + "\n" + last).utf8), contentType: "application/x-ndjson"); assertionFailure("Truncated stream accepted") } catch {}
        let config = NativeRouting.Config(api: "https://example.org/api", end: .init(lat: 48.001, lon: 2.001), criterion: "distance", avoidMotorways: true, avoidTolls: false)
        let request = try NativeRouting.request(config: config, fix: fix(48, 100_000), id: "test")
        let body = try JSONSerialization.jsonObject(with: request.httpBody!) as! [String: Any]
        assert(body["criterion"] as? String == "distance" && body["avoidMotorways"] as? Bool == true && body["avoidTolls"] as? Bool == false && body["guidanceOnly"] as? Bool == true)
        var withWaypoint = config; withWaypoint.via = .init(lat: 48.0005, lon: 2, at: 55)
        let restored = try JSONDecoder().decode(NativeRouting.Config.self, from: JSONEncoder().encode(withWaypoint))
        assert(restored.via?.at == 55); try restored.validate()
        withWaypoint.vias = [.init(lat: 48.0005, lon: 2, at: 55), .init(lat: 48.0008, lon: 2, at: 88)]
        let multiple = try JSONDecoder().decode(NativeRouting.Config.self, from: JSONEncoder().encode(withWaypoint))
        assert(multiple.stops.count == 2 && multiple.stops.last?.at == 88)
        try withWaypoint.validate(); withWaypoint.removeNext()
        assert(withWaypoint.stops.count == 1 && withWaypoint.stops.first?.at == 88)
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
