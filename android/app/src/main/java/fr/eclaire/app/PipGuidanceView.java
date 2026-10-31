package fr.eclaire.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.SurfaceTexture;
import android.os.Handler;
import android.os.Looper;
import android.text.TextUtils;
import android.text.SpannableString;
import android.text.style.RelativeSizeSpan;
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
    private CarGuidance.Snapshot state;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable refresh = this::refreshInstruction;

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
        instruction.setEllipsize(TextUtils.TruncateAt.END);
        int padding = Math.round(6 * getResources().getDisplayMetrics().density);
        instruction.setPadding(padding, padding, padding, padding);
        addView(instruction, new LayoutParams(-1, -2, Gravity.TOP));
    }

    void update(CarGuidance.Snapshot state) {
        this.state = state;
        map.update(state);
        refreshInstruction();
    }

    private void refreshInstruction() {
        handler.removeCallbacks(refresh);
        if (closed) return;
        var position = map.position(System.currentTimeMillis());
        if (state == null) instruction.setText("Guidage terminé");
        else if (position != null && position.estimated()) instruction.setText("Position estimée · " + state.message());
        else if (state.progress() != null) {
            int sign = state.route().steps.get(state.progress().nextIndex()).sign();
            String arrow = switch (sign) {
                case -8, -98 -> "⤺"; case -7, -3, -2, -1 -> "↖";
                case 1, 2, 3, 7 -> "↗"; case 8 -> "⤻";
                case 4, 5 -> "⚑"; case 6, -6 -> "⟳"; default -> "↑";
            };
            var label = new SpannableString(arrow + "  " + state.message());
            label.setSpan(new RelativeSizeSpan(1.4f), 0, arrow.length(), 0);
            instruction.setText(label);
        } else instruction.setText(state.message());
        if (state != null) handler.postDelayed(refresh, 1000);
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

    void close() { closed = true; handler.removeCallbacks(refresh); map.close(); surface = null; }
}
