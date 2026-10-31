package fr.eclaire.app;

import static org.junit.Assert.*;
import java.io.IOException;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class NativeRoutingTest {
    private static final String FIRST = "{\"type\":\"batch\",\"edges\":[{\"key\":7,\"geometry\":[[48,2],[48.001,2]],\"length\":111,\"seconds\":10}]}";
    private static final String LAST = "{\"type\":\"result\",\"edges\":[{\"key\":8,\"geometry\":[[48.001,2],[48.001,2.001]],\"length\":75,\"seconds\":20,\"speedLimit\":50}],\"result\":{\"found\":true,\"path\":[7,8],\"length\":186,\"seconds\":33,\"instructions\":[{\"at\":0,\"sign\":0,\"text\":\"Continuez\",\"name\":\"Rue A\"},{\"at\":111,\"sign\":2,\"text\":\"Tournez\",\"name\":\"Rue B\"},{\"at\":186,\"sign\":4,\"text\":\"Arrivée\",\"name\":\"\"}]}}";

    @Test public void oldStreamAndCompactResponseProduceTheSameValidatedRoute() throws Exception {
        var route = NativeRouting.decode(FIRST + "\n" + LAST + "\n", "application/x-ndjson");
        var tracker = GuidanceTracker.fromJson(route);
        assertEquals(3, tracker.points.size());
        assertEquals(111, tracker.points.get(1).at(), .01);
        assertEquals(33, tracker.points.get(2).seconds(), .01);
        assertEquals(2, tracker.steps.get(1).sign());
        assertEquals(50, route.getJSONArray("points").getJSONObject(2).getDouble("speedLimit"), .01);
        var compact = new JSONObject().put("found", true).put("route", route);
        assertEquals(route.toString(), NativeRouting.decode(compact.toString(), "application/json; charset=utf-8").toString());
    }

    @Test public void invalidOrIncompleteRoutesAreRejected() throws Exception {
        assertThrows(IOException.class, () -> NativeRouting.decode(LAST + "\n", "application/x-ndjson"));
        assertThrows(IOException.class, () -> NativeRouting.decode("{\"found\":false}", "application/json"));
        assertThrows(IOException.class, () -> NativeRouting.decode(FIRST + "\n" + LAST.replace("[48.001,2],[48.001,2.001]", "[49,2],[49,2.001]") + "\n", "application/x-ndjson"));
        assertThrows(IOException.class, () -> NativeRouting.decode(FIRST + "\n" + LAST, "application/x-ndjson"));
        var route = NativeRouting.decode(FIRST + "\n" + LAST + "\n", "application/x-ndjson");
        route.getJSONArray("instructions").getJSONObject(2).put("sign", 0);
        assertThrows(IllegalArgumentException.class, () -> NativeRouting.decode(new JSONObject().put("found", true).put("route", route).toString(), "application/json"));
    }

    @Test public void waypointMergesBothLegsWithoutAnIntermediateFinalArrival() throws Exception {
        var first = NativeRouting.decode(FIRST + "\n" + LAST + "\n", "application/x-ndjson");
        var second = new JSONObject(first.toString());
        var points = second.getJSONArray("points");
        for (int i = 0; i < points.length(); i++) {
            var point = points.getJSONObject(i); point.put("lat", point.getDouble("lat") + .001); point.put("lon", point.getDouble("lon") + .001);
        }
        var combined = NativeRouting.combine(first, second);
        assertEquals(372, combined.getDouble("length"), .001); assertEquals(186, combined.getDouble("waypointAt"), .001);
        assertEquals(5, combined.getJSONArray("points").length());
        assertEquals(4, combined.getJSONArray("instructions").getJSONObject(combined.getJSONArray("instructions").length() - 1).getInt("sign"));
        assertEquals(0, combined.getJSONArray("instructions").getJSONObject(2).getInt("sign"));
        points.getJSONObject(0).put("lat", 49);
        assertThrows(IOException.class, () -> NativeRouting.combine(first, second));
    }

    @Test public void waypointRecalculationRequestsBothLegsWithTheSamePreferences() throws Exception {
        var received = new java.util.ArrayList<JSONObject>(); var failure = new java.util.concurrent.atomic.AtomicReference<Exception>();
        try (var server = new java.net.ServerSocket(0, 2, java.net.InetAddress.getByName("127.0.0.1"))) {
            var worker = new Thread(() -> {
                try {
                    for (int i = 0; i < 3; i++) try (var socket = server.accept()) {
                        var input = socket.getInputStream(); var headers = new java.io.ByteArrayOutputStream(); int previous = 0, current;
                        while ((current = input.read()) != -1) { headers.write(current); if ((previous & 0xffffff) == 0x0d0a0d && current == 0x0a) break; previous = (previous << 8) | current; }
                        int size = 0; for (String line : headers.toString("UTF-8").split("\r\n")) if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) size = Integer.parseInt(line.substring(line.indexOf(':') + 1).trim());
                        var request = new JSONObject(new String(input.readNBytes(size), java.nio.charset.StandardCharsets.UTF_8)); received.add(request);
                        var start = request.getJSONObject("start"); var end = request.getJSONObject("end");
                        var route = new JSONObject().put("length", 100).put("seconds", 10)
                                .put("points", new org.json.JSONArray().put(new JSONObject(start.toString()).put("at", 0).put("seconds", 0)).put(new JSONObject(end.toString()).put("at", 100).put("seconds", 10)))
                                .put("instructions", new org.json.JSONArray().put(new JSONObject().put("at", 0).put("sign", 0).put("text", "Départ").put("name", "")) .put(new JSONObject().put("at", 100).put("sign", 4).put("text", "Arrivée").put("name", "")));
                        byte[] body = new JSONObject().put("found", true).put("route", route).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                        var output = socket.getOutputStream(); output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII)); output.write(body); output.flush();
                    }
                } catch (Exception error) { failure.set(error); }
            });
            worker.start();
            var wireConfig = new JSONObject().put("api", "http://127.0.0.1:" + server.getLocalPort() + "/api").put("end", new JSONObject().put("lat", 48.003).put("lon", 2)).put("criterion", "distance").put("avoidMotorways", true).put("avoidTolls", false)
                    .put("vias", new org.json.JSONArray().put(new JSONObject().put("lat", 48.001).put("lon", 2).put("at", 111)).put(new JSONObject().put("lat", 48.002).put("lon", 2).put("at", 222)));
            var config = NativeRouting.Config.fromJson(wireConfig);
            var route = new NativeRouting(config).calculate(new GuidanceTracker.Fix(48, 2, 5, System.currentTimeMillis(), 0d, null)).route();
            worker.join(5000); assertNull(failure.get()); assertFalse(worker.isAlive());
            assertEquals(3, received.size()); assertEquals(48.001, received.get(0).getJSONObject("end").getDouble("lat"), .000001);
            assertEquals(48.001, received.get(1).getJSONObject("start").getDouble("lat"), .000001); assertEquals(48.002, received.get(1).getJSONObject("end").getDouble("lat"), .000001);
            for (var request : received) { assertTrue(request.getBoolean("avoidMotorways")); assertEquals("distance", request.getString("criterion")); }
            assertEquals(100, route.getDouble("waypointAt"), .001);
            assertEquals(200, route.getJSONArray("waypointAts").getDouble(1), .001);
            assertEquals(48.002, received.get(2).getJSONObject("start").getDouble("lat"), .000001);
            assertEquals(48.003, received.get(2).getJSONObject("end").getDouble("lat"), .000001);
            wireConfig.getJSONArray("vias").getJSONObject(1).put("at", 10);
            assertThrows(IllegalArgumentException.class, () -> NativeRouting.Config.fromJson(wireConfig));
        }
    }

    @Test public void routeConfigurationRetainsDestinationAndAvoidancePreferences() throws Exception {
        var data = new JSONObject("{\"api\":\"https://eclaire.nriault.fr/api\",\"end\":{\"lat\":48,\"lon\":2},\"criterion\":\"distance\",\"avoidMotorways\":true,\"avoidTolls\":false}");
        var config = NativeRouting.Config.fromJson(data);
        assertEquals("distance", config.criterion()); assertTrue(config.avoidMotorways()); assertFalse(config.avoidTolls());
        data.put("api", "file:///private/data");
        assertThrows(IllegalArgumentException.class, () -> NativeRouting.Config.fromJson(data));
    }

    @Test public void requestSendsTheOriginalPreferencesAndReceivesACompactRoute() throws Exception {
        var route = NativeRouting.decode(FIRST + "\n" + LAST + "\n", "application/x-ndjson");
        var body = new JSONObject().put("found", true).put("route", route).toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
        var received = new java.util.concurrent.atomic.AtomicReference<JSONObject>();
        var failure = new java.util.concurrent.atomic.AtomicReference<Exception>();
        try (var server = new java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))) {
            var worker = new Thread(() -> {
                try (var socket = server.accept()) {
                    var input = socket.getInputStream(); var headers = new java.io.ByteArrayOutputStream();
                    int previous = 0, current;
                    while ((current = input.read()) != -1) { headers.write(current); if ((previous & 0xffffff) == 0x0d0a0d && current == 0x0a) break; previous = (previous << 8) | current; }
                    var lines = headers.toString("UTF-8").split("\r\n"); int length = 0;
                    for (String line : lines) if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(line.substring(line.indexOf(':') + 1).trim());
                    received.set(new JSONObject(new String(input.readNBytes(length), java.nio.charset.StandardCharsets.UTF_8)));
                    var out = socket.getOutputStream();
                    out.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(java.nio.charset.StandardCharsets.US_ASCII));
                    out.write(body); out.flush();
                } catch (Exception error) { failure.set(error); }
            });
            worker.start();
            var config = new NativeRouting.Config("http://127.0.0.1:" + server.getLocalPort() + "/api", 48.001, 2.001, "distance", true, false);
            var result = new NativeRouting(config).calculate(new GuidanceTracker.Fix(48, 2, 5, System.currentTimeMillis(), 0d, null));
            worker.join(5000);
            assertNull(failure.get()); assertFalse(worker.isAlive());
            assertEquals(3, result.tracker().points.size());
            assertTrue(received.get().getBoolean("guidanceOnly")); assertTrue(received.get().getBoolean("avoidMotorways"));
            assertFalse(received.get().getBoolean("avoidTolls")); assertEquals("distance", received.get().getString("criterion"));
            assertEquals(48.001, received.get().getJSONObject("end").getDouble("lat"), .000001);
        }
    }

    @Test public void publicServerCanBeDecodedWithoutTheCompactProtocol() throws Exception {
        org.junit.Assume.assumeTrue("1".equals(System.getenv("ECLAIRE_TEST_PUBLIC_ROUTING")));
        var config = new NativeRouting.Config("https://eclaire.nriault.fr/api", 48.8462, 2.3464, "time", false, false);
        var result = new NativeRouting(config).calculate(new GuidanceTracker.Fix(48.8608, 2.3376, 5, System.currentTimeMillis(), 0d, null));
        assertTrue(result.tracker().points.size() > 1);
        assertEquals(4, result.tracker().steps.get(result.tracker().steps.size() - 1).sign());
        var origin = new GuidanceTracker.Fix(48.8608, 2.345, 5, System.currentTimeMillis(), 0d, null);
        var approach = new NativeRouting(config).calculate(origin).tracker().update(origin, System.currentTimeMillis());
        assertEquals("approach", approach.status());
        assertTrue(GuidanceTracker.acceptsReroute(approach, origin, origin));
    }

    @Test public void publicServerKeepsTheWaypointDuringRecalculation() throws Exception {
        org.junit.Assume.assumeTrue("1".equals(System.getenv("ECLAIRE_TEST_PUBLIC_ROUTING")));
        var config = new NativeRouting.Config("https://eclaire.nriault.fr/api", 48.8462, 2.3464, "time", false, false, 48.8584, 2.2945, 1000d);
        var fix = new GuidanceTracker.Fix(48.8608, 2.3376, 5, System.currentTimeMillis(), 0d, null);
        var result = new NativeRouting(config).calculate(fix);
        assertTrue(result.route().getDouble("waypointAt") > 0);
        assertTrue(result.route().getDouble("waypointAt") < result.route().getDouble("length"));
        assertEquals(4, result.tracker().steps.get(result.tracker().steps.size() - 1).sign());
    }
}
