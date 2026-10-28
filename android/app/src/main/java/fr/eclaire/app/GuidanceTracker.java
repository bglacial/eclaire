package fr.eclaire.app;

import java.util.List;

/** Native counterpart of navigation.ts, kept alive independently of the WebView. */
final class GuidanceTracker {
    record Point(double lat, double lon, double at, double seconds) {}
    record Step(double at, String text) {}
    record Fix(double lat, double lon, double accuracy, long timestamp, Double speed, Double heading) {}
    record State(String status, double at, double seconds, double distance, int nextIndex, double toTurn) {}
    final List<Point> points;
    final List<Step> steps;
    private State match;
    private long timestamp, lastSeen, arrivalSince;

    GuidanceTracker(List<Point> points, List<Step> steps) {
        if (points.size() < 2 || steps.isEmpty()) throw new IllegalArgumentException("Parcours de guidage incomplet.");
        double previous = -1;
        for (Point p : points) {
            if (!Double.isFinite(p.lat) || Math.abs(p.lat) > 90 || !Double.isFinite(p.lon) || Math.abs(p.lon) > 180 || !Double.isFinite(p.at) || p.at < 0 || p.at < previous || !Double.isFinite(p.seconds) || p.seconds < 0)
                throw new IllegalArgumentException("Point de guidage invalide.");
            previous = p.at;
        }
        previous = -1;
        for (Step step : steps) {
            if (!Double.isFinite(step.at) || step.at < 0 || step.at < previous || step.at > points.get(points.size() - 1).at + 1 || step.text == null || step.text.length() > 2000)
                throw new IllegalArgumentException("Manœuvre de guidage invalide.");
            previous = step.at;
        }
        this.points = List.copyOf(points); this.steps = List.copyOf(steps);
    }

    State update(Fix fix, long now) {
        if (!Double.isFinite(fix.lat) || Math.abs(fix.lat) > 90 || !Double.isFinite(fix.lon) || Math.abs(fix.lon) > 180 || !Double.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 50 || now - fix.timestamp > 15000 || fix.timestamp > now + 5000 || fix.timestamp <= lastSeen)
            return new State("uncertain", 0, 0, 0, 0, 0);
        lastSeen = fix.timestamp;
        double scaleX = 111195 * Math.cos(fix.lat * Math.PI / 180);
        double speed = fix.speed != null && Double.isFinite(fix.speed) && fix.speed >= 0 && fix.speed <= 100 ? fix.speed : 0;
        double forward = Math.max(180, (speed + 15) * (timestamp == 0 ? 0 : fix.timestamp - timestamp) / 1000 + fix.accuracy * 2);
        double best = Double.POSITIVE_INFINITY, at = 0, seconds = 0;
        for (int i = 1; i < points.size(); i++) {
            Point a = points.get(i - 1), b = points.get(i);
            double x = (b.lon - a.lon) * scaleX, y = (b.lat - a.lat) * 111195;
            double px = (fix.lon - a.lon) * scaleX, py = (fix.lat - a.lat) * 111195;
            double t = x == 0 && y == 0 ? 0 : Math.max(0, Math.min(1, (px * x + py * y) / (x * x + y * y)));
            double candidate = a.at + (b.at - a.at) * t;
            // shortcut: continuité géométrique bornée, comme navigation.ts ; pas de map matching multivoie.
            if (match != null && (candidate < match.at - 60 || candidate > match.at + forward)) continue;
            double distance = Math.hypot(px - x * t, py - y * t);
            if (distance < best) { best = distance; at = candidate; seconds = a.seconds + (b.seconds - a.seconds) * t; }
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
