package ai.loveclaw.android

import android.content.Context
import android.content.SharedPreferences

/**
 * Typed wrapper around SharedPreferences.
 * Single source of truth for all persisted state.
 */
object Prefs {

    private const val FILE = "loveclaw"

    private fun sp(ctx: Context): SharedPreferences =
        ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    // ── Relay connection ──────────────────────────────────────────────────────

    var relayUrl: String
        get() = _ctx?.let { sp(it).getString("relay_url", "http://10.0.2.2:9090") } ?: "http://10.0.2.2:9090"
        set(v) { _ctx?.let { sp(it).edit().putString("relay_url", v).apply() } }

    // ── Couple identity ───────────────────────────────────────────────────────

    var coupleId: String
        get() = _ctx?.let { sp(it).getString("couple_id", "") } ?: ""
        set(v) { _ctx?.let { sp(it).edit().putString("couple_id", v).apply() } }

    var myName: String
        get() = _ctx?.let { sp(it).getString("my_name", "") } ?: ""
        set(v) { _ctx?.let { sp(it).edit().putString("my_name", v).apply() } }

    // ── Attestation state ─────────────────────────────────────────────────────

    /** Base64 DER of the leaf attestation certificate (generated once). */
    var attestCert: String
        get() = _ctx?.let { sp(it).getString("attest_cert", "") } ?: ""
        set(v) { _ctx?.let { sp(it).edit().putString("attest_cert", v).apply() } }

    /** Hex fingerprint of the attestation key (for display). */
    var keyFingerprint: String
        get() = _ctx?.let { sp(it).getString("key_fp", "") } ?: ""
        set(v) { _ctx?.let { sp(it).edit().putString("key_fp", v).apply() } }

    // ── Service state ─────────────────────────────────────────────────────────

    var serviceRunning: Boolean
        get() = _ctx?.let { sp(it).getBoolean("svc_running", false) } ?: false
        set(v) { _ctx?.let { sp(it).edit().putBoolean("svc_running", v).apply() } }

    var lastSignalTs: Long
        get() = _ctx?.let { sp(it).getLong("last_sig_ts", 0L) } ?: 0L
        set(v) { _ctx?.let { sp(it).edit().putLong("last_sig_ts", v).apply() } }

    var signalCount: Int
        get() = _ctx?.let { sp(it).getInt("sig_count", 0) } ?: 0
        set(v) { _ctx?.let { sp(it).edit().putInt("sig_count", v).apply() } }

    // ── Known installed packages (to detect new installs) ────────────────────

    fun getKnownPackages(ctx: Context): Set<String> =
        sp(ctx).getStringSet("known_pkgs", emptySet()) ?: emptySet()

    fun setKnownPackages(ctx: Context, pkgs: Set<String>) =
        sp(ctx).edit().putStringSet("known_pkgs", pkgs).apply()

    // ── Init ──────────────────────────────────────────────────────────────────

    private var _ctx: Context? = null

    fun init(ctx: Context) {
        _ctx = ctx.applicationContext
    }
}
