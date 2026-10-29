package fr.eclaire.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import androidx.activity.EdgeToEdge;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.view.View;
import android.webkit.WebView;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    AppUpdater updater;

    @Override protected void onCreate(android.os.Bundle state) {
        registerPlugin(EclaireDevice.class);
        registerPlugin(EclaireNavigation.class);
        super.onCreate(state);
        EdgeToEdge.enable(this);
        enableLegacyEdgeToEdge();
        updater = new AppUpdater(this);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                getBridge().getWebView().evaluateJavascript("!window.dispatchEvent(new Event('eclaire-back', {cancelable:true}))", handled -> {
                    if ("true".equals(handled)) return;
                    setEnabled(false);
                    try { getOnBackPressedDispatcher().onBackPressed(); }
                    finally { setEnabled(true); }
                });
            }
        });
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
                "(()=>{const s=document.documentElement.style;s.setProperty('--safe-area-inset-top','%dpx');s.setProperty('--safe-area-inset-right','%dpx');s.setProperty('--safe-area-inset-bottom','%dpx');s.setProperty('--safe-area-inset-left','%dpx');})()",
                Math.round(safe.top / density), Math.round(safe.right / density), keyboard ? 0 : Math.round(safe.bottom / density), Math.round(safe.left / density));
            getBridge().getWebView().evaluateJavascript(css, null);
            return new WindowInsetsCompat.Builder(insets).setInsets(system, Insets.NONE).build();
        });
        getBridge().addWebViewListener(new WebViewListener() {
            @Override public void onPageCommitVisible(WebView view, String url) { ViewCompat.requestApplyInsets(decor); }
        });
        ViewCompat.requestApplyInsets(decor);
    }

    @Override public void onResume() {
        super.onResume();
        if (updater != null) updater.onResume();
    }

    @Override public void onPause() {
        getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        super.onPause();
    }

    @Override public void onDestroy() {
        if (updater != null) updater.close();
        super.onDestroy();
    }
}
