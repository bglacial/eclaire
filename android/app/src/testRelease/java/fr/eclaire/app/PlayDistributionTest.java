package fr.eclaire.app;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class PlayDistributionTest {
    @Test public void releaseUsesPlayAndCannotRequestApkInstallation() throws Exception {
        var context = RuntimeEnvironment.getApplication();
        var info = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS);
        assertFalse(java.util.Arrays.asList(info.requestedPermissions).contains("android.permission.REQUEST_INSTALL_PACKAGES"));
        try (var controller = Robolectric.buildActivity(Activity.class).setup()) {
            var activity = controller.get();
            var updater = new AppUpdater(activity);
            updater.onResume();
            assertNull(shadowOf(activity).getNextStartedActivity());
            assertEquals("store", updater.updateStatus().getString("status"));
            updater.check(true, result -> assertEquals("store", result.getString("status")));
            var intent = shadowOf(activity).getNextStartedActivity();
            assertEquals(Intent.ACTION_VIEW, intent.getAction());
            assertEquals("https://play.google.com/store/apps/details?id=" + context.getPackageName(), intent.getDataString());
            updater.close();
        }
    }
}
