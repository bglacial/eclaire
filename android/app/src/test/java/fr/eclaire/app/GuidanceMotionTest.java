package fr.eclaire.app;

import static org.junit.Assert.*;
import java.util.Arrays;
import org.junit.Test;

public class GuidanceMotionTest {
    @Test public void approachAfterRerouteUsesOnlyTheRealPosition() {
        var oldRoute = new GuidanceTracker(java.util.List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1112, 100)), java.util.List.of(new GuidanceTracker.Step(0, "Continuez")));
        var newRoute = new GuidanceTracker(java.util.List.of(new GuidanceTracker.Point(48.005, 2.004, 0, 0), new GuidanceTracker.Point(48.01, 2, 800, 100)), java.util.List.of(new GuidanceTracker.Step(0, "Continuez")));
        var motion = new GuidanceMotion();
        var oldFix = new GuidanceTracker.Fix(48.001, 2, 5, 100000, 10d, 0d);
        motion.update(new CarGuidance.Snapshot(oldRoute, oldFix, new GuidanceTracker.State("on-route", 111, 10, 0, 0, 0), "on-route", "Continuez", false), 100000);
        var current = new GuidanceTracker.Fix(48.002, 2.004, 5, 102000, 10d, 0d);
        motion.update(new CarGuidance.Snapshot(newRoute, current, null, "approach", "Rejoignez la route", false), 102000);
        var position = motion.position(110000);
        assertEquals(current.lat(), position.lat(), 0.000001); assertEquals(current.lon(), position.lon(), 0.000001);
        assertTrue(Double.isNaN(position.at())); assertFalse(position.estimated()); assertNull(motion.progress());
    }
    @Test public void estimatesOnlyFromRealMatchesAndStopsAfterFifteenSeconds() {
        var route = new GuidanceTracker(Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1000, 100)), Arrays.asList(new GuidanceTracker.Step(0, "Continuez")));
        var fix = new GuidanceTracker.Fix(48, 2, 5, 100_000, 20.0, 0.0);
        var match = new GuidanceTracker.State("on-route", 100, 10, 0, 0, 0);
        var motion = new GuidanceMotion();
        motion.update(new CarGuidance.Snapshot(route, fix, match, "on-route", "Continuez", false), 100_000);
        assertEquals(120, motion.position(101_000).at(), 0.001);
        assertEquals(300, motion.position(110_000).at(), 0.001);
        assertEquals(100, motion.position(110_000, true).at(), 0.001);
        assertTrue(motion.position(110_000).estimated());
        motion.update(new CarGuidance.Snapshot(route, null, null, "uncertain", "Signal GPS perdu", false), 110_000);
        assertEquals(400, motion.position(115_000).at(), 0.001);
        assertNull(motion.position(115_001));
        var off = new GuidanceTracker.Fix(49, 3, 5, 116_000, 20.0, 90.0);
        motion.update(new CarGuidance.Snapshot(route, off, null, "off-route", "Hors du trajet", false), 116_000);
        assertEquals(49, motion.position(116_000).lat(), 0.001);
        assertFalse(motion.position(116_000).estimated());
        motion.update(null, 117_000);
        assertNull(motion.position(117_000));
    }

    @Test public void stoppedOrMissingSpeedDoesNotInventMotion() {
        var route = new GuidanceTracker(Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1000, 100)), Arrays.asList(new GuidanceTracker.Step(0, "Continuez")));
        var motion = new GuidanceMotion();
        var fix = new GuidanceTracker.Fix(48, 2, 5, 100_000, 0.0, null);
        var match = new GuidanceTracker.State("on-route", 100, 10, 0, 0, 0);
        motion.update(new CarGuidance.Snapshot(route, fix, match, "on-route", "Continuez", false), 100_000);
        assertEquals(100, motion.position(110_000).at(), 0.001);
        assertFalse(motion.moving(110_000));
    }
}
