package fr.eclaire.app;

/** Visual estimation only: navigation and arrival always use real GPS fixes. */
final class GuidanceMotion {
    record Position(double lat, double lon, double at, double heading, boolean estimated) {}
    private GuidanceTracker route;
    private GuidanceTracker.Fix fix;
    private GuidanceTracker.State match;
    private CarGuidance.Snapshot state;
    private double speed, from;
    private long blendAt, speedAt;

    void update(CarGuidance.Snapshot next, long now) {
        Position previous = position(now);
        if (next == null || route != next.route()) {
            fix = null; match = null; speed = 0; speedAt = 0;
            route = next == null ? null : next.route();
            previous = null;
        }
        state = next;
        if (next == null) return;
        if ("on-route".equals(next.status()) && next.fix() != null && next.progress() != null) {
            fix = next.fix(); match = next.progress();
            Double value = fix.speed();
            if (value != null && Double.isFinite(value) && value >= 0 && value <= 100) { speed = value; speedAt = fix.timestamp(); }
            else if (fix.timestamp() - speedAt > 20_000) speed = 0;
            from = previous == null || !Double.isFinite(previous.at()) ? match.at() : previous.at();
            blendAt = now;
        } else if (!"uncertain".equals(next.status())) {
            fix = null; match = null; speed = 0; speedAt = 0;
        }
    }

    Position position(long now) { return position(now, false); }

    Position position(long now, boolean reducedMotion) {
        if (state == null) return null;
        if (!"on-route".equals(state.status()) && !"uncertain".equals(state.status())) {
            var raw = state.fix();
            if (raw == null) return null;
            double heading = raw.heading() != null && Double.isFinite(raw.heading()) && raw.heading() >= 0 && raw.heading() < 360 ? raw.heading() : 0;
            return new Position(raw.lat(), raw.lon(), Double.NaN, heading, false);
        }
        if (fix == null || match == null || route == null) return null;
        long age = Math.max(0, now - fix.timestamp());
        if (age > 15_000) return null;
        var points = route.points;
        double target = Math.min(points.get(points.size() - 1).at(), match.at() + Math.min(300, reducedMotion || speed < 0.5 ? 0 : speed * age / 1000));
        double blend = reducedMotion ? 1 : Math.min(1, Math.max(0, (now - blendAt) / 500.0));
        double at = from + (target - from) * blend;
        int low = 1, high = points.size() - 1;
        while (low < high) { int mid = (low + high) >>> 1; if (points.get(mid).at() < at) low = mid + 1; else high = mid; }
        var a = points.get(low - 1); var b = points.get(low);
        double fraction = b.at() > a.at() ? Math.max(0, Math.min(1, (at - a.at()) / (b.at() - a.at()))) : 0;
        double lat = a.lat() + (b.lat() - a.lat()) * fraction, lon = a.lon() + (b.lon() - a.lon()) * fraction;
        double heading = (Math.toDegrees(Math.atan2((b.lon() - a.lon()) * Math.cos(Math.toRadians(lat)), b.lat() - a.lat())) + 360) % 360;
        if (speed >= 1 && fix.heading() != null && Double.isFinite(fix.heading()) && fix.heading() >= 0 && fix.heading() < 360) heading = fix.heading();
        return new Position(lat, lon, at, heading, age > 3000 || "uncertain".equals(state.status()));
    }

    boolean moving(long now) { return fix != null && match != null && speed >= 0.5 && now - fix.timestamp() <= 15_000; }

    GuidanceTracker.State progress() { return match; }
}
