package fr.eclaire.app;

import static org.junit.Assert.*;
import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Looper;
import androidx.car.app.CarContext;
import androidx.car.app.OnDoneCallback;
import androidx.car.app.ScreenManager;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.model.SearchTemplate;
import androidx.car.app.navigation.model.MessageInfo;
import androidx.car.app.navigation.model.NavigationTemplate;
import androidx.car.app.navigation.model.RoutingInfo;
import androidx.car.app.testing.ScreenController;
import androidx.car.app.testing.TestCarContext;
import androidx.car.app.testing.navigation.TestNavigationManager;
import androidx.lifecycle.Lifecycle;
import java.util.List;
import java.time.Duration;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class CarNavigationScreenTest {
    @Test public void requestsPermissionOnlyWhileParkedThenOpensCarSearch() {
        var app = RuntimeEnvironment.getApplication();
        var context = TestCarContext.createCarContext(app);
        var screen = new CarNavigationScreen(context, () -> {}, () -> {});
        var controller = new ScreenController(screen).moveToState(Lifecycle.State.RESUMED);
        try {
            var permission = ((MessageTemplate) screen.onGetTemplate()).getActions().get(0);
            assertTrue(permission.getOnClickDelegate().isParkedOnly());
            Shadows.shadowOf(app).grantPermissions(Manifest.permission.ACCESS_FINE_LOCATION);
            var search = ((MessageTemplate) screen.onGetTemplate()).getActions().get(0);
            assertEquals("Rechercher une destination", search.getTitle().toString());
            assertFalse(search.getOnClickDelegate().isParkedOnly());
            search.getOnClickDelegate().sendClick(new OnDoneCallback() {});
            Shadows.shadowOf(Looper.getMainLooper()).idle();
            assertTrue(context.getCarService(ScreenManager.class).getTop().onGetTemplate() instanceof SearchTemplate);
        } finally { controller.moveToState(Lifecycle.State.DESTROYED); }
    }

    @Test public void simulatedDirectionsAdvanceAndStopWithoutStartingTheLocationService() {
        var app = RuntimeEnvironment.getApplication();
        var context = TestCarContext.createCarContext(app);
        var screen = new CarNavigationScreen(context, () -> fail("La simulation ne demande pas le GPS"), () -> {});
        var controller = new ScreenController(screen).moveToState(Lifecycle.State.RESUMED);
        var navigation = context.getCarService(TestNavigationManager.class);
        try {
            navigation.getNavigationManagerCallback().onAutoDriveEnabled();
            assertEquals("Rechercher une destination", ((MessageTemplate) screen.onGetTemplate()).getActions().get(0).getTitle().toString());
            screen.startSimulation(new GuidanceTracker(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.001, 2, 111, 12)),
                    List.of(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(55, "Tournez"), new GuidanceTracker.Step(111, "Arrivée", 4))), "Destination simulée");
            var initial = (NavigationTemplate) screen.onGetTemplate();
            Shadows.shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(2));
            var progress = (NavigationTemplate) screen.onGetTemplate();
            assertTrue(progress.getDestinationTravelEstimate().getRemainingDistance().getDisplayDistance()
                    < initial.getDestinationTravelEstimate().getRemainingDistance().getDisplayDistance());
            assertNull(CarGuidance.current());
            navigation.getNavigationManagerCallback().onStopNavigation();
            assertTrue(screen.onGetTemplate() instanceof MessageTemplate);
            assertEquals(1, navigation.getNavigationEndedCount());
            assertNull(Shadows.shadowOf(app).getNextStartedService());
        } finally { controller.moveToState(Lifecycle.State.DESTROYED); }
    }

    @Test public void navigationRequestDecodesAddressesAndCoordinates() {
        assertEquals("Place de la République", CarNavigationScreen.navigationQuery(new Intent(CarContext.ACTION_NAVIGATE,
                Uri.parse("geo:0,0?q=Place+de+la+R%C3%A9publique&mode=d"))));
        assertEquals("48.8566,2.3522", CarNavigationScreen.navigationQuery(new Intent(CarContext.ACTION_NAVIGATE,
                Uri.parse("geo:48.8566,2.3522?mode=d"))));
        assertNull(CarNavigationScreen.navigationQuery(new Intent(Intent.ACTION_VIEW, Uri.parse("geo:48.8566,2.3522"))));
    }

    @Test public void sharedTripShowsProgressAndSuspendsDirectionsWhenGpsIsLost() {
        var context = TestCarContext.createCarContext(RuntimeEnvironment.getApplication());
        var screen = new CarNavigationScreen(context, () -> {}, () -> {});
        var controller = new ScreenController(screen).moveToState(Lifecycle.State.RESUMED);
        var navigation = context.getCarService(TestNavigationManager.class);
        assertTrue(screen.onGetTemplate() instanceof MessageTemplate);

        var route = new GuidanceTracker(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1000, 100)),
                List.of(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(500, "Tournez")));
        CarGuidance.update(new CarGuidance.Snapshot(route, null, null, "starting", "Recherche de votre position…", false));
        assertTrue(((NavigationTemplate) screen.onGetTemplate()).getNavigationInfo() instanceof MessageInfo);
        var fix = new GuidanceTracker.Fix(48.005, 2, 5, 1000, 5.0, 0.0);
        var progress = new GuidanceTracker.State("on-route", 300, 30, 0, 1, 200);
        CarGuidance.update(new CarGuidance.Snapshot(route, fix, progress, "on-route", "Tournez", false));
        var template = (NavigationTemplate) screen.onGetTemplate();
        assertTrue(template.getNavigationInfo() instanceof RoutingInfo);
        assertEquals(700.0, template.getDestinationTravelEstimate().getRemainingDistance().getDisplayDistance(), 0.01);
        CarGuidance.update(new CarGuidance.Snapshot(route, null, null, "uncertain", "Signal GPS perdu.", false));
        assertTrue(((NavigationTemplate) screen.onGetTemplate()).getNavigationInfo() instanceof MessageInfo);
        assertTrue(navigation.getTripsSent().get(navigation.getTripsSent().size() - 1).isLoading());
        navigation.getNavigationManagerCallback().onStopNavigation();
        assertEquals("stop", Shadows.shadowOf(RuntimeEnvironment.getApplication()).getNextStartedService().getAction());
        CarGuidance.update(null);
        assertTrue(screen.onGetTemplate() instanceof MessageTemplate);
        controller.moveToState(Lifecycle.State.DESTROYED);
        assertEquals(1, navigation.getNavigationStartedCount());
        assertEquals(1, navigation.getNavigationEndedCount());
    }
}
