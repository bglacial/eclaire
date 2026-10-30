package fr.eclaire.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.SurfaceTexture;
import android.view.Surface;
import android.view.TextureView;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.car.app.SurfaceContainer;

/** Compact native view fed by the same live guidance session as Android Auto. */
final class PipGuidanceView extends FrameLayout implements TextureView.SurfaceTextureListener {
    private final CarMap map;
    private final TextView instruction;
    private Surface surface;
    private boolean closed;

    PipGuidanceView(Context context) {
        super(context);
        map = new CarMap(context.getApplicationContext());
        var canvas = new TextureView(context);
        canvas.setSurfaceTextureListener(this);
        addView(canvas, new LayoutParams(-1, -1));
        instruction = new TextView(context);
        instruction.setTextColor(Color.WHITE);
        instruction.setBackgroundColor(Color.rgb(24, 46, 57));
        instruction.setTextSize(15);
        instruction.setMaxLines(2);
        int padding = Math.round(6 * getResources().getDisplayMetrics().density);
        instruction.setPadding(padding, padding, padding, padding);
        addView(instruction, new LayoutParams(-1, -2, Gravity.TOP));
    }

    void update(CarGuidance.Snapshot state) {
        instruction.setText(state == null ? "Guidage terminé" : state.message());
        map.update(state);
    }

    @Override public void onSurfaceTextureAvailable(SurfaceTexture texture, int width, int height) {
        if (closed) return;
        surface = new Surface(texture);
        map.onSurfaceAvailable(new SurfaceContainer(surface, width, height, getResources().getDisplayMetrics().densityDpi));
    }
    @Override public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int width, int height) {
        if (!closed && surface != null) map.onSurfaceAvailable(new SurfaceContainer(surface, width, height, getResources().getDisplayMetrics().densityDpi));
    }
    @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) {
        if (surface != null) {
            map.onSurfaceDestroyed(new SurfaceContainer(surface, 0, 0, getResources().getDisplayMetrics().densityDpi));
            surface = null;
        }
        return true;
    }
    @Override public void onSurfaceTextureUpdated(SurfaceTexture texture) { }

    void close() { closed = true; map.close(); surface = null; }
}
