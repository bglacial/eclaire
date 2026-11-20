package fr.eclaire.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import androidx.annotation.NonNull;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.MessageTemplate;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.BiConsumer;

final class CarRouteScreen extends Screen implements LocationListener {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final LocationManager locations;
    private final CarDestinationScreen.Destination destination;
    private final NativeRouting.Config config;
    private final Runnable enableLocation, disableLocation;
    private final BiConsumer<GuidanceTracker, String> startSimulation;
    private NativeRouting request;
    private NativeRouting.Result preview;
    private boolean locating, locationForeground, bound, starting;
    private String message;
    private final Runnable gpsTimeout = () -> fail("Position précise introuvable. Réessayez en plein air.");
    private final Runnable routeTimeout = () -> fail("Le calcul prend trop de temps. Réessayez.");
    private final Runnable startTimeout = () -> fail("Impossible de lancer le guidage. Réessayez.");

    CarRouteScreen(CarContext context, CarDestinationScreen.Destination destination, Runnable enableLocation,
            Runnable disableLocation, BiConsumer<GuidanceTracker, String> startSimulation) {
        super(context);
        this.destination = destination;
        this.enableLocation = enableLocation;
        this.disableLocation = disableLocation;
        this.startSimulation = startSimulation;
        locations = context.getSystemService(LocationManager.class);
        config = new NativeRouting.Config("https://eclaire.nriault.fr/api", destination.lat(), destination.lon(), "time", false, false);
        getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override public void onCreate(@NonNull LifecycleOwner owner) { prepare(); }
            @Override public void onDestroy(@NonNull LifecycleOwner owner) { cleanUp(); worker.shutdownNow(); }
        });
    }

    private void prepare() {
        preview = null;
        if (startSimulation != null) {
            // Reviewers can simulate a route in the supported region regardless of their actual location.
            calculate(new GuidanceTracker.Fix(48.8566, 2.3522, 5, System.currentTimeMillis(), null, null));
            return;
        }
        message = "Recherche de votre position…";
        try {
            enableLocation.run();
            locationForeground = true;
            for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                if (!locations.isProviderEnabled(provider)) continue;
                locations.requestLocationUpdates(provider, 1000, 0, this, Looper.getMainLooper());
                locating = true;
            }
            if (locating) main.postDelayed(gpsTimeout, 15_000);
            else fail("Localisation désactivée. Activez-la uniquement à l’arrêt.");
        } catch (RuntimeException error) { fail("Localisation indisponible. Vérifiez les autorisations uniquement à l’arrêt."); }
        invalidate();
    }

    @Override public void onLocationChanged(@NonNull Location location) {
        long now = System.currentTimeMillis();
        if (!locating || !location.hasAccuracy() || location.getAccuracy() > 50 || now - location.getTime() > 15_000
                || location.getTime() - now > 5_000) return;
        locating = false;
        locations.removeUpdates(this);
        main.removeCallbacks(gpsTimeout);
        if (!CarDestinationScreen.Destination.covered(location.getLatitude(), location.getLongitude())) {
            fail("Le calcul de trajets couvre la France métropolitaine.");
            return;
        }
        calculate(new GuidanceTracker.Fix(location.getLatitude(), location.getLongitude(), location.getAccuracy(),
                location.getTime(), null, null));
    }

    private void calculate(GuidanceTracker.Fix origin) {
        message = "Calcul de l’itinéraire…";
        var calculation = new NativeRouting(config);
        request = calculation;
        main.postDelayed(routeTimeout, 9_000);
        invalidate();
        worker.execute(() -> {
            try {
                var result = calculation.calculate(origin);
                main.post(() -> {
                    if (calculation != request) return;
                    request = null;
                    main.removeCallbacks(routeTimeout);
                    preview = result;
                    invalidate();
                });
            } catch (Exception error) {
                main.post(() -> { if (calculation == request) fail("Itinéraire indisponible. Réessayez."); });
            }
        });
    }

    private void start() {
        if (preview == null || starting) return;
        if (CarGuidance.current() != null) { getScreenManager().popToRoot(); return; }
        if (startSimulation != null) {
            startSimulation.accept(preview.tracker(), destination.name());
            getScreenManager().popToRoot();
            return;
        }
        starting = true;
        message = "Démarrage du guidage…";
        invalidate();
        try {
            bound = getCarContext().bindService(new Intent(getCarContext(), NavigationService.class), connection, Context.BIND_AUTO_CREATE);
            if (bound) main.postDelayed(startTimeout, 4_000);
            else fail("Impossible de lancer le guidage. Réessayez.");
        } catch (RuntimeException error) { fail("Impossible de lancer le guidage. Réessayez."); }
    }

    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            if (!starting) return;
            var service = ((NavigationService.LocalBinder) binder).service();
            try {
                if (CarGuidance.current() == null) {
                    getCarContext().startService(new Intent(getCarContext(), NavigationService.class));
                    service.startFromCar(preview, config, destination.name());
                }
                getScreenManager().popToRoot();
            } catch (RuntimeException error) { fail("Impossible de lancer le guidage. Vérifiez la localisation à l’arrêt."); }
        }
        @Override public void onServiceDisconnected(ComponentName name) { fail("Le guidage a été interrompu. Réessayez."); }
    };

    private void fail(String error) {
        cleanUp();
        preview = null;
        message = error;
        invalidate();
    }

    private void cleanUp() {
        main.removeCallbacksAndMessages(null);
        if (request != null) { request.cancel(); request = null; }
        if (locating) { locating = false; locations.removeUpdates(this); }
        starting = false;
        if (bound) { bound = false; getCarContext().unbindService(connection); }
        if (locationForeground) { locationForeground = false; disableLocation.run(); }
    }

    @NonNull @Override public MessageTemplate onGetTemplate() {
        boolean loading = locating || request != null || starting;
        var builder = new MessageTemplate.Builder(loading || preview == null ? message : summary())
                .setTitle(destination.name()).setHeaderAction(Action.BACK);
        if (loading) return builder.setLoading(true).build();
        if (preview == null) return builder.addAction(new Action.Builder().setTitle("Réessayer").setOnClickListener(this::prepare).build()).build();
        return builder.addAction(new Action.Builder().setTitle("Démarrer le guidage").setFlags(Action.FLAG_PRIMARY)
                .setOnClickListener(this::start).build()).build();
    }

    private String summary() {
        var end = preview.tracker().points.get(preview.tracker().points.size() - 1);
        return String.format(Locale.FRANCE, "%.1f km · %d min%s", end.at() / 1000, Math.max(1, Math.round(end.seconds() / 60)),
                startSimulation == null ? "" : " · Simulation depuis Paris");
    }
}
