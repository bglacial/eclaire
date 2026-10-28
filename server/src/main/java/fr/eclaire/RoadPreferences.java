package fr.eclaire;

import com.fasterxml.jackson.databind.JsonNode;
import com.graphhopper.routing.ev.*;
import com.graphhopper.routing.weighting.AbstractAdjustedWeighting;
import com.graphhopper.routing.weighting.Weighting;
import com.graphhopper.util.EdgeIteratorState;

record RoadPreferences(boolean avoidMotorways, boolean avoidTolls) {
    static RoadPreferences parse(JsonNode request) {
        return new RoadPreferences(flag(request, "avoidMotorways"), flag(request, "avoidTolls"));
    }

    private static boolean flag(JsonNode request, String key) {
        var value = request.get(key);
        if (value == null) return false;
        if (!value.isBoolean()) throw new IllegalArgumentException("Préférence routière invalide : " + key);
        return value.booleanValue();
    }

    static boolean supported(EncodedValueLookup encoding) {
        return encoding.hasEncodedValue(RoadClass.KEY) && encoding.hasEncodedValue(Toll.KEY);
    }

    Weighting apply(Weighting time, EncodedValueLookup encoding) {
        if (!avoidMotorways && !avoidTolls) return time;
        if (!supported(encoding)) throw new IllegalArgumentException("L’évitement nécessite une mise à jour du graphe France. Désactivez les options ou réessayez après sa mise à jour.");
        var roadClass = encoding.getEnumEncodedValue(RoadClass.KEY, RoadClass.class);
        var toll = encoding.getEnumEncodedValue(Toll.KEY, Toll.class);
        return new AbstractAdjustedWeighting(time) {
            @Override public double calcEdgeWeight(EdgeIteratorState edge, boolean reverse) {
                // Les bretelles motorway_link portent aussi RoadClass.MOTORWAY ; HGV ne concerne pas les voitures.
                if ((avoidMotorways && edge.get(roadClass) == RoadClass.MOTORWAY) || (avoidTolls && edge.get(toll) == Toll.ALL)) return Double.POSITIVE_INFINITY;
                return super.calcEdgeWeight(edge, reverse);
            }
            @Override public String getName() { return "eclaire_avoidance"; }
        };
    }
}
