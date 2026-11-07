package fr.eclaire.app;

import org.junit.Test;
import java.util.List;
import static org.junit.Assert.*;

/** Java-specific checks; shared tracking scenarios live in GuidanceFixturesTest. */
public class GuidanceTrackerTest {
    @Test public void emptyRouteIsRejected() {
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

    @Test public void voiceWarningsIgnoreNonFiniteSpeed() {
        assertEquals("far", GuidanceTracker.voiceStage(400, Double.NaN));
    }
}
