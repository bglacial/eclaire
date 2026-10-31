package fr.eclaire.app;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.*;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.Lifecycle;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.util.ArrayList;

@CapacitorPlugin(name = "EclaireNavigation", permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class EclaireNavigation extends Plugin {
    private NavigationService service;
    private PluginCall pending;
    private GuidanceTracker route;
    private JSONObject routeWire;
    private NativeRouting.Config routing;
    private boolean bound;
    private JSObject latest = new JSObject().put("active", false).put("status", "stopped");
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            service = ((NavigationService.LocalBinder) binder).service();
            PluginCall call = pending; pending = null;
            if (call == null) { close(); return; }
            try {
                service.start(route, Boolean.TRUE.equals(call.getBoolean("voice", false)), event -> { latest = event; notifyListeners("location", event); }, routeWire, routing);
                latest = new JSObject().put("active", true).put("status", "starting");
                call.resolve();
            } catch (RuntimeException error) { close(); call.reject("Impossible de démarrer le GPS. Vérifiez la localisation et ses autorisations.", error); }
        }
        @Override public void onServiceDisconnected(ComponentName name) { service = null; latest = new JSObject().put("active", false).put("status", "stopped"); notifyListeners("location", latest); }
    };

    @PluginMethod public void start(PluginCall call) {
        try {
            var data = call.getObject("route");
            if (data == null) throw new IllegalArgumentException();
            route = GuidanceTracker.fromJson(data);
            routeWire = data;
            var config = call.getObject("routing");
            routing = config == null ? null : NativeRouting.Config.fromJson(config);
            if (routing != null && routing.viaAt() != null && routing.viaAt() >= route.points.get(route.points.size() - 1).at()) throw new IllegalArgumentException("Étape hors du trajet.");
        } catch (JSONException | IllegalArgumentException error) { call.reject("Parcours de guidage invalide."); return; }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) { requestPermissionForAlias("notifications", call, "notificationsResult"); return; }
        begin(call);
    }
    @PermissionCallback private void notificationsResult(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) { call.reject("Autorisez les notifications d’Éclaire pour afficher et arrêter le guidage en arrière-plan."); return; }
        begin(call);
    }
    private void begin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pending != null || bound) { call.reject("Un guidage est déjà actif."); return; }
            if (!getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.RESUMED)) { call.reject("Ouvrez Éclaire pour démarrer le guidage."); return; }
            if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { call.reject("Autorisez la localisation précise dans les réglages du téléphone."); return; }
            try {
                var intent = new Intent(getContext(), NavigationService.class);
                pending = call;
                ContextCompat.startForegroundService(getContext(), intent);
                bound = getContext().bindService(intent, connection, Context.BIND_AUTO_CREATE);
                if (!bound) throw new IllegalStateException();
            } catch (RuntimeException error) { pending = null; close(); call.reject("Impossible de démarrer le guidage en arrière-plan.", error); }
        });
    }
    @PluginMethod public void getState(PluginCall call) { getActivity().runOnUiThread(() -> call.resolve(service == null ? latest : service.state())); }
    @PluginMethod public void setVoice(PluginCall call) { getActivity().runOnUiThread(() -> { if (service != null) service.setVoice(Boolean.TRUE.equals(call.getBoolean("enabled", false))); call.resolve(); }); }
    @PluginMethod public void stop(PluginCall call) { getActivity().runOnUiThread(() -> { close(); call.resolve(); }); }
    private void close() {
        if (bound) { getContext().unbindService(connection); bound = false; }
        getContext().stopService(new Intent(getContext(), NavigationService.class)); service = null; route = null; routeWire = null; routing = null;
        latest = new JSObject().put("active", false).put("status", "stopped");
    }
    @Override protected void handleOnDestroy() { getActivity().runOnUiThread(this::close); }
}
