package fr.eclaire.app;

import static org.junit.Assert.*;
import android.graphics.PixelFormat;
import android.media.ImageReader;
import androidx.car.app.SurfaceContainer;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class CarMapInstrumentedTest {
    @Test public void mapRotatesWithTheVehicleHeading() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        try (var reader = ImageReader.newInstance(800, 480, PixelFormat.RGBA_8888, 3)) {
            var map = new AtomicReference<CarMap>();
            var route = new GuidanceTracker(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.002, 2, 222, 40)), List.of(new GuidanceTracker.Step(0, "Continuez")));
            instrumentation.runOnMainSync(() -> {
                map.set(new CarMap(instrumentation.getTargetContext()));
                var fix = new GuidanceTracker.Fix(48.001, 2, 5, System.currentTimeMillis(), 10d, 90d);
                var progress = new GuidanceTracker.State("on-route", 111, 20, 0, 0, 111);
                map.get().update(new CarGuidance.Snapshot(route, fix, progress, "on-route", "Continuez", false));
                map.get().onSurfaceAvailable(new SurfaceContainer(reader.getSurface(), 800, 480, 160));
            });
            android.media.Image image = null; long deadline = System.currentTimeMillis() + 5000;
            while (image == null && System.currentTimeMillis() < deadline) { image = reader.acquireLatestImage(); if (image == null) Thread.sleep(50); }
            assertNotNull(image);
            try {
                var plane = image.getPlanes()[0]; var pixels = plane.getBuffer();
                int offset = 240 * plane.getRowStride() + 350 * plane.getPixelStride();
                assertEquals(0, pixels.get(offset) & 255); assertEquals(113, pixels.get(offset + 1) & 255); assertEquals(200, pixels.get(offset + 2) & 255);
            } finally { image.close(); instrumentation.runOnMainSync(() -> map.get().close()); }
        }
    }

    @Test public void surfaceShowsRouteWhenApproachingWithoutDirections() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        try (var reader = ImageReader.newInstance(800, 480, PixelFormat.RGBA_8888, 3)) {
            var map = new AtomicReference<CarMap>();
            var route = new GuidanceTracker(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.002, 2, 222, 40)), List.of(new GuidanceTracker.Step(0, "Continuez")));
            instrumentation.runOnMainSync(() -> {
                map.set(new CarMap(instrumentation.getTargetContext()));
                var fix = new GuidanceTracker.Fix(48.001, 2.0015, 5, System.currentTimeMillis(), 0d, 0d);
                map.get().update(new CarGuidance.Snapshot(route, fix, null, "approach", "Rejoignez la route", false));
                map.get().onSurfaceAvailable(new SurfaceContainer(reader.getSurface(), 800, 480, 160));
            });
            android.media.Image image = null; long deadline = System.currentTimeMillis() + 5000;
            while (image == null && System.currentTimeMillis() < deadline) { image = reader.acquireLatestImage(); if (image == null) Thread.sleep(50); }
            assertNotNull(image);
            try {
                var plane = image.getPlanes()[0]; var pixels = plane.getBuffer();
                int offset = 240 * plane.getRowStride() + 330 * plane.getPixelStride();
                assertEquals(0, pixels.get(offset) & 255); assertEquals(113, pixels.get(offset + 1) & 255); assertEquals(200, pixels.get(offset + 2) & 255);
            } finally { image.close(); instrumentation.runOnMainSync(() -> map.get().close()); }
        }
    }

    @Test public void surfaceDrawsCurrentPositionAndRoute() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        try (var reader = ImageReader.newInstance(800, 480, PixelFormat.RGBA_8888, 3)) {
            var map = new AtomicReference<CarMap>();
            var route = new GuidanceTracker(java.util.Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.002, 2, 222, 40)),
                    java.util.Arrays.asList(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(222, "Arrivée")));
            instrumentation.runOnMainSync(() -> {
                map.set(new CarMap(instrumentation.getTargetContext()));
                map.get().update(new CarGuidance.Snapshot(route, new GuidanceTracker.Fix(48.001, 2, 5, System.currentTimeMillis(), 0.0, 0.0),
                        new GuidanceTracker.State("on-route", 111, 20, 0, 1, 111), "on-route", "Continuez", false));
                map.get().onSurfaceAvailable(new SurfaceContainer(reader.getSurface(), 800, 480, 160));
            });
            android.media.Image image = null;
            long deadline = System.currentTimeMillis() + 5000;
            while (image == null && System.currentTimeMillis() < deadline) { image = reader.acquireLatestImage(); if (image == null) Thread.sleep(50); }
            assertNotNull(image);
            try {
                var plane = image.getPlanes()[0];
                int offset = 240 * plane.getRowStride() + 400 * plane.getPixelStride();
                var pixels = plane.getBuffer();
                assertEquals(0, pixels.get(offset) & 255);
                assertEquals(90, pixels.get(offset + 1) & 255);
                assertEquals(190, pixels.get(offset + 2) & 255);
                int routeOffset = 190 * plane.getRowStride() + 400 * plane.getPixelStride();
                assertEquals(0, pixels.get(routeOffset) & 255);
                assertEquals(113, pixels.get(routeOffset + 1) & 255);
                assertEquals(200, pixels.get(routeOffset + 2) & 255);
            } finally {
                image.close();
                instrumentation.runOnMainSync(() -> map.get().close());
            }
        }
    }
}
