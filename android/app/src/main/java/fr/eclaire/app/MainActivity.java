package fr.eclaire.app;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private AppUpdater updater;

    @Override protected void onCreate(android.os.Bundle state) {
        super.onCreate(state);
        updater = new AppUpdater(this);
    }

    @Override public void onResume() {
        super.onResume();
        if (updater != null) updater.onResume();
    }

    @Override public void onDestroy() {
        if (updater != null) updater.close();
        super.onDestroy();
    }
}
