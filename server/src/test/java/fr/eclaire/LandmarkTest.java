package fr.eclaire;

import com.graphhopper.routing.DijkstraBidirectionRef;
import com.graphhopper.routing.ev.*;
import com.graphhopper.routing.lm.LMApproximator;
import com.graphhopper.routing.util.*;
import com.graphhopper.routing.weighting.*;
import com.graphhopper.storage.BaseGraph;
import com.graphhopper.util.EdgeIterator;
import java.nio.file.Path;
import java.util.Random;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import static org.junit.jupiter.api.Assertions.*;

class LandmarkTest {
    @TempDir Path temporary;
    @Test void landmarksKeepTheDijkstraOptimumForBothObjectivesAndTurnRestrictions() throws Exception {
        var access = new SimpleBooleanEncodedValue("car_access", true);
        var speed = new DecimalEncodedValueImpl("car_average_speed", 8, 1, true);
        var restriction = new SimpleBooleanEncodedValue(TurnRestriction.key("car"), false);
        var encoding = new EncodingManager.Builder().add(access).add(speed).add(new SimpleBooleanEncodedValue("car_subnetwork", false)).addTurnCostEncodedValue(restriction).build();
        try (var graph = new BaseGraph.Builder(encoding).withTurnCosts(true).create()) {
            var random = new Random(83);
            for (int i = 0; i < 33; i++) graph.getNodeAccess().setNode(i, 48 + i * 0.0000001, 2);
            for (int i = 0; i < 32; i++) graph.edge(i, (i + 1) % 32).setDistance(100 + random.nextInt(400)).set(access, true, false).set(speed, 10d + random.nextInt(60), 0d);
            for (int i = 0; i < 64; i++) { int a = random.nextInt(32), b = random.nextInt(32); if (a != b) graph.edge(a, b).setDistance(100 + random.nextInt(400)).set(access, true, false).set(speed, 10d + random.nextInt(60), 0d); }
            graph.getTurnCostStorage().set(restriction, 0, 1, 1, true);
            var time = new SpeedWeighting(speed) {
                public double calcTurnWeight(int in, int via, int out) { return EdgeIterator.Edge.isValid(in) && EdgeIterator.Edge.isValid(out) && graph.getTurnCostStorage().get(restriction, in, via, out) ? Double.POSITIVE_INFINITY : 0; }
                public boolean hasTurnCosts() { return true; }
            };
            for (boolean distance : new boolean[]{false, true}) {
                Weighting weighting = distance ? new DistanceWeighting(time) : time;
                var directory = temporary.resolve(distance ? "distance" : "time").toString();
                var landmarks = LandmarkIndex.open(graph, encoding, weighting, directory, true);
                assertFalse(landmarks.isEmpty());
                assertEquals(32, landmarks.getLandmarkCount());
                assertEquals("32", java.nio.file.Files.readString(Path.of(directory, "eclaire.ready")));
                for (int i = 0; i < 100; i++) {
                    int a = random.nextInt(32), b = random.nextInt(32);
                    var expected = new DijkstraBidirectionRef(graph, weighting, TraversalMode.EDGE_BASED).calcPath(a, b);
                    var search = new TracedSearch(graph, weighting, LMApproximator.forLandmarks(graph, weighting, landmarks, landmarks.getLandmarkCount()));
                    var actual = search.calcPath(a, b);
                    assertEquals(expected.isFound(), actual.isFound()); assertEquals(expected.getWeight(), actual.getWeight(), 1e-7);
                }
                assertFalse(new TracedSearch(graph, weighting, LMApproximator.forLandmarks(graph, weighting, landmarks, landmarks.getLandmarkCount())).calcPath(0, 32).isFound());
                landmarks.close();
                var loaded = LandmarkIndex.open(graph, encoding, weighting, directory, false); assertFalse(loaded.isEmpty()); loaded.close();
            }
        }
    }
}
