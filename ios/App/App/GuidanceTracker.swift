import Foundation

struct GuidancePoint: Decodable { let lat, lon, at, seconds: Double }
struct GuidanceStep: Decodable { let at: Double; let text: String }
struct GuidanceRoute: Decodable { let points: [GuidancePoint]; let instructions: [GuidanceStep] }
struct GuidanceFix { let lat, lon, accuracy, timestamp: Double; let speed, heading: Double? }
struct GuidanceState { let status: String; let at, seconds, distance: Double; let nextIndex: Int; let toTurn: Double }

// Native counterpart of navigation.ts, independent of the WebView's lifecycle.
struct GuidanceTracker {
    let route: GuidanceRoute
    private var match: GuidanceState?
    private var timestamp = 0.0
    private var lastSeen = 0.0
    private var arrivalSince: Double?

    init(route: GuidanceRoute) throws {
        guard route.points.count >= 2, route.points.count <= 1_000_000, !route.instructions.isEmpty, route.instructions.count <= 50_000 else { throw TrackerError.invalidRoute }
        var previous = -1.0
        for p in route.points {
            guard p.lat.isFinite, abs(p.lat) <= 90, p.lon.isFinite, abs(p.lon) <= 180, p.at.isFinite, p.at >= 0, p.at >= previous, p.seconds.isFinite, p.seconds >= 0 else { throw TrackerError.invalidRoute }
            previous = p.at
        }
        previous = -1
        for step in route.instructions {
            guard step.at.isFinite, step.at >= 0, step.at >= previous, step.at <= route.points[route.points.count - 1].at + 1, step.text.count <= 2000 else { throw TrackerError.invalidRoute }
            previous = step.at
        }
        self.route = route
    }
    enum TrackerError: Error { case invalidRoute }

    mutating func update(_ fix: GuidanceFix, now: Double) -> GuidanceState {
        guard fix.lat.isFinite, abs(fix.lat) <= 90, fix.lon.isFinite, abs(fix.lon) <= 180, fix.accuracy.isFinite, fix.accuracy >= 0, fix.accuracy <= 50, fix.timestamp.isFinite, now - fix.timestamp <= 15_000, fix.timestamp <= now + 5000, fix.timestamp > lastSeen else {
            return GuidanceState(status: "uncertain", at: 0, seconds: 0, distance: 0, nextIndex: 0, toTurn: 0)
        }
        lastSeen = fix.timestamp
        let scaleX = 111_195 * cos(fix.lat * .pi / 180)
        let speed = fix.speed.flatMap { $0.isFinite && $0 >= 0 && $0 <= 100 ? $0 : nil } ?? 0
        let forward = max(180, (speed + 15) * (timestamp == 0 ? 0 : fix.timestamp - timestamp) / 1000 + fix.accuracy * 2)
        var best = Double.infinity, at = 0.0, seconds = 0.0
        for i in 1..<route.points.count {
            let a = route.points[i - 1], b = route.points[i]
            let x = (b.lon - a.lon) * scaleX, y = (b.lat - a.lat) * 111_195
            let px = (fix.lon - a.lon) * scaleX, py = (fix.lat - a.lat) * 111_195
            let t = x == 0 && y == 0 ? 0 : max(0, min(1, (px * x + py * y) / (x * x + y * y)))
            let candidate = a.at + (b.at - a.at) * t
            // shortcut: continuité géométrique bornée, comme navigation.ts ; pas de map matching multivoie.
            if let match, candidate < match.at - 60 || candidate > match.at + forward { continue }
            let distance = hypot(px - x * t, py - y * t)
            if distance < best { best = distance; at = candidate; seconds = a.seconds + (b.seconds - a.seconds) * t }
        }
        if best > max(75, fix.accuracy * 1.5) {
            arrivalSince = nil
            return GuidanceState(status: match == nil && best <= 2000 ? "approach" : "off-route", at: at, seconds: seconds, distance: best, nextIndex: 0, toTurn: 0)
        }
        let end = route.points[route.points.count - 1]
        let endDistance = hypot((fix.lon - end.lon) * scaleX, (fix.lat - end.lat) * 111_195)
        let near = end.at - at < 35 && endDistance < 30 && fix.accuracy <= 25 && (fix.speed.map { $0 <= 3 } ?? true)
        arrivalSince = near ? arrivalSince ?? fix.timestamp : nil
        var next = 0
        while next < route.instructions.count - 1 && route.instructions[next].at <= at - 8 { next += 1 }
        let arrived = arrivalSince.map { fix.timestamp - $0 >= 3000 } ?? false
        let state = GuidanceState(status: arrived ? "arrived" : "on-route", at: at, seconds: seconds, distance: best, nextIndex: next, toTurn: max(0, route.instructions[next].at - at))
        match = state; timestamp = fix.timestamp
        return state
    }
}
