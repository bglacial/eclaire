package fr.eclaire.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import javax.net.ssl.HttpsURLConnection;

final class AppUpdater {
    private static final String RELEASES = "https://api.github.com/repos/bglacial/eclaire/releases?per_page=30";
    private static final long CHECK_INTERVAL = 6 * 60 * 60 * 1000L;
    private static final long MAX_APK_SIZE = 100L * 1024 * 1024;
    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean checking;
    private File pending;

    AppUpdater(Activity activity) { this.activity = activity; }

    void onResume() {
        String waiting = activity.getPreferences(Activity.MODE_PRIVATE).getString("update_pending", null);
        if (waiting != null) {
            activity.getPreferences(Activity.MODE_PRIVATE).edit().remove("update_pending").apply();
            if (waiting.startsWith("eclaire-update-") && waiting.endsWith(".apk") && !waiting.contains("/")) pending = new File(activity.getCacheDir(), waiting);
            if (pending != null && pending.isFile() && (Build.VERSION.SDK_INT < 26 || activity.getPackageManager().canRequestPackageInstalls())) install();
            else { if (pending != null) pending.delete(); pending = null; toast("Autorisation d’installation non accordée."); }
            return;
        }
        long last = activity.getPreferences(Activity.MODE_PRIVATE).getLong("update_check", 0);
        if (checking || System.currentTimeMillis() - last < CHECK_INTERVAL) return;
        checking = true;
        worker.execute(() -> {
            try {
                ReleaseVersion installed = ReleaseVersion.parse(activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName);
                if (installed == null) return;
                JSONArray releases = new JSONArray(new String(read(RELEASES, 1024 * 1024), StandardCharsets.UTF_8));
                ReleaseVersion newest = installed;
                String download = null;
                for (int i = 0; i < releases.length(); i++) {
                    JSONObject release = releases.getJSONObject(i);
                    if (release.optBoolean("draft", true)) continue;
                    String tag = release.optString("tag_name", "");
                    ReleaseVersion candidate = ReleaseVersion.parse(tag);
                    if (candidate == null || candidate.compareTo(newest) <= 0) continue;
                    JSONArray assets = release.optJSONArray("assets");
                    if (assets == null) continue;
                    for (int j = 0; j < assets.length(); j++) {
                        JSONObject asset = assets.getJSONObject(j);
                        String expected = candidate.assetUrl(tag, asset.optString("name"), asset.optString("state"), asset.optString("browser_download_url"));
                        if (expected != null) { newest = candidate; download = expected; break; }
                    }
                }
                activity.getPreferences(Activity.MODE_PRIVATE).edit().putLong("update_check", System.currentTimeMillis()).apply();
                if (download != null) {
                    String url = download, version = newest.name;
                    activity.runOnUiThread(() -> {
                        if (activity.isFinishing() || activity.isDestroyed()) return;
                        new AlertDialog.Builder(activity).setTitle("Mise à jour disponible")
                                .setMessage("Éclaire " + version + " est disponible sur GitHub.")
                                .setNegativeButton("Plus tard", null)
                                .setPositiveButton("Mettre à jour", (dialog, which) -> download(url)).show();
                    });
                }
            } catch (Exception ignored) {
                // Une vérification réseau échouée sera retentée à la prochaine ouverture.
            } finally { checking = false; }
        });
    }

