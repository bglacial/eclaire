package fr.eclaire.app;

import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.car.app.AppManager;
import androidx.car.app.CarContext;
import androidx.car.app.Screen;
import androidx.car.app.model.Action;
import androidx.car.app.model.ActionStrip;
import androidx.car.app.model.DateTimeWithZone;
import androidx.car.app.model.Distance;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.Template;
import androidx.car.app.navigation.NavigationManager;
import androidx.car.app.navigation.NavigationManagerCallback;
import androidx.car.app.navigation.model.NavigationTemplate;
import androidx.car.app.navigation.model.Destination;
import androidx.car.app.navigation.model.RoutingInfo;
import androidx.car.app.navigation.model.Step;
import androidx.car.app.navigation.model.TravelEstimate;
import androidx.car.app.navigation.model.Trip;
import androidx.lifecycle.DefaultLifecycleObserver;
import androidx.lifecycle.LifecycleOwner;
import java.util.TimeZone;

final class CarNavigationScreen extends Screen {
    private final NavigationManager navigation;
    private final CarMap map;
    private boolean navigating;
    private final Runnable changed = this::refresh;

    CarNavigationScreen(CarContext context) {
        super(context);
        navigation = context.getCarService(NavigationManager.class);
        map = new CarMap(context.getApplicationContext());
        context.getCarService(AppManager.class).setSurfaceCallback(map);
        navigation.setNavigationManagerCallback(new NavigationManagerCallback() {
            @Override public void onStopNavigation() { stop(); }
        });
        getLifecycle().addObserver(new DefaultLifecycleObserver() {
            @Override public void onCreate(@NonNull LifecycleOwner owner) { CarGuidance.observe(changed); }
            @Override public void onDestroy(@NonNull LifecycleOwner owner) {
                CarGuidance.remove(changed);
                if (navigating) navigation.navigationEnded();
                navigation.clearNavigationManagerCallback();
                context.getCarService(AppManager.class).setSurfaceCallback(null);
                map.close();
            }
        });
    }

    private void stop() {
        getCarContext().startService(new Intent(getCarContext(), NavigationService.class).setAction("stop"));
    }

    private void refresh() {
        var state = CarGuidance.current();
        map.update(state);
        if (state != null && !navigating) { navigation.navigationStarted(); navigating = true; }
        if (state == null && navigating) { navigation.navigationEnded(); navigating = false; }
        if (state != null && state.progress() != null) {
            var progress = state.progress();
            var step = new Step.Builder(state.route().steps.get(progress.nextIndex()).text()).build();
            var end = state.route().points.get(state.route().points.size() - 1);
            navigation.updateTrip(new Trip.Builder().addStep(step, estimate(progress.toTurn(), stepSeconds(state.route(), progress)))
                    .addDestination(new Destination.Builder().setName("Destination").build(), estimate(end.at() - progress.at(), end.seconds() - progress.seconds())).build());
        } else if (state != null) {
            navigation.updateTrip(new Trip.Builder().setLoading(true).build());
        }
        invalidate();
    }

    private static TravelEstimate estimate(double metres, double seconds) {
        long duration = Math.max(0, Math.round(seconds));
        long arrival = System.currentTimeMillis() + duration * 1000;
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
        var state = CarGuidance.current();
        if (state == null) return new MessageTemplate.Builder("Préparez et démarrez un trajet dans Éclaire sur le téléphone.").setTitle("Éclaire").build();
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
