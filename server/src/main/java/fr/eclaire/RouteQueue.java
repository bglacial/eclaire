package fr.eclaire;

import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

final class RouteQueue {
    // Keep one calculation in memory on the 2 GB Pi; waiting clients hold no search graph.
    private final Semaphore requests = new Semaphore(5);
    private final Semaphore calculation = new Semaphore(1, true);

    boolean acquire(long timeoutMillis) throws InterruptedException {
        if (!requests.tryAcquire()) return false;
        boolean acquired = false;
        try {
            acquired = calculation.tryAcquire(timeoutMillis, TimeUnit.MILLISECONDS);
            return acquired;
        } finally {
            if (!acquired) requests.release();
        }
    }

    void release() {
        calculation.release();
        requests.release();
    }

    void stop() {
        // Hold the graph until process exit so no handler can read it after close.
        calculation.acquireUninterruptibly();
    }
}
