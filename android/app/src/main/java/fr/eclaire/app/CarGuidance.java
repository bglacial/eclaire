package fr.eclaire.app;

import java.util.LinkedHashSet;
import java.util.Set;

/** In-memory snapshot of the one guidance session shared by phone and car. */
final class CarGuidance {
    record Snapshot(GuidanceTracker route, GuidanceTracker.Fix fix, GuidanceTracker.State progress, String status, String message) {}
    private static final Set<Runnable> listeners = new LinkedHashSet<>();
    private static volatile Snapshot current;

    static Snapshot current() { return current; }
    static void observe(Runnable listener) { listeners.add(listener); listener.run(); }
    static void remove(Runnable listener) { listeners.remove(listener); }
    static void update(Snapshot snapshot) {
        current = snapshot;
        for (Runnable listener : new java.util.ArrayList<>(listeners)) {
            try { listener.run(); }
            catch (RuntimeException error) { android.util.Log.e("EclaireCar", "Échec de mise à jour de l’écran voiture", error); }
        }
    }
}
