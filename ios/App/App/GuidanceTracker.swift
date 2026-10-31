import Foundation

struct GuidancePoint: Codable {
    let lat, lon, at, seconds: Double
    let speedLimit: Double?
    init(lat: Double, lon: Double, at: Double, seconds: Double, speedLimit: Double? = nil) {
        self.lat = lat; self.lon = lon; self.at = at; self.seconds = seconds; self.speedLimit = speedLimit
    }
}
struct GuidanceStep: Codable {
    let at: Double; let text: String; let sign: Int?; let name: String?
    init(at: Double, text: String, sign: Int? = nil, name: String? = nil) { self.at = at; self.text = text; self.sign = sign; self.name = name }
}
struct GuidanceRoute: Codable {
    let points: [GuidancePoint]; let instructions: [GuidanceStep]; let length, seconds, waypointAt: Double?
    init(points: [GuidancePoint], instructions: [GuidanceStep], length: Double? = nil, seconds: Double? = nil, waypointAt: Double? = nil) {
        self.points = points; self.instructions = instructions; self.length = length; self.seconds = seconds; self.waypointAt = waypointAt
    }
}
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
        var previous = -1.0, previousSeconds = -1.0
        for p in route.points {
            guard p.lat.isFinite, abs(p.lat) <= 90, p.lon.isFinite, abs(p.lon) <= 180, p.at.isFinite, p.at >= 0, p.at >= previous, p.seconds.isFinite, p.seconds >= 0, p.seconds >= previousSeconds, p.speedLimit.map({ $0.isFinite && $0 > 0 && $0 <= 250 }) ?? true else { throw TrackerError.invalidRoute }
            previous = p.at; previousSeconds = p.seconds
        }
        previous = -1
        for step in route.instructions {
            guard step.at.isFinite, step.at >= 0, step.at >= previous, step.at <= route.points[route.points.count - 1].at + 1, step.text.count <= 2000 else { throw TrackerError.invalidRoute }
            previous = step.at
        }
        self.route = route
    }
    enum TrackerError: Error { case invalidRoute }

    static func acceptsReroute(_ state: GuidanceState, original: GuidanceFix, latest: GuidanceFix) -> Bool {
        if state.status == "on-route" { return true }
        let moved = hypot((latest.lat - original.lat) * 111_195, (latest.lon - original.lon) * 111_195 * cos(latest.lat * .pi / 180))
        return state.status == "approach" && moved <= max(50, latest.accuracy + original.accuracy)
    }

    static func voiceStage(distance: Double, speed: Double?) -> String {
        let speed = speed.flatMap { $0.isFinite && $0 >= 0 && $0 <= 100 ? $0 : nil } ?? 0
        let immediate = max(35, min(100, speed * 3)), near = max(200, min(500, speed * 15))
        return distance < immediate ? "now" : distance < near ? "near" : "far"
    }

    func reachedWaypoint(_ fix: GuidanceFix, state: GuidanceState, at: Double) -> Bool {
        guard state.status == "on-route" || state.status == "arrived", state.at >= at - 10, state.distance <= 35,
              let point = route.points.min(by: { abs($0.at - at) < abs($1.at - at) }) else { return false }
        return hypot((fix.lat - point.lat) * 111_195, (fix.lon - point.lon) * 111_195 * cos(fix.lat * .pi / 180)) <= 30
    }

    mutating func update(_ fix: GuidanceFix, now: Double) -> GuidanceState {
        guard fix.lat.isFinite, abs(fix.lat) <= 90, fix.lon.isFinite, abs(fix.lon) <= 180, fix.accuracy.isFinite, fix.accuracy >= 0, fix.accuracy <= 50, fix.timestamp.isFinite, now - fix.timestamp <= 15_000, fix.timestamp <= now + 5000, fix.timestamp > lastSeen else {
            return GuidanceState(status: "uncertain", at: 0, seconds: 0, distance: 0, nextIndex: 0, toTurn: 0)
        }
        lastSeen = fix.timestamp
        let scaleX = 111_195 * cos(fix.lat * .pi / 180)
        let speed = fix.speed.flatMap { $0.isFinite && $0 >= 0 && $0 <= 100 ? $0 : nil } ?? 0
        let forward = max(180, (speed + 15) * (timestamp == 0 ? 0 : fix.timestamp - timestamp) / 1000 + fix.accuracy * 2)
        var best = Double.infinity, bestScore = Double.infinity, at = 0.0, seconds = 0.0
        var first = 1
        if let match {
            var low = 1, high = route.points.count - 1
            while low < high { let mid = (low + high) / 2; if route.points[mid].at < match.at - 60 { low = mid + 1 } else { high = mid } }
            first = low
        }
        for i in first..<route.points.count {
            let a = route.points[i - 1], b = route.points[i]
            if let match, a.at > match.at + forward { break }
            let x = (b.lon - a.lon) * scaleX, y = (b.lat - a.lat) * 111_195
            let px = (fix.lon - a.lon) * scaleX, py = (fix.lat - a.lat) * 111_195
            let t = x == 0 && y == 0 ? 0 : max(0, min(1, (px * x + py * y) / (x * x + y * y)))
            let candidate = a.at + (b.at - a.at) * t
            if let match, candidate < match.at - 60 || candidate > match.at + forward { continue }
            let distance = hypot(px - x * t, py - y * t)
            if distance > bestScore { continue }
            // shortcut: sans historique ni altitude fiable, les voies superposées restent ambiguës ; utiliser un vrai map matching pour identifier le niveau au départ.
            let heading = fix.heading.flatMap { speed >= 3 && $0.isFinite && $0 >= 0 && $0 < 360 && hypot(x, y) >= 10 ? $0 : nil }
            let penalty = heading.map { 12.5 * (1 - cos(atan2(x, y) - $0 * .pi / 180)) } ?? 0
            let elapsed = fix.timestamp - timestamp
            let motion: Double
            if let match, elapsed > 0, elapsed <= 15_000, let measured = fix.speed, measured.isFinite, measured >= 0, measured <= 100 {
                motion = min(25, abs(candidate - match.at - speed * elapsed / 1000) * 0.25)
            } else { motion = 0 }
            let score = distance + penalty + motion + (distance > max(75, fix.accuracy * 1.5) ? 100 : 0)
            if score < bestScore { bestScore = score; best = distance; at = candidate; seconds = a.seconds + (b.seconds - a.seconds) * t }
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

// The compact format avoids sending the exploration trace; older servers return NDJSON.
enum NativeRouting {
    struct Endpoint: Codable { let lat, lon: Double }
    struct Waypoint: Codable { let lat, lon, at: Double }
    struct Config: Codable {
        let api: String; let end: Endpoint; let criterion: String; let avoidMotorways, avoidTolls: Bool; var via: Waypoint? = nil
        func validate() throws {
            guard let parts = URLComponents(string: api), ["https", "http"].contains(parts.scheme ?? ""), parts.host != nil,
                  parts.user == nil, parts.password == nil, parts.query == nil, parts.fragment == nil,
                  ["time", "distance"].contains(criterion), end.lat.isFinite, (41.3...51.2).contains(end.lat),
                  end.lon.isFinite, (-5.3...9.7).contains(end.lon) else { throw RoutingError.invalid }
            if let via, !via.lat.isFinite || !(41.3...51.2).contains(via.lat) || !via.lon.isFinite || !(-5.3...9.7).contains(via.lon) || !via.at.isFinite || via.at <= 0 { throw RoutingError.invalid }
        }
        func leg(to end: Endpoint) -> Config { Config(api: api, end: end, criterion: criterion, avoidMotorways: avoidMotorways, avoidTolls: avoidTolls) }
    }
    private struct Payload: Encodable {
        let start, end: Endpoint; let criterion: String; let avoidMotorways, avoidTolls: Bool; let requestId: String; let guidanceOnly = true
    }
    private struct Compact: Decodable { let found: Bool; let route: GuidanceRoute? }
    private struct Edge: Decodable { let key: Int; let geometry: [[Double]]; let length, seconds: Double; let speedLimit: Double? }
    private struct WireResult: Decodable { let found: Bool; let path: [Int]?; let length, seconds: Double?; let instructions: [GuidanceStep]? }
    private struct Message: Decodable { let type: String; let edges: [Edge]?; let result: WireResult? }
    enum RoutingError: Error { case invalid, notFound, interrupted, tooLarge }

    static func request(config: Config, fix: GuidanceFix, id: String) throws -> URLRequest {
        try config.validate()
        guard let url = URL(string: config.api.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/route") else { throw RoutingError.invalid }
        let body = Payload(start: Endpoint(lat: fix.lat, lon: fix.lon), end: config.end, criterion: config.criterion, avoidMotorways: config.avoidMotorways, avoidTolls: config.avoidTolls, requestId: id)
        var request = URLRequest(url: url, timeoutInterval: 180)
        request.httpMethod = "POST"; request.setValue("application/json", forHTTPHeaderField: "Content-Type"); request.httpBody = try JSONEncoder().encode(body)
        return request
    }

    static func decode(_ data: Data, contentType: String?) throws -> GuidanceRoute {
        guard data.count <= 32 * 1024 * 1024 else { throw RoutingError.tooLarge }
        let decoder = JSONDecoder()
        if contentType?.lowercased().hasPrefix("application/json") == true {
            let response = try decoder.decode(Compact.self, from: data)
            guard response.found, let route = response.route else { throw RoutingError.notFound }
            try validate(route); return route
        }
        guard let text = String(data: data, encoding: .utf8), text.hasSuffix("\n") else { throw RoutingError.interrupted }
        var edges: [Int: Edge] = [:], result: WireResult?
        for line in text.split(separator: "\n", omittingEmptySubsequences: true) {
            let message = try decoder.decode(Message.self, from: Data(line.utf8))
            for edge in message.edges ?? [] {
                guard edge.key >= 0, edges.count < 100_000 || edges[edge.key] != nil else { throw RoutingError.tooLarge }
                if edges[edge.key] == nil { edges[edge.key] = edge }
            }
            if message.type == "result" { result = message.result; break }
        }
        guard let result, result.found, let path = result.path, !path.isEmpty, path.count <= 100_000,
              let length = result.length, length.isFinite, length >= 1, let duration = result.seconds, duration.isFinite, duration >= 0,
              let instructions = result.instructions else { throw RoutingError.notFound }
        var points: [GuidancePoint] = [], at = 0.0, seconds = 0.0
        for key in path {
            guard key >= 0, let edge = edges[key], edge.geometry.count >= 2, edge.geometry.count <= 50_000,
                  points.count + edge.geometry.count <= 1_000_000, edge.length.isFinite, edge.length >= 0,
                  edge.seconds.isFinite, edge.seconds >= 0, edge.geometry.allSatisfy({ $0.count == 2 && $0[0].isFinite && abs($0[0]) <= 90 && $0[1].isFinite && abs($0[1]) <= 180 }) else { throw RoutingError.invalid }
            let first = edge.geometry[0]
            if let previous = points.last {
                guard distance(previous.lat, previous.lon, first[0], first[1]) <= 2 else { throw RoutingError.invalid }
            } else { points.append(GuidancePoint(lat: first[0], lon: first[1], at: 0, seconds: 0)) }
            var lengths: [Double] = []; var total = 0.0, covered = 0.0
            for i in 1..<edge.geometry.count {
                let a = edge.geometry[i - 1], b = edge.geometry[i], part = distance(a[0], a[1], b[0], b[1])
                lengths.append(part); total += part
            }
            for i in 1..<edge.geometry.count {
                covered += lengths[i - 1]
                let ratio = total > 0 ? covered / total : Double(i) / Double(edge.geometry.count - 1), point = edge.geometry[i]
                points.append(GuidancePoint(lat: point[0], lon: point[1], at: at + edge.length * ratio, seconds: seconds + edge.seconds * ratio, speedLimit: edge.speedLimit))
            }
            at += edge.length; seconds += edge.seconds
        }
        guard abs(at - length) <= 2 else { throw RoutingError.invalid }
        if seconds > 0 { points = points.map { GuidancePoint(lat: $0.lat, lon: $0.lon, at: $0.at, seconds: $0.seconds * duration / seconds, speedLimit: $0.speedLimit) } }
        let route = GuidanceRoute(points: points, instructions: instructions, length: length, seconds: duration)
        try validate(route); return route
    }

    static func combine(_ first: GuidanceRoute, _ second: GuidanceRoute) throws -> GuidanceRoute {
        try validate(first); try validate(second)
        let a = first.points.last!, b = second.points[0], length = first.length!, seconds = first.seconds!
        guard distance(a.lat, a.lon, b.lat, b.lon) <= 2 else { throw RoutingError.invalid }
        let points = first.points + second.points.dropFirst().map { GuidancePoint(lat: $0.lat, lon: $0.lon, at: length + $0.at, seconds: seconds + $0.seconds, speedLimit: $0.speedLimit) }
        let instructions = Array(first.instructions.dropLast()) + [GuidanceStep(at: length, text: "Vous arrivez à l’étape", sign: 0, name: "")] + second.instructions.dropFirst().map { GuidanceStep(at: length + $0.at, text: $0.text, sign: $0.sign, name: $0.name) }
        let route = GuidanceRoute(points: points, instructions: instructions, length: length + second.length!, seconds: seconds + second.seconds!, waypointAt: length)
        try validate(route); return route
    }

    private static func validate(_ route: GuidanceRoute) throws {
        _ = try GuidanceTracker(route: route)
        guard let length = route.length, length.isFinite, length >= 1, let seconds = route.seconds, seconds.isFinite, seconds >= 0,
              route.waypointAt.map({ $0.isFinite && $0 > 0 && $0 < length }) ?? true,
              route.points[0].at == 0, route.points[0].seconds == 0,
              abs(route.points[route.points.count - 1].at - length) <= 2, abs(route.points[route.points.count - 1].seconds - seconds) <= 2,
              route.instructions[0].at == 0, route.instructions.last?.sign == 4,
              abs(route.instructions[route.instructions.count - 1].at - length) <= 1,
              route.instructions.allSatisfy({ $0.sign != nil && $0.name != nil && $0.name!.count <= 2000 }) else { throw RoutingError.invalid }
    }

    private static func distance(_ latA: Double, _ lonA: Double, _ latB: Double, _ lonB: Double) -> Double {
        let rad = Double.pi / 180
        let x = pow(sin((latB - latA) * rad / 2), 2) + cos(latA * rad) * cos(latB * rad) * pow(sin((lonB - lonA) * rad / 2), 2)
        return 12_742_000 * asin(sqrt(min(1, x)))
    }
}
