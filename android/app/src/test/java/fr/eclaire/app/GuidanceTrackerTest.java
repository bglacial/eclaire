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
}
