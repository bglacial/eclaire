package fr.eclaire;

import org.junit.jupiter.api.Test;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;

class RouteQueueTest {
    private static void waiting(Thread thread) throws InterruptedException {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2);
        while (thread.getState() != Thread.State.TIMED_WAITING && thread.isAlive() && System.nanoTime() < deadline) Thread.sleep(1);
        assertEquals(Thread.State.TIMED_WAITING, thread.getState());
    }

    @Test void clientsWaitInOrderWithoutRunningTwoCalculations() throws Exception {
        assertQueueCapacityAndOrder(new RouteQueue());
    }

    private void assertQueueCapacityAndOrder(RouteQueue queue) throws Exception {
        assertTrue(queue.acquire(0));
        var completed = new CountDownLatch(4);
        var order = new AtomicInteger();
        var failed = new AtomicInteger();
        var clients = new Thread[4];
        try {
            for (int i = 0; i < clients.length; i++) {
                int expected = i;
                clients[i] = Thread.ofPlatform().start(() -> {
                    boolean acquired = false;
                    try {
                        acquired = queue.acquire(5000);
                        if (!acquired || order.getAndIncrement() != expected) failed.incrementAndGet();
                    } catch (InterruptedException error) { failed.incrementAndGet(); }
                    finally { if (acquired) queue.release(); completed.countDown(); }
                });
                waiting(clients[i]);
            }
            assertEquals(0, order.get());
            assertTimeoutPreemptively(Duration.ofMillis(500), () -> assertFalse(queue.acquire(5000)));
        } finally { queue.release(); }
        assertTrue(completed.await(5, TimeUnit.SECONDS));
        assertEquals(4, order.get());
        assertEquals(0, failed.get());
        assertTrue(queue.acquire(0));
        queue.release();
    }

    @Test void timeoutAndCancellationDoNotLeakCapacity() throws Exception {
        var queue = new RouteQueue();
        assertTrue(queue.acquire(0));
        var interrupted = new CountDownLatch(1);
        try {
            for (int i = 0; i < 10; i++) assertFalse(queue.acquire(0));
            var client = Thread.ofPlatform().start(() -> {
                try {
                    if (queue.acquire(5000)) queue.release();
                } catch (InterruptedException expected) { interrupted.countDown(); }
            });
            waiting(client);
            client.interrupt();
            client.join(2000);
            assertFalse(client.isAlive());
            assertEquals(0, interrupted.getCount());
        } finally { queue.release(); }
        assertQueueCapacityAndOrder(queue);
    }
}
