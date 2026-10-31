import Capacitor
import CoreLocation
import AVFoundation
import UIKit

@objc(EclaireNavigation)
final class EclaireNavigation: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate, AVSpeechSynthesizerDelegate {
    let identifier = "EclaireNavigation"
    let jsName = "EclaireNavigation"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVoice", returnType: CAPPluginReturnPromise)
    ]
    private let locations = CLLocationManager()
    private let speech = AVSpeechSynthesizer()
    private var tracker: GuidanceTracker?
    private var voice = false
    private var active = false
    private var spoken = Set<String>()
    private var lastGoodAt = Date()
    private var timer: Timer?
    private var latest: JSObject = ["active": false, "status": "stopped"]
    private var routing: NativeRouting.Config?
    private var routeTask: RouteDownload?
    private var requestId: String?
    private var generation = 0
    private var latestFix: GuidanceFix?
    private var offRouteCount = 0
    private var retryAfter = Date.distantPast
    private var routeVersion = 1
    private var routeWire: JSObject?
    private var waypointReached = false
    private var waypointsReached = 0

    override func load() {
        locations.delegate = self
        locations.desiredAccuracy = kCLLocationAccuracyBestForNavigation
        locations.distanceFilter = 2
        locations.activityType = .automotiveNavigation
        locations.pausesLocationUpdatesAutomatically = false
        locations.showsBackgroundLocationIndicator = true
        speech.delegate = self
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("Guidage indisponible."); return }
            guard UIApplication.shared.applicationState == .active else { call.reject("Ouvrez Éclaire pour démarrer le guidage."); return }
            guard CLLocationManager.locationServicesEnabled(), [.authorizedWhenInUse, .authorizedAlways].contains(self.locations.authorizationStatus), self.locations.accuracyAuthorization == .fullAccuracy else { call.reject("Autorisez la localisation précise dans les réglages du téléphone."); return }
            do {
                guard let object = call.getObject("route") else { throw GuidanceTracker.TrackerError.invalidRoute }
                let route = try JSONDecoder().decode(GuidanceRoute.self, from: JSONSerialization.data(withJSONObject: object))
                let tracker = try GuidanceTracker(route: route)
                let routing = try call.getObject("routing").map { try JSONDecoder().decode(NativeRouting.Config.self, from: JSONSerialization.data(withJSONObject: $0)) }
                try routing?.validate()
                if routing?.stops.contains(where: { $0.at >= route.points.last!.at }) == true { throw NativeRouting.RoutingError.invalid }
                self.finish()
                self.tracker = tracker; self.voice = call.getBool("voice") ?? false; self.spoken.removeAll(); self.active = true
                self.routing = routing; self.routeVersion = 1; self.routeWire = nil; self.latestFix = nil; self.offRouteCount = 0; self.retryAfter = .distantPast; self.waypointReached = false; self.waypointsReached = 0
                self.latest = ["active": true, "status": "starting", "voice": self.voice, "nativeRerouting": routing != nil, "routeVersion": 1]; self.lastGoodAt = Date()
                self.locations.allowsBackgroundLocationUpdates = true
                self.locations.startUpdatingLocation()
                self.timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                    guard let self, self.active, Date().timeIntervalSince(self.lastGoodAt) > 15 else { return }
                    self.speech.stopSpeaking(at: .immediate)
                    self.publish(["active": true, "status": "uncertain"])
                }
                call.resolve()
            } catch { call.reject("Parcours de guidage invalide.") }
        }
    }
    @objc func stop(_ call: CAPPluginCall) { DispatchQueue.main.async { self.finish(); self.latest = ["active": false, "status": "stopped"]; call.resolve() } }
    @objc func getState(_ call: CAPPluginCall) { DispatchQueue.main.async { var state = self.latest; if self.active, self.routeVersion > 1, let route = self.routeWire { state["route"] = route }; call.resolve(state) } }
    @objc func setVoice(_ call: CAPPluginCall) { DispatchQueue.main.async { self.voice = call.getBool("enabled") ?? false; if !self.voice { self.speech.stopSpeaking(at: .immediate); self.releaseAudio() }; self.latest["voice"] = self.voice; call.resolve() } }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active, let location = locations.last else { return }
        let fix = GuidanceFix(lat: location.coordinate.latitude, lon: location.coordinate.longitude, accuracy: location.horizontalAccuracy, timestamp: location.timestamp.timeIntervalSince1970 * 1000, speed: location.speed >= 0 ? location.speed : nil, heading: location.course >= 0 ? location.course : nil)
        guard let state = tracker?.update(fix, now: Date().timeIntervalSince1970 * 1000) else { return }
        if state.status == "uncertain" && Date().timeIntervalSince(lastGoodAt) <= 3 { return }
        if state.status != "uncertain" { lastGoodAt = Date(); latestFix = fix }
        var coordinates: JSObject = ["lat": fix.lat, "lon": fix.lon, "accuracy": fix.accuracy, "timestamp": fix.timestamp]
        if let speed = fix.speed { coordinates["speed"] = speed }
        if let heading = fix.heading { coordinates["heading"] = heading }
        var event: JSObject = ["active": state.status != "arrived", "status": state.status, "fix": coordinates]
        if state.status == "on-route" || state.status == "arrived" {
            if let via = routing?.stops.first, tracker?.reachedWaypoint(fix, state: state, at: via.at) == true {
                routing?.removeNext(); waypointReached = true; waypointsReached += 1
            }
            offRouteCount = 0; retryAfter = .distantPast
            if routeTask != nil { cancelRoute() }
            event["match"] = ["at": state.at, "seconds": state.seconds, "distance": state.distance]
            let stage = GuidanceTracker.voiceStage(distance: state.toTurn, speed: fix.speed)
            let key = state.status == "arrived" ? "arrived" : "\(state.nextIndex):\(stage)"
            if voice && !spoken.contains(key), let tracker {
                let distance = state.toTurn >= 1000 ? String(format: "%.1f kilomètres", state.toTurn / 1000) : "\(max(0, Int((state.toTurn / 10).rounded()) * 10)) mètres"
                let message = state.status == "arrived" ? "Vous êtes arrivé au point routier." : (state.toTurn < 20 ? "Maintenant, " : "Dans \(distance), ") + tracker.route.instructions[state.nextIndex].text
                if speak(message) { spoken.insert(key) }
            }
        } else {
            speech.stopSpeaking(at: .immediate); releaseAudio()
            if state.status == "off-route", routing != nil {
                offRouteCount += 1
                if offRouteCount >= 2, routeTask == nil, Date() >= retryAfter { startReroute(fix) }
                if routeTask != nil { event["status"] = "rerouting"; event["message"] = "Recalcul du trajet en cours…" }
                else if Date() < retryAfter { event["status"] = "reroute-failed"; event["message"] = "Recalcul indisponible. Nouvelle tentative automatique." }
            } else if state.status == "approach" { offRouteCount = 0 }
        }
        publish(event)
        if state.status == "arrived" { active = false; cancelRoute(); timer?.invalidate(); timer = nil; manager.stopUpdatingLocation(); manager.allowsBackgroundLocationUpdates = false }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        guard active else { return }
        if ![.authorizedWhenInUse, .authorizedAlways].contains(manager.authorizationStatus) || manager.accuracyAuthorization != .fullAccuracy { finish(); publish(["active": false, "status": "denied"]) }
    }
    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        guard active else { return }
        if (error as? CLError)?.code == .denied { finish(); publish(["active": false, "status": "denied"]) }
        else if Date().timeIntervalSince(lastGoodAt) > 3 { speech.stopSpeaking(at: .immediate); releaseAudio(); publish(["active": true, "status": "uncertain"]) }
    }
    private func publish(_ state: JSObject) {
        var event = state; event["voice"] = voice; event["nativeRerouting"] = routing != nil; event["routeVersion"] = routeVersion; event["waypointReached"] = waypointReached; event["waypointsReached"] = waypointsReached
        latest = event; notifyListeners("location", data: event)
    }
    private func startReroute(_ fix: GuidanceFix) {
        guard let routing else { return }
        generation += 1
        let target = routing.stops.first.map { NativeRouting.Endpoint(lat: $0.lat, lon: $0.lon) } ?? routing.end
        requestLeg(fix, target: target, first: nil, original: fix, current: generation)
    }
    private func requestLeg(_ fix: GuidanceFix, target: NativeRouting.Endpoint, first: GuidanceRoute?, original: GuidanceFix, current: Int, index: Int = 0) {
        guard let routing else { return }
        let id = UUID().uuidString
        do {
            let request = try NativeRouting.request(config: routing.leg(to: target), fix: fix, id: id)
            requestId = id
            let task = RouteDownload(request: request) { [weak self] data, contentType, error in
                let result: Result<GuidanceRoute, Error>
                do {
                    guard error == nil, let data else { throw NativeRouting.RoutingError.interrupted }
                    result = .success(try NativeRouting.decode(data, contentType: contentType))
                } catch { result = .failure(error) }
                DispatchQueue.main.async {
                    guard let self, self.active, self.generation == current else { return }
                    self.routeTask = nil; self.requestId = nil
                    do {
                        let route = try result.get()
                        let combined = try first.map { try NativeRouting.combine($0, route) } ?? route
                        let targets = routing.stops.map { NativeRouting.Endpoint(lat: $0.lat, lon: $0.lon) } + [routing.end]
                        if index + 1 < targets.count {
                            let origin = GuidanceFix(lat: target.lat, lon: target.lon, accuracy: fix.accuracy, timestamp: fix.timestamp, speed: nil, heading: nil)
                            self.requestLeg(origin, target: targets[index + 1], first: combined, original: original, current: current, index: index + 1)
                        } else { self.finishReroute(current, original: original, .success(combined)) }
                    } catch { self.finishReroute(current, original: original, .failure(error)) }
                }
            }
            routeTask = task; task.start()
        } catch { finishReroute(current, original: original, .failure(error)) }
    }
    private func finishReroute(_ current: Int, original: GuidanceFix, _ result: Result<GuidanceRoute, Error>) {
        guard active, generation == current else { return }
        routeTask = nil; requestId = nil
        if case let .success(route) = result, let fix = latestFix, var candidate = try? GuidanceTracker(route: route) {
            let state = candidate.update(fix, now: Date().timeIntervalSince1970 * 1000)
            let approach = state.status == "approach"
            if GuidanceTracker.acceptsReroute(state, original: original, latest: fix), (route.waypointAts ?? route.waypointAt.map { [$0] } ?? []).count == (routing?.stops.count ?? 0), let wire = try? JSValueEncoder().encodeJSObject(route) {
                tracker = candidate; routeWire = wire
                routing?.updateStops(route)
                routeVersion += 1; offRouteCount = 0; retryAfter = .distantPast; spoken.removeAll()
                var coordinates: JSObject = ["lat": fix.lat, "lon": fix.lon, "accuracy": fix.accuracy, "timestamp": fix.timestamp]
                if let speed = fix.speed { coordinates["speed"] = speed }; if let heading = fix.heading { coordinates["heading"] = heading }
                var event: JSObject = ["active": true, "status": approach ? "approach" : "on-route", "fix": coordinates, "route": wire]
                if !approach { event["match"] = ["at": state.at, "seconds": state.seconds, "distance": state.distance] }
                publish(event)
                return
            }
        }
        let succeeded: Bool = { if case .success = result { return true }; return false }()
        retryAfter = Date().addingTimeInterval(succeeded ? 3 : 15)
        publish(["active": true, "status": "reroute-failed", "message": succeeded ? "La position a changé. Nouveau calcul dans un instant." : "Recalcul indisponible. Vérifiez la connexion ; nouvelle tentative automatique."])
    }
    private func cancelRoute() {
        generation += 1; routeTask?.cancel(); routeTask = nil
        if let routing, let id = requestId, let url = URL(string: routing.api.trimmingCharacters(in: CharacterSet(charactersIn: "/")) + "/route/" + id) {
            var request = URLRequest(url: url, timeoutInterval: 10); request.httpMethod = "DELETE"; URLSession.shared.dataTask(with: request).resume()
        }
        requestId = nil
    }
    private func speak(_ message: String) -> Bool {
        guard let voice = AVSpeechSynthesisVoice(language: "fr-FR") else { return false }
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
            try audio.setActive(true)
            speech.stopSpeaking(at: .immediate)
            let utterance = AVSpeechUtterance(string: message); utterance.voice = voice; speech.speak(utterance)
            return true
        } catch { releaseAudio(); return false }
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) { releaseAudio() }
    private func releaseAudio() { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
    private func finish() {
        active = false; timer?.invalidate(); timer = nil; locations.stopUpdatingLocation(); locations.allowsBackgroundLocationUpdates = false
        cancelRoute(); routing = nil; speech.stopSpeaking(at: .immediate); releaseAudio(); tracker = nil
    }
    deinit { timer?.invalidate(); locations.stopUpdatingLocation(); speech.stopSpeaking(at: .immediate) }
}

