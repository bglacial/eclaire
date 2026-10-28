package fr.eclaire;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.graphhopper.routing.ev.*;
import com.graphhopper.routing.util.EncodingManager;
import com.graphhopper.routing.util.DefaultSnapFilter;
import com.graphhopper.routing.weighting.SpeedWeighting;
import com.graphhopper.storage.BaseGraph;
import com.graphhopper.util.EdgeIteratorState;
import com.graphhopper.reader.ReaderWay;
import com.graphhopper.routing.util.parsers.OSMRoadClassParser;
import com.graphhopper.routing.util.parsers.OSMTollParser;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class RoadPreferencesTest {
    private final DecimalEncodedValue speed = new DecimalEncodedValueImpl("car_average_speed", 8, 1, true);
    private final EnumEncodedValue<RoadClass> roadClass = RoadClass.create();
    private final EnumEncodedValue<Toll> toll = Toll.create();
    private final BooleanEncodedValue subnetwork = new SimpleBooleanEncodedValue("car_subnetwork");

    @Test void osmImportIncludesRampsAndHandlesMissingTollTags() {
        var encoding = new EncodingManager.Builder().add(roadClass).add(toll).build();
        var flags = ArrayEdgeIntAccess.createFromBytes(encoding.getBytesForFlags());
        var way = new ReaderWay(1);
        way.setTag("highway", "motorway_link"); way.setTag("toll", "yes");
        new OSMRoadClassParser(roadClass).handleWayTags(0, flags, way, null);
        new OSMTollParser(toll).handleWayTags(0, flags, way, null);
        assertEquals(RoadClass.MOTORWAY, roadClass.getEnum(false, 0, flags));
        assertEquals(Toll.ALL, toll.getEnum(false, 0, flags));
        way = new ReaderWay(2); way.setTag("highway", "residential");
        new OSMTollParser(toll).handleWayTags(1, flags, way, null);
        assertEquals(Toll.NO, toll.getEnum(false, 1, flags));
    }

    @Test void exclusionsReachBothObjectivesDirectionsAndSnapping() {
        var encoding = new EncodingManager.Builder().add(speed).add(roadClass).add(toll).add(subnetwork).build();
        try (var graph = new BaseGraph.Builder(encoding).create()) {
            for (int i = 0; i < 5; i++) graph.getNodeAccess().setNode(i, 48 + i * .001, 2);
            var motorway = edge(graph, 0, 1, 100, RoadClass.MOTORWAY, Toll.NO);
            var paid = edge(graph, 1, 3, 100, RoadClass.PRIMARY, Toll.ALL);
            var a = edge(graph, 0, 2, 200, RoadClass.RESIDENTIAL, Toll.MISSING);
            edge(graph, 2, 3, 200, RoadClass.RESIDENTIAL, Toll.HGV);
            var base = new SpeedWeighting(speed);
            for (var preferences : new RoadPreferences[] { new RoadPreferences(true, false), new RoadPreferences(false, true), new RoadPreferences(true, true) }) {
                var time = preferences.apply(base, encoding);
                var filter = new DefaultSnapFilter(time, subnetwork);
                assertEquals(!preferences.avoidMotorways(), filter.accept(motorway));
                assertEquals(!preferences.avoidTolls(), filter.accept(paid));
                assertTrue(filter.accept(a));
                for (boolean reverse : new boolean[] { false, true }) {
                    assertEquals(preferences.avoidMotorways(), Double.isInfinite(time.calcEdgeWeight(motorway, reverse)));
                    assertEquals(preferences.avoidTolls(), Double.isInfinite(time.calcEdgeWeight(paid, reverse)));
                }
                assertEquals(400, new TracedSearch(graph, time).calcPath(0, 3).getDistance());
                assertEquals(400, new TracedSearch(graph, new DistanceWeighting(time)).calcPath(3, 0).getDistance());
                assertFalse(new TracedSearch(graph, time).calcPath(0, 4).isFound());
                assertEquals(base.calcEdgeMillis(a, false), time.calcEdgeMillis(a, false));
            }
            assertSame(base, new RoadPreferences(false, false).apply(base, encoding));
        }
    }

    private EdgeIteratorState edge(BaseGraph graph, int a, int b, double distance, RoadClass kind, Toll fee) {
        return graph.edge(a, b).setDistance(distance).set(speed, 50, 50).set(roadClass, kind).set(toll, fee);
    }

    @Test void protocolAndOldGraphsFailExplicitly() throws Exception {
        var json = new ObjectMapper();
        assertEquals(new RoadPreferences(false, false), RoadPreferences.parse(json.readTree("{}")));
        assertEquals(new RoadPreferences(true, true), RoadPreferences.parse(json.readTree("{\"avoidMotorways\":true,\"avoidTolls\":true}")));
        for (String invalid : new String[] { "null", "1", "\"true\"", "{}" })
            assertThrows(IllegalArgumentException.class, () -> RoadPreferences.parse(json.readTree("{\"avoidTolls\":" + invalid + "}")));
        var old = new EncodingManager.Builder().add(speed).build();
        assertFalse(RoadPreferences.supported(old));
        assertThrows(IllegalArgumentException.class, () -> new RoadPreferences(true, false).apply(new SpeedWeighting(speed), old));
        assertNotNull(new RoadPreferences(false, false).apply(new SpeedWeighting(speed), old));
    }
}
