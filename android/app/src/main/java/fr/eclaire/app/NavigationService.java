package fr.eclaire.app;

import android.app.*;
import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.*;
import android.media.AudioManager;
import android.os.*;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;
import java.util.function.Consumer;

public final class NavigationService extends Service implements LocationListener {
    private static final String CHANNEL = "navigation";
    private static final int NOTIFICATION = 41;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private LocationManager locations;
    private TextToSpeech speech;
    private AudioManager audio;
    private final AudioManager.OnAudioFocusChangeListener focus = change -> { if (change < 0 && speech != null) silence(); };
    private boolean voice, speechReady, active;
    private GuidanceTracker tracker;
    private Consumer<JSObject> listener;
    private JSObject latest = new JSObject();
    private final Set<String> spoken = new HashSet<>();
    private String message = "Recherche de votre position…";
    private long lastGoodAt;
    public final class LocalBinder extends Binder { NavigationService service() { return NavigationService.this; } }
    @Override public IBinder onBind(Intent intent) { return new LocalBinder(); }

    @Override public void onCreate() {
        super.onCreate();
        locations = (LocationManager) getSystemService(LOCATION_SERVICE);
        audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(new NotificationChannel(CHANNEL, "Guidage GPS", NotificationManager.IMPORTANCE_LOW));
        ServiceCompat.startForeground(this, NOTIFICATION, notification(), Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION : 0);
        speech = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int language = speech.setLanguage(Locale.FRANCE);
                speechReady = language != TextToSpeech.LANG_MISSING_DATA && language != TextToSpeech.LANG_NOT_SUPPORTED;
                speech.setAudioAttributes(new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE).setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH).build());
            }
        });
        speech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { handler.post(() -> { audio.abandonAudioFocus(focus); if ("arrived".equals(id)) finishArrival(); }); }
            @Override public void onError(String id) { handler.post(() -> { audio.abandonAudioFocus(focus); if ("arrived".equals(id)) finishArrival(); }); }
        });
    }

    void start(GuidanceTracker route, boolean enabled, Consumer<JSObject> events) {
        tracker = route; voice = enabled; listener = events; active = true; lastGoodAt = System.currentTimeMillis();
        try {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED)
                throw new SecurityException("Localisation précise non autorisée.");
            boolean requested = false;
            for (String provider : new String[] { LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER }) if (locations.isProviderEnabled(provider)) {
                locations.requestLocationUpdates(provider, 1000, 0, this, Looper.getMainLooper()); requested = true;
            }
            if (!requested) throw new IllegalStateException("Activez la localisation du téléphone.");
            CarGuidance.update(new CarGuidance.Snapshot(tracker, null, null, "starting", message));
            handler.post(checkSignal);
        } catch (RuntimeException error) { stopSelf(); throw error; }
    }

    void setVoice(boolean enabled) { voice = enabled; if (!enabled) silence(); }
    JSObject state() { return latest; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) {
            active = false; locations.removeUpdates(this); handler.removeCallbacksAndMessages(null); silence();
            publish("stopped", false, null, null); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf();
        }
        return START_NOT_STICKY;
    }
    @Override public void onTaskRemoved(Intent rootIntent) { stopSelf(); }

    private final Runnable checkSignal = new Runnable() {
        @Override public void run() {
            if (!active) return;
            if (System.currentTimeMillis() - lastGoodAt > 15000) { message = "Signal GPS perdu. Indications suspendues."; silence(); publish("uncertain", true, null, null); updateNotification(); }
            handler.postDelayed(this, 1000);
        }
    };

    @Override public void onLocationChanged(Location location) {
        if (!active) return;
        var fix = new GuidanceTracker.Fix(location.getLatitude(), location.getLongitude(), location.hasAccuracy() ? location.getAccuracy() : Double.POSITIVE_INFINITY, location.getTime(), location.hasSpeed() ? (double) location.getSpeed() : null, location.hasBearing() ? (double) location.getBearing() : null);
        var progress = tracker.update(fix, System.currentTimeMillis());
        if (progress.status().equals("uncertain") && System.currentTimeMillis() - lastGoodAt <= 3000) return;
        if (!progress.status().equals("uncertain")) lastGoodAt = System.currentTimeMillis();
        boolean onRoute = progress.status().equals("on-route") || progress.status().equals("arrived");
        if (onRoute) {
            message = progress.status().equals("arrived") ? "Vous êtes arrivé au point routier." : (progress.toTurn() < 20 ? "Maintenant, " : "Dans " + distance(progress.toTurn()) + ", ") + tracker.steps.get(progress.nextIndex()).text();
            String key = progress.status().equals("arrived") ? "arrived" : progress.nextIndex() + ":" + (progress.toTurn() < 35 ? "now" : progress.toTurn() < 200 ? "near" : "far");
            if (voice && speechReady && !spoken.contains(key) && audio.requestAudioFocus(focus, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
                if (speech.speak(message, TextToSpeech.QUEUE_FLUSH, null, key) == TextToSpeech.SUCCESS) spoken.add(key);
                else audio.abandonAudioFocus(focus);
            }
        } else {
            silence();
            message = switch (progress.status()) {
                case "approach" -> "Rejoignez le point routier par une voie accessible.";
                case "off-route" -> "Hors du trajet. Ouvrez Éclaire pour reprendre le guidage.";
                default -> "En attente d’un signal GPS précis.";
            };
        }
        boolean arrived = progress.status().equals("arrived");
        publish(progress.status(), !arrived, progress.status().equals("uncertain") ? null : fix, onRoute ? progress : null); updateNotification();
        if (arrived) {
            active = false; locations.removeUpdates(this); handler.removeCallbacks(checkSignal);
            if (!voice || !speechReady) finishArrival();
            else handler.postDelayed(this::finishArrival, 20000);
        }
    }

    private void finishArrival() { audio.abandonAudioFocus(focus); speech.shutdown(); speechReady = false; handler.removeCallbacksAndMessages(null); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf(); }
    private void silence() { speech.stop(); audio.abandonAudioFocus(focus); }

    private static String distance(double metres) { return metres >= 1000 ? String.format(Locale.FRANCE, "%.1f kilomètres", metres / 1000) : Math.max(0, Math.round(metres / 10) * 10) + " mètres"; }
    private void publish(String status, boolean running, GuidanceTracker.Fix fix, GuidanceTracker.State progress) {
        var event = new JSObject().put("active", running).put("status", status);
        if (fix != null) event.put("fix", new JSObject().put("lat", fix.lat()).put("lon", fix.lon()).put("accuracy", fix.accuracy()).put("timestamp", fix.timestamp()).put("speed", fix.speed()).put("heading", fix.heading()));
        if (progress != null) event.put("match", new JSObject().put("at", progress.at()).put("seconds", progress.seconds()).put("distance", progress.distance()));
        latest = event;
        CarGuidance.update(running ? new CarGuidance.Snapshot(tracker, fix, progress, status, message) : null);
        if (listener != null) listener.accept(event);
    }

    private Notification notification() {
        var open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        var stop = PendingIntent.getService(this, 1, new Intent(this, NavigationService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CHANNEL).setSmallIcon(R.drawable.ic_navigation).setContentTitle("Éclaire · Guidage GPS").setContentText(message).setStyle(new NotificationCompat.BigTextStyle().bigText(message)).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setCategory(NotificationCompat.CATEGORY_NAVIGATION).addAction(0, "Arrêter le guidage", stop).build();
    }
    private void updateNotification() { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION, notification()); }
    @Override public void onProviderDisabled(String provider) { message = "Localisation désactivée. Vérifiez les réglages du téléphone."; silence(); publish("uncertain", active, null, null); updateNotification(); }

    @Override public void onDestroy() {
        active = false; handler.removeCallbacksAndMessages(null); locations.removeUpdates(this);
        speech.stop(); speech.shutdown(); audio.abandonAudioFocus(focus);
        if (!"arrived".equals(latest.optString("status"))) publish("stopped", false, null, null);
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
}
