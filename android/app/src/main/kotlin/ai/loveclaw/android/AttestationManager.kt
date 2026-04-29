package ai.loveclaw.android

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.Certificate
import java.security.spec.ECGenParameterSpec

/**
 * Manages the TEE-backed attestation key.
 *
 * Key facts:
 * - Key is generated inside the Android Keystore (hardware-backed on supported devices)
 * - Private key NEVER leaves the TEE — even root cannot extract it
 * - setAttestationChallenge() binds the cert to a specific challenge (couple ID + timestamp)
 *   so the cert can't be replayed from a different pact
 * - The resulting certificate chain proves:
 *     · which app package created this key (ai.loveclaw.android)
 *     · device boot state (locked/unlocked bootloader)
 *     · whether hardware-backed TEE is in use
 *   All signed by Google's hardware attestation root (verifiable offline)
 *
 * The partner stores this cert in the pact at pair-time. Every subsequent signal
 * is signed with this key — the partner verifies signature + cert match.
 * If the user tampers with the APK, the package-name field in the cert won't match.
 */
object AttestationManager {

    private const val TAG       = "LoveClaw/Attest"
    private const val KEY_ALIAS = "loveclaw_sensor_key_v1"
    private const val PROVIDER  = "AndroidKeyStore"

    /**
     * Generate (or load existing) attestation key pair.
     *
     * @param challenge  Bytes bound into the attestation certificate —
     *                   use couple ID bytes so the cert is pact-specific.
     * @return           Base64-encoded DER certificate chain (leaf first), or null on failure.
     */
    fun getOrCreateKey(context: Context, challenge: ByteArray): String? {
        return try {
            val ks = KeyStore.getInstance(PROVIDER).apply { load(null) }

            // Re-use existing key if already generated for this alias
            if (!ks.containsAlias(KEY_ALIAS)) {
                generateKey(challenge)
            }

            val chain: Array<Certificate> = ks.getCertificateChain(KEY_ALIAS)
            if (chain.isEmpty()) {
                Log.e(TAG, "Empty certificate chain")
                return null
            }

            // Encode full chain: leaf cert first, then intermediates
            val chainB64 = chain.joinToString("|") { cert ->
                Base64.encodeToString(cert.encoded, Base64.NO_WRAP)
            }

            // Cache fingerprint for display
            val fp = fingerprint(chain[0].encoded)
            Prefs.attestCert      = chainB64
            Prefs.keyFingerprint  = fp

            Log.i(TAG, "Attestation key ready — fingerprint: $fp")
            chainB64

        } catch (e: Exception) {
            Log.e(TAG, "Attestation setup failed: $e")
            null
        }
    }

    private fun generateKey(challenge: ByteArray) {
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256, KeyProperties.DIGEST_SHA512)
            .setAttestationChallenge(challenge)   // binds cert to this specific challenge
            .setUserAuthenticationRequired(false) // background service — no user interaction
            .build()

        KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, PROVIDER)
            .apply { initialize(spec) }
            .generateKeyPair()

        Log.i(TAG, "New attestation key generated in TEE")
    }

    /** Sign arbitrary bytes with the Keystore private key (never leaves TEE). */
    fun sign(data: ByteArray): ByteArray? {
        return try {
            val ks = KeyStore.getInstance(PROVIDER).apply { load(null) }
            val key = ks.getKey(KEY_ALIAS, null)
                ?: run { Log.e(TAG, "Key not found"); return null }

            java.security.Signature.getInstance("SHA256withECDSA").run {
                initSign(key as java.security.PrivateKey)
                update(data)
                sign()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Sign failed: $e")
            null
        }
    }

    /** Delete the key (called when pact is broken — forces re-attestation on next pair). */
    fun deleteKey() {
        try {
            KeyStore.getInstance(PROVIDER).apply { load(null) }.deleteEntry(KEY_ALIAS)
            Log.i(TAG, "Attestation key deleted")
        } catch (e: Exception) {
            Log.w(TAG, "Delete key: $e")
        }
    }

    /** Short hex fingerprint of a DER-encoded certificate for display. */
    fun fingerprint(certDer: ByteArray): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(certDer)
        return digest.take(8).joinToString(":") { "%02X".format(it) }
    }

    /** True if current device has hardware-backed Keystore (TEE/StrongBox). */
    fun isHardwareBacked(): Boolean {
        return try {
            val ks = KeyStore.getInstance(PROVIDER).apply { load(null) }
            if (!ks.containsAlias(KEY_ALIAS)) return false
            val keyInfo = ks.getKey(KEY_ALIAS, null)?.let { key ->
                val factory = java.security.KeyFactory.getInstance(
                    (key as java.security.PrivateKey).algorithm, PROVIDER
                )
                factory.getKeySpec(key, android.security.keystore.KeyInfo::class.java)
            }
            keyInfo?.securityLevel ==
                android.security.keystore.KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT ||
            keyInfo?.securityLevel ==
                android.security.keystore.KeyProperties.SECURITY_LEVEL_STRONGBOX
        } catch (e: Exception) {
            false
        }
    }
}
