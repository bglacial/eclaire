package fr.eclaire.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;
import android.Manifest;
import android.content.*;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.view.KeyEvent;
import androidx.core.content.ContextCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class RealDeviceGuidanceInstrumentedTest {
    @Test public void publicServerRequestWithSyntheticPosition() throws Exception {
        assumeTrue("1".equals(InstrumentationRegistry.getArguments().getString("eclairePublicRouting")));
        var config = new NativeRouting.Config("https://eclaire.nriault.fr/api", 48.8462, 2.3464, "time", false, false);
        var origin = new GuidanceTracker.Fix(48.8608, 2.345, 5, System.currentTimeMillis(), 0d, null);
        var result = new NativeRouting(config).calculate(origin);
        var state = result.tracker().update(origin, System.currentTimeMillis());
        assertEquals("approach", state.status());
        assertTrue(GuidanceTracker.acceptsReroute(state, origin, origin));
    }

    @Test public void publicServerRecalculatesSyntheticPositionInBackground() throws Exception {
        assumeTrue("1".equals(InstrumentationRegistry.getArguments().getString("eclairePublicRouting")));
        var instrumentation = InstrumentationRegistry.getInstrumentation(); var context = instrumentation.getTargetContext();
        for (String permission : new String[] { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), permission);
        if (Build.VERSION.SDK_INT >= 33) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        var connected = new CountDownLatch(1); var service = new AtomicReference<NavigationService>();
        var connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) { service.set(((NavigationService.LocalBinder) binder).service()); connected.countDown(); }
            @Override public void onServiceDisconnected(ComponentName name) {}
        };
        try (var scenario = ActivityScenario.launch(MainActivity.class)) {
            Thread.sleep(2000);
            boolean pip = "1".equals(InstrumentationRegistry.getArguments().getString("eclairePip"));
            boolean screenOff = "1".equals(InstrumentationRegistry.getArguments().getString("eclaireScreenOff"));
            boolean locked = "1".equals(InstrumentationRegistry.getArguments().getString("eclaireLocked"));
            scenario.onActivity(activity -> { if (pip) activity.setPipAutomatic(true); var intent = new Intent(activity, NavigationService.class); ContextCompat.startForegroundService(activity, intent); context.bindService(intent, connection, Context.BIND_AUTO_CREATE); });
            assertTrue(connected.await(10, TimeUnit.SECONDS));
            try {
                if (!pip) scenario.moveToState(androidx.lifecycle.Lifecycle.State.CREATED);
                var route = new GuidanceTracker(List.of(new GuidanceTracker.Point(48.8608, 2.3376, 0, 0), new GuidanceTracker.Point(48.8462, 2.3464, 1800, 300)), List.of(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(1800, "Arrivée", 4)));
                var config = new NativeRouting.Config("https://eclaire.nriault.fr/api", 48.8462, 2.3464, "time", false, false);
                instrumentation.runOnMainSync(() -> {
                    service.get().start(route, false, event -> {}, null, config);
                    ((LocationManager) context.getSystemService(Context.LOCATION_SERVICE)).removeUpdates(service.get());
                    service.get().onLocationChanged(synthetic(48.8608, 2.3376, System.currentTimeMillis() - 3000));
                });
                if (pip) {
                    instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_HOME);
                    var entered = new java.util.concurrent.atomic.AtomicBoolean();
                    long pipDeadline = System.currentTimeMillis() + 10000;
                    while (!entered.get() && System.currentTimeMillis() < pipDeadline) { scenario.onActivity(activity -> entered.set(activity.isInPictureInPictureMode())); if (!entered.get()) Thread.sleep(100); }
                    assertTrue("Le PiP doit être actif pendant le recalcul", entered.get());
                }
                if (screenOff) {
                    instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_POWER);
                    var power = (android.os.PowerManager) context.getSystemService(Context.POWER_SERVICE);
                    long sleepDeadline = System.currentTimeMillis() + 5000;
                    while (power.isInteractive() && System.currentTimeMillis() < sleepDeadline) Thread.sleep(100);
                    assertFalse("L’écran doit être éteint pendant le recalcul", power.isInteractive());
                    if (locked) {
                        var keyguard = (android.app.KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
                        long lockDeadline = System.currentTimeMillis() + 5000;
                        while (!keyguard.isDeviceLocked() && System.currentTimeMillis() < lockDeadline) Thread.sleep(100);
                        assertTrue("Le téléphone doit être verrouillé pendant le recalcul", keyguard.isDeviceLocked());
                    }
                }
                instrumentation.runOnMainSync(() -> {
                    long now = System.currentTimeMillis();
                    service.get().onLocationChanged(synthetic(48.8608, 2.345, now - 2000));
                    service.get().onLocationChanged(synthetic(48.8608, 2.345, now - 1000));
                });
                long deadline = System.currentTimeMillis() + 120000;
                var observed = new java.util.LinkedHashSet<String>();
                while (service.get().state().optInt("routeVersion") < 2 && System.currentTimeMillis() < deadline) {
                    Thread.sleep(2000);
                    observed.add(service.get().state().optString("status") + ": " + service.get().state().optString("message"));
                    instrumentation.runOnMainSync(() -> service.get().onLocationChanged(synthetic(48.8608, 2.345, System.currentTimeMillis())));
                }
                assertEquals("Le service doit fournir un trajet recalculé ; états : " + observed, 2, service.get().state().getInt("routeVersion"));
                assertNotNull(service.get().state().getJSONObject("route"));
                assertEquals("approach", service.get().state().getString("status"));
                assertNull(CarGuidance.current().progress());
                if (screenOff) assertFalse(((android.os.PowerManager) context.getSystemService(Context.POWER_SERVICE)).isInteractive());
                if (locked) assertTrue(((android.app.KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE)).isDeviceLocked());
            } finally { if (screenOff) instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_WAKEUP); context.unbindService(connection); context.stopService(new Intent(context, NavigationService.class)); }
        }
    }

    private static Location synthetic(double lat, double lon, long timestamp) {
        var location = new Location("gps"); location.setLatitude(lat); location.setLongitude(lon); location.setAccuracy(5); location.setTime(timestamp); location.setSpeed(0); return location;
    }

    @Test public void realGpsContinuesWhenTheScreenIsOff() throws Exception {
        assumeTrue(!Build.FINGERPRINT.contains("generic") && !Build.MODEL.contains("Emulator"));
        var instrumentation = InstrumentationRegistry.getInstrumentation(); var context = instrumentation.getTargetContext();
        for (String permission : new String[] { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), permission);
        if (Build.VERSION.SDK_INT >= 33) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        var manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        assumeTrue(manager.isProviderEnabled(LocationManager.GPS_PROVIDER));
        var fix = new AtomicReference<Location>(); var fixReady = new CountDownLatch(1);
        LocationListener observer = location -> { if (location.hasAccuracy() && location.getAccuracy() <= 50 && System.currentTimeMillis() - location.getTime() <= 15000) { fix.set(location); fixReady.countDown(); } };
        try (var scenario = ActivityScenario.launch(MainActivity.class)) {
            instrumentation.runOnMainSync(() -> manager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000, 0, observer, Looper.getMainLooper()));
            try {
                assumeTrue("Aucune position GPS précise obtenue à l’arrêt", fixReady.await(40, TimeUnit.SECONDS));
                instrumentation.runOnMainSync(() -> manager.removeUpdates(observer));
                var connected = new CountDownLatch(1); var service = new AtomicReference<NavigationService>();
                var connection = new ServiceConnection() {
                    @Override public void onServiceConnected(ComponentName name, IBinder binder) { service.set(((NavigationService.LocalBinder) binder).service()); connected.countDown(); }
                    @Override public void onServiceDisconnected(ComponentName name) {}
                };
                Thread.sleep(2000);
                scenario.onActivity(activity -> { var intent = new Intent(activity, NavigationService.class); ContextCompat.startForegroundService(activity, intent); context.bindService(intent, connection, Context.BIND_AUTO_CREATE); });
                assertTrue(connected.await(10, TimeUnit.SECONDS));
                try {
                    var origin = fix.get(); double lat = origin.getLatitude(), lon = origin.getLongitude();
                    var route = new GuidanceTracker(List.of(new GuidanceTracker.Point(lat, lon, 0, 0), new GuidanceTracker.Point(lat + .01, lon, 1112, 120)), List.of(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(1112, "Arrivée", 4)));
                    instrumentation.runOnMainSync(() -> service.get().start(route, false, event -> {}));
                    long deadline = System.currentTimeMillis() + 20000;
                    while (!"on-route".equals(service.get().state().optString("status")) && System.currentTimeMillis() < deadline) Thread.sleep(200);
                    assertEquals("Le suivi doit recevoir un vrai point GPS", "on-route", service.get().state().optString("status"));
                    long before = service.get().state().getJSONObject("fix").getLong("timestamp");
                    instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_POWER);
                    try {
                        var power = (android.os.PowerManager) context.getSystemService(Context.POWER_SERVICE);
                        long sleepDeadline = System.currentTimeMillis() + 5000;
                        while (power.isInteractive() && System.currentTimeMillis() < sleepDeadline) Thread.sleep(100);
                        assertFalse("L’écran doit être éteint", power.isInteractive());
                        deadline = System.currentTimeMillis() + 25000; long after = before;
                        while (after <= before && System.currentTimeMillis() < deadline) { Thread.sleep(500); var point = service.get().state().optJSONObject("fix"); if (point != null) after = point.optLong("timestamp"); }
                        assertTrue("Le GPS doit continuer écran éteint", after > before);
                        assertTrue(service.get().state().getBoolean("active"));
                    } finally { instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_WAKEUP); }
                } finally { context.unbindService(connection); context.stopService(new Intent(context, NavigationService.class)); }
            } finally { instrumentation.runOnMainSync(() -> manager.removeUpdates(observer)); }
        }
    }
}
