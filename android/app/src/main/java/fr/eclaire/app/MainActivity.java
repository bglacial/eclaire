package fr.eclaire.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.car.app.connection.CarConnection;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.app.PictureInPictureParams;
import android.app.PendingIntent;
import android.app.RemoteAction;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.util.Rational;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.webkit.WebView;
import android.widget.TextView;
import java.util.Locale;
import java.util.Arrays;

public class MainActivity extends BridgeActivity {
    AppUpdater updater;
    private PipGuidanceView pipView;
    private TextView projectionNotice;
    private boolean projected;
    private boolean pipEnabled, pipActive, pipVoice;
    private final Runnable guidanceChanged = this::updatePip;

    @Override protected void onCreate(android.os.Bundle state) {
        registerPlugin(EclaireDevice.class);
        registerPlugin(EclaireNavigation.class);
        super.onCreate(state);
        EdgeToEdge.enable(this);
        enableLegacyEdgeToEdge();
        updater = new AppUpdater(this);
        new CarConnection(this).getType().observe(this, type -> setProjected(Integer.valueOf(CarConnection.CONNECTION_TYPE_PROJECTION).equals(type)));
        CarGuidance.observe(guidanceChanged);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (projected) { moveTaskToBack(true); return; }
                getBridge().getWebView().evaluateJavascript("!window.dispatchEvent(new Event('eclaire-back', {cancelable:true}))", handled -> {
                    if ("true".equals(handled)) return;
                    setEnabled(false);
                    try { getOnBackPressedDispatcher().onBackPressed(); }
                    finally { setEnabled(true); }
                });
            }
        });
    }

    void setProjected(boolean connected) {
        if (projected == connected) return;
        projected = connected;
        if (connected && projectionNotice == null) {
            projectionNotice = new TextView(this);
            projectionNotice.setText("Utilisez Éclaire sur l’écran de la voiture.");
            projectionNotice.setTextSize(20);
            projectionNotice.setGravity(Gravity.CENTER);
            boolean night = (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
            projectionNotice.setBackgroundColor(night ? 0xff152019 : 0xfff5f9f5);
            projectionNotice.setTextColor(night ? 0xfff5f9f5 : 0xff152019);
            addContentView(projectionNotice, new android.view.ViewGroup.LayoutParams(-1, -1));
        }
        var webView = getBridge().getWebView();
        if (connected) {
            getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            getSystemService(InputMethodManager.class).hideSoftInputFromWindow(webView.getWindowToken(), 0);
        }
        webView.setVisibility(connected ? View.INVISIBLE : View.VISIBLE);
        if (projectionNotice != null) {
            projectionNotice.setVisibility(connected ? View.VISIBLE : View.GONE);
            if (connected) projectionNotice.bringToFront();
        }
        if (pipView != null) pipView.setVisibility(connected ? View.GONE : View.VISIBLE);
        updatePip();
    }

    private void enableLegacyEdgeToEdge() {
        // shortcut: Android 7.0–7.1 keeps Capacitor's inset fallback; extend if edge-to-edge is needed there.
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        PackageInfo webView = WebView.getCurrentWebViewPackage();
        if (webView == null || webView.versionName == null) return;
        try {
            if (Integer.parseInt(webView.versionName.split("\\.")[0]) >= 140) return;
        } catch (NumberFormatException ignored) { return; }

        View decor = getWindow().getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (view, insets) -> {
            int system = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets safe = insets.getInsets(system);
            boolean keyboard = insets.isVisible(WindowInsetsCompat.Type.ime());
            view.setPadding(0, 0, 0, keyboard ? insets.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0);
            float density = getResources().getDisplayMetrics().density;
            String css = String.format(Locale.US,
                "(()=>{if(!document.documentElement)return;const s=document.documentElement.style;s.setProperty('--safe-area-inset-top','%dpx');s.setProperty('--safe-area-inset-right','%dpx');s.setProperty('--safe-area-inset-bottom','%dpx');s.setProperty('--safe-area-inset-left','%dpx');})()",
                Math.round(safe.top / density), Math.round(safe.right / density), keyboard ? 0 : Math.round(safe.bottom / density), Math.round(safe.left / density));
            getBridge().getWebView().evaluateJavascript(css, null);
            return new WindowInsetsCompat.Builder(insets).setInsets(system, Insets.NONE).build();
        });
        getBridge().addWebViewListener(new WebViewListener() {
            @Override public void onPageCommitVisible(WebView view, String url) { ViewCompat.requestApplyInsets(decor); }
        });
        ViewCompat.requestApplyInsets(decor);
    }

    boolean pipSupported() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getPackageManager().hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE);
    }

    boolean pipAutomatic() { return getPreferences(MODE_PRIVATE).getBoolean("pipAutomatic", true); }

    void setPipAutomatic(boolean enabled) {
        getPreferences(MODE_PRIVATE).edit().putBoolean("pipAutomatic", enabled).apply();
        updatePip();
    }

    PictureInPictureParams pipParams(CarGuidance.Snapshot state) {
        var builder = new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9));
        if (state != null) {
            var voice = PendingIntent.getService(this, 2, new Intent(this, NavigationService.class).setAction("voice"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            var stop = PendingIntent.getService(this, 1, new Intent(this, NavigationService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            String label = state.voice() ? "Couper la voix" : "Activer la voix";
            builder.setActions(Arrays.asList(new RemoteAction(Icon.createWithResource(this, state.voice() ? android.R.drawable.ic_lock_silent_mode : android.R.drawable.ic_lock_silent_mode_off), label, label, voice),
                    new RemoteAction(Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel), "Arrêter le guidage", "Arrêter le guidage", stop)));
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) builder.setAutoEnterEnabled(state != null && pipAutomatic() && !projected).setSeamlessResizeEnabled(false);
        return builder.build();
    }

    void updatePip() {
        var state = CarGuidance.current();
        if (pipView != null) pipView.update(state);
        if (!pipSupported()) return;
        boolean active = state != null && !projected, enabled = active && pipAutomatic(), voice = active && state.voice();
        if (pipEnabled == enabled && pipActive == active && pipVoice == voice) return;
        pipEnabled = enabled; pipActive = active; pipVoice = voice;
        setPictureInPictureParams(pipParams(projected ? null : state));
    }

    boolean enterPip() {
        if (projected || !pipSupported() || CarGuidance.current() == null) return false;
        try { return enterPictureInPictureMode(pipParams(CarGuidance.current())); }
        catch (IllegalStateException | SecurityException ignored) { return false; }
    }

    @Override public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && Build.VERSION.SDK_INT < Build.VERSION_CODES.S && pipEnabled) enterPip();
    }

    @Override public void onPictureInPictureModeChanged(boolean inPip, Configuration configuration) {
        super.onPictureInPictureModeChanged(inPip, configuration);
        if (inPip && pipView == null) {
            pipView = new PipGuidanceView(this);
            addContentView(pipView, new android.view.ViewGroup.LayoutParams(-1, -1));
            if (projected) pipView.setVisibility(View.GONE);
            pipView.update(CarGuidance.current());
        } else if (!inPip && pipView != null) {
            pipView.close();
            ((android.view.ViewGroup) pipView.getParent()).removeView(pipView);
            pipView = null;
        }
    }

    @Override public void onResume() {
        super.onResume();
        if (updater != null && !projected) updater.onResume();
    }

    @Override public void onPause() {
        getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        super.onPause();
    }

    @Override public void onDestroy() {
        CarGuidance.remove(guidanceChanged);
        if (pipView != null) { pipView.close(); pipView = null; }
        if (updater != null) updater.close();
        super.onDestroy();
    }
}
