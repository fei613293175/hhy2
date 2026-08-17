package com.hehuoyun.pro;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.view.MotionEvent;
import android.view.View;
import android.widget.Toast;

/** Renders D02 APP-SYS-001 through APP-SYS-003 at their 360 x 800dp baseline. */
public final class SystemScreenView extends View {
    public interface Actions {
        void onRetryBootstrap();
        void onRetryMaintenance();
        void onUpdateRequested();
        void onSupportRequested();
        void onBackRequested(boolean forcedUpdate);
    }

    enum Page { SPLASH, MAINTENANCE, UPDATE }
    enum SplashState { DEFAULT, BOOTSTRAP_LOADING, NETWORK_ERROR }
    enum MaintenanceState { DEFAULT, RETRYING, NETWORK_ERROR, RECOVERED }
    enum UpdateState { OPTIONAL, RECOMMENDED, FORCED, DOWNLOADING, VERIFYING, READY_INSTALL, DOWNLOAD_FAILED }

    private static final float BASE_WIDTH = 360f;
    private static final float BASE_HEIGHT = 800f;
    private static final int PRIMARY_950 = Color.rgb(5, 11, 36);
    private static final int PRIMARY_900 = Color.rgb(7, 19, 58);
    private static final int PRIMARY_800 = Color.rgb(13, 36, 99);
    private static final int PRIMARY_500 = Color.rgb(47, 107, 255);
    private static final int NEUTRAL_50 = Color.rgb(244, 247, 251);
    private static final int NEUTRAL_800 = Color.rgb(30, 41, 64);
    private static final int NEUTRAL_700 = Color.rgb(53, 66, 91);
    private static final int NEUTRAL_500 = Color.rgb(117, 129, 152);
    private static final int ERROR_500 = Color.rgb(227, 68, 85);

    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Actions actions;
    private final Drawable brandIcon;
    private final Drawable healthIcon;
    private final Drawable updateIcon;
    private final Drawable infoIcon;
    private final Drawable errorIcon;
    private final Drawable backIcon;
    private final Drawable moreIcon;
    private Page page = Page.SPLASH;
    private SplashState splashState = SplashState.DEFAULT;
    private MaintenanceState maintenanceState = MaintenanceState.DEFAULT;
    private UpdateState updateState = UpdateState.FORCED;
    private float scale = 1f;
    private float offsetX;
    private float offsetY;

    public SystemScreenView(Context context, Actions actions) {
        super(context);
        this.actions = actions;
        setLayerType(View.LAYER_TYPE_SOFTWARE, null);
        brandIcon = context.getDrawable(com.hehuoyun.pro.R.drawable.hhy_brand_icon);
        healthIcon = context.getDrawable(com.hehuoyun.pro.R.drawable.icon_health);
        updateIcon = context.getDrawable(com.hehuoyun.pro.R.drawable.icon_update);
        infoIcon = context.getDrawable(com.hehuoyun.pro.R.drawable.icon_info);
        errorIcon = context.getDrawable(com.hehuoyun.pro.R.drawable.icon_error);
        backIcon = context.getDrawable(com.hehuoyun.pro.R.drawable.icon_back);
        moreIcon = context.getDrawable(com.hehuoyun.pro.R.drawable.icon_more);
        paint.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
        setContentDescription("合伙云 Pro 系统状态");
    }

    void showSplash(SplashState state) {
        page = Page.SPLASH;
        splashState = state;
        invalidate();
    }

    void showMaintenance(MaintenanceState state) {
        page = Page.MAINTENANCE;
        maintenanceState = state;
        invalidate();
    }

    void showUpdate(UpdateState state) {
        page = Page.UPDATE;
        updateState = state;
        invalidate();
    }

    boolean isForcedUpdate() {
        return page == Page.UPDATE && updateState == UpdateState.FORCED;
    }