// Bound the stream before buffering it, including responses without Content-Length.
private final class RouteDownload: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    private static let limit = 32 * 1024 * 1024
    private let request: URLRequest
    private let completion: (Data?, String?, Error?) -> Void
    private var data = Data(), contentType: String?, failure: Error?
    private var session: URLSession?, task: URLSessionDataTask?
    init(request: URLRequest, completion: @escaping (Data?, String?, Error?) -> Void) { self.request = request; self.completion = completion }
    func start() {
        let queue = OperationQueue(); queue.maxConcurrentOperationCount = 1
        let session = URLSession(configuration: .default, delegate: self, delegateQueue: queue)
        self.session = session; let task = session.dataTask(with: request); self.task = task; task.resume()
    }
    func cancel() { task?.cancel() }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode), response.expectedContentLength <= Self.limit else {
            failure = NativeRouting.RoutingError.interrupted; completionHandler(.cancel); return
        }
        contentType = http.value(forHTTPHeaderField: "Content-Type"); completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive chunk: Data) {
        guard chunk.count <= Self.limit - data.count else { failure = NativeRouting.RoutingError.tooLarge; dataTask.cancel(); return }
        data.append(chunk)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        completion(failure == nil && error == nil ? data : nil, contentType, failure ?? error)
        session.finishTasksAndInvalidate()
    }
}

@objc(EclaireDevice)
final class EclaireDevice: CAPPlugin, CAPBridgedPlugin {
    let identifier = "EclaireDevice"
    let jsName = "EclaireDevice"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "setKeepScreenOn", returnType: CAPPluginReturnPromise), CAPPluginMethod(name: "getVersion", returnType: CAPPluginReturnPromise)]
    @objc func setKeepScreenOn(_ call: CAPPluginCall) {
        guard let enabled = call.getBool("enabled") else { call.reject("Missing enabled"); return }
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = enabled && UIApplication.shared.applicationState == .active; call.resolve() }
    }
    @objc func getVersion(_ call: CAPPluginCall) { call.resolve(["version": Bundle.main.object(forInfoDictionaryKey: "EclaireVersion") as? String ?? "Indisponible"]) }
}

final class EclaireViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(EclaireDevice())
        bridge?.registerPluginInstance(EclaireNavigation())
    }
}