    private void download(String url) {
        toast("Téléchargement de la mise à jour…");
        worker.execute(() -> {
            File file = null;
            try {
                file = File.createTempFile("eclaire-update-", ".apk", activity.getCacheDir());
                try (InputStream in = open(url); FileOutputStream out = new FileOutputStream(file)) {
                    byte[] buffer = new byte[32 * 1024]; long total = 0; int count;
                    while ((count = in.read(buffer)) != -1) {
                        total += count;
                        if (total > MAX_APK_SIZE) throw new IOException("APK trop volumineux");
                        out.write(buffer, 0, count);
                    }
                }
                if (!validUpdate(file)) throw new IOException("APK incompatible");
                File downloaded = file;
                activity.runOnUiThread(() -> {
                    if (activity.isFinishing() || activity.isDestroyed()) { downloaded.delete(); return; }
                    pending = downloaded;
                    if (Build.VERSION.SDK_INT >= 26 && !activity.getPackageManager().canRequestPackageInstalls()) {
                        new AlertDialog.Builder(activity).setTitle("Autoriser l’installation")
                                .setMessage("Android demande votre autorisation pour installer la mise à jour d’Éclaire.")
                                .setNegativeButton("Annuler", (dialog, which) -> { pending = null; downloaded.delete(); })
                                .setPositiveButton("Ouvrir les réglages", (dialog, which) -> {
                                    activity.getPreferences(Activity.MODE_PRIVATE).edit().putString("update_pending", downloaded.getName()).apply();
                                    try { activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName()))); }
                                    catch (RuntimeException error) {
                                        activity.getPreferences(Activity.MODE_PRIVATE).edit().remove("update_pending").apply();
                                        downloaded.delete(); pending = null; toast("Impossible d’ouvrir les réglages Android.");
                                    }
                                }).show();
                    } else install();
                });
            } catch (Exception error) {
                if (file != null) file.delete();
                activity.runOnUiThread(() -> toast("Mise à jour indisponible ou incompatible. Réessayez plus tard."));
            }
        });
    }

    private boolean validUpdate(File file) throws PackageManager.NameNotFoundException {
        PackageManager manager = activity.getPackageManager();
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo installed = manager.getPackageInfo(activity.getPackageName(), flags);
        PackageInfo update = manager.getPackageArchiveInfo(file.getAbsolutePath(), flags);
        if (update == null || !activity.getPackageName().equals(update.packageName)) return false;
        long installedCode = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        long updateCode = Build.VERSION.SDK_INT >= 28 ? update.getLongVersionCode() : update.versionCode;
        Signature[] current = Build.VERSION.SDK_INT >= 28 ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
        Signature[] next = Build.VERSION.SDK_INT >= 28 && update.signingInfo != null ? update.signingInfo.getApkContentsSigners() : update.signatures;
        return updateCode > installedCode && current != null && current.length > 0 && Arrays.equals(current, next);
    }

    private void install() {
        if (pending == null || activity.isFinishing() || activity.isDestroyed()) return;
        try {
            Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", pending);
            Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(intent);
            pending = null;
        } catch (RuntimeException error) { toast("Impossible d’ouvrir l’installation Android."); }
    }

    private static InputStream open(String address) throws IOException {
        for (int redirects = 0; redirects < 6; redirects++) {
            URL url = new URL(address);
            if (!ReleaseVersion.trustedHost(url)) throw new IOException("Hôte non autorisé");
            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(10_000); connection.setReadTimeout(20_000);
            connection.setRequestProperty("User-Agent", "Eclaire-Android"); connection.setRequestProperty("Accept", "application/vnd.github+json");
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) {
                String location = connection.getHeaderField("Location"); connection.disconnect();
                if (location == null) throw new IOException("Redirection invalide");
                address = new URL(url, location).toString(); continue;
            }
            if (status != 200) { connection.disconnect(); throw new IOException("Téléchargement indisponible"); }
            return connection.getInputStream();
        }
        throw new IOException("Trop de redirections");
    }

    private static byte[] read(String url, int limit) throws IOException {
        try (InputStream in = open(url); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count;
            while ((count = in.read(buffer)) != -1) { if (out.size() + count > limit) throw new IOException("Réponse trop volumineuse"); out.write(buffer, 0, count); }
            return out.toByteArray();
        }
    }

    private void toast(String message) { if (!activity.isFinishing() && !activity.isDestroyed()) Toast.makeText(activity, message, Toast.LENGTH_LONG).show(); }
    void close() { worker.shutdownNow(); }
}
