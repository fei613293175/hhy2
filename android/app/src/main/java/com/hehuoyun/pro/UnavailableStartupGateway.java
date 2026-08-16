package com.hehuoyun.pro;

import android.os.Handler;
import android.os.Looper;

/**
 * Honest first-slice behavior: without a configured API base URL, bootstrap
 * cannot assert that a user session, release gate or maintenance flag is valid.
 */
final class UnavailableStartupGateway implements StartupGateway {
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void check(Callback callback) {
        mainHandler.postDelayed(() -> callback.onResult(StartupDecision.NETWORK_ERROR), 650L);
    }
}
