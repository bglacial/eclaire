package fr.eclaire.app;

import android.view.WindowManager;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "EclaireDevice")
public class EclaireDevice extends Plugin {
    @PluginMethod public void setKeepScreenOn(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { call.reject("Missing enabled"); return; }
        getActivity().runOnUiThread(() -> {
            if (enabled && !getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) { call.reject("Activity not visible"); return; }
            if (enabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            call.resolve();
        });
    }

    @PluginMethod public void getVersion(PluginCall call) {
        try {
            JSObject result = new JSObject();
            result.put("version", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
            call.resolve(result);
        } catch (Exception error) { call.reject("Version unavailable", error); }
    }
}
