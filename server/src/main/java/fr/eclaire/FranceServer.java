package fr.eclaire;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.graphhopper.GraphHopper;
import com.graphhopper.GraphHopperConfig;
import com.graphhopper.config.Profile;
import com.graphhopper.routing.Path;
import com.graphhopper.routing.InstructionsFromEdges;
import com.graphhopper.routing.ev.EncodedValueLookup;
import com.graphhopper.storage.Graph;
import com.graphhopper.routing.querygraph.QueryGraph;
import com.graphhopper.routing.util.DefaultSnapFilter;
import com.graphhopper.routing.weighting.Weighting;
import com.graphhopper.util.*;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;
import static com.graphhopper.json.Statement.If;
import static com.graphhopper.json.Statement.Op.MULTIPLY;

public final class FranceServer {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final NationalHopper hopper;
    private final Profile profile;
    private final Semaphore capacity = new Semaphore(1);
    private final ConcurrentHashMap<String, Thread> active = new ConcurrentHashMap<>();
    private final Set<String> origins = Set.of(System.getenv().getOrDefault("ECLAIRE_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8787,https://localhost,http://localhost,capacitor://localhost").split(","));

    private static final class NationalHopper extends GraphHopper {
        @Override protected void cleanUp() { super.cleanUp(); getProperties().put("eclaire.connectivity", "1"); }
        void ensureConnectivity() {
            if (!"1".equals(getProperties().get("eclaire.connectivity"))) {
                cleanUp(); getBaseGraph().flush(); getProperties().flush();
            }
        }
    }

    public FranceServer(String osmFile, String graphDirectory) {
        var model = GHUtility.loadCustomModelFromJar("car.json").setDistanceInfluence(0d);
        model.addToPriority(If("road_access == PRIVATE || road_access == DESTINATION", MULTIPLY, "0"));
        profile = new Profile("car").setCustomModel(model).setTurnCostsConfig(new TurnCostsConfig().setVehicleTypes(List.of("motorcar", "motor_vehicle")));
        hopper = new NationalHopper();
        hopper.init(new GraphHopperConfig()
                .putObject("datareader.file", osmFile).putObject("graph.location", graphDirectory)
                .putObject("graph.dataaccess.default_type", "MMAP")
                .putObject("graph.encoded_values", "car_access,car_average_speed,road_access")
                .putObject("import.osm.ignored_highways", "steps,bridleway,platform,construction,proposed,abandoned,corridor,elevator")
                .putObject("prepare.min_network_size", 200).setProfiles(List.of(profile)));
        hopper.importOrLoad();
        hopper.ensureConnectivity();
    }

    private Weighting timeWeighting() { return hopper.createWeighting(profile, new PMap()); }

    static List<Map<String, Object>> navigation(Path path, Graph graph, Weighting time, EncodedValueLookup encoding, Translation french) {
        var result = new ArrayList<Map<String, Object>>();
        double at = 0;
        for (var instruction : InstructionsFromEdges.calcInstructions(path, graph, time, encoding, french)) {
            result.add(Map.of("at", at, "sign", instruction.getSign(), "text", instruction.getTurnDescription(french), "name", instruction.getName()));
            at += instruction.getDistance();
        }
        return result;
    }

    Map<String, Object> health() {
        var bounds = hopper.getBaseGraph().getBounds();
        return Map.of("status", "ready", "engine", "GraphHopper 11.0 · Dijkstra bidirectionnel", "nodes", hopper.getBaseGraph().getNodes(),
                "edges", hopper.getBaseGraph().getEdges(), "bounds", List.of(bounds.minLat, bounds.minLon, bounds.maxLat, bounds.maxLon),
                "dataTimestamp", hopper.getProperties().get("datareader.data.date"));
    }

    private static double coordinate(JsonNode point, String field, double min, double max) {
        if (point == null || !point.path(field).isNumber()) throw new IllegalArgumentException("Coordonnées manquantes.");
        double value = point.path(field).asDouble();
        if (!Double.isFinite(value) || value < min || value > max) throw new IllegalArgumentException("Point hors de France métropolitaine et Corse.");
        return value;
    }