    boolean showDebugState(String requestedState) {
        if (requestedState == null || requestedState.isEmpty()) return false;
        switch (requestedState) {
            case "splash":
                showSplash(SplashState.DEFAULT);
                return true;
            case "splash_network_error":
                showSplash(SplashState.NETWORK_ERROR);
                return true;
            case "maintenance":
                showMaintenance(MaintenanceState.DEFAULT);
                return true;
            case "maintenance_retrying":
                showMaintenance(MaintenanceState.RETRYING);
                return true;
            case "maintenance_network_error":
                showMaintenance(MaintenanceState.NETWORK_ERROR);
                return true;
            case "update_forced":
                showUpdate(UpdateState.FORCED);
                return true;
            case "update_download_failed":
                showUpdate(UpdateState.DOWNLOAD_FAILED);
                return true;
            default:
                return false;
        }
    }

    void announceSupportUnavailable() {
        Toast.makeText(getContext(), "客服渠道尚未配置", Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        scale = Math.min(getWidth() / BASE_WIDTH, getHeight() / BASE_HEIGHT);
        offsetX = (getWidth() - BASE_WIDTH * scale) / 2f;
        offsetY = (getHeight() - BASE_HEIGHT * scale) / 2f;
        canvas.save();
        canvas.translate(offsetX, offsetY);
        canvas.scale(scale, scale);
        if (page == Page.SPLASH) {
            drawSplash(canvas);
        } else {
            drawSystemPage(canvas);
        }
        canvas.restore();
    }

    private void drawSplash(Canvas canvas) {
        paint.setShader(new LinearGradient(0, 0, BASE_WIDTH, BASE_HEIGHT, PRIMARY_950, PRIMARY_500, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, BASE_WIDTH, BASE_HEIGHT, paint);
        paint.setShader(null);
        paint.setColor(Color.argb(46, 152, 180, 255));
        canvas.drawCircle(330, 48, 130, paint);
        paint.setColor(Color.argb(62, 36, 181, 198));
        canvas.drawCircle(0, 790, 108, paint);

        if (splashState == SplashState.NETWORK_ERROR) {
            drawToast(canvas, 126, "网络连接异常，保留当前内容并支持重试", true);
        }

        drawRoundRect(canvas, 123, 260, 237, 374, 38, Color.rgb(48, 72, 137));
        drawDrawable(canvas, brandIcon, 163, 300, 197, 334);
        drawCenteredText(canvas, "合伙云", 425, 33, Color.WHITE, Typeface.NORMAL);
        drawRoundRect(canvas, 206, 400, 254, 430, 17, Color.argb(65, 255, 255, 255));
        drawCenteredText(canvas, "PRO", 415, 16, Color.WHITE, Typeface.NORMAL, 230);
        drawCenteredText(canvas, "让好项目被看见，让精准流量更有价值", 466, 15, Color.rgb(227, 235, 255), Typeface.NORMAL);

        if (splashState == SplashState.BOOTSTRAP_LOADING || splashState == SplashState.DEFAULT) {
            drawSpinner(canvas, 146, 547);
            drawText(canvas, "页面已就绪", 166, 554, 14, Color.WHITE, Typeface.NORMAL);
        } else {
            drawText(canvas, "网络连接异常，保留当前内容并支持重试", 56, 545, 13.4f, Color.WHITE, Typeface.NORMAL);
            drawOutlineButton(canvas, 100, 570, 260, 620, "重新连接", Color.WHITE, PRIMARY_800);
        }
        drawCenteredText(canvas, "安全连接  ·  对象存储  ·  合伙云 Pro", 765, 10, Color.argb(150, 218, 230, 255), Typeface.NORMAL);
    }

    private void drawSystemPage(Canvas canvas) {
        canvas.drawColor(NEUTRAL_50);
        drawHeader(canvas, page == Page.MAINTENANCE ? "系统维护页" : "版本更新页");
        if (page == Page.MAINTENANCE) {
            drawMaintenance(canvas);
        } else {
            drawUpdate(canvas);
        }
    }

    private void drawHeader(Canvas canvas, String title) {
        paint.setShader(new LinearGradient(0, 0, BASE_WIDTH, 0, PRIMARY_950, PRIMARY_500, Shader.TileMode.CLAMP));
        canvas.drawRect(0, 0, BASE_WIDTH, 82, paint);
        paint.setShader(null);
        drawDrawable(canvas, backIcon, 24, 42, 35, 62);
        drawCenteredText(canvas, title, 55, 22, Color.WHITE, Typeface.NORMAL);
        drawDrawable(canvas, moreIcon, 319, 46, 341, 58);
    }

    private void drawMaintenance(Canvas canvas) {
        String stateName = maintenanceState == MaintenanceState.RETRYING ? "Retrying"
                : maintenanceState == MaintenanceState.NETWORK_ERROR ? "Network Error"
                : maintenanceState == MaintenanceState.RECOVERED ? "Recovered" : "Default";
        if (maintenanceState != MaintenanceState.DEFAULT) drawStatePill(canvas, stateName, false);
        drawCard(canvas);
        drawIconTile(canvas, healthIcon, false);
        String heading = maintenanceState == MaintenanceState.RETRYING
                ? "正在检查服务状态"
                : maintenanceState == MaintenanceState.RECOVERED ? "服务已恢复" : "系统维护中";
        drawCenteredText(canvas, heading, 382, 25, Color.rgb(19, 30, 58), Typeface.NORMAL);
        drawCenteredText(canvas, "平台正在进行短时维护，已为你保留当前操作状态。", 413, 14, NEUTRAL_500, Typeface.NORMAL);
        drawPrimaryButton(canvas, 31, 446, 329, 496, "重新检查");
        drawSecondaryButton(canvas, 31, 508, 329, 558, "联系客服");
        drawInfoPanel(canvas, 31, 577, 329, 641, maintenanceState == MaintenanceState.NETWORK_ERROR
                ? "网络连接异常，保留当前内容并支持重试"
                : "当前状态：" + stateName);
    }

    private void drawUpdate(Canvas canvas) {
        boolean failed = updateState == UpdateState.DOWNLOAD_FAILED;
        String stateName = updateState == UpdateState.DOWNLOADING ? "Downloading"
                : updateState == UpdateState.VERIFYING ? "Verifying"
                : updateState == UpdateState.READY_INSTALL ? "Ready Install"
                : failed ? "Download Failed"
                : updateState == UpdateState.RECOMMENDED ? "Recommended"
                : updateState == UpdateState.OPTIONAL ? "Optional" : "Forced";
        drawStatePill(canvas, stateName, failed);
        if (failed) drawToast(canvas, 207, "安装包下载失败，请重试", true);
        drawCard(canvas);
        drawIconTile(canvas, updateIcon, failed);
        String heading = failed ? "下载未完成" : updateState == UpdateState.READY_INSTALL
                ? "安装包已就绪" : updateState == UpdateState.DOWNLOADING
                ? "正在下载更新" : updateState == UpdateState.VERIFYING
                ? "正在校验更新" : updateState == UpdateState.FORCED
                ? "需要更新后继续" : "发现新版本";
        drawCenteredText(canvas, heading, 405, 25, Color.rgb(19, 30, 58), Typeface.NORMAL);
        drawCenteredText(canvas, "P00 基础工程  ·  正在准备版本元数据与安全校验。", 447, 13, NEUTRAL_500, Typeface.NORMAL);
        drawPrimaryButton(canvas, 31, 492, 329, 542, updateState == UpdateState.READY_INSTALL ? "开始安装" : "立即更新");
        if (updateState != UpdateState.FORCED) {
            drawSecondaryButton(canvas, 31, 554, 329, 604, "稍后提醒");
        }
        drawInfoPanel(canvas, 31, updateState == UpdateState.FORCED ? 561 : 623, 329,
                updateState == UpdateState.FORCED ? 625 : 687, failed
                        ? "安装包下载失败，请重试" : "当前状态：" + stateName);
    }

    private void drawCard(Canvas canvas) {
        paint.setShadowLayer(14, 0, 8, Color.argb(18, 26, 55, 114));
        drawRoundRect(canvas, 15, 232, 345, 666, 24, Color.WHITE);
        paint.clearShadowLayer();
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1.2f);
        paint.setColor(Color.rgb(220, 226, 235));
        canvas.drawRoundRect(new RectF(15, 232, 345, 666), 24, 24, paint);
        paint.setStyle(Paint.Style.FILL);
    }

    private void drawIconTile(Canvas canvas, Drawable icon, boolean error) {
        int tile = error ? Color.rgb(255, 227, 231) : Color.rgb(235, 246, 250);
        drawRoundRect(canvas, 138, 249, 222, 333, 27, tile);
        drawDrawable(canvas, icon, 160, 270, 200, 310, error ? ERROR_500 : PRIMARY_500);
    }

    private void drawStatePill(Canvas canvas, String state, boolean error) {
        float left = error ? 180 : 218;
        float top = 90;
        float right = 347;
        float bottom = 122;
        paint.setShadowLayer(10, 0, 5, Color.argb(20, 26, 55, 114));
        drawRoundRect(canvas, left, top, right, bottom, 18, Color.WHITE);
        paint.clearShadowLayer();
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1);
        paint.setColor(error ? Color.rgb(244, 196, 202) : Color.rgb(206, 225, 255));
        canvas.drawRoundRect(new RectF(left, top, right, bottom), 18, 18, paint);
        paint.setStyle(Paint.Style.FILL);
        drawDrawable(canvas, infoIcon, left + 11, top + 9, left + 23, top + 21, error ? ERROR_500 : PRIMARY_500);
        drawText(canvas, "当前状态：" + state, left + 31, top + 21, 10.7f, error ? ERROR_500 : PRIMARY_500, Typeface.NORMAL);
    }

