package fr.eclaire.app;

import android.Manifest;
import android.app.NotificationManager;
import android.content.*;
import android.location.Location;
import android.os.*;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class BackgroundGuidanceInstrumentedTest {
    @Test public void progressAndNotificationStopWorkWhileActivityIsStopped() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        var context = instrumentation.getTargetContext();
        for (String permission : new String[] { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), permission);
        if (Build.VERSION.SDK_INT >= 33) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        var connected = new CountDownLatch(1);
        var service = new AtomicReference<NavigationService>();
        var connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) { service.set(((NavigationService.LocalBinder) binder).service()); connected.countDown(); }
            @Override public void onServiceDisconnected(ComponentName name) {}
        };
        try (var scenario = ActivityScenario.launch(MainActivity.class)) {
            // Laisser finir les arrêts de session émis au chargement de la carte.
            Thread.sleep(2000);
            scenario.onActivity(activity -> {
                var intent = new Intent(activity, NavigationService.class);
                ContextCompat.startForegroundService(activity, intent);
                context.bindService(intent, connection, Context.BIND_AUTO_CREATE);
            });
            assertTrue(connected.await(10, TimeUnit.SECONDS));
            try {
                scenario.moveToState(Lifecycle.State.CREATED);
                instrumentation.runOnMainSync(() -> service.get().start(new GuidanceTracker(
                        java.util.Arrays.asList(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.002, 2, 222, 40)),
                        java.util.Arrays.asList(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(222, "Arrivée"))), false, state -> {}));
                assertEquals("starting", CarGuidance.current().status());
                assertFalse(CarGuidance.current().voice());
                var actions = new AtomicReference<java.util.List<android.app.RemoteAction>>();
                scenario.onActivity(activity -> actions.set(activity.pipParams(CarGuidance.current()).getActions()));
                assertEquals(2, actions.get().size());
                assertEquals("Activer la voix", actions.get().get(0).getTitle().toString());
                assertEquals("Arrêter le guidage", actions.get().get(1).getTitle().toString());
                actions.get().get(0).getActionIntent().send();
                long voiceDeadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                while (!CarGuidance.current().voice() && System.nanoTime() < voiceDeadline) Thread.sleep(100);
                assertTrue(CarGuidance.current().voice());
                instrumentation.runOnMainSync(() -> service.get().onStartCommand(new Intent(context, NavigationService.class).setAction("voice"), 0, 0));
                assertFalse(CarGuidance.current().voice());
                long time = System.currentTimeMillis();
                instrumentation.runOnMainSync(() -> service.get().onLocationChanged(fix(48.001, time)));
                assertEquals("on-route", service.get().state().getString("status"));
                assertEquals("on-route", CarGuidance.current().status());
                assertNotNull(CarGuidance.current().progress());
                assertTrue(service.get().state().getBoolean("active"));
                instrumentation.runOnMainSync(() -> {
                    var inaccurate = fix(48.001, time + 1000); inaccurate.setAccuracy(150);
                    service.get().onLocationChanged(inaccurate);
                });
                assertEquals("on-route", service.get().state().getString("status"));
                var notifications = ((NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE)).getActiveNotifications();
                assertEquals(1, notifications.length);
                assertTrue(notifications[0].getNotification().actions.length > 0);
                notifications[0].getNotification().actions[0].actionIntent.send();
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
                while (!service.get().state().optString("status").equals("stopped") && System.nanoTime() < deadline) Thread.sleep(100);
                assertEquals("stopped", service.get().state().getString("status"));
                assertNull(CarGuidance.current());
                instrumentation.runOnMainSync(() -> service.get().onLocationChanged(fix(48.0015, time + 2000)));
                assertEquals("stopped", service.get().state().getString("status"));
                assertFalse(service.get().state().getBoolean("active"));
            } finally { context.unbindService(connection); context.stopService(new Intent(context, NavigationService.class)); }
        }
    }
    private Location fix(double lat, long time) {
        var location = new Location("gps"); location.setLatitude(lat); location.setLongitude(2); location.setAccuracy(5); location.setTime(time); location.setSpeed(0); return location;
    }
}
