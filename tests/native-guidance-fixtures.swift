import Foundation

// Runs tests/fixtures/guidance/scenarios.json, shared with navigation.ts and GuidanceTracker.java.
@main struct NativeGuidanceFixturesCheck {
    static var failures = 0
    static func check(_ condition: Bool, _ message: @autoclosure () -> String) {
        if !condition { failures += 1; print("Échec : \(message())") }
    }
    static func route(_ value: Any) throws -> GuidanceRoute {
        let wire = try JSONSerialization.data(withJSONObject: ["found": true, "route": value])
        return try NativeRouting.decode(wire, contentType: "application/json")
    }
    static func fix(_ value: [String: Any]) -> GuidanceFix {
        GuidanceFix(lat: value["lat"] as! Double, lon: value["lon"] as! Double, accuracy: value["accuracy"] as! Double, timestamp: value["timestamp"] as! Double, speed: value["speed"] as? Double, heading: value["heading"] as? Double)
    }

    static func main() throws {
        let path = CommandLine.arguments.dropFirst().first ?? "tests/fixtures/guidance/scenarios.json"
        let fixtures = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: path))) as! [String: Any]
        let tolerance = fixtures["tolerance"] as! Double, routes = fixtures["routes"] as! [String: Any]

        for c in fixtures["validation"] as! [[String: Any]] {
            let valid = (try? route(c["route"]!)) != nil
            check(valid == c["valid"] as! Bool, "validation « \(c["name"]!) »")
        }
        for scenario in fixtures["tracking"] as! [[String: Any]] {
            let name = scenario["name"] as! String
            var tracker = try GuidanceTracker(route: route(routes[scenario["route"] as! String]!))
            for (index, update) in (scenario["updates"] as! [[String: Any]]).enumerated() {
                let f = fix(update["fix"] as! [String: Any]), expect = update["expect"] as! [String: Any]
                let state = tracker.update(f, now: update["now"] as? Double ?? f.timestamp)
                let label = "\(name) #\(index)"
                check(state.status == expect["status"] as! String, "\(label) : statut \(state.status)")
                if let at = expect["at"] as? Double { check(abs(state.at - at) <= tolerance, "\(label) : at \(state.at) ≠ \(at)") }
                if let next = expect["nextIndex"] as? Int { check(state.nextIndex == next, "\(label) : nextIndex \(state.nextIndex) ≠ \(next)") }
                if let toTurn = expect["toTurn"] as? Double { check(abs(state.toTurn - toTurn) <= tolerance, "\(label) : toTurn \(state.toTurn) ≠ \(toTurn)") }
            }
        }
        for c in fixtures["voiceStage"] as! [[String: Any]] {
            let stage = GuidanceTracker.voiceStage(distance: c["distance"] as! Double, speed: c["speed"] as? Double)
            check(stage == c["expect"] as! String, "voiceStage \(c) : \(stage)")
        }
        for c in fixtures["acceptsReroute"] as! [[String: Any]] {
            let state = GuidanceState(status: c["state"] as! String, at: 0, seconds: 0, distance: 0, nextIndex: 0, toTurn: 0)
            let accepted = GuidanceTracker.acceptsReroute(state, original: fix(c["origin"] as! [String: Any]), latest: fix(c["latest"] as! [String: Any]))
            check(accepted == c["expect"] as! Bool, "acceptsReroute « \(c["name"]!) »")
        }
        if failures > 0 { print("\(failures) écart(s) avec les fixtures de guidage."); exit(1) }
        print("Guidage natif iOS : fixtures partagées validées.")
    }
}
