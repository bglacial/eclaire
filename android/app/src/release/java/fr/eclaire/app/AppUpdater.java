package fr.eclaire.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import java.util.function.Consumer;

final class AppUpdater {
    private final Activity activity;

    AppUpdater(Activity activity) { this.activity = activity; }

    void onResume() { }
    void close() { }

    JSObject updateStatus() {
        return new JSObject().put("lastCheckedAt", 0).put("checking", false).put("status", "store");
    }

    void check(boolean force, Consumer<JSObject> completed) {
        var state = updateStatus();
        try {
            activity.startActivity(new Intent(Intent.ACTION_VIEW,
                    Uri.parse("https://play.google.com/store/apps/details?id=" + activity.getPackageName())));
        } catch (RuntimeException error) { state.put("status", "error"); }
        if (completed != null) completed.accept(state);
    }
}
