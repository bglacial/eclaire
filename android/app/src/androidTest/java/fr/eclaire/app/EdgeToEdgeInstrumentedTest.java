package fr.eclaire.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeTrue;

import android.os.Build;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.view.WindowInsetsCompat;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

@RunWith(AndroidJUnit4.class)
public class EdgeToEdgeInstrumentedTest {
    @Test public void systemBackClosesSettingsAndKeepsMapOpen() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        String app = instrumentation.getTargetContext().getPackageName();
        for (String permission : new String[] { android.Manifest.permission.ACCESS_COARSE_LOCATION, android.Manifest.permission.ACCESS_FINE_LOCATION }) instrumentation.getUiAutomation().grantRuntimePermission(app, permission);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (!"true".equals(js(scenario, "Boolean(document.getElementById('settings-open'))")) && System.nanoTime() < deadline) Thread.sleep(200);
            js(scenario, "document.getElementById('settings-open').click(); void 0");
            assertEquals("false", js(scenario, "document.getElementById('settings-page').hidden"));
            instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_BACK);
            while (!"true".equals(js(scenario, "document.getElementById('settings-page').hidden")) && System.nanoTime() < deadline) Thread.sleep(100);
            assertEquals("true", js(scenario, "document.getElementById('settings-page').hidden"));
            scenario.onActivity(activity -> assertTrue(!activity.isFinishing()));
        }
    }

    @Test public void screenFlagAndVersionAreAvailableThroughBridge() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (!"true".equals(js(scenario, "Boolean(window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.EclaireDevice)")) && System.nanoTime() < deadline) Thread.sleep(200);
            js(scenario, "window.__deviceTest='waiting'; Capacitor.Plugins.EclaireDevice.setKeepScreenOn({enabled:true}).then(()=>window.__deviceTest='ok').catch(()=>window.__deviceTest='error'); void 0");
            while (!"\"ok\"".equals(js(scenario, "window.__deviceTest")) && System.nanoTime() < deadline) Thread.sleep(200);
            assertEquals("\"ok\"", js(scenario, "window.__deviceTest"));
            scenario.onActivity(activity -> assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0));
            js(scenario, "window.__deviceTest='waiting'; Capacitor.Plugins.EclaireDevice.getVersion().then(v=>window.__deviceTest=v.version); void 0");
            while ("\"waiting\"".equals(js(scenario, "window.__deviceTest")) && System.nanoTime() < deadline) Thread.sleep(200);
            android.content.Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
            assertEquals("\"" + context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName + "\"", js(scenario, "window.__deviceTest"));
            js(scenario, "window.__deviceTest='waiting'; Capacitor.Plugins.EclaireDevice.setKeepScreenOn({enabled:false}).then(()=>window.__deviceTest='ok'); void 0");
            while (!"\"ok\"".equals(js(scenario, "window.__deviceTest")) && System.nanoTime() < deadline) Thread.sleep(200);
            assertEquals("\"ok\"", js(scenario, "window.__deviceTest"));
            scenario.onActivity(activity -> assertEquals(0, activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
            js(scenario, "window.__deviceTest='waiting'; Capacitor.Plugins.EclaireDevice.setKeepScreenOn({enabled:true}).then(()=>window.__deviceTest='ok'); void 0");
            while (!"\"ok\"".equals(js(scenario, "window.__deviceTest")) && System.nanoTime() < deadline) Thread.sleep(200);
            assertEquals("\"ok\"", js(scenario, "window.__deviceTest"));
            scenario.moveToState(androidx.lifecycle.Lifecycle.State.STARTED);
            scenario.onActivity(activity -> assertEquals(0, activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON));
        }
    }

    @Test public void webViewFillsScreenAndReceivesSafeArea() throws Exception {
        assumeTrue(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O);
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            int top = 0;
            while (top == 0 && System.nanoTime() < deadline) {
                top = Integer.parseInt(js(scenario, "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top'))||0"));
                if (top == 0) Thread.sleep(200);
            }
            assertTrue("Le haut de la zone sûre doit être transmis à la page", top > 0);
            final int cssTop = top;
            final int cssLeft = inset(scenario, "left");
            final int cssRight = inset(scenario, "right");
            final int cssBottom = inset(scenario, "bottom");
            scenario.onActivity(activity -> {
                View decor = activity.getWindow().getDecorView();
                WebView webView = activity.getBridge().getWebView();
                int[] position = new int[2];
                webView.getLocationOnScreen(position);
                assertEquals(0, position[0]);
                assertEquals(0, position[1]);
                assertEquals(decor.getWidth(), webView.getWidth());
                assertEquals(decor.getHeight(), webView.getHeight());
                WindowInsetsCompat insets = WindowInsetsCompat.toWindowInsetsCompat(decor.getRootWindowInsets(), decor);
                androidx.core.graphics.Insets safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                float density = activity.getResources().getDisplayMetrics().density;
                assertEquals(Math.round(safe.top / density), cssTop, 1);
                assertEquals(Math.round(safe.left / density), cssLeft, 1);
                assertEquals(Math.round(safe.right / density), cssRight, 1);
                assertEquals(Math.round(safe.bottom / density), cssBottom, 1);
            });
        }
    }

    private int inset(ActivityScenario<MainActivity> scenario, String side) throws Exception {
        return Integer.parseInt(js(scenario, "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-" + side + "'))||0"));
    }

    private String js(ActivityScenario<MainActivity> scenario, String expression) throws Exception {
        AtomicReference<String> value = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        scenario.onActivity(activity -> activity.getBridge().getWebView().evaluateJavascript(expression, answer -> { value.set(answer); done.countDown(); }));
        assertTrue(done.await(5, TimeUnit.SECONDS));
        return value.get();
    }
}
