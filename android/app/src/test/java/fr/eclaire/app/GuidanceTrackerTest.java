package fr.eclaire.app;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

public class GuidanceTrackerTest {
    private GuidanceTracker tracker() {
        return new GuidanceTracker(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.001, 2, 111, 20), new GuidanceTracker.Point(48.002, 2, 222, 40)),
                List.of(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(111, "Tournez à droite"), new GuidanceTracker.Step(222, "Arrivée")));
    }
    private GuidanceTracker.Fix fix(double lat, double lon, double accuracy, long time, Double speed) { return new GuidanceTracker.Fix(lat, lon, accuracy, time, speed, null); }

    @Test public void nativeUpdatesContinueAcrossLongGapsAndRejectBadFixes() {
        var tracker = tracker();
        var state = tracker.update(fix(48.0005, 2, 5, 100000, 0d), 100000);
        assertEquals("on-route", state.status()); assertEquals(55.5, state.toTurn(), .1); assertEquals(1, state.nextIndex());
        assertEquals("uncertain", tracker.update(fix(48.001, 2, 5, 100000, 0d), 100000).status());
        assertEquals("uncertain", tracker.update(fix(48.001, 2, 100, 102000, 0d), 102000).status());
        assertEquals("uncertain", tracker.update(fix(48.001, 2, 5, 103000, 0d), 130000).status());
        assertEquals("off-route", tracker.update(fix(48.001, 2.01, 5, 140000, 0d), 140000).status());
        state = tracker.update(fix(48.0015, 2, 5, 180000, 0d), 180000);
        assertEquals("on-route", state.status()); assertEquals(2, state.nextIndex());
        assertEquals("on-route", tracker.update(fix(48.002, 2, 5, 182000, 0d), 182000).status());
        assertEquals("arrived", tracker.update(fix(48.002, 2, 5, 186000, 0d), 186000).status());
    }

    @Test public void arrivalRequiresSlowAccurateFixesAndApproachHasNoTurn() {
        var tracker = tracker();
        assertEquals("approach", tracker.update(fix(48, 2.005, 5, 100000, 0d), 100000).status());
        assertEquals("on-route", tracker.update(fix(48.002, 2, 5, 104000, 15d), 104000).status());
        assertEquals("on-route", tracker.update(fix(48.002, 2, 5, 108000, 15d), 108000).status());
        assertEquals("on-route", tracker.update(fix(48.002, 2, 5, 110000, null), 110000).status());
        assertEquals("arrived", tracker.update(fix(48.002, 2, 5, 114000, null), 114000).status());
        assertThrows(IllegalArgumentException.class, () -> new GuidanceTracker(List.of(), List.of()));
    }

    @Test public void routeKeepsAnImmutableCopyOfItsInputs() {
        var points = new java.util.ArrayList<>(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.001, 2, 111, 20)));
        var steps = new java.util.ArrayList<>(List.of(new GuidanceTracker.Step(0, "Continuez")));
        var tracker = new GuidanceTracker(points, steps);
        points.clear(); steps.clear();
        assertEquals(2, tracker.points.size());
        assertEquals(1, tracker.steps.size());
        assertThrows(UnsupportedOperationException.class, () -> tracker.points.clear());
    }

    @Test public void headingDistinguishesParallelOppositeDirectionsOnlyWhenMoving() {
        var points = List.of(new GuidanceTracker.Point(48.001, 2, 0, 0), new GuidanceTracker.Point(48, 2, 111, 10), new GuidanceTracker.Point(48, 2.0002, 126, 12), new GuidanceTracker.Point(48.001, 2.0002, 237, 22));
        var steps = List.of(new GuidanceTracker.Step(0, "Continuez"));
        var moving = new GuidanceTracker(points, steps).update(new GuidanceTracker.Fix(48.0005, 2, 5, 100000, 10d, 0d), 100000);
        var stopped = new GuidanceTracker(points, steps).update(new GuidanceTracker.Fix(48.0005, 2, 5, 100000, 0d, 0d), 100000);
        assertTrue(moving.at() > 126); assertTrue(stopped.at() < 111);
    }

    @Test public void speedAndHistoryKeepTheCorrectPassOnParallelAndOverlappingSegments() {
        double y = 111195, x = y * Math.cos(Math.toRadians(48));
        for (double offset : new double[]{0, 5}) {
            var points = List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48 + 30 / y, 2, 30, 3),
                    new GuidanceTracker.Point(48 + 30 / y, 2 + 10 / x, 40, 4), new GuidanceTracker.Point(48, 2 + 10 / x, 70, 7),
                    new GuidanceTracker.Point(48, 2 + offset / x, 80 - offset, (80 - offset) / 10), new GuidanceTracker.Point(48 + 60 / y, 2 + offset / x, 140 - offset, (140 - offset) / 10));
            var steps = List.of(new GuidanceTracker.Step(0, "Continuez"));
            var later = new GuidanceTracker(points, steps);
            assertEquals(60, later.update(new GuidanceTracker.Fix(48 + 10 / y, 2 + 10 / x, 5, 100000, 10d, 180d), 100000).at(), 0.01);
            assertEquals(95 - offset, later.update(new GuidanceTracker.Fix(48 + 15 / y, 2 + offset / x, 5, 103500, 10d, 0d), 103500).at(), 0.01);
            var earlier = new GuidanceTracker(points, steps);
            earlier.update(new GuidanceTracker.Fix(48 + 10 / y, 2, 5, 100000, 10d, 0d), 100000);
            assertEquals(20, earlier.update(new GuidanceTracker.Fix(48 + 20 / y, 2 + offset / x, 5, 101000, 10d, 0d), 101000).at(), 0.01);
        }
    }

    @Test public void recalculatedApproachIsRejectedIfTheDriverMovedTooFar() {
        var origin = fix(48, 2, 5, 100000, 0d);
        var approach = new GuidanceTracker.State("approach", 0, 0, 300, 0, 0);
        assertTrue(GuidanceTracker.acceptsReroute(approach, origin, fix(48.0001, 2, 5, 101000, 0d)));
        assertFalse(GuidanceTracker.acceptsReroute(approach, origin, fix(48.001, 2, 5, 101000, 0d)));
        assertFalse(GuidanceTracker.acceptsReroute(new GuidanceTracker.State("uncertain", 0, 0, 0, 0, 0), origin, origin));
    }

    @Test public void voiceWarningsAdaptToSpeedWithBoundedDistances() {
        assertEquals("far", GuidanceTracker.voiceStage(400, 0d));
        assertEquals("near", GuidanceTracker.voiceStage(400, 30d));
        assertEquals("now", GuidanceTracker.voiceStage(80, 30d));
        assertEquals("near", GuidanceTracker.voiceStage(80, null));
        assertEquals("far", GuidanceTracker.voiceStage(600, 100d));
        assertEquals("far", GuidanceTracker.voiceStage(400, Double.NaN));
    }

    @Test public void longSegmentCrossingTheContinuityWindowRemainsEligible() {
        var tracker = new GuidanceTracker(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1000, 100), new GuidanceTracker.Point(48.02, 2, 2000, 200)), List.of(new GuidanceTracker.Step(0, "Continuez")));
        tracker.update(fix(48.0049, 2, 5, 100000, 0d), 100000);
        var state = tracker.update(fix(48.005, 2, 5, 101000, 0d), 101000);
        assertEquals("on-route", state.status()); assertEquals(500, state.at(), .01);
    }
}
