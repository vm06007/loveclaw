package ai.loveclaw.android

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import java.util.concurrent.Executors

/**
 * Foreground service — the tamper-resistant sensor core.
 *
 * Runs every HEARTBEAT_MS. On each tick:
 *   1. Reads all installed packages (OS-level, no mock possible)
 *   2. Diffs against known packages → emits app_installed for new dating apps
 *   3. Requests GPS fix → emits location signal
 *   4. Checks if mock location provider is enabled → included in every signal
 *   5. Signs every signal with TEE-backed Keystore key
 *   6. POSTs to signal-relay.py
 *
 * Survives:
 *   - App backgrounded (foreground service with notification)
 *   - "Force stop" by user → BootReceiver restarts on next boot
 *   - Battery optimisation → WakeLock held during each tick
 *
 * Cannot be trivially killed without root. On ethOS/dGen1 install as
 * a system app for full tamper-proof behaviour.
 */
class SensorService : Service() {

    companion object {
        private const val TAG            = "LoveClaw/Sensor"
        private const val CHANNEL_ID     = "loveclaw_sensor"
        private const val NOTIF_ID       = 1001
        private const val HEARTBEAT_MS   = 5 * 60 * 1_000L   // 5 minutes
        private const val LOCATION_MS    = 10_000L            // GPS min interval
        private const val LOCATION_M     = 10f                // GPS min distance

        fun start(ctx: Context) {
            val i = Intent(ctx, SensorService::class.java)
            ctx.startForegroundService(i)
        }
        fun stop(ctx: Context) {
            ctx.stopService(Intent(ctx, SensorService::class.java))
        }
    }

    private val executor   = Executors.newSingleThreadExecutor()
    private val handler    = Handler(Looper.getMainLooper())
    private var wakeLock: PowerManager.WakeLock? = null
    private var lastLocation: Location? = null

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIF_ID, buildNotification("Monitoring active"))
        acquireWakeLock()
        startLocationUpdates()
        scheduleNextHeartbeat()
        Prefs.serviceRunning = true
        Log.i(TAG, "SensorService started")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // START_STICKY — OS restarts service if killed (within reason)
        return START_STICKY
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacksAndMessages(null)
        stopLocationUpdates()
        wakeLock?.release()
        executor.shutdown()
        Prefs.serviceRunning = false
        Log.i(TAG, "SensorService stopped")
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ── Heartbeat ─────────────────────────────────────────────────────────────

    private val heartbeatRunnable = Runnable {
        executor.execute { runHeartbeat() }
        scheduleNextHeartbeat()
    }

    private fun scheduleNextHeartbeat() {
        handler.postDelayed(heartbeatRunnable, HEARTBEAT_MS)
    }

    private fun runHeartbeat() {
        val relay = Prefs.relayUrl
        if (relay.isBlank()) {
            Log.w(TAG, "No relay URL configured — skipping heartbeat")
            return
        }

        Log.i(TAG, "Heartbeat tick → $relay")
        updateNotification("Scanning…")

        val mockEnabled = isMockLocationEnabled()
        val allPackages = getInstalledPackages()
        val known       = Prefs.getKnownPackages(this)

        // Detect newly installed packages since last heartbeat
        val newPkgs = allPackages - known
        if (known.isNotEmpty()) {
            newPkgs.forEach { pkg ->
                val label = getAppLabel(pkg)
                Log.i(TAG, "New app: $pkg ($label)")
                SignalSigner.sendAppInstalled(relay, pkg, label, firstSeen = true)
            }
        }

        // Send current state of all dating apps (regardless of first-seen)
        allPackages
            .filter { isDatingApp(it) }
            .forEach { pkg ->
                SignalSigner.sendAppInstalled(relay, pkg, getAppLabel(pkg), firstSeen = false)
            }

        // Persist full package set for next diff
        Prefs.setKnownPackages(this, allPackages)

        // Send location if we have a recent fix
        lastLocation?.let { loc ->
            SignalSigner.sendLocation(relay, loc.latitude, loc.longitude,
                loc.accuracy, loc.isFromMockProvider)
        }

        // Heartbeat ping
        SignalSigner.sendHeartbeat(relay, allPackages.size, mockEnabled)

        Prefs.lastSignalTs = System.currentTimeMillis()
        Prefs.signalCount  = Prefs.signalCount + 1 + newPkgs.size
        updateNotification("Last scan: ${java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date())}")
    }

    // ── Package scanning ──────────────────────────────────────────────────────

    /** Read the full installed package list at OS level. Cannot be mocked. */
    private fun getInstalledPackages(): Set<String> {
        return packageManager
            .getInstalledPackages(PackageManager.GET_META_DATA)
            .map { it.packageName }
            .toSet()
    }

    private fun getAppLabel(pkg: String): String {
        return try {
            val info = packageManager.getApplicationInfo(pkg, 0)
            packageManager.getApplicationLabel(info).toString()
        } catch (e: Exception) { pkg }
    }

    /** Known dating/hookup app package names. */
    private val datingPackages = setOf(
        "com.tinder",
        "com.bumble.app",
        "co.hinge.app",
        "com.grindr.android",
        "com.okcupid.okcupid",
        "com.badoo.mobile",
        "com.happn.app",
        "com.zoosk.zoosk",
        "com.match.android",
        "com.pof.android",
        "com.meetic.android",
        "com.taimi",
        "com.feeld.dating",
        "com.scruff",
        "com.muzz",
        "com.chispa.app",
        "com.hily.app",
        "com.lovoo.android",
    )

    private fun isDatingApp(pkg: String): Boolean =
        datingPackages.any { pkg.startsWith(it) } ||
        listOf("tinder","bumble","hinge","grindr","badoo","happn","okcupid",
                "zoosk","feeld","scruff","muzz","hily")
            .any { pkg.contains(it, ignoreCase = true) }

    // ── Location ──────────────────────────────────────────────────────────────

    private var locationManager: LocationManager? = null
    private val locationListener = LocationListener { loc -> lastLocation = loc }

    private fun startLocationUpdates() {
        try {
            locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED) {
                locationManager?.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    LOCATION_MS, LOCATION_M, locationListener, Looper.getMainLooper()
                )
                // Seed with last known fix immediately
                lastLocation = locationManager
                    ?.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                    ?: locationManager?.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Location setup: $e")
        }
    }

    private fun stopLocationUpdates() {
        try { locationManager?.removeUpdates(locationListener) } catch (_: Exception) {}
    }

    /**
     * True if the user has enabled a mock location provider.
     * Signal relay flags this on every signal — if it's true, location signals
     * are marked as potentially spoofed.
     */
    private fun isMockLocationEnabled(): Boolean {
        return try {
            Settings.Secure.getString(
                contentResolver, Settings.Secure.ALLOW_MOCK_LOCATION
            ) == "1"
        } catch (_: Exception) { false }
    }

    // ── Notification ──────────────────────────────────────────────────────────

    private fun createNotificationChannel() {
        val ch = NotificationChannel(
            CHANNEL_ID,
            "LoveClaw Sensor",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Keeps the tamper-proof sensor running in the background"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
    }

    private fun buildNotification(status: String): Notification {
        val tapIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("LoveClaw — Pact active")
            .setContentText(status)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentIntent(tapIntent)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun updateNotification(status: String) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.notify(NOTIF_ID, buildNotification(status))
    }

    // ── WakeLock ──────────────────────────────────────────────────────────────

    private fun acquireWakeLock() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK,
            "LoveClaw::SensorWakeLock"
        ).apply { acquire(24 * 60 * 60 * 1_000L) }  // 24h max, renewed on restart
    }
}