    private void drawToast(Canvas canvas, float top, String text, boolean error) {
        float left = error ? 126 : 145;
        float right = 347;
        paint.setShadowLayer(8, 0, 4, Color.argb(20, 26, 55, 114));
        drawRoundRect(canvas, left, top, right, top + 32, 18, Color.WHITE);
        paint.clearShadowLayer();
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1);
        paint.setColor(error ? Color.rgb(244, 196, 202) : Color.rgb(206, 225, 255));
        canvas.drawRoundRect(new RectF(left, top, right, top + 32), 18, 18, paint);
        paint.setStyle(Paint.Style.FILL);
        drawDrawable(canvas, error ? errorIcon : infoIcon, left + 11, top + 10, left + 23, top + 22, error ? ERROR_500 : PRIMARY_500);
        drawText(canvas, text, left + 31, top + 21, 9.8f, error ? Color.rgb(156, 47, 61) : PRIMARY_500, Typeface.NORMAL);
    }

    private void drawPrimaryButton(Canvas canvas, float left, float top, float right, float bottom, String text) {
        paint.setShadowLayer(8, 0, 5, Color.argb(34, 47, 107, 255));
        drawRoundRect(canvas, left, top, right, bottom, 16, PRIMARY_500);
        paint.clearShadowLayer();
        drawCenteredText(canvas, text, top + 32, 17, Color.WHITE, Typeface.NORMAL);
    }

    private void drawSecondaryButton(Canvas canvas, float left, float top, float right, float bottom, String text) {
        drawRoundRect(canvas, left, top, right, bottom, 16, Color.rgb(236, 240, 245));
        drawCenteredText(canvas, text, top + 32, 17, Color.rgb(80, 100, 139), Typeface.NORMAL);
    }

    private void drawInfoPanel(Canvas canvas, float left, float top, float right, float bottom, String text) {
        drawRoundRect(canvas, left, top, right, bottom, 16, Color.rgb(236, 240, 245));
        drawRoundRect(canvas, left + 14, top + 15, left + 52, top + 53, 19, Color.rgb(52, 69, 108));
        drawDrawable(canvas, infoIcon, left + 25, top + 26, left + 41, top + 42, Color.WHITE);
        drawText(canvas, text, left + 62, top + 40, 12.4f, NEUTRAL_700, Typeface.NORMAL);
    }

    private void drawSpinner(Canvas canvas, float centerX, float centerY) {
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(5);
        paint.setStrokeCap(Paint.Cap.ROUND);
        paint.setColor(Color.argb(120, 170, 201, 255));
        canvas.drawCircle(centerX, centerY, 11, paint);
        paint.setColor(Color.WHITE);
        canvas.drawArc(new RectF(centerX - 11, centerY - 11, centerX + 11, centerY + 11), -105, 112, false, paint);
        paint.setStyle(Paint.Style.FILL);
    }

    private void drawOutlineButton(Canvas canvas, float left, float top, float right, float bottom, String text, int fill, int textColor) {
        drawRoundRect(canvas, left, top, right, bottom, 16, fill);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(1);
        paint.setColor(Color.rgb(209, 223, 255));
        canvas.drawRoundRect(new RectF(left, top, right, bottom), 16, 16, paint);
        paint.setStyle(Paint.Style.FILL);
        drawCenteredText(canvas, text, top + 32, 16, textColor, Typeface.NORMAL);
    }

    private void drawRoundRect(Canvas canvas, float left, float top, float right, float bottom, float radius, int color) {
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(color);
        canvas.drawRoundRect(new RectF(left, top, right, bottom), radius, radius, paint);
    }

    private void drawDrawable(Canvas canvas, Drawable drawable, float left, float top, float right, float bottom) {
        drawDrawable(canvas, drawable, left, top, right, bottom, null);
    }

    private void drawDrawable(Canvas canvas, Drawable drawable, float left, float top, float right, float bottom, Integer tint) {
        if (drawable == null) return;
        if (tint != null) drawable.setTint(tint);
        else drawable.clearColorFilter();
        drawable.setBounds(Math.round(left), Math.round(top), Math.round(right), Math.round(bottom));
        drawable.draw(canvas);
    }

    private void drawCenteredText(Canvas canvas, String text, float baseline, float size, int color, int style) {
        drawCenteredText(canvas, text, baseline, size, color, style, BASE_WIDTH / 2f);
    }

    private void drawCenteredText(Canvas canvas, String text, float baseline, float size, int color, int style, float centerX) {
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(color);
        paint.setTextSize(size);
        paint.setTypeface(Typeface.create("sans-serif", style));
        paint.setTextAlign(Paint.Align.CENTER);
        canvas.drawText(text, centerX, baseline, paint);
        paint.setTextAlign(Paint.Align.LEFT);
    }

    private void drawText(Canvas canvas, String text, float x, float baseline, float size, int color, int style) {
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(color);
        paint.setTextSize(size);
        paint.setTypeface(Typeface.create("sans-serif", style));
        paint.setTextAlign(Paint.Align.LEFT);
        canvas.drawText(text, x, baseline, paint);
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if (event.getAction() != MotionEvent.ACTION_UP) return true;
        float x = (event.getX() - offsetX) / scale;
        float y = (event.getY() - offsetY) / scale;
        if (page == Page.SPLASH && splashState == SplashState.NETWORK_ERROR && contains(x, y, 100, 570, 260, 620)) {
            actions.onRetryBootstrap();
            return true;
        }
        if (page == Page.MAINTENANCE) {
            if (contains(x, y, 31, 446, 329, 496)) actions.onRetryMaintenance();
            else if (contains(x, y, 31, 508, 329, 558)) actions.onSupportRequested();
            else if (contains(x, y, 12, 24, 56, 72)) actions.onBackRequested(false);
            return true;
        }
        if (page == Page.UPDATE) {
            if (contains(x, y, 31, 492, 329, 542)) actions.onUpdateRequested();
            else if (contains(x, y, 12, 24, 56, 72)) actions.onBackRequested(isForcedUpdate());
            return true;
        }
        return true;
    }

    private static boolean contains(float x, float y, float left, float top, float right, float bottom) {
        return x >= left && x <= right && y >= top && y <= bottom;
    }
}
