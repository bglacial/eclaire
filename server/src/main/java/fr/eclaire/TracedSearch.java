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
    private final int maxTraceEvents;
    private final long[] traceCounts = {0, 0};
    int traceStride = 1;

    public TracedSearch(Graph graph, Weighting weighting) { this(graph, weighting, null); }
    public TracedSearch(Graph graph, Weighting weighting, WeightApproximator approximation) {
        this(graph, weighting, approximation, 60000);
    }
    public TracedSearch(Graph graph, Weighting weighting, WeightApproximator approximation, int maxTraceEvents) {
        super(graph, weighting, TraversalMode.EDGE_BASED);
        if (maxTraceEvents < 2) throw new IllegalArgumentException("La trace doit conserver au moins deux événements.");
        this.maxTraceEvents = maxTraceEvents;
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
        int side = reverse ? 1 : 0;
        if (traceCounts[side]++ % traceStride != 0) return;
        int key = graph.getEdgeIteratorState(entry.edge, entry.adjNode).getEdgeKey();
        keys.add(reverse ? key ^ 1 : key); sides.add((byte) side);
        if (keys.size() > maxTraceEvents) {
            // Decimate each front independently, retaining its first event and chronological order.
            int[] counts = {0, 0};
            int retained = 0;
            for (int i = 0; i < keys.size(); i++) if (counts[sides.get(i)]++ % 2 == 0) {
                keys.set(retained, keys.get(i)); sides.set(retained++, sides.get(i));
            }
            keys.resize(retained); sides.resize(retained); traceStride *= 2;
        }
    }

    @Override protected boolean fromEntryCanBeSkipped() { record(currFrom, false); return false; }
    @Override protected boolean toEntryCanBeSkipped() { record(currTo, true); return false; }

    boolean exhaustedBudget() { return isMaxVisitedNodesExceeded() || isTimeoutExceeded(); }
    int meetingNode() { return bestFwdEntry == null ? -1 : bestFwdEntry.adjNode; }
}
