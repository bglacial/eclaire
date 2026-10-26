package fr.eclaire;

import com.graphhopper.routing.DijkstraBidirectionRef;
import com.graphhopper.routing.ev.*;
import com.graphhopper.routing.util.EncodingManager;
import com.graphhopper.routing.util.TraversalMode;
import com.graphhopper.routing.weighting.SpeedWeighting;
import com.graphhopper.storage.BaseGraph;
import com.graphhopper.util.EdgeIterator;
import com.graphhopper.util.EdgeIteratorState;
import org.junit.jupiter.api.Test;
import java.util.concurrent.CancellationException;
import static org.junit.jupiter.api.Assertions.*;

class RoutingTest {
    private final BooleanEncodedValue access = new SimpleBooleanEncodedValue("car_access", true);
    private final DecimalEncodedValue speed = new DecimalEncodedValueImpl("car_average_speed", 8, 1, true);
    private final BooleanEncodedValue restriction = new SimpleBooleanEncodedValue(TurnRestriction.key("car"), false);

    private BaseGraph graph() {
        var manager = new EncodingManager.Builder().add(access).add(speed).addTurnCostEncodedValue(restriction).build();
        var graph = new BaseGraph.Builder(manager).withTurnCosts(true).create();
        for (int i = 0; i < 5; i++) graph.getNodeAccess().setNode(i, 48.8 + i * 0.001, 2.3);
        return graph;
    }
    private EdgeIteratorState edge(BaseGraph graph, int a, int b, double distance, double velocity) {
        return graph.edge(a, b).setDistance(distance).set(access, true, false).set(speed, velocity, 0);
    }
    private SpeedWeighting weighting(BaseGraph graph) {
        return new SpeedWeighting(speed) {
            @Override public double calcTurnWeight(int in, int via, int out) {
                if (!EdgeIterator.Edge.isValid(in) || !EdgeIterator.Edge.isValid(out)) return 0;
                return graph.getTurnCostStorage().get(restriction, in, via, out) ? Double.POSITIVE_INFINITY : 0;
            }
            @Override public long calcTurnMillis(int in, int via, int out) { return 0; }
            @Override public boolean hasTurnCosts() { return true; }
        };
    }

    @Test void twoCriteriaAndTraceDirection() {
        try (var graph = graph()) {
            edge(graph, 0, 1, 100, 10); edge(graph, 1, 3, 100, 10);
            edge(graph, 0, 2, 200, 50); edge(graph, 2, 3, 200, 50);
            var time = weighting(graph);
            var fastest = new TracedSearch(graph, time);
            var shortAlgo = new TracedSearch(graph, new DistanceWeighting(time));
            var fastPath = fastest.calcPath(0, 3); var shortPath = shortAlgo.calcPath(0, 3);
            assertEquals(400, fastPath.getDistance()); assertEquals(200, shortPath.getDistance());
            assertTrue(fastPath.getTime() < shortPath.getTime());
            assertTrue(fastest.sides.toArray().length > 0);
            boolean reverse = false, forward = false;
            for (int i = 0; i < fastest.keys.size(); i++) {
                assertTrue(Double.isFinite(time.calcEdgeWeight(graph.getEdgeIteratorStateForKey(fastest.keys.get(i)), false)));
                if (fastest.sides.get(i) == 0) forward = true; else reverse = true;
            }
            assertTrue(forward && reverse);
            var untraced = new DijkstraBidirectionRef(graph, time, TraversalMode.EDGE_BASED).calcPath(0, 3);
            assertEquals(untraced.getWeight(), fastPath.getWeight());
        }
    }
    @Test void oneWayImpossibleAndSamePoint() {
        try (var graph = graph()) {
            edge(graph, 0, 1, 100, 10); edge(graph, 1, 3, 100, 10);
            assertFalse(new TracedSearch(graph, weighting(graph)).calcPath(3, 0).isFound());
            assertFalse(new TracedSearch(graph, weighting(graph)).calcPath(0, 4).isFound());
            var same = new TracedSearch(graph, weighting(graph)).calcPath(0, 0);
            assertTrue(same.isFound()); assertEquals(0, same.getDistance()); assertEquals(0, same.getTime());
        }
    }
    @Test void turnRestrictionSurvivesBothObjectives() {
        try (var graph = graph()) {
            var a = edge(graph, 0, 1, 100, 10); var b = edge(graph, 1, 3, 100, 10);
            edge(graph, 0, 2, 200, 10); edge(graph, 2, 3, 200, 10);
            graph.getTurnCostStorage().set(restriction, a.getEdge(), 1, b.getEdge(), true);
            assertEquals(400, new TracedSearch(graph, weighting(graph)).calcPath(0, 3).getDistance());
            assertEquals(400, new TracedSearch(graph, new DistanceWeighting(weighting(graph))).calcPath(0, 3).getDistance());
        }
    }
    @Test void firstMeetingIsOnlyACandidate() {
        try (var graph = graph()) {
            edge(graph, 0, 1, 1, 1); edge(graph, 1, 3, 100, 1);
            edge(graph, 0, 2, 30, 1); edge(graph, 2, 3, 30, 1);
            assertEquals(60, new TracedSearch(graph, new DistanceWeighting(weighting(graph))).calcPath(0, 3).getDistance());
        }
    }
    @Test void interruptionAndUnprovenResultAreNotSuccesses() {
        try (var graph = graph()) {
            edge(graph, 0, 1, 100, 10); edge(graph, 1, 3, 100, 10);
            var limited = new TracedSearch(graph, weighting(graph)); limited.setMaxVisitedNodes(0);
            limited.calcPath(0, 3); assertTrue(limited.exhaustedBudget());
            Thread.currentThread().interrupt();
            try { assertThrows(CancellationException.class, () -> new TracedSearch(graph, weighting(graph)).calcPath(0, 3)); }
            finally { Thread.interrupted(); }
        }
    }
}
