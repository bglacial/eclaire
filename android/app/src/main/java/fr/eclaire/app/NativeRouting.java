package fr.eclaire.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** One cancellable route request; accepts both the compact and the previous NDJSON protocol. */
final class NativeRouting {
    record Config(String api, double lat, double lon, String criterion, boolean avoidMotorways, boolean avoidTolls, Double viaLat, Double viaLon, Double viaAt) {
        Config(String api, double lat, double lon, String criterion, boolean avoidMotorways, boolean avoidTolls) { this(api, lat, lon, criterion, avoidMotorways, avoidTolls, null, null, null); }
        Config withoutVia() { return new Config(api, lat, lon, criterion, avoidMotorways, avoidTolls); }
        Config withViaAt(double at) { return new Config(api, lat, lon, criterion, avoidMotorways, avoidTolls, viaLat, viaLon, at); }
        static Config fromJson(JSONObject data) throws JSONException {
            String api = data.getString("api").replaceAll("/$", ""), criterion = data.getString("criterion");
            URI uri = URI.create(api);
            if (!java.util.Arrays.asList("http", "https").contains(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || !java.util.Arrays.asList("time", "distance").contains(criterion)) throw new IllegalArgumentException("Service de recalcul invalide.");
            var end = data.getJSONObject("end");
            double lat = end.getDouble("lat"), lon = end.getDouble("lon");
            if (!Double.isFinite(lat) || lat < 41.3 || lat > 51.2 || !Double.isFinite(lon) || lon < -5.3 || lon > 9.7) throw new IllegalArgumentException("Destination invalide.");
            if (!(data.opt("avoidMotorways") instanceof Boolean) || !(data.opt("avoidTolls") instanceof Boolean)) throw new IllegalArgumentException("Préférences routières invalides.");
            Double viaLat = null, viaLon = null, viaAt = null;
            if (data.has("via") && !data.isNull("via")) {
                var via = data.getJSONObject("via"); viaLat = via.getDouble("lat"); viaLon = via.getDouble("lon"); viaAt = via.getDouble("at");
                if (!Double.isFinite(viaLat) || viaLat < 41.3 || viaLat > 51.2 || !Double.isFinite(viaLon) || viaLon < -5.3 || viaLon > 9.7 || !Double.isFinite(viaAt) || viaAt <= 0) throw new IllegalArgumentException("Étape invalide.");
            }
            return new Config(api, lat, lon, criterion, data.getBoolean("avoidMotorways"), data.getBoolean("avoidTolls"), viaLat, viaLon, viaAt);
        }
    }
    record Result(JSONObject route, GuidanceTracker tracker) {}
    private static final int MAX_RESPONSE = 32 * 1024 * 1024;
    private final Config config;
    private volatile String id;
    private volatile HttpURLConnection connection;
    private volatile boolean cancelled;

    NativeRouting(Config config) { this.config = config; }

    Result calculate(GuidanceTracker.Fix fix) throws IOException, JSONException {
        if (config.viaLat() == null) {
            JSONObject route = leg(fix.lat(), fix.lon(), config.lat(), config.lon());
            return new Result(route, GuidanceTracker.fromJson(route));
        }
        JSONObject first = leg(fix.lat(), fix.lon(), config.viaLat(), config.viaLon());
        JSONObject second = leg(config.viaLat(), config.viaLon(), config.lat(), config.lon());
        JSONObject route = combine(first, second);
        return new Result(route, GuidanceTracker.fromJson(route));
    }

    private JSONObject leg(double fromLat, double fromLon, double toLat, double toLon) throws IOException, JSONException {
        if (cancelled) throw new IOException("Recalcul annulé.");
        String currentId = UUID.randomUUID().toString(); id = currentId;
        var body = new JSONObject().put("start", new JSONObject().put("lat", fromLat).put("lon", fromLon))
                .put("end", new JSONObject().put("lat", toLat).put("lon", toLon))
                .put("criterion", config.criterion()).put("avoidMotorways", config.avoidMotorways()).put("avoidTolls", config.avoidTolls())
                .put("requestId", currentId).put("guidanceOnly", true);
        var request = (HttpURLConnection) new URL(config.api() + "/route").openConnection();
        connection = request;
        try {
            if (cancelled) throw new IOException("Recalcul annulé.");
            request.setConnectTimeout(10_000); request.setReadTimeout(180_000); request.setRequestMethod("POST"); request.setDoOutput(true);
            request.setRequestProperty("Content-Type", "application/json");
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
            request.setFixedLengthStreamingMode(bytes.length);
            try (var out = request.getOutputStream()) { out.write(bytes); }
            int status = request.getResponseCode();
            if (status != 200) {
                String message = status == 429 ? "Le service est sollicité. Nouveau calcul dans un instant." : "Recalcul indisponible. Vérifiez la connexion.";
                try (var error = request.getErrorStream()) {
                    if (error != null) { var parsed = new JSONObject(read(error)); if (parsed.opt("error") instanceof String) message = parsed.getString("error"); }
                } catch (IOException | JSONException ignored) { }
                throw new IOException(message);
            }
            try (var input = request.getInputStream()) {
                JSONObject route = decode(read(input), request.getContentType());
                if (cancelled) throw new IOException("Recalcul annulé.");
                return route;
            }
        } finally { connection = null; request.disconnect(); }
    }

