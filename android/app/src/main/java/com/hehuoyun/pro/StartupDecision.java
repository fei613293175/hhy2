package com.hehuoyun.pro;

/** Results the startup API must return before the app enters a protected route. */
public enum StartupDecision {
    SESSION_VALID,
    SESSION_INVALID,
    MAINTENANCE,
    UPDATE_REQUIRED,
    NETWORK_ERROR
}
