package fr.eclaire.app;

import android.graphics.Bitmap;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.net.http.HttpResponseCache;
import android.os.Handler;
import android.os.Looper;
import android.util.LruCache;
import android.view.Surface;
import androidx.annotation.NonNull;
import androidx.car.app.SurfaceCallback;
import androidx.car.app.SurfaceContainer;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class CarMap implements SurfaceCallback {
    private static final int TILE = 256;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Context context;
    private final ExecutorService worker = Executors.newFixedThreadPool(2);
    private final LruCache<String, Bitmap> tiles = new LruCache<>(64);
    private final LruCache<String, Long> retryAfter = new LruCache<>(128);
    private final Set<String> pending = new HashSet<>();
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private Surface surface;
    private int width, height;
    private float density = 1;
    private Rect visible = new Rect();
    private CarGuidance.Snapshot state;
    private GuidanceTracker.Fix lastFix;
    private final GuidanceMotion motion = new GuidanceMotion();
    private final Runnable animate = this::draw;
    private double heading;
    private boolean headingReady;
    private boolean closed;

    CarMap(Context context) { this.context = context; }

    @Override public void onSurfaceAvailable(@NonNull SurfaceContainer container) {
        if (surface != null && surface != container.getSurface()) surface.release();
        surface = container.getSurface(); width = container.getWidth(); height = container.getHeight();
        density = container.getDpi() > 0 ? container.getDpi() / 160f : 1;
        draw();
    }
    @Override public void onVisibleAreaChanged(@NonNull Rect area) { visible = new Rect(area); draw(); }
    @Override public void onSurfaceDestroyed(@NonNull SurfaceContainer container) {
        Surface destroyed = container.getSurface();
        if (destroyed != null) destroyed.release();
        if (surface == destroyed) surface = null;
    }
    void update(CarGuidance.Snapshot value) {
        motion.update(value, System.currentTimeMillis());
        state = value;
        if (value == null) { lastFix = null; headingReady = false; }
        else if (value.fix() != null) lastFix = value.fix();
        draw();
    }
    void close() {
        closed = true; worker.shutdownNow();
        main.removeCallbacks(animate);
        if (surface != null) surface.release();
        surface = null;
    }

    private static boolean reducedMotion() { return android.os.Build.VERSION.SDK_INT >= 26 && !ValueAnimator.areAnimatorsEnabled(); }
    GuidanceMotion.Position position(long now) { return motion.position(now, reducedMotion()); }

    private static double x(double lon, int zoom) { return (lon + 180) / 360 * (1 << zoom) * TILE; }
    private static double y(double lat, int zoom) {
        double radians = Math.toRadians(Math.max(-85.05112878, Math.min(85.05112878, lat)));
        return (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * (1 << zoom) * TILE;
    }
    private void draw() {
        if (closed || surface == null || !surface.isValid()) return;
        Canvas canvas = null;
        try {
            canvas = surface.lockCanvas(null);
            canvas.drawColor(Color.rgb(235, 239, 238));
            if (state == null || lastFix == null) return;
            canvas.scale(density, density);
            Rect area = visible.isEmpty() ? new Rect(0, 0, width, height) : visible;
            float cx = area.exactCenterX() / density, cy = area.exactCenterY() / density;
            long now = System.currentTimeMillis();
            var position = position(now);
            var progress = state.progress() != null ? state.progress() : motion.progress();
            int zoom = progress != null && progress.toTurn() < 200 ? 17 : 16;
            double lat = position == null ? lastFix.lat() : position.lat(), lon = position == null ? lastFix.lon() : position.lon();
            double ox = x(lon, zoom) - cx, oy = y(lat, zoom) - cy;
            if (position != null) {
                if (!headingReady) { heading = position.heading(); headingReady = true; }
                else heading = (heading + ((position.heading() - heading + 540) % 360 - 180) * (reducedMotion() ? 1 : 0.2) + 360) % 360;
            }
            canvas.save();
            canvas.rotate((float) -heading, cx, cy);
            double radius = Math.hypot(Math.max(cx, width / density - cx), Math.max(cy, height / density - cy));
            int minX = (int) Math.floor((ox + cx - radius) / TILE), maxX = (int) Math.floor((ox + cx + radius) / TILE);
            int minY = (int) Math.floor((oy + cy - radius) / TILE), maxY = (int) Math.floor((oy + cy + radius) / TILE);
            for (int tx = minX; tx <= maxX; tx++) for (int ty = minY; ty <= maxY; ty++) {
                int wrappedX = Math.floorMod(tx, 1 << zoom);
                if (ty < 0 || ty >= (1 << zoom)) continue;
                String key = zoom + "/" + wrappedX + "/" + ty;
                Bitmap tile = tiles.get(key);
                if (tile == null) fetch(key);
                else { paint.setAlpha(255); canvas.drawBitmap(tile, (float) (tx * TILE - ox), (float) (ty * TILE - oy), paint); }
            }
            Path path = new Path(); boolean started = false;
            var points = state.route().points;
            double at = progress == null ? ("approach".equals(state.status()) ? 0 : -1) : progress.at();
            int first = 0;
            if (at >= 0) {
                int high = points.size();
                while (first < high) { int mid = (first + high) >>> 1; if (points.get(mid).at() < at - 3000) first = mid + 1; else high = mid; }
                first = Math.max(0, first - 1);
            }
            for (int i = first; at >= 0 && i < points.size(); i++) {
                var point = points.get(i);
                if (at >= 0 && point.at() > at + 3000) break;
                float px = (float) (x(point.lon(), zoom) - ox), py = (float) (y(point.lat(), zoom) - oy);
                if (!started) { path.moveTo(px, py); started = true; } else path.lineTo(px, py);
            }
            paint.setColor(Color.rgb(0, 113, 200)); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(7); paint.setStrokeJoin(Paint.Join.ROUND);
            canvas.drawPath(path, paint); paint.setStyle(Paint.Style.FILL);
            canvas.restore();
            if (position != null) {
                Path marker = new Path(); marker.moveTo(cx, cy - 14); marker.lineTo(cx + 10, cy + 10); marker.lineTo(cx, cy + 6); marker.lineTo(cx - 10, cy + 10); marker.close();
                paint.setColor(Color.WHITE); paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(3); canvas.drawPath(marker, paint);
                paint.setStyle(Paint.Style.FILL); paint.setColor(position.estimated() ? Color.rgb(190, 100, 0) : Color.rgb(0, 90, 190)); canvas.drawPath(marker, paint);
            }
            paint.setColor(Color.DKGRAY); paint.setTextSize(16); canvas.drawText("© OpenStreetMap contributors", area.left / density + 8, area.bottom / density - 8, paint);
        } catch (IllegalArgumentException | IllegalStateException ignored) {
            // The host can destroy its surface while it is being drawn.
        } finally {
            if (canvas != null) surface.unlockCanvasAndPost(canvas);
            main.removeCallbacks(animate);
            if (!closed && surface != null && !reducedMotion() && motion.moving(System.currentTimeMillis())) main.postDelayed(animate, 33);
        }
    }
    private void fetch(String key) {
        Long retry = retryAfter.get(key);
        if ((retry != null && android.os.SystemClock.elapsedRealtime() < retry) || !pending.add(key)) return;
        worker.execute(() -> {
            Bitmap result = null;
            try {
                try { synchronized (CarMap.class) {
                    if (HttpResponseCache.getInstalled() == null) HttpResponseCache.install(new java.io.File(context.getCacheDir(), "car-map-tiles"), 32L * 1024 * 1024);
                } } catch (java.io.IOException ignored) { }
                var connection = (HttpURLConnection) new URL("https://tile.openstreetmap.org/" + key + ".png").openConnection();
                connection.setRequestProperty("User-Agent", "Eclaire/1.1 Android Auto (https://github.com/bglacial/eclaire)");
                connection.setConnectTimeout(8000); connection.setReadTimeout(8000);
                try (var input = connection.getInputStream()) { result = BitmapFactory.decodeStream(input); }
                finally { connection.disconnect(); }
            } catch (Exception ignored) { }
            Bitmap image = result;
            main.post(() -> {
                pending.remove(key);
                if (closed) return;
                if (image != null) { tiles.put(key, image); draw(); }
                else retryAfter.put(key, android.os.SystemClock.elapsedRealtime() + 60000);
            });
        });
    }
}