    static JSONObject combine(JSONObject first, JSONObject second) throws JSONException, IOException {
        GuidanceTracker.fromJson(first); GuidanceTracker.fromJson(second);
        var a = first.getJSONArray("points"); var b = second.getJSONArray("points");
        var last = a.getJSONObject(a.length() - 1); var start = b.getJSONObject(0);
        if (distance(last.getDouble("lat"), last.getDouble("lon"), start.getDouble("lat"), start.getDouble("lon")) > 2) throw new IOException("Étape routière discontinue.");
        double length = first.getDouble("length"), seconds = first.getDouble("seconds");
        var points = new JSONArray(); for (int i = 0; i < a.length(); i++) points.put(a.getJSONObject(i));
        for (int i = 1; i < b.length(); i++) {
            var point = new JSONObject(b.getJSONObject(i).toString());
            point.put("at", point.getDouble("at") + length); point.put("seconds", point.getDouble("seconds") + seconds); points.put(point);
        }
        var instructions = new JSONArray(); var stepsA = first.getJSONArray("instructions"); var stepsB = second.getJSONArray("instructions");
        for (int i = 0; i < stepsA.length() - 1; i++) instructions.put(stepsA.getJSONObject(i));
        instructions.put(new JSONObject().put("at", length).put("sign", 0).put("text", "Vous arrivez à l’étape").put("name", ""));
        for (int i = 1; i < stepsB.length(); i++) { var step = new JSONObject(stepsB.getJSONObject(i).toString()); step.put("at", step.getDouble("at") + length); instructions.put(step); }
        var route = new JSONObject().put("points", points).put("instructions", instructions).put("length", length + second.getDouble("length")).put("seconds", seconds + second.getDouble("seconds")).put("waypointAt", length);
        GuidanceTracker.fromJson(route); return route;
    }

    void cancel() {
        cancelled = true;
        var current = connection; var currentId = id;
        if (current == null) return;
        new Thread(() -> {
            HttpURLConnection cancel = null;
            try {
                cancel = (HttpURLConnection) new URL(config.api() + "/route/" + currentId).openConnection();
                cancel.setConnectTimeout(3000); cancel.setReadTimeout(3000); cancel.setRequestMethod("DELETE");
                cancel.getResponseCode();
            } catch (IOException ignored) { }
            finally { if (cancel != null) cancel.disconnect(); current.disconnect(); }
        }, "eclaire-cancel-route").start();
    }

    private static String read(InputStream input) throws IOException {
        var output = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
        while ((count = input.read(buffer)) != -1) {
            if (output.size() + count > MAX_RESPONSE) throw new IOException("Réponse routière trop volumineuse.");
            output.write(buffer, 0, count);
        }
        return new String(output.toByteArray(), StandardCharsets.UTF_8);
    }

    static JSONObject decode(String body, String contentType) throws JSONException, IOException {
        if (contentType != null && contentType.toLowerCase(java.util.Locale.ROOT).startsWith("application/json")) {
            var response = new JSONObject(body);
            if (!Boolean.TRUE.equals(response.opt("found"))) throw new IOException("Aucun itinéraire disponible depuis votre position.");
            var route = response.getJSONObject("route");
            GuidanceTracker.fromJson(route);
            return route;
        }
        if (!body.endsWith("\n")) throw new IOException("Flux routier interrompu.");
        Map<Integer, JSONObject> edges = new HashMap<>(); JSONObject result = null;
        try (var reader = new BufferedReader(new java.io.StringReader(body))) {
            for (String line; (line = reader.readLine()) != null;) {
                if (line.isEmpty()) continue;
                var message = new JSONObject(line); JSONArray batch = message.optJSONArray("edges");
                if (batch != null) for (int i = 0; i < batch.length(); i++) {
                    var edge = batch.getJSONObject(i); int key = index(edge.opt("key"));
                    if (key < 0 || edges.size() >= 100_000 && !edges.containsKey(key)) throw new IOException("Trace routière trop volumineuse.");
                    edges.putIfAbsent(key, edge);
                }
                if ("result".equals(message.optString("type"))) { result = message.getJSONObject("result"); break; }
            }
        }
        if (result == null || !Boolean.TRUE.equals(result.opt("found"))) throw new IOException("Aucun itinéraire disponible depuis votre position.");
        return fromEdges(result, edges);
    }

