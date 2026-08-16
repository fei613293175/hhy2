package com.hehuoyun.pro;

import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;

public final class MainActivity extends Activity implements SystemScreenView.Actions {
    private SystemScreenView screen;
    private final StartupGateway startupGateway = new UnavailableStartupGateway();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        screen = new SystemScreenView(this, this);
        setContentView(screen);
        configureEdgeToEdge();

        String requestedState = BuildConfig.DEBUG
                ? getIntent().getStringExtra("hhy.debug.screen")
                : null;
        if (!screen.showDebugState(requestedState)) {
            screen.showSplash(SystemScreenView.SplashState.DEFAULT);
            screen.postDelayed(this::bootstrap, 480L);
        }
    }

    private void configureEdgeToEdge() {
        Window window = getWindow();
        window.setStatusBarColor(android.graphics.Color.TRANSPARENT);
        window.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false);
            if (window.getDecorView().getWindowInsetsController() != null) {
                window.getDecorView().getWindowInsetsController().setSystemBarsAppearance(0,
                        android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                | android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
        } else {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    private void bootstrap() {
        screen.showSplash(SystemScreenView.SplashState.BOOTSTRAP_LOADING);
        startupGateway.check(this::handleStartupDecision);
    }

    private void handleStartupDecision(StartupDecision decision) {
        switch (decision) {
            case MAINTENANCE:
                screen.showMaintenance(SystemScreenView.MaintenanceState.DEFAULT);
                break;
            case UPDATE_REQUIRED:
                screen.showUpdate(SystemScreenView.UpdateState.FORCED);
                break;
            case SESSION_VALID:
            case SESSION_INVALID:
                // Login and home modules are not implemented in this slice. A route is
                // deliberately not faked until their contracts and screens exist.
                screen.showSplash(SystemScreenView.SplashState.NETWORK_ERROR);
                break;
            case NETWORK_ERROR:
            default:
                screen.showSplash(SystemScreenView.SplashState.NETWORK_ERROR);
                break;
        }
    }

    @Override
    public void onRetryBootstrap() {
        bootstrap();
    }

    @Override
    public void onRetryMaintenance() {
        screen.showMaintenance(SystemScreenView.MaintenanceState.RETRYING);
        startupGateway.check(decision -> {
            if (decision == StartupDecision.MAINTENANCE) {
                screen.showMaintenance(SystemScreenView.MaintenanceState.DEFAULT);
            } else if (decision == StartupDecision.NETWORK_ERROR) {
                screen.showMaintenance(SystemScreenView.MaintenanceState.NETWORK_ERROR);
            } else {
                handleStartupDecision(decision);
            }
        });
    }

    @Override
    public void onUpdateRequested() {
        screen.showUpdate(SystemScreenView.UpdateState.DOWNLOADING);
        // A verified update URL and SHA-256 are mandatory. Until the version API
        // contract exists, report the real condition instead of manufacturing a file.
        screen.postDelayed(() -> screen.showUpdate(SystemScreenView.UpdateState.DOWNLOAD_FAILED), 650L);
    }

    @Override
    public void onSupportRequested() {
        screen.announceSupportUnavailable();
    }

    @Override
    public void onBackRequested(boolean forcedUpdate) {
        if (!forcedUpdate) {
            screen.showSplash(SystemScreenView.SplashState.DEFAULT);
            screen.postDelayed(this::bootstrap, 220L);
        }
    }

    @Override
    public void onBackPressed() {
        if (screen.isForcedUpdate()) {
            return;
        }
        onBackRequested(false);
    }
}
