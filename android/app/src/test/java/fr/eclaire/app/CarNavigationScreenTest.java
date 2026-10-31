package fr.eclaire.app;

import static org.junit.Assert.*;
import androidx.car.app.model.MessageTemplate;
import androidx.car.app.navigation.model.MessageInfo;
import androidx.car.app.navigation.model.NavigationTemplate;
import androidx.car.app.navigation.model.RoutingInfo;
import androidx.car.app.testing.ScreenController;
import androidx.car.app.testing.TestCarContext;
import androidx.car.app.testing.navigation.TestNavigationManager;
import androidx.lifecycle.Lifecycle;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class CarNavigationScreenTest {
    @Test public void sharedTripShowsProgressAndSuspendsDirectionsWhenGpsIsLost() {
        var context = TestCarContext.createCarContext(RuntimeEnvironment.getApplication());
        var screen = new CarNavigationScreen(context);
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
