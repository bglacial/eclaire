package fr.eclaire.app;

import android.content.Intent;
import androidx.annotation.NonNull;
import androidx.car.app.CarAppService;
import androidx.car.app.Screen;
import androidx.car.app.Session;
import androidx.car.app.validation.HostValidator;

public final class EclaireCarService extends CarAppService {
    @NonNull @Override public HostValidator createHostValidator() {
        return new HostValidator.Builder(this).addAllowedHosts(androidx.car.app.R.array.hosts_allowlist_sample).build();
    }

    @NonNull @Override public Session onCreateSession() {
        return new Session() {
            @NonNull @Override public Screen onCreateScreen(@NonNull Intent intent) {
                return new CarNavigationScreen(getCarContext());
            }
        };
    }
}
