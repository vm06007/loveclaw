package ai.loveclaw.android

import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

/**
 * Builds, signs, and transmits signals to signal-relay.py.
 *
 * Every signal payload:
 *   1. Gets a UTC timestamp added
 *   2. Gets signed with the TEE-backed Keystore key (SHA256withECDSA)
 *   3. Has the attestation certificate chain attached
 *
 * signal-relay.py can verify the signature against the cert's public key.
 * The attestation cert proves the key lives in the TEE of an unmodified LoveClaw APK.
 *
 * Signal format (backward-compatible with existing relay):
 * {
 *   "type":    "app_installed",
 *   "package": "com.tinder",
 *   "_ts":     "2026-04-22T10:00:00Z",
 *   "_attest": {
 *     "sig":   "<base64 ECDSA signature over canonical payload>",
 *     "cert":  "<base64 DER leaf cert>",
 *     "chain": "<base64 DER chain: leaf|intermediate|root>",
 *     "hw":    true
 *   }
 * }
 */
object SignalSigner {

    private const val TAG     = "LoveClaw/Signer"
    private const val TIMEOUT = 8_000  // ms

    /**
     * Sign a signal payload and POST it to the relay.
     *
     * @param relayUrl  e.g. "http://192.168.1.35:9090"
     * @param payload   JSONObject with signal fields (no _ts or _attest — added here)
     * @return          true if relay returned 200
     */
    fun signAndSend(relayUrl: String, payload: JSONObject): Boolean {
        // 1. Add timestamp
        val ts = Instant.now().toString()
        payload.put("_ts", ts)

        // 2. Canonical string to sign: sorted keys, deterministic
        val canonical = canonicalize(payload)
        Log.v(TAG, "Canonical: $canonical")

        // 3. Sign with TEE key
        val sigBytes = AttestationManager.sign(canonical.toByteArray(Charsets.UTF_8))
        if (sigBytes != null) {
            val certChain = Prefs.attestCert
            val leafCert  = certChain.split("|").firstOrNull() ?: ""
            val attest    = JSONObject().apply {
                put("sig",   Base64.encodeToString(sigBytes, Base64.NO_WRAP))
                put("cert",  leafCert)
                put("chain", certChain)
                put("hw",    AttestationManager.isHardwareBacked())
            }
            payload.put("_attest", attest)
        } else {
            Log.w(TAG, "Signing failed — sending unsigned signal")
        }

        // 4. POST to relay
        return post("$relayUrl/signal", payload.toString())
    }

    /** Build a location signal and send it. */
    fun sendLocation(relayUrl: String, lat: Double, lon: Double,
                     accuracy: Float, mockFlag: Boolean): Boolean {
        val p = JSONObject().apply {
            put("type",     "location")
            put("lat",      lat)
            put("lon",      lon)
            put("accuracy", accuracy)
            put("mock",     mockFlag)   // true if mock location detected
        }
        return signAndSend(relayUrl, p)
    }

    /** Build an app_installed signal and send it. */
    fun sendAppInstalled(relayUrl: String, pkg: String, label: String,
                         firstSeen: Boolean): Boolean {
        val p = JSONObject().apply {
            put("type",       "app_installed")
            put("package",    pkg)
            put("name",       label)
            put("first_seen", firstSeen)   // true = newly appeared since last heartbeat
        }
        return signAndSend(relayUrl, p)
    }

    /** Build a heartbeat signal (proves the sensor is still alive). */
    fun sendHeartbeat(relayUrl: String, packageCount: Int,
                      mockLocationEnabled: Boolean): Boolean {
        val p = JSONObject().apply {
            put("type",                   "heartbeat")
            put("package_count",          packageCount)
            put("mock_location_enabled",  mockLocationEnabled)
        }
        return signAndSend(relayUrl, p)
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Deterministic canonical form: sorted keys, no whitespace.
     * Only includes non-_attest fields so the signature covers the actual data.
     */
    private fun canonicalize(obj: JSONObject): String {
        val sorted = JSONObject()
        obj.keys().asSequence()
            .filter { !it.startsWith("_attest") }
            .sorted()
            .forEach { k -> sorted.put(k, obj.get(k)) }
        return sorted.toString()
    }

    private fun post(url: String, body: String): Boolean {
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod        = "POST"
                doOutput             = true
                connectTimeout       = TIMEOUT
                readTimeout          = TIMEOUT
                setRequestProperty("Content-Type", "application/json")
            }
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            conn.disconnect()
            (code in 200..299).also {
                if (!it) Log.w(TAG, "Relay returned $code for $url")
            }
        } catch (e: Exception) {
            Log.w(TAG, "POST failed: $e")
            false
        }
    }
}
