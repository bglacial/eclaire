import Foundation

@main struct NativeGuidanceBridgeCheck {
    static func main() throws {
        let route = GuidanceRoute(points: [GuidancePoint(lat: 48, lon: 2, at: 0, seconds: 0), GuidancePoint(lat: 48.001, lon: 2, at: 111, seconds: 20)], instructions: [GuidanceStep(at: 0, text: "Continuez", sign: 0, name: "Rue"), GuidanceStep(at: 111, text: "Arrivée", sign: 4, name: "")], length: 111, seconds: 20)
        let wire = try JSValueEncoder().encodeJSObject(route)
        let data = try JSONSerialization.data(withJSONObject: wire)
        let restored = try JSONDecoder().decode(GuidanceRoute.self, from: data)
        assert(restored.points.count == 2 && restored.instructions.last?.sign == 4 && restored.waypointAt == nil)
        print("Encodage du trajet pour le pont Capacitor validé.")
    }
}
