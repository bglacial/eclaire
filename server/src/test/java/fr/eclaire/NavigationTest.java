package fr.eclaire;

import com.graphhopper.routing.DijkstraBidirectionRef;
import com.graphhopper.routing.ev.*;
import com.graphhopper.routing.util.EncodingManager;
import com.graphhopper.routing.util.TraversalMode;
import com.graphhopper.routing.weighting.SpeedWeighting;
import com.graphhopper.storage.BaseGraph;
import com.graphhopper.util.TranslationMap;
import org.junit.jupiter.api.Test;
import java.util.Locale;
import static org.junit.jupiter.api.Assertions.*;

class NavigationTest {
    @Test void frenchInstructionsDescribeTheActualPathAndFinishAtItsDistance() {
        var access = new SimpleBooleanEncodedValue("car_access", true);
        var speed = new DecimalEncodedValueImpl("car_average_speed", 8, 1, true);
        var manager = new EncodingManager.Builder().add(access).add(speed).add(Roundabout.create()).add(RoadClassLink.create())
                .add(RoadClass.create()).add(RoadEnvironment.create()).add(MaxSpeed.create()).build();
        try (var graph = new BaseGraph.Builder(manager).create()) {
            graph.getNodeAccess().setNode(0, 48.85, 2.35);
            graph.getNodeAccess().setNode(1, 48.851, 2.35);
            graph.getNodeAccess().setNode(2, 48.851, 2.351);
            graph.getNodeAccess().setNode(3, 48.852, 2.35);
            graph.edge(0, 1).setDistance(110).set(access, true, false).set(speed, 30d, 0d);
            graph.edge(1, 2).setDistance(75).set(access, true, false).set(speed, 30d, 0d);
            graph.edge(1, 3).setDistance(110).set(access, true, false).set(speed, 30d, 0d);
            var maxSpeed = manager.getDecimalEncodedValue("max_speed");
            var limited = graph.edge(2, 3).setDistance(100).set(maxSpeed, 50d, 80d);
            assertEquals(50d, FranceServer.speedLimit(limited, manager));
            assertEquals(80d, FranceServer.speedLimit(limited.detach(true), manager));
            limited.set(maxSpeed, Double.POSITIVE_INFINITY, Double.POSITIVE_INFINITY);
            assertNull(FranceServer.speedLimit(limited, manager));
            var time = new SpeedWeighting(speed);
            var path = new DijkstraBidirectionRef(graph, time, TraversalMode.NODE_BASED).calcPath(0, 2);
            var french = new TranslationMap().doImport().getWithFallBack(Locale.FRENCH);
            var instructions = FranceServer.navigation(path, graph, time, manager, french);
            assertEquals(0d, instructions.getFirst().get("at"));
            assertEquals(path.getDistance(), instructions.getLast().get("at"));
            assertEquals(4, instructions.getLast().get("sign"));
            assertTrue(instructions.stream().anyMatch(i -> i.get("text").toString().toLowerCase(Locale.FRENCH).contains("droite")));
            var same = new DijkstraBidirectionRef(graph, time, TraversalMode.NODE_BASED).calcPath(0, 0);
            var sameInstructions = FranceServer.navigation(same, graph, time, manager, french);
            assertEquals(1, sameInstructions.size()); assertEquals(4, sameInstructions.getFirst().get("sign"));
        }
    }
}
