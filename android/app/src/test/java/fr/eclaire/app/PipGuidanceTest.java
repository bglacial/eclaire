package fr.eclaire.app;

import static org.junit.Assert.*;
import android.content.pm.PackageInfo;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;
import com.getcapacitor.CapConfig;
import java.util.List;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowWebView;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class PipGuidanceTest {
    public static class TestActivity extends MainActivity {
        @Override protected void onCreate(Bundle savedInstanceState) {
            config = new CapConfig.Builder(this).setResolveServiceWorkerRequests(false).create();
            super.onCreate(savedInstanceState);
        }
    }

    @Test public void androidAutoProjectionSuspendsTheInteractivePhoneViewUntilDisconnect() {
        var webViewPackage = new PackageInfo();
        webViewPackage.packageName = "com.android.webview";
        webViewPackage.versionName = "150";
        ShadowWebView.setCurrentWebViewPackage(webViewPackage);
        var controller = Robolectric.buildActivity(TestActivity.class).create();
        try {
            var activity = controller.get();
            var webView = activity.getBridge().getWebView();
            activity.setProjected(true);
            assertEquals(View.INVISIBLE, webView.getVisibility());
            assertFalse(activity.enterPip());
            activity.setProjected(false);
            assertEquals(View.VISIBLE, webView.getVisibility());
        } finally { controller.destroy(); }
    }

    @Test public void compactViewFollowsLiveGuidanceAndReportsItsEnd() {
        var view = new PipGuidanceView(RuntimeEnvironment.getApplication());
        var route = new GuidanceTracker(List.of(new GuidanceTracker.Point(48, 2, 0, 0), new GuidanceTracker.Point(48.01, 2, 1000, 100)),
                List.of(new GuidanceTracker.Step(0, "Continuez"), new GuidanceTracker.Step(500, "Tournez")));
        try {
            view.update(new CarGuidance.Snapshot(route, null, null, "starting", "Recherche GPS", false));
            assertEquals("Recherche GPS", ((TextView) view.getChildAt(1)).getText().toString());
            var fix = new GuidanceTracker.Fix(48.005, 2, 5, 1000, 5.0, 0.0);
            var progress = new GuidanceTracker.State("on-route", 300, 30, 0, 1, 200);
            view.update(new CarGuidance.Snapshot(route, fix, progress, "on-route", "Dans 200 mètres, tournez", false));
            assertTrue(((TextView) view.getChildAt(1)).getText().toString().contains("Dans 200 mètres, tournez"));
            view.update(null);
            assertEquals("Guidage terminé", ((TextView) view.getChildAt(1)).getText().toString());
        } finally { view.close(); }
    }
}
