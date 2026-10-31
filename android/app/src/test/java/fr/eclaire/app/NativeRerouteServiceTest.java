package fr.eclaire.app;

import static org.junit.Assert.*;
import android.Manifest;
import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.Looper;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class NativeRerouteServiceTest {
    private static Location fix(double lat, double lon, long time) {
        var location = new Location("gps"); location.setLatitude(lat); location.setLongitude(lon); location.setAccuracy(5); location.setTime(time); location.setSpeed(10); return location;
    }

    @Test public void restartingGuidanceResetsThePreviousInstruction() {
        var app = RuntimeEnvironment.getApplication();
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        Shadows.shadowOf((LocationManager) app.getSystemService(Context.LOCATION_SERVICE)).setProviderEnabled(LocationManager.GPS_PROVIDER, true);
        var route = new GuidanceTracker(Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1112, 120)), Arrays.asList(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(1112, "Arrivée", 4)));
        var controller = Robolectric.buildService(NavigationService.class).create(); var service = controller.get();
        try {
            service.start(route, false, event -> {});
            service.onLocationChanged(fix(48.001, 2, System.currentTimeMillis() - 1000));
            assertTrue(CarGuidance.current().message().contains("Dans"));
            service.start(route, false, event -> {});
            assertEquals("Recherche de votre position…", CarGuidance.current().message());
        } finally { controller.destroy(); }
    }

    @Test public void waypointIsMarkedReachedOnlyNearTheActualPoint() throws Exception {
        var app = RuntimeEnvironment.getApplication();
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        Shadows.shadowOf((LocationManager) app.getSystemService(Context.LOCATION_SERVICE)).setProviderEnabled(LocationManager.GPS_PROVIDER, true);
        var route = new GuidanceTracker(Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.001, 2, 111, 10), new GuidanceTracker.Point(48.002, 2, 222, 20)),
                Arrays.asList(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(111, "Étape"), new GuidanceTracker.Step(222, "Arrivée", 4)));
        var controller = Robolectric.buildService(NavigationService.class).create(); var service = controller.get();
        try {
            var config = new NativeRouting.Config("https://example.org/api", 48.002, 2, "time", false, false, 48.001, 2d, 111d);
            service.start(route, false, event -> {}, new JSONObject(), config);
            long now = System.currentTimeMillis();
            service.onLocationChanged(fix(48.0005, 2, now - 3000));
            assertFalse(service.state().optBoolean("waypointReached"));
            service.onLocationChanged(fix(48.001, 2, now - 1000));
            assertTrue(service.state().optBoolean("waypointReached"));
        } finally { controller.destroy(); }
    }

    @Test public void afterTheWaypointARecalculationGoesDirectlyToTheDestination() throws Exception {
        var app = RuntimeEnvironment.getApplication();
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        Shadows.shadowOf((LocationManager) app.getSystemService(Context.LOCATION_SERVICE)).setProviderEnabled(LocationManager.GPS_PROVIDER, true);
        var route = new GuidanceTracker(Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.001, 2, 111, 10), new GuidanceTracker.Point(48.002, 2, 222, 20)), Arrays.asList(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(111, "Étape"), new GuidanceTracker.Step(222, "Arrivée", 4)));
        try (var server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            var received = new AtomicReference<JSONObject>(); var done = new CountDownLatch(1);
            var worker = new Thread(() -> {
                try (var socket = server.accept()) {
                    var input = socket.getInputStream(); var headers = new java.io.ByteArrayOutputStream(); int previous = 0, current;
                    while ((current = input.read()) != -1) { headers.write(current); if ((previous & 0xffffff) == 0x0d0a0d && current == 0x0a) break; previous = (previous << 8) | current; }
                    int length = 0; for (String line : headers.toString("UTF-8").split("\r\n")) if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(line.substring(line.indexOf(':') + 1).trim());
                    received.set(new JSONObject(new String(input.readNBytes(length), StandardCharsets.UTF_8)));
                    socket.getOutputStream().write("HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                } catch (Exception ignored) { } finally { done.countDown(); }
            });
            worker.start(); var controller = Robolectric.buildService(NavigationService.class).create(); var service = controller.get();
            try {
                var config = new NativeRouting.Config("http://127.0.0.1:" + server.getLocalPort() + "/api", 48.002, 2, "time", false, false, 48.001, 2d, 111d);
                service.start(route, false, event -> {}, new JSONObject(), config);
                long now = System.currentTimeMillis();
                service.onLocationChanged(fix(48.001, 2, now - 3000));
                assertTrue(service.state().getBoolean("waypointReached"));
                service.onLocationChanged(fix(48.001, 2.004, now - 2000)); service.onLocationChanged(fix(48.001, 2.004, now - 1000));
                assertTrue(done.await(5, TimeUnit.SECONDS)); assertNotNull(received.get());
                assertEquals(48.002, received.get().getJSONObject("end").getDouble("lat"), .000001);
            } finally { controller.destroy(); }
        }
    }

    @Test public void serviceRecalculatesInBackgroundAndSharesTheUpdatedRoute() throws Exception {
        var app = RuntimeEnvironment.getApplication();
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        var locations = (LocationManager) app.getSystemService(Context.LOCATION_SERVICE);
        Shadows.shadowOf(locations).setProviderEnabled(LocationManager.GPS_PROVIDER, true);
        var route = new GuidanceTracker(Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1112, 120)),
                Arrays.asList(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(1112, "Arrivée", 4)));
        var received = new AtomicReference<JSONObject>(); var failure = new AtomicReference<Exception>();
        var done = new CountDownLatch(1);
        String routeJson = "{\"found\":true,\"route\":{\"length\":1000,\"seconds\":100,\"points\":[{\"lat\":48.002,\"lon\":2.004,\"at\":0,\"seconds\":0},{\"lat\":48.01,\"lon\":2,\"at\":1000,\"seconds\":100}],\"instructions\":[{\"at\":0,\"sign\":0,\"text\":\"Continuez\",\"name\":\"Route\"},{\"at\":1000,\"sign\":4,\"text\":\"Arrivée\",\"name\":\"\"}]}}";
        try (var server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            var worker = new Thread(() -> {
                try (var socket = server.accept()) {
                    var input = socket.getInputStream(); var headers = new java.io.ByteArrayOutputStream(); int previous = 0, current;
                    while ((current = input.read()) != -1) { headers.write(current); if ((previous & 0xffffff) == 0x0d0a0d && current == 0x0a) break; previous = (previous << 8) | current; }
                    int length = 0; for (String line : headers.toString("UTF-8").split("\r\n")) if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(line.substring(line.indexOf(':') + 1).trim());
                    received.set(new JSONObject(new String(input.readNBytes(length), StandardCharsets.UTF_8)));
                    byte[] body = routeJson.getBytes(StandardCharsets.UTF_8); var output = socket.getOutputStream();
                    output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                    output.write(body); output.flush();
                } catch (Exception error) { failure.set(error); } finally { done.countDown(); }
            });
            worker.start();
            var controller = Robolectric.buildService(NavigationService.class).create();
            var service = controller.get();
            try {
                var config = new NativeRouting.Config("http://127.0.0.1:" + server.getLocalPort() + "/api", 48.01, 2, "distance", true, false);
                service.start(route, false, event -> {}, new JSONObject(), config);
                long now = System.currentTimeMillis();
                service.onLocationChanged(fix(48.001, 2, now - 3000));
                service.onLocationChanged(fix(48.002, 2.004, now - 2000));
                service.onLocationChanged(fix(48.002, 2.004, now - 1000));
                assertEquals("rerouting", service.state().getString("status"));
                assertTrue(done.await(5, TimeUnit.SECONDS)); assertNull(failure.get());
                long deadline = System.currentTimeMillis() + 5000;
                while (service.state().optInt("routeVersion") < 2 && System.currentTimeMillis() < deadline) { Thread.sleep(10); Shadows.shadowOf(Looper.getMainLooper()).idle(); }
                assertEquals(2, service.state().getInt("routeVersion"));
                assertEquals("on-route", service.state().getString("status"));
                assertNotNull(service.state().getJSONObject("route"));
                assertEquals(48.002, CarGuidance.current().route().points.get(0).lat(), .000001);
                assertTrue(received.get().getBoolean("avoidMotorways")); assertEquals("distance", received.get().getString("criterion"));
            } finally { controller.destroy(); }
        }
    }

    @Test public void recalculationAcceptsAnApproachWithoutAnnouncingATurn() throws Exception {
        var app = RuntimeEnvironment.getApplication();
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        Shadows.shadowOf((LocationManager) app.getSystemService(Context.LOCATION_SERVICE)).setProviderEnabled(LocationManager.GPS_PROVIDER, true);
        var original = new GuidanceTracker(Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1112, 120)), Arrays.asList(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(1112, "Arrivée", 4)));
        String response = "{\"found\":true,\"route\":{\"length\":800,\"seconds\":100,\"points\":[{\"lat\":48.005,\"lon\":2.004,\"at\":0,\"seconds\":0},{\"lat\":48.01,\"lon\":2,\"at\":800,\"seconds\":100}],\"instructions\":[{\"at\":0,\"sign\":0,\"text\":\"Continuez\",\"name\":\"Route\"},{\"at\":800,\"sign\":4,\"text\":\"Arrivée\",\"name\":\"\"}]}}";
        try (var server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            var done = new CountDownLatch(1);
            var worker = new Thread(() -> {
                try (var socket = server.accept()) {
                    byte[] body = response.getBytes(StandardCharsets.UTF_8); var output = socket.getOutputStream();
                    output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII)); output.write(body); output.flush();
                } catch (Exception ignored) { } finally { done.countDown(); }
            });
            worker.start(); var controller = Robolectric.buildService(NavigationService.class).create(); var service = controller.get();
            try {
                var config = new NativeRouting.Config("http://127.0.0.1:" + server.getLocalPort() + "/api", 48.01, 2, "time", false, false);
                service.start(original, false, event -> {}, new JSONObject(), config); long now = System.currentTimeMillis();
                service.onLocationChanged(fix(48.001, 2, now - 3000));
                service.onLocationChanged(fix(48.002, 2.004, now - 2000)); service.onLocationChanged(fix(48.002, 2.004, now - 1000));
                assertTrue(done.await(5, TimeUnit.SECONDS));
                long deadline = System.currentTimeMillis() + 5000;
                while (service.state().optInt("routeVersion") < 2 && System.currentTimeMillis() < deadline) { Thread.sleep(10); Shadows.shadowOf(Looper.getMainLooper()).idle(); }
                assertEquals(2, service.state().getInt("routeVersion"));
                assertEquals("approach", service.state().getString("status")); assertTrue(service.state().getString("message").contains("Rejoignez"));
                assertNull(CarGuidance.current().progress()); assertNotNull(service.state().getJSONObject("route"));
                service.onLocationChanged(fix(48.005, 2.004, System.currentTimeMillis()));
                assertEquals("on-route", service.state().getString("status"));
            } finally { controller.destroy(); }
        }
    }

    @Test public void failedRecalculationIsVisibleAndDoesNotRetryOnEveryGpsFix() throws Exception {
        var app = RuntimeEnvironment.getApplication();
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        Shadows.shadowOf((LocationManager) app.getSystemService(Context.LOCATION_SERVICE)).setProviderEnabled(LocationManager.GPS_PROVIDER, true);
        var route = new GuidanceTracker(Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1112, 120)),
                Arrays.asList(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(1112, "Arrivée", 4)));
        try (var server = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            var done = new CountDownLatch(1);
            var worker = new Thread(() -> {
                try (var socket = server.accept()) {
                    byte[] body = "{\"error\":\"Service indisponible\"}".getBytes(StandardCharsets.UTF_8);
                    var output = socket.getOutputStream();
                    output.write(("HTTP/1.1 503 Unavailable\r\nContent-Type: application/json\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                    output.write(body); output.flush();
                } catch (Exception ignored) { } finally { done.countDown(); }
            });
            worker.start();
            var controller = Robolectric.buildService(NavigationService.class).create(); var service = controller.get();
            try {
                var config = new NativeRouting.Config("http://127.0.0.1:" + server.getLocalPort() + "/api", 48.01, 2, "time", false, false);
                service.start(route, false, event -> {}, new JSONObject(), config);
                long now = System.currentTimeMillis();
                service.onLocationChanged(fix(48.001, 2, now - 3000));
                service.onLocationChanged(fix(48.002, 2.004, now - 2000));
                service.onLocationChanged(fix(48.002, 2.004, now - 1000));
                assertTrue(done.await(5, TimeUnit.SECONDS));
                long deadline = System.currentTimeMillis() + 5000;
                while (!"reroute-failed".equals(service.state().optString("status")) && System.currentTimeMillis() < deadline) { Thread.sleep(10); Shadows.shadowOf(Looper.getMainLooper()).idle(); }
                assertEquals("reroute-failed", service.state().getString("status"));
                assertTrue(service.state().getString("message").contains("connexion"));
                service.onLocationChanged(fix(48.002, 2.004, now));
                assertEquals(1, service.state().getInt("routeVersion"));
                assertTrue(service.state().getString("message").contains("Nouvelle tentative"));
            } finally { controller.destroy(); }
        }
    }


    @Test public void returningToTheOriginalRouteCancelsAnObsoleteCalculation() throws Exception {
        var app = RuntimeEnvironment.getApplication();
        Shadows.shadowOf(app).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
        Shadows.shadowOf((LocationManager) app.getSystemService(Context.LOCATION_SERVICE)).setProviderEnabled(LocationManager.GPS_PROVIDER, true);
        var route = new GuidanceTracker(Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1112, 120)),
                Arrays.asList(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(1112, "Arrivée", 4)));
        try (var server = new ServerSocket(0, 2, InetAddress.getByName("127.0.0.1"))) {
            var started = new CountDownLatch(1); var release = new CountDownLatch(1); var cancelled = new CountDownLatch(1);
            var worker = new Thread(() -> {
                try (var socket = server.accept()) {
                    started.countDown(); release.await(5, TimeUnit.SECONDS);
                    byte[] body = "{\"found\":false}".getBytes(StandardCharsets.UTF_8); var output = socket.getOutputStream();
                    output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII)); output.write(body); output.flush();
                } catch (Exception ignored) { }
            });
            var canceller = new Thread(() -> {
                try (var socket = server.accept()) {
                    var input = new java.io.BufferedReader(new java.io.InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
                    String first = input.readLine(); if (first != null && first.startsWith("DELETE ")) cancelled.countDown();
                    socket.getOutputStream().write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                } catch (Exception ignored) { }
            });
            worker.start();
            var controller = Robolectric.buildService(NavigationService.class).create(); var service = controller.get();
            try {
                var config = new NativeRouting.Config("http://127.0.0.1:" + server.getLocalPort() + "/api", 48.01, 2, "time", false, false);
                service.start(route, false, event -> {}, new JSONObject(), config);
                long now = System.currentTimeMillis();
                service.onLocationChanged(fix(48.001, 2, now - 4000));
                service.onLocationChanged(fix(48.002, 2.004, now - 3000));
                service.onLocationChanged(fix(48.002, 2.004, now - 2000));
                assertTrue(started.await(5, TimeUnit.SECONDS));
                canceller.start();
                service.onLocationChanged(fix(48.002, 2, now - 1000));
                assertTrue(cancelled.await(5, TimeUnit.SECONDS));
                release.countDown(); worker.join(5000); canceller.join(5000);
                Thread.sleep(100); Shadows.shadowOf(Looper.getMainLooper()).idle();
                assertEquals("on-route", service.state().getString("status"));
                assertEquals(1, service.state().getInt("routeVersion"));
                assertSame(route, CarGuidance.current().route());
            } finally { release.countDown(); controller.destroy(); }
        }
    }

}