    private void route(HttpExchange exchange) throws IOException {
        if (!capacity.tryAcquire()) { json(exchange, 429, Map.of("error", "Le service calcule déjà un trajet. Réessayez dans un instant.")); return; }
        String requestId = null;
        try {
            byte[] body = exchange.getRequestBody().readNBytes(8193);
            if (body.length > 8192) throw new IllegalArgumentException("Requête trop volumineuse.");
            JsonNode request = JSON.readTree(body);
            requestId = UUID.fromString(request.path("requestId").asText()).toString();
            if (active.putIfAbsent(requestId, Thread.currentThread()) != null) throw new IllegalArgumentException("Identifiant de requête déjà utilisé.");
            String criterion = request.path("criterion").asText();
            if (!Set.of("time", "distance").contains(criterion)) throw new IllegalArgumentException("Critère invalide.");
            double fromLat = coordinate(request.get("start"), "lat", 41.3, 51.2), fromLon = coordinate(request.get("start"), "lon", -5.3, 9.7);
            double toLat = coordinate(request.get("end"), "lat", 41.3, 51.2), toLon = coordinate(request.get("end"), "lon", -5.3, 9.7);
            var time = timeWeighting();
            var filter = new DefaultSnapFilter(time, hopper.getEncodingManager().getBooleanEncodedValue("car_subnetwork"));
            var from = hopper.getLocationIndex().findClosest(fromLat, fromLon, filter);
            var to = hopper.getLocationIndex().findClosest(toLat, toLon, filter);
            if (!from.isValid() || !to.isValid() || from.getQueryDistance() > 2000 || to.getQueryDistance() > 2000) throw new IllegalArgumentException("Aucune route automobile accessible à moins de 2 km d’un des points dans les données chargées.");
            var queryGraph = QueryGraph.create(hopper.getBaseGraph(), from, to);
            Weighting queryTime = queryGraph.wrapWeighting(time);
            Weighting weighting = queryGraph.wrapWeighting(criterion.equals("distance") ? new DistanceWeighting(time) : time);
            var algo = new TracedDijkstra(queryGraph, weighting);
            algo.setMaxVisitedNodes(Integer.parseInt(System.getenv().getOrDefault("ECLAIRE_MAX_STATES", "40000000")));
            algo.setTimeoutMillis(Long.parseLong(System.getenv().getOrDefault("ECLAIRE_TIMEOUT_MS", "120000")));
            long began = System.nanoTime();
            Path path = algo.calcPath(from.getClosestNode(), to.getClosestNode());
            double computeMs = (System.nanoTime() - began) / 1e6;
            if (algo.exhaustedBudget()) { json(exchange, 422, Map.of("error", "Limite de calcul atteinte avant la preuve d’optimalité. Augmentez les ressources ou rapprochez les points.", "visited", algo.getVisitedNodes(), "computeMs", computeMs)); return; }

            exchange.getResponseHeaders().set("Content-Type", "application/x-ndjson; charset=utf-8");
            exchange.getResponseHeaders().set("Cache-Control", "no-store");
            exchange.sendResponseHeaders(200, 0);
            try (var writer = new BufferedWriter(new OutputStreamWriter(exchange.getResponseBody(), StandardCharsets.UTF_8))) {
                int stride = Math.max(1, (int) Math.ceil((double) algo.keys.size() / Integer.parseInt(System.getenv().getOrDefault("ECLAIRE_MAX_TRACE_EVENTS", "60000"))));
                var selected = new com.carrotsearch.hppc.IntArrayList();
                int[] sideCounts = { 0, 0 };
                for (int i = 0; i < algo.keys.size(); i++) if (sideCounts[algo.sides.get(i)]++ % stride == 0) selected.add(i);
                writeLine(writer, Map.of("type", "metadata", "visited", algo.getVisitedNodes(), "computeMs", computeMs, "traceStride", stride, "traceEvents", selected.size(),
                        "snapped", List.of(Map.of("lat", from.getSnappedPoint().lat, "lon", from.getSnappedPoint().lon, "distance", from.getQueryDistance()), Map.of("lat", to.getSnappedPoint().lat, "lon", to.getSnappedPoint().lon, "distance", to.getQueryDistance()))));
                Set<Integer> sent = new HashSet<>();
                for (int offset = 0; offset < selected.size(); offset += 256) {
                    if (Thread.currentThread().isInterrupted()) throw new CancellationException();
                    var events = new ArrayList<Map<String, Object>>();
                    var edges = new ArrayList<Map<String, Object>>();
                    for (int j = offset; j < Math.min(offset + 256, selected.size()); j++) {
                        int i = selected.get(j);
                        int key = algo.keys.get(i);
                        events.add(Map.of("key", key, "side", algo.sides.get(i)));
                        if (sent.add(key)) edges.add(edge(queryGraph, key, queryTime));
                    }
                    writeLine(writer, Map.of("type", "batch", "events", events, "edges", edges));
                }
                if (!path.isFound()) { writeLine(writer, Map.of("type", "result", "result", Map.of("found", false))); return; }
                var pathKeys = new ArrayList<Integer>();
                var finalEdges = new ArrayList<Map<String, Object>>();
                int meetingKey = -1;
                for (var edge : path.calcEdges()) {
                    int key = edge.getEdgeKey(); pathKeys.add(key);
                    if (sent.add(key)) finalEdges.add(edge(queryGraph, key, queryTime));
                    if (edge.getAdjNode() == algo.meetingNode()) meetingKey = key;
                }
                writeLine(writer, Map.of("type", "result", "edges", finalEdges, "result", Map.of("found", true, "path", pathKeys, "meeting", meetingKey,
                        "length", path.getDistance(), "seconds", path.getTime() / 1000.0, "cost", path.getWeight(), "visited", algo.getVisitedNodes(), "computeMs", computeMs,
                        "instructions", navigation(path, queryGraph, queryTime, hopper.getEncodingManager(), hopper.getTranslationMap().getWithFallBack(Locale.FRENCH)))));
            }
        } catch (CancellationException error) {
            if (exchange.getResponseCode() == -1) json(exchange, 409, Map.of("error", "Exploration interrompue."));
        } catch (IllegalArgumentException error) {
            if (exchange.getResponseCode() == -1) json(exchange, 400, Map.of("error", error.getMessage() == null ? "Requête invalide." : error.getMessage()));
        } catch (Exception error) {
            System.err.println("Route failed: " + error.getClass().getSimpleName());
            if (exchange.getResponseCode() == -1) json(exchange, 500, Map.of("error", "Le service routier n’a pas pu terminer le calcul."));
        } finally { if (requestId != null) active.remove(requestId, Thread.currentThread()); Thread.interrupted(); capacity.release(); exchange.close(); }
    }

