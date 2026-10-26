package fr.eclaire;

import com.carrotsearch.hppc.IntArrayList;
import com.carrotsearch.hppc.ByteArrayList;
import com.graphhopper.routing.AStarBidirection;
import com.graphhopper.routing.weighting.WeightApproximator;
import com.graphhopper.routing.SPTEntry;
import com.graphhopper.routing.util.TraversalMode;
import com.graphhopper.routing.weighting.Weighting;
import com.graphhopper.storage.Graph;
import com.graphhopper.util.EdgeIterator;
import java.util.concurrent.CancellationException;

/** Instruments settled entries without replacing GraphHopper's edge-based reverse search or stopping proof. */
public final class TracedSearch extends AStarBidirection {
    final IntArrayList keys = new IntArrayList();
    final ByteArrayList sides = new ByteArrayList();

    public TracedSearch(Graph graph, Weighting weighting) { this(graph, weighting, null); }
    public TracedSearch(Graph graph, Weighting weighting, WeightApproximator approximation) {
        super(graph, weighting, TraversalMode.EDGE_BASED);
        // Une heuristique nulle conserve Dijkstra et sa condition d'arrêt.
        setApproximation(approximation == null ? new WeightApproximator() {
            public double approximate(int node) { return 0; }
            public void setTo(int node) {}
            public WeightApproximator reverse() { return this; }
            public double getSlack() { return 0; }
        } : approximation);
    }

    private void record(SPTEntry entry, boolean reverse) {
        if (Thread.currentThread().isInterrupted()) throw new CancellationException("Exploration interrompue.");
        if (!EdgeIterator.Edge.isValid(entry.edge)) return;
        var edge = graph.getEdgeIteratorState(entry.edge, entry.adjNode).detach(reverse);
        keys.add(edge.getEdgeKey()); sides.add((byte) (reverse ? 1 : 0));
    }

    @Override protected boolean fromEntryCanBeSkipped() { record(currFrom, false); return false; }
    @Override protected boolean toEntryCanBeSkipped() { record(currTo, true); return false; }

    boolean exhaustedBudget() { return isMaxVisitedNodesExceeded() || isTimeoutExceeded(); }
    int meetingNode() { return bestFwdEntry == null ? -1 : bestFwdEntry.adjNode; }
}