    private static JSONObject fromEdges(JSONObject result, Map<Integer, JSONObject> edges) throws JSONException, IOException {
        var path = result.getJSONArray("path"); var points = new JSONArray(); double at = 0, seconds = 0;
        double length = result.getDouble("length"), totalSeconds = result.getDouble("seconds");
        if (!Double.isFinite(length) || length < 1 || !Double.isFinite(totalSeconds) || totalSeconds < 0 || path.length() == 0 || path.length() > 100_000) throw new IOException("Parcours routier invalide.");
        for (int n = 0; n < path.length(); n++) {
            var edge = edges.get(index(path.opt(n)));
            if (edge == null) throw new IOException("Parcours routier incomplet.");
            var geometry = edge.getJSONArray("geometry"); double edgeLength = edge.getDouble("length"), edgeSeconds = edge.getDouble("seconds");
            if (geometry.length() < 2 || geometry.length() > 50_000 || points.length() + geometry.length() > 1_000_000 || !Double.isFinite(edgeLength) || edgeLength < 0 || !Double.isFinite(edgeSeconds) || edgeSeconds < 0) throw new IOException("Segment routier invalide.");
            var first = geometry.getJSONArray(0);
            if (points.length() == 0) points.put(new JSONObject().put("lat", first.getDouble(0)).put("lon", first.getDouble(1)).put("at", 0).put("seconds", 0));
            else {
                var previous = points.getJSONObject(points.length() - 1);
                if (distance(previous.getDouble("lat"), previous.getDouble("lon"), first.getDouble(0), first.getDouble(1)) > 2) throw new IOException("Parcours routier discontinu.");
            }
            double[] lengths = new double[geometry.length() - 1]; double total = 0, covered = 0;
            for (int i = 1; i < geometry.length(); i++) {
                var a = geometry.getJSONArray(i - 1); var b = geometry.getJSONArray(i);
                lengths[i - 1] = distance(a.getDouble(0), a.getDouble(1), b.getDouble(0), b.getDouble(1)); total += lengths[i - 1];
            }
            for (int i = 1; i < geometry.length(); i++) {
                covered += lengths[i - 1]; double ratio = total > 0 ? covered / total : (double) i / (geometry.length() - 1);
                var coordinate = geometry.getJSONArray(i);
                var point = new JSONObject().put("lat", coordinate.getDouble(0)).put("lon", coordinate.getDouble(1)).put("at", at + edgeLength * ratio).put("seconds", seconds + edgeSeconds * ratio);
                if (edge.has("speedLimit")) point.put("speedLimit", edge.getDouble("speedLimit"));
                points.put(point);
            }
            at += edgeLength; seconds += edgeSeconds;
        }
        if (Math.abs(at - length) > 2) throw new IOException("Distance du trajet incohérente.");
        if (seconds > 0) for (int i = 0; i < points.length(); i++) { var point = points.getJSONObject(i); point.put("seconds", point.getDouble("seconds") * totalSeconds / seconds); }
        var route = new JSONObject().put("points", points).put("instructions", result.getJSONArray("instructions")).put("length", length).put("seconds", totalSeconds);
        GuidanceTracker.fromJson(route);
        return route;
    }

    private static double distance(double aLat, double aLon, double bLat, double bLon) {
        double rad = Math.PI / 180, x = Math.pow(Math.sin((bLat - aLat) * rad / 2), 2) + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.pow(Math.sin((bLon - aLon) * rad / 2), 2);
        return 12_742_000 * Math.asin(Math.sqrt(Math.min(1, x)));
    }

    private static int index(Object value) throws IOException {
        if (!(value instanceof Number number) || !Double.isFinite(number.doubleValue()) || number.doubleValue() < 0 || number.doubleValue() > Integer.MAX_VALUE || number.doubleValue() != Math.floor(number.doubleValue())) throw new IOException("Identifiant routier invalide.");
        return number.intValue();
    }
}
