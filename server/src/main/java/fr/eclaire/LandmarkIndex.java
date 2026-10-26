package fr.eclaire;

import com.graphhopper.routing.ev.EncodedValueLookup;
import com.graphhopper.routing.lm.*;
import com.graphhopper.routing.weighting.AbstractAdjustedWeighting;
import com.graphhopper.routing.weighting.Weighting;
import com.graphhopper.storage.*;

/** Les bornes préparent un graphe moins contraint ; la recherche garde tous les virages interdits. */
final class LandmarkIndex {
    static Weighting withoutTurns(Weighting weighting) {
        return new AbstractAdjustedWeighting(weighting) {
            public double calcTurnWeight(int in, int via, int out) { return 0; }
            public long calcTurnMillis(int in, int via, int out) { return 0; }
            public boolean hasTurnCosts() { return false; }
            public String getName() { return weighting.getName(); }
        };
    }
    static LandmarkStorage open(BaseGraph graph, EncodedValueLookup encoding, Weighting weighting, String directory, boolean prepare) {
        if (prepare) try { java.nio.file.Files.createDirectories(java.nio.file.Path.of(directory)); }
        catch (java.io.IOException error) { throw new java.io.UncheckedIOException(error); }
        var preparation = new PrepareLandmarks(new MMapDirectory(directory), graph, encoding, new LMConfig("car", withoutTurns(weighting)), 8);
        preparation.setMinimumNodes(Math.min(5000, Math.max(2, graph.getNodes() / 2)));
        if (!preparation.loadExisting()) {
            if (!prepare) throw new IllegalStateException("Index landmarks absent. Préparez-le sur une machine suffisamment puissante avant le déploiement.");
            preparation.doWork();
        }
        return preparation.getLandmarkStorage();
    }
}
