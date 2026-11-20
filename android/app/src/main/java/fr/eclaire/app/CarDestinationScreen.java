package fr.eclaire.app;

import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.constraints.ConstraintManager;
import androidx.car.app.model.Action;
import androidx.car.app.model.ItemList;
import androidx.car.app.model.Row;
import androidx.car.app.model.SearchTemplate;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import org.json.JSONException;
import org.json.JSONObject;

final class CarDestinationScreen extends Screen {
    record Destination(String name, double lat, double lon) {
        static boolean covered(double lat, double lon) {
            return lat >= 41.3 && lat <= 51.2 && lon >= -5.3 && lon <= 9.7;
        }
    }

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newFixedThreadPool(2);
    private final Consumer<Destination> select;
    private final String initial;
    private String query = "";
    private String empty = "Saisissez ou dictez une destination en France.";
    private List<Destination> places = List.of();
    private boolean loading;
    private int generation;
    private Runnable pending;
    private Future<?> lookup;
    private final SearchTemplate.SearchCallback search = new SearchTemplate.SearchCallback() {
        @Override public void onSearchTextChanged(@NonNull String text) { schedule(text, 350); }
        @Override public void onSearchSubmitted(@NonNull String text) { schedule(text, 0); }
    };

    CarDestinationScreen(CarContext context, String initial, Consumer<Destination> select) {
        super(context);
        this.initial = initial;
        this.select = select;
        getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override public void onCreate(@NonNull LifecycleOwner owner) { schedule(initial, 0); }
            @Override public void onDestroy(@NonNull LifecycleOwner owner) {
                generation++;
                main.removeCallbacksAndMessages(null);
                worker.shutdownNow();
            }
        });
    }

    private void schedule(String text, long delay) {
        if (worker.isShutdown()) return;
        String next = text.trim();
        if (next.equals(query) && (delay > 0 || !loading && !places.isEmpty())) return;
        query = next;
        if (pending != null) main.removeCallbacks(pending);
        if (lookup != null) lookup.cancel(true);
        int request = ++generation;
        places = List.of();
        loading = next.length() >= 2 && next.length() <= 180;
        empty = next.length() > 180 ? "Précisez une adresse ou une ville." : "Saisissez ou dictez une destination en France.";
        if (loading) {
            int limit = getCarContext().getCarAppApiLevel() < 2 ? 6 : Math.min(6,
                    getCarContext().getCarService(ConstraintManager.class).getContentLimit(ConstraintManager.CONTENT_LIMIT_TYPE_LIST));
            pending = () -> lookup = worker.submit(() -> {
                try {
                    var found = find(next, limit);
                    main.post(() -> complete(request, found, "Aucune destination trouvée."));
                } catch (IOException | JSONException error) {
                    main.post(() -> complete(request, List.of(), "Recherche indisponible. Réessayez."));
                }
            });
            main.postDelayed(pending, delay);
        }
        invalidate();
    }

    private void complete(int request, List<Destination> found, String message) {
        if (request != generation) return;
        loading = false;
        places = found;
        empty = message;
        invalidate();
    }

    private static List<Destination> find(String query, int limit) throws IOException, JSONException {
        var url = new URL("https://data.geopf.fr/geocodage/search?limit=" + limit + "&q=" + URLEncoder.encode(query, "UTF-8"));
        var request = (HttpURLConnection) url.openConnection();
        request.setConnectTimeout(4_000);
        request.setReadTimeout(4_000);
        try (var input = request.getInputStream(); var reader = new java.io.InputStreamReader(input, java.nio.charset.StandardCharsets.UTF_8)) {
            var json = new StringBuilder();
            char[] buffer = new char[2048];
            for (int count; (count = reader.read(buffer)) != -1; ) {
                if (json.length() + count > 128_000) throw new IOException("Réponse IGN trop volumineuse.");
                json.append(buffer, 0, count);
            }
            var features = new JSONObject(json.toString()).getJSONArray("features");
            var results = new ArrayList<Destination>();
            for (int i = 0; i < features.length() && results.size() < limit; i++) {
                var feature = features.getJSONObject(i);
                var coordinates = feature.getJSONObject("geometry").getJSONArray("coordinates");
                double lat = coordinates.getDouble(1), lon = coordinates.getDouble(0);
                String name = feature.getJSONObject("properties").optString("label").trim();
                if (!name.isEmpty() && Destination.covered(lat, lon)) results.add(new Destination(name, lat, lon));
            }
            return results;
        } finally { request.disconnect(); }
    }

    @NonNull @Override public SearchTemplate onGetTemplate() {
        var builder = new SearchTemplate.Builder(search).setHeaderAction(Action.BACK)
                .setSearchHint("Adresse ou ville").setInitialSearchText(initial).setShowKeyboardByDefault(initial.isEmpty());
        if (loading) return builder.setLoading(true).build();
        var list = new ItemList.Builder().setNoItemsMessage(empty);
        for (var place : places) list.addItem(new Row.Builder().setTitle(place.name()).setOnClickListener(() -> select.accept(place)).build());
        return builder.setItemList(list.build()).build();
    }
}
