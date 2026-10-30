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
                self.finish()
                self.tracker = tracker; self.voice = call.getBool("voice") ?? false; self.spoken.removeAll(); self.active = true
                self.latest = ["active": true, "status": "starting"]; self.lastGoodAt = Date()
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
    @objc func getState(_ call: CAPPluginCall) { DispatchQueue.main.async { call.resolve(self.latest) } }
    @objc func setVoice(_ call: CAPPluginCall) { DispatchQueue.main.async { self.voice = call.getBool("enabled") ?? false; if !self.voice { self.speech.stopSpeaking(at: .immediate); self.releaseAudio() }; call.resolve() } }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard active, let location = locations.last else { return }
        let fix = GuidanceFix(lat: location.coordinate.latitude, lon: location.coordinate.longitude, accuracy: location.horizontalAccuracy, timestamp: location.timestamp.timeIntervalSince1970 * 1000, speed: location.speed >= 0 ? location.speed : nil, heading: location.course >= 0 ? location.course : nil)
        guard let state = tracker?.update(fix, now: Date().timeIntervalSince1970 * 1000) else { return }
        if state.status == "uncertain" && Date().timeIntervalSince(lastGoodAt) <= 3 { return }
        if state.status != "uncertain" { lastGoodAt = Date() }
        var coordinates: JSObject = ["lat": fix.lat, "lon": fix.lon, "accuracy": fix.accuracy, "timestamp": fix.timestamp]
        if let speed = fix.speed { coordinates["speed"] = speed }
        if let heading = fix.heading { coordinates["heading"] = heading }
        var event: JSObject = ["active": state.status != "arrived", "status": state.status, "fix": coordinates]
        if state.status == "on-route" || state.status == "arrived" {
            event["match"] = ["at": state.at, "seconds": state.seconds, "distance": state.distance]
            let stage = state.toTurn < 35 ? "now" : state.toTurn < 200 ? "near" : "far"
            let key = state.status == "arrived" ? "arrived" : "\(state.nextIndex):\(stage)"
            if voice && !spoken.contains(key), let tracker {
                let distance = state.toTurn >= 1000 ? String(format: "%.1f kilomètres", state.toTurn / 1000) : "\(max(0, Int((state.toTurn / 10).rounded()) * 10)) mètres"
                let message = state.status == "arrived" ? "Vous êtes arrivé au point routier." : (state.toTurn < 20 ? "Maintenant, " : "Dans \(distance), ") + tracker.route.instructions[state.nextIndex].text
                if speak(message) { spoken.insert(key) }
            }
        } else { speech.stopSpeaking(at: .immediate); releaseAudio() }
        publish(event)
        if state.status == "arrived" { active = false; timer?.invalidate(); timer = nil; manager.stopUpdatingLocation(); manager.allowsBackgroundLocationUpdates = false }
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
    private func publish(_ state: JSObject) { latest = state; notifyListeners("location", data: state) }
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
        speech.stopSpeaking(at: .immediate); releaseAudio(); tracker = nil
    }
    deinit { timer?.invalidate(); locations.stopUpdatingLocation(); speech.stopSpeaking(at: .immediate) }
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