    private static Map<String, Object> edge(QueryGraph graph, int key, Weighting time) {
        var edge = graph.getEdgeIteratorStateForKey(key);
        var points = edge.fetchWayGeometry(FetchMode.ALL);
        var coordinates = new ArrayList<List<Double>>(points.size());
        for (int i = 0; i < points.size(); i++) coordinates.add(List.of(points.getLat(i), points.getLon(i)));
        return Map.of("key", key, "geometry", coordinates, "length", edge.getDistance(), "seconds", time.calcEdgeMillis(edge, false) / 1000.0, "name", edge.getName());
    }
    private static void writeLine(Writer writer, Object value) throws IOException { writer.write(JSON.writeValueAsString(value)); writer.write('\n'); writer.flush(); }
    private static void json(HttpExchange exchange, int status, Object value) throws IOException {
        byte[] bytes = JSON.writeValueAsBytes(value);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8"); exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
    }

    public void serve(int port) throws IOException {
        var server = HttpServer.create(new InetSocketAddress(System.getenv().getOrDefault("ECLAIRE_HOST", "127.0.0.1"), port), 16);
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
        server.createContext("/api/", exchange -> {
            String origin = exchange.getRequestHeaders().getFirst("Origin");
            if (origin != null && !origins.contains(origin)) { json(exchange, 403, Map.of("error", "Origine non autorisée.")); return; }
            if (origin != null) { exchange.getResponseHeaders().set("Access-Control-Allow-Origin", origin); exchange.getResponseHeaders().set("Vary", "Origin"); }
            exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
            exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type");
            if (exchange.getRequestMethod().equals("OPTIONS")) { exchange.sendResponseHeaders(204, -1); exchange.close(); return; }
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/api/health") && exchange.getRequestMethod().equals("GET")) { json(exchange, 200, health()); return; }
            if (path.equals("/api/route") && exchange.getRequestMethod().equals("POST")) { route(exchange); return; }
            if (path.startsWith("/api/route/") && exchange.getRequestMethod().equals("DELETE")) {
                Thread thread = active.get(path.substring("/api/route/".length())); if (thread != null) thread.interrupt();
                json(exchange, 200, Map.of("cancelled", thread != null)); return;
            }
            json(exchange, 404, Map.of("error", "Ressource inconnue."));
        });
        server.createContext("/", exchange -> {
            if (!exchange.getRequestMethod().equals("GET")) { exchange.sendResponseHeaders(405, -1); exchange.close(); return; }
            var root = java.nio.file.Path.of(System.getenv().getOrDefault("ECLAIRE_WEB_DIR", "dist")).toAbsolutePath().normalize();
            String route = exchange.getRequestURI().getPath();
            var file = root.resolve(route.equals("/") ? "index.html" : route.substring(1)).normalize();
            if (!file.startsWith(root) || !Files.isRegularFile(file)) { exchange.sendResponseHeaders(404, -1); exchange.close(); return; }
            String type = Files.probeContentType(file);
            exchange.getResponseHeaders().set("Content-Type", file.toString().endsWith(".js") ? "text/javascript" : type == null ? "application/octet-stream" : type);
            exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
            exchange.sendResponseHeaders(200, Files.size(file));
            try (var out = exchange.getResponseBody()) { Files.copy(file, out); }
        });
        server.start();
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { server.stop(1); hopper.close(); }));
        System.out.println("Éclaire France ready: http://localhost:" + port);
    }

    public static void main(String[] args) throws Exception {
        String osm = System.getenv().getOrDefault("ECLAIRE_OSM_FILE", "server/data/france-latest.osm.pbf");
        String graph = System.getenv().getOrDefault("ECLAIRE_GRAPH_DIR", "server/data/france-graph");
        new FranceServer(osm, graph).serve(Integer.parseInt(System.getenv().getOrDefault("PORT", "8787")));
    }
}
