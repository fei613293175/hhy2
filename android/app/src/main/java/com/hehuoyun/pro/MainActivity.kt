package com.hehuoyun.pro

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.Window
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.ui.viewinterop.AndroidView

/**
 * P00's Compose host keeps the already-measured D02 startup view intact.
 * Product routes remain unavailable until their R01+ contracts are implemented.
 */
class MainActivity : ComponentActivity(), SystemScreenView.Actions {
    private lateinit var screen: SystemScreenView
    private val startupGateway: StartupGateway = UnavailableStartupGateway()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        configureEdgeToEdge()
        screen = SystemScreenView(this, this)
        setContent {
            AndroidView(factory = { screen })
        }
        val requestedState = if (BuildConfig.DEBUG) intent.getStringExtra("hhy.debug.screen") else null
        if (!screen.showDebugState(requestedState)) {
            screen.showSplash(SystemScreenView.SplashState.DEFAULT)
            screen.postDelayed(::bootstrap, 480L)
        }
    }

    private fun configureEdgeToEdge() {
        val window: Window = window
        window.statusBarColor = android.graphics.Color.TRANSPARENT
        window.navigationBarColor = android.graphics.Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.decorView.windowInsetsController?.setSystemBarsAppearance(
                0,
                android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS,
            )
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility =
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        }
    }

    private fun bootstrap() {
        screen.showSplash(SystemScreenView.SplashState.BOOTSTRAP_LOADING)
        startupGateway.check(::handleStartupDecision)
    }

    private fun handleStartupDecision(decision: StartupDecision) {
        when (decision) {
            StartupDecision.MAINTENANCE -> screen.showMaintenance(SystemScreenView.MaintenanceState.DEFAULT)
            StartupDecision.UPDATE_REQUIRED -> screen.showUpdate(SystemScreenView.UpdateState.FORCED)
            StartupDecision.SESSION_VALID, StartupDecision.SESSION_INVALID, StartupDecision.NETWORK_ERROR ->
                screen.showSplash(SystemScreenView.SplashState.NETWORK_ERROR)
        }
    }

    override fun onRetryBootstrap() = bootstrap()

    override fun onRetryMaintenance() {
        screen.showMaintenance(SystemScreenView.MaintenanceState.RETRYING)
        startupGateway.check { decision ->
            when (decision) {
                StartupDecision.MAINTENANCE -> screen.showMaintenance(SystemScreenView.MaintenanceState.DEFAULT)
                StartupDecision.NETWORK_ERROR -> screen.showMaintenance(SystemScreenView.MaintenanceState.NETWORK_ERROR)
                else -> handleStartupDecision(decision)
            }
        }
    }

    override fun onUpdateRequested() {
        screen.showUpdate(SystemScreenView.UpdateState.DOWNLOADING)
        screen.postDelayed({ screen.showUpdate(SystemScreenView.UpdateState.DOWNLOAD_FAILED) }, 650L)
    }

    override fun onSupportRequested() = screen.announceSupportUnavailable()

    override fun onBackRequested(forcedUpdate: Boolean) {
        if (!forcedUpdate) {
            screen.showSplash(SystemScreenView.SplashState.DEFAULT)
            screen.postDelayed(::bootstrap, 220L)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (!screen.isForcedUpdate) onBackRequested(false)
    }
}
