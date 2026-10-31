package fr.eclaire.app;

import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.graphics.Color;
import android.view.KeyEvent;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class PipGuidanceInstrumentedTest {
    private static PipGuidanceView find(View view) {
        if (view instanceof PipGuidanceView pip) return pip;
        if (view instanceof ViewGroup group) for (int i = 0; i < group.getChildCount(); i++) {
            var result = find(group.getChildAt(i));
            if (result != null) return result;
        }
        return null;
    }

    @Test public void entersPipUpdatesGuidanceAndReturnsToFullScreen() throws Exception {
        assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        var context = instrumentation.getTargetContext();
        for (String permission : new String[] { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), permission);
        if (Build.VERSION.SDK_INT >= 33) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        assumeTrue(context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE));
        var route = new GuidanceTracker(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1000, 100)),
                List.of(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(500, "Tournez")));
        try (var scenario = ActivityScenario.launch(MainActivity.class)) {
            Thread.sleep(2000);
            scenario.onActivity(activity -> {
                CarGuidance.update(new CarGuidance.Snapshot(route, null, null, "starting", "Recherche GPS", false));
            });
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_HOME);
            var entered = new AtomicBoolean();
            long deadline = System.currentTimeMillis() + 10000;
            while (!entered.get() && System.currentTimeMillis() < deadline) {
                scenario.onActivity(activity -> entered.set(activity.isInPictureInPictureMode() && find(activity.getWindow().getDecorView()) != null));
                if (!entered.get()) Thread.sleep(100);
            }
            assertTrue("La fenêtre PiP doit être visible", entered.get());
            scenario.onActivity(activity -> {
                var fix = new GuidanceTracker.Fix(48.005, 2, 5, System.currentTimeMillis(), 5.0, 0.0);
                var progress = new GuidanceTracker.State("on-route", 300, 30, 0, 1, 200);
                CarGuidance.update(new CarGuidance.Snapshot(route, fix, progress, "on-route", "Dans 200 mètres, tournez", false));
                assertTrue(((TextView) find(activity.getWindow().getDecorView()).getChildAt(1)).getText().toString().contains("Dans 200 mètres, tournez"));
            });
            var drawn = new AtomicBoolean();
            deadline = System.currentTimeMillis() + 5000;
            while (!drawn.get() && System.currentTimeMillis() < deadline) {
                scenario.onActivity(activity -> {
                    var view = (TextureView) find(activity.getWindow().getDecorView()).getChildAt(0);
                    var image = view.isAvailable() ? view.getBitmap() : null;
                    if (image != null) {
                        drawn.set(image.getPixel(image.getWidth() / 2, image.getHeight() / 2) == Color.rgb(172, 249, 151));
                        image.recycle();
                    }
                });
                if (!drawn.get()) Thread.sleep(100);
            }
            assertTrue("La carte PiP doit afficher la position GPS", drawn.get());
            scenario.onActivity(activity -> activity.startActivity(new Intent(activity, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP)));
            var expanded = new AtomicBoolean();
            deadline = System.currentTimeMillis() + 10000;
            while (!expanded.get() && System.currentTimeMillis() < deadline) {
                scenario.onActivity(activity -> expanded.set(!activity.isInPictureInPictureMode() && find(activity.getWindow().getDecorView()) == null));
                if (!expanded.get()) Thread.sleep(100);
            }
            assertTrue("Le retour en plein écran doit retirer la vue PiP", expanded.get());
        } finally { instrumentation.runOnMainSync(() -> CarGuidance.update(null)); }
    }

    @Test public void disabledAutomaticPreferencePersistsButManualEntryStillWorks() throws Exception {
        assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        var context = instrumentation.getTargetContext();
        assumeTrue(context.getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE));
        for (String permission : new String[] { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), permission);
        if (Build.VERSION.SDK_INT >= 33) instrumentation.getUiAutomation().grantRuntimePermission(context.getPackageName(), Manifest.permission.POST_NOTIFICATIONS);
        var route = new GuidanceTracker(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1000, 100)), List.of(new GuidanceTracker.Step(0, "Continuez")));
        try (var scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> activity.setPipAutomatic(false));
            scenario.recreate(); Thread.sleep(2000);
            var entered = new AtomicBoolean();
            scenario.onActivity(activity -> {
                assertFalse(activity.pipAutomatic());
                CarGuidance.update(new CarGuidance.Snapshot(route, null, null, "starting", "Recherche GPS", false));
                if (Build.VERSION.SDK_INT >= 31) assertFalse(activity.pipParams(CarGuidance.current()).isAutoEnterEnabled());
                entered.set(activity.enterPip());
            });
            assertTrue("Le PiP manuel doit rester disponible", entered.get());
        } finally {
            context.getSharedPreferences("MainActivity", android.content.Context.MODE_PRIVATE).edit().remove("pipAutomatic").commit();
            instrumentation.runOnMainSync(() -> CarGuidance.update(null));
        }
    }
}
