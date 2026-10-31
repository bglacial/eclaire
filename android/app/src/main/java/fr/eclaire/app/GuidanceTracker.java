package fr.eclaire.app;

import java.util.List;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.ArrayList;

/** Native counterpart of navigation.ts, kept alive independently of the WebView. */
final class GuidanceTracker {
    record Point(double lat, double lon, double at, double seconds) {}
    record Step(double at, String text, int sign) {
        Step(double at, String text) { this(at, text, 0); }
    }
    record Fix(double lat, double lon, double accuracy, long timestamp, Double speed, Double heading) {}
    record State(String status, double at, double seconds, double distance, int nextIndex, double toTurn) {}
    static boolean acceptsReroute(State state, Fix origin, Fix latest) {
        if ("on-route".equals(state.status())) return true;
        double moved = Math.hypot((latest.lat() - origin.lat()) * 111195, (latest.lon() - origin.lon()) * 111195 * Math.cos(latest.lat() * Math.PI / 180));
        return "approach".equals(state.status()) && moved <= Math.max(50, latest.accuracy() + origin.accuracy());
    }
    static String voiceStage(double distance, Double measuredSpeed) {
        double speed = measuredSpeed != null && Double.isFinite(measuredSpeed) && measuredSpeed >= 0 && measuredSpeed <= 100 ? measuredSpeed : 0;
        double immediate = Math.max(35, Math.min(100, speed * 3));
        double near = Math.max(200, Math.min(500, speed * 15));
        return distance < immediate ? "now" : distance < near ? "near" : "far";
    }
    final List<Point> points;
    final List<Step> steps;
    private State match;
    private long timestamp, lastSeen, arrivalSince;

    static GuidanceTracker fromJson(JSONObject data) throws JSONException {
        JSONArray points = data.getJSONArray("points"), steps = data.getJSONArray("instructions");
        if (points.length() > 1_000_000 || steps.length() > 50_000 || points.length() < 2 || steps.length() == 0) throw new IllegalArgumentException("Parcours de guidage incomplet.");
        var geometry = new ArrayList<Point>(); var instructions = new ArrayList<Step>();
        for (int i = 0; i < points.length(); i++) {
            var p = points.getJSONObject(i);
            if (p.has("speedLimit")) { double limit = p.getDouble("speedLimit"); if (!Double.isFinite(limit) || limit <= 0 || limit > 250) throw new IllegalArgumentException("Limite de vitesse invalide."); }
            geometry.add(new Point(p.getDouble("lat"), p.getDouble("lon"), p.getDouble("at"), p.getDouble("seconds")));
        }
        for (int i = 0; i < steps.length(); i++) {
            var s = steps.getJSONObject(i); var sign = s.opt("sign");
            if (!(sign instanceof Number number) || !Double.isFinite(number.doubleValue()) || number.doubleValue() != Math.rint(number.doubleValue()) || number.doubleValue() < Integer.MIN_VALUE || number.doubleValue() > Integer.MAX_VALUE || !(s.opt("name") instanceof String) || s.getString("name").length() > 2000) throw new IllegalArgumentException("Manœuvre de guidage invalide.");
            instructions.add(new Step(s.getDouble("at"), s.getString("text"), number.intValue()));
        }
        var tracker = new GuidanceTracker(geometry, instructions);
        double length = data.getDouble("length"), seconds = data.getDouble("seconds");
        if (data.has("waypointAt")) { double at = data.getDouble("waypointAt"); if (!Double.isFinite(at) || at <= 0 || at >= length) throw new IllegalArgumentException("Étape hors du trajet."); }
        if (!Double.isFinite(length) || length < 1 || !Double.isFinite(seconds) || seconds < 0 || Math.abs(geometry.get(0).at()) > 1e-6 || Math.abs(geometry.get(0).seconds()) > 1e-6 || Math.abs(geometry.get(geometry.size() - 1).at() - length) > 2 || Math.abs(geometry.get(geometry.size() - 1).seconds() - seconds) > 2 || Math.abs(instructions.get(0).at()) > 1e-6 || instructions.get(instructions.size() - 1).sign() != 4 || Math.abs(instructions.get(instructions.size() - 1).at() - length) > 1)
            throw new IllegalArgumentException("Parcours de guidage incohérent.");
        return tracker;
    }

