package fr.eclaire.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Screen;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

public final class EclaireCarService extends CarAppService {
    @NonNull @Override public HostValidator createHostValidator() {
        return new HostValidator.Builder(this).addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample).build();
    }

    @NonNull @Override public Session onCreateSession() {
        return new Session() {
            private CarNavigationScreen screen;

            @NonNull @Override public Screen onCreateScreen(@NonNull Intent intent) {
                screen = new CarNavigationScreen(getCarContext(), EclaireCarService.this::enableLocation,
                        () -> stopForeground(STOP_FOREGROUND_REMOVE));
                if (CarNavigationScreen.navigationQuery(intent) != null) screen.searchOnStart(intent);
                return screen;
            }

            @Override public void onNewIntent(@NonNull Intent intent) { screen.openNavigationRequest(intent); }
        };
    }

    private void enableLocation() {
        String channel = "car-location";
        if (Build.VERSION.SDK_INT >= 26) getSystemService(NotificationManager.class).createNotificationChannel(
                new NotificationChannel(channel, "Départ Android Auto", NotificationManager.IMPORTANCE_LOW));
        var notification = new NotificationCompat.Builder(this, channel).setSmallIcon(R.drawable.ic_navigation)
                .setContentTitle("Éclaire · Android Auto").setContentText("Recherche de votre position de départ")
                .setOngoing(true).build();
        // The host binds this service. Promote it before requesting a fix with the phone locked.
        ServiceCompat.startForeground(this, 42, notification, Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
    }
}
