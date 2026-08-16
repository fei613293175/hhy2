package com.hehuoyun.pro;

/**
 * Boundary for app-version, maintenance, anonymous-session and login-session
 * checks. The API contract has not been supplied, so the production gateway is
 * intentionally not implemented yet.
 */
public interface StartupGateway {
    interface Callback {
        void onResult(StartupDecision decision);
    }

    void check(Callback callback);
}