    GuidanceTracker(List<Point> points, List<Step> steps) {
        if (points.size() < 2 || steps.isEmpty()) throw new IllegalArgumentException("Parcours de guidage incomplet.");
        double previous = -1, previousSeconds = -1;
        for (Point p : points) {
            if (!Double.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Double.isFinite(p.lon) || Math.abs(p.lon) > 180 || !Double.isFinite(p.at) || p.at < 0 || p.at < previous || !Double.isFinite(p.seconds) || p.seconds < 0 || p.seconds < previousSeconds)
                throw new IllegalArgumentException("Point de guidage invalide.");
            previous = p.at; previousSeconds = p.seconds;
        }
        previous = -1;
        for (Step step : steps) {
            if (!Double.isFinite(step.at) || step.at < 0 || step.at < previous || step.at > points.get(points.size() - 1).at + 1 || step.text == null || step.text.length() > 2000)
                throw new IllegalArgumentException("Manœuvre de guidage invalide.");
            previous = step.at;
        }
        this.points = java.util.Collections.unmodifiableList(new java.util.ArrayList<>(points));
        this.steps = java.util.Collections.unmodifiableList(new java.util.ArrayList<>(steps));
    }

    State update(Fix fix, long now) {
        if (!Double.isFinite(fix.lat) || Math.abs(fix.lat) > 90 || !Double.isFinite(fix.lon) || Math.abs(fix.lon) > 180 || !Double.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 50 || now - fix.timestamp > 15000 || fix.timestamp > now + 5000 || fix.timestamp <= lastSeen)
            return new State("uncertain", 0, 0, 0, 0, 0);
        lastSeen = fix.timestamp;
        double scaleX = 111195 * Math.cos(fix.lat * Math.PI / 180);
        double speed = fix.speed != null && Double.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 100 ? fix.speed : 0;
        double forward = Math.max(180, (speed + 15) * (timestamp == 0 ? 0 : fix.timestamp - timestamp) / 1000 + fix.accuracy * 2);
        double best = Double.POSITIVE_INFINITY, bestScore = Double.POSITIVE_INFINITY, at = 0, seconds = 0;
        int first = 1;
        if (match != null) {
            int low = 1, high = points.size() - 1;
            while (low < high) { int mid = (low + high) >>> 1; if (points.get(mid).at < match.at - 60) low = mid + 1; else high = mid; }
            first = low;
        }
        for (int i = first; i < points.size(); i++) {
            Point a = points.get(i - 1), b = points.get(i);
            if (match != null && a.at > match.at + forward) break;
            double x = (b.lon - a.lon) * scaleX, y = (b.lat - a.lat) * 111195;
            double px = (fix.lon - a.lon) * scaleX, py = (fix.lat - a.lat) * 111195;
            double t = x == 0 && y == 0 ? 0 : Math.max(0, Math.min(1, (px * x + py * y) / (x * x + y * y)));
            double candidate = a.at + (b.at - a.at) * t;
            if (match != null && (candidate < match.at - 60 || candidate > match.at + forward)) continue;
            double distance = Math.hypot(px - x * t, py - y * t);
            if (distance > bestScore) continue;
            // shortcut: sans historique ni altitude fiable, les voies superposées restent ambiguës ; utiliser un vrai map matching pour identifier le niveau au départ.
            boolean heading = speed >= 3 && fix.heading != null && Double.isFinite(fix.heading) && fix.heading >= 0 && fix.heading < 360 && Math.hypot(x, y) >= 10;
            double penalty = heading ? 12.5 * (1 - Math.cos(Math.atan2(x, y) - Math.toRadians(fix.heading))) : 0;
            long elapsed = fix.timestamp - timestamp;
            double motion = match != null && elapsed > 0 && elapsed <= 15000 && fix.speed != null && Double.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 100
                    ? Math.min(25, Math.abs(candidate - match.at - speed * elapsed / 1000) * 0.25) : 0;
            double score = distance + penalty + motion + (distance > Math.max(75, fix.accuracy * 1.5) ? 100 : 0);
            if (score < bestScore) { bestScore = score; best = distance; at = candidate; seconds = a.seconds + (b.seconds - a.seconds) * t; }
        }
        if (best > Math.max(75, fix.accuracy * 1.5)) {
            arrivalSince = 0;
            return new State(match == null && best <= 2000 ? "approach" : "off-route", at, seconds, best, 0, 0);
        }
        Point end = points.get(points.size() - 1);
        double endDistance = Math.hypot((fix.lon - end.lon) * scaleX, (fix.lat - end.lat) * 111195);
        boolean near = end.at - at < 35 && endDistance < 30 && fix.accuracy <= 25 && (fix.speed == null || fix.speed <= 3);
        arrivalSince = near ? arrivalSince == 0 ? fix.timestamp : arrivalSince : 0;
        int next = 0;
        while (next < steps.size() - 1 && steps.get(next).at <= at - 8) next++;
        String status = arrivalSince != 0 && fix.timestamp - arrivalSince >= 3000 ? "arrived" : "on-route";
        match = new State(status, at, seconds, best, next, Math.max(0, steps.get(next).at - at));
        timestamp = fix.timestamp;
        return match;
    }
}
