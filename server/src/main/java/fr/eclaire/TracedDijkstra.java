package fr.eclaire;

import com.carrotsearch.hppc.IntArrayList;
import com.carrotsearch.hppc.ByteArrayList;
import com.graphhopper.routing.DijkstraBidirectionRef;
import com.graphhopper.routing.SPTEntry;
import com.graphhopper.routing.util.TraversalMode;
import com.graphhopper.routing.weighting.Weighting;
import com.graphhopper.storage.Graph;
import com.graphhopper.util.EdgeIterator;
import java.util.concurrent.CancellationException;

/** Instruments settled entries without replacing GraphHopper's edge-based reverse search or stopping proof. */
public final class TracedDijkstra extends DijkstraBidirectionRef {
    final IntArrayList keys = new IntArrayList();
    final ByteArrayList sides = new ByteArrayList();

    public TracedDijkstra(Graph graph, Weighting weighting) {
        super(graph, weighting, TraversalMode.EDGE_BASED);
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
