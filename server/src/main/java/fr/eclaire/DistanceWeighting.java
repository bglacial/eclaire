package fr.eclaire;

import com.graphhopper.routing.weighting.Weighting;
import com.graphhopper.util.EdgeIteratorState;

/** Exact distance objective; restrictions remain infinite and duration uses the same free-flow speeds. */
final class DistanceWeighting implements Weighting {
    private final Weighting time;
    DistanceWeighting(Weighting time) { this.time = time; }
    public double calcMinWeightPerDistance() { return 1; }
    public double calcEdgeWeight(EdgeIteratorState edge, boolean reverse) {
        return Double.isInfinite(time.calcEdgeWeight(edge, reverse)) ? Double.POSITIVE_INFINITY : edge.getDistance();
    }
    public long calcEdgeMillis(EdgeIteratorState edge, boolean reverse) { return time.calcEdgeMillis(edge, reverse); }
    public double calcTurnWeight(int in, int via, int out) { return Double.isInfinite(time.calcTurnWeight(in, via, out)) ? Double.POSITIVE_INFINITY : 0; }
    public long calcTurnMillis(int in, int via, int out) { return time.calcTurnMillis(in, via, out); }
    public boolean hasTurnCosts() { return time.hasTurnCosts(); }
    public String getName() { return "eclaire_distance"; }
}
