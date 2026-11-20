package fr.eclaire.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.car.app.AppManager;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.DateTimeWithZone;
import androidx.car.app.model.Distance;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.ParkedOnlyOnClickListener;
import androidx.car.app.model.Template;
import androidx.car.app.navigation.NavigationManager;
import androidx.car.app.navigation.NavigationManagerCallback;
import androidx.car.app.navigation.model.Destination;
import androidx.car.app.navigation.model.NavigationTemplate;
import androidx.car.app.navigation.model.RoutingInfo;
import androidx.car.app.navigation.model.Step;
import androidx.car.app.navigation.model.TravelEstimate;
import androidx.car.app.navigation.model.Trip;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import java.util.List;
import java.util.TimeZone;

final class CarNavigationScreen extends Screen {
    private final NavigationManager navigation;
    private final CarMap map;
    private final Runnable enableLocation, disableLocation;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean navigating;
    private boolean autoDrive;
    private Intent initialRequest;
    private GuidanceTracker demoRoute;
    private String demoDestination;
    private CarGuidance.Snapshot demoState;
    private double demoMetres;
    private int demoSegment;
    private final Runnable changed = this::refresh;
    private final Runnable drive = this::simulate;

    CarNavigationScreen(CarContext context, Runnable enableLocation, Runnable disableLocation) {
        super(context);
        this.enableLocation = enableLocation;
        this.disableLocation = disableLocation;
        navigation = context.getCarService(NavigationManager.class);
        map = new CarMap(context.getApplicationContext());
        context.getCarService(AppManager.class).setSurfaceCallback(map);
        navigation.setNavigationManagerCallback(new NavigationManagerCallback() {
            @Override public void onStopNavigation() { stop(); }
            @Override public void onAutoDriveEnabled() { autoDrive = true; invalidate(); }
        });
        getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override public void onCreate(@NonNull LifecycleOwner owner) { CarGuidance.observe(changed); }
            @Override public void onStart(@NonNull LifecycleOwner owner) {
                if (initialRequest == null) return;
                var intent = initialRequest;
                initialRequest = null;
                main.post(() -> openNavigationRequest(intent));
            }
            @Override public void onDestroy(@NonNull LifecycleOwner owner) {
                main.removeCallbacksAndMessages(null);
                CarGuidance.remove(changed);
                if (navigating) navigation.navigationEnded();
                navigation.clearNavigationManagerCallback();
                context.getCarService(AppManager.class).setSurfaceCallback(null);
                map.close();
            }
        });
    }

    private void stop() {
        if (demoRoute != null) {
            main.removeCallbacks(drive);
            demoRoute = null;
            demoState = null;
            refresh();
        } else if (CarGuidance.current() != null) {
            getCarContext().startService(new Intent(getCarContext(), NavigationService.class).setAction("stop"));
        }
    }

    static String navigationQuery(Intent intent) {
        if (!CarContext.ACTION_NAVIGATE.equals(intent.getAction()) || intent.getData() == null || !"geo".equals(intent.getData().getScheme())) return null;
        String value = intent.getData().getEncodedSchemeSpecificPart();
        if (value == null || value.length() > 1024) return null;
        int start = value.indexOf('?');
        if (start >= 0) for (String parameter : value.substring(start + 1).split("&")) {
            if (parameter.startsWith("q=")) return android.net.Uri.decode(parameter.substring(2).replace('+', ' ')).trim();
        }
        return android.net.Uri.decode(start < 0 ? value : value.substring(0, start)).trim();
    }

    void searchOnStart(Intent intent) { initialRequest = intent; }

    void openNavigationRequest(Intent intent) {
        String query = navigationQuery(intent);
        if (query == null || query.isEmpty() || snapshot() != null) return;
        getScreenManager().popToRoot();
        if (!canPlan()) return;
        var parts = query.split(",", -1);
        if (parts.length == 2) {
            try {
                double lat = Double.parseDouble(parts[0]), lon = Double.parseDouble(parts[1]);
                if (CarDestinationScreen.Destination.covered(lat, lon)) {
                    preview(new CarDestinationScreen.Destination("Destination", lat, lon));
                    return;
                }
            } catch (NumberFormatException ignored) { }
        }
        search(query);
    }

    private boolean canPlan() {
        return autoDrive || ContextCompat.checkSelfPermission(getCarContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private void search(String query) {
        getScreenManager().push(new CarDestinationScreen(getCarContext(), query, this::preview));
    }

    private void preview(CarDestinationScreen.Destination destination) {
        getScreenManager().push(new CarRouteScreen(getCarContext(), destination, enableLocation, disableLocation, autoDrive ? this::startSimulation : null));
    }

    void startSimulation(GuidanceTracker route, String destination) {
        demoRoute = route;
        demoDestination = destination;
        demoMetres = 0;
        demoSegment = 1;
        simulate();
    }

    private void simulate() {
        if (CarGuidance.current() != null) { stop(); return; }
        var points = demoRoute.points;
        double end = points.get(points.size() - 1).at();
        while (demoSegment < points.size() - 1 && points.get(demoSegment).at() < demoMetres) demoSegment++;
        var a = points.get(demoSegment - 1);
        var b = points.get(demoSegment);
        double fraction = b.at() == a.at() ? 0 : Math.max(0, (demoMetres - a.at()) / (b.at() - a.at()));
        long now = System.currentTimeMillis();
        double speed = demoMetres >= end ? 0 : 25;
        var fix = new GuidanceTracker.Fix(a.lat() + (b.lat() - a.lat()) * fraction, a.lon() + (b.lon() - a.lon()) * fraction,
                5, now, speed, null);
        var progress = demoRoute.update(fix, now);
        demoState = new CarGuidance.Snapshot(demoRoute, fix, progress, progress.status(), "Conduite simulée", false, demoDestination);
        refresh();
        if ("arrived".equals(progress.status())) main.postDelayed(() -> { if (demoRoute != null) stop(); }, 1_000);
        else {
            demoMetres = Math.min(end, demoMetres + speed);
            main.postDelayed(drive, 1_000);
        }
    }

    private CarGuidance.Snapshot snapshot() { return demoState == null ? CarGuidance.current() : demoState; }

    private Template home() {
        if (!canPlan()) return new MessageTemplate.Builder("Autorisez la localisation précise. Regardez le téléphone uniquement à l’arrêt, en lieu sûr.")
                .setTitle("Éclaire").setHeaderAction(Action.APP_ICON)
                .addAction(new Action.Builder().setTitle("Autoriser à l’arrêt").setOnClickListener(ParkedOnlyOnClickListener.create(() ->
                        getCarContext().requestPermissions(List.of(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                                (approved, rejected) -> invalidate()))).build()).build();
        return new MessageTemplate.Builder(autoDrive ? "Conduite simulée depuis Paris" : "Choisissez une destination pour démarrer le guidage.")
                .setTitle("Éclaire").setHeaderAction(Action.APP_ICON)
                .addAction(new Action.Builder().setTitle("Rechercher une destination").setFlags(Action.FLAG_PRIMARY)
                        .setOnClickListener(() -> search("")).build()).build();
    }

    private void refresh() {
        var state = snapshot();
        map.update(state);
        if (state != null && !navigating) { navigation.navigationStarted(); navigating = true; }
        if (state == null && navigating) { navigation.navigationEnded(); navigating = false; }
        if (state != null && state.progress() != null) {
            var progress = state.progress();
            var step = new Step.Builder(state.route().steps.get(progress.nextIndex()).text()).build();
            var end = state.route().points.get(state.route().points.size() - 1);
            navigation.updateTrip(new Trip.Builder().addStep(step, estimate(progress.toTurn(), stepSeconds(state.route(), progress)))
                    .addDestination(new Destination.Builder().setName(state.destination() == null ? "Destination" : state.destination()).build(),
                            estimate(end.at() - progress.at(), end.seconds() - progress.seconds())).build());
        } else if (state != null) {
            navigation.updateTrip(new Trip.Builder().setLoading(true).build());
        }
        invalidate();
    }

    private static TravelEstimate estimate(double metres, double seconds) {
        long duration = Math.max(0, Math.round(seconds));
        long arrival = ArrivalClock.arrivalMillis(System.currentTimeMillis(), Math.max(0, seconds));
        return new TravelEstimate.Builder(Distance.create(Math.max(0, metres), Distance.UNIT_METERS), DateTimeWithZone.create(arrival, TimeZone.getDefault()))
                .setRemainingTimeSeconds(duration).build();
    }

    private static double stepSeconds(GuidanceTracker route, GuidanceTracker.State progress) {
        double target = route.steps.get(progress.nextIndex()).at();
        var points = route.points;
        int low = 0, high = points.size() - 1;
        while (low < high) { int mid = (low + high) >>> 1; if (points.get(mid).at() < target) low = mid + 1; else high = mid; }
        var end = points.get(low);
        if (low == 0) return Math.max(0, end.seconds() - progress.seconds());
        var start = points.get(low - 1);
        double fraction = end.at() == start.at() ? 0 : (target - start.at()) / (end.at() - start.at());
        return Math.max(0, start.seconds() + fraction * (end.seconds() - start.seconds()) - progress.seconds());
    }

    @NonNull @Override public Template onGetTemplate() {
        var state = snapshot();
        if (state == null) return home();
        var builder = new NavigationTemplate.Builder().setActionStrip(new ActionStrip.Builder().addAction(
                new Action.Builder().setTitle("Arrêter").setOnClickListener(this::stop).build()).build());
        var progress = state.progress();
        if (progress == null) {
            builder.setNavigationInfo(new androidx.car.app.navigation.model.MessageInfo.Builder(state.message()).build());
        } else {
            var step = new Step.Builder(state.route().steps.get(progress.nextIndex()).text()).build();
            builder.setNavigationInfo(new RoutingInfo.Builder().setCurrentStep(step, Distance.create(progress.toTurn(), Distance.UNIT_METERS)).build());
            var end = state.route().points.get(state.route().points.size() - 1);
            builder.setDestinationTravelEstimate(estimate(end.at() - progress.at(), end.seconds() - progress.seconds()));
        }
        return builder.build();
    }
}
