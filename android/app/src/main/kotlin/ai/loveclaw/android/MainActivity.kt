package ai.loveclaw.android

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import ai.loveclaw.android.databinding.ActivityMainBinding
import java.util.concurrent.Executors

/**
 * Minimal status screen.
 *
 * - Shows attestation key fingerprint (proves TEE key is active)
 * - Shows relay URL (editable) and couple ID (editable)
 * - Start / Stop sensor service button
 * - Hardware-backed indicator
 *
 * The app is intentionally minimal — the real work happens in SensorService.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val executor = Executors.newSingleThreadExecutor()

    // ── Permission launcher ───────────────────────────────────────────────────

    private val permLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        val allOk = grants.values.all { it }
        if (allOk) {
            initAttestation()
        } else {
            toast("Location permission is required for tamper-proof signals")
        }
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        Prefs.init(this)
        setupUI()
        checkPermissions()
    }

    override fun onResume() {
        super.onResume()
        refreshStatus()
    }

    // ── UI setup ──────────────────────────────────────────────────────────────

    private fun setupUI() {
        // Pre-fill saved values
        binding.editRelayUrl.setText(Prefs.relayUrl)
        binding.editCoupleId.setText(Prefs.coupleId)
        binding.editMyName.setText(Prefs.myName)

        binding.btnSave.setOnClickListener { saveConfig() }

        binding.btnToggleService.setOnClickListener {
            if (Prefs.serviceRunning) {
                SensorService.stop(this)
                binding.btnToggleService.text = "START SENSOR"
                toast("Sensor stopped")
            } else {
                if (Prefs.coupleId.isBlank()) {
                    toast("Enter a Couple ID first")
                    return@setOnClickListener
                }
                SensorService.start(this)
                binding.btnToggleService.text = "STOP SENSOR"
                toast("Sensor started")
            }
        }

        binding.btnRegenKey.setOnClickListener {
            executor.execute {
                AttestationManager.deleteKey()
                val coupleId = Prefs.coupleId.ifBlank { "loveclaw" }
                val cert = AttestationManager.getOrCreateKey(
                    this, coupleId.toByteArray(Charsets.UTF_8)
                )
                runOnUiThread {
                    if (cert != null) {
                        refreshStatus()
                        toast("New attestation key generated")
                    } else {
                        toast("Key generation failed — check logcat")
                    }
                }
            }
        }
    }

    private fun saveConfig() {
        val relay    = binding.editRelayUrl.text.toString().trim()
        val coupleId = binding.editCoupleId.text.toString().trim()
        val name     = binding.editMyName.text.toString().trim()

        if (relay.isBlank())    { toast("Enter relay URL");    return }
        if (coupleId.isBlank()) { toast("Enter couple ID");    return }
        if (name.isBlank())     { toast("Enter your name");    return }

        Prefs.relayUrl  = relay
        Prefs.coupleId  = coupleId
        Prefs.myName    = name

        // Re-generate attestation key bound to new couple ID
        executor.execute {
            val cert = AttestationManager.getOrCreateKey(
                this, coupleId.toByteArray(Charsets.UTF_8)
            )
            runOnUiThread {
                refreshStatus()
                toast(if (cert != null) "Config saved ✓" else "Config saved (key gen failed)")
            }
        }
    }

    private fun refreshStatus() {
        val fp      = Prefs.keyFingerprint
        val hw      = AttestationManager.isHardwareBacked()
        val running = Prefs.serviceRunning
        val count   = Prefs.signalCount
        val lastTs  = Prefs.lastSignalTs

        binding.textKeyFingerprint.text = if (fp.isNotBlank()) fp else "— not generated"
        binding.textHwBacked.text       = if (hw) "✓ Hardware TEE" else "⚠ Software only"
        binding.textHwBacked.setTextColor(
            ContextCompat.getColor(this,
                if (hw) android.R.color.holo_green_light else android.R.color.holo_orange_light)
        )
        binding.textServiceStatus.text  = if (running) "● ACTIVE" else "○ STOPPED"
        binding.textSignalCount.text    = "$count signals sent"
        binding.textLastSignal.text     = if (lastTs > 0)
            "Last: ${java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date(lastTs))}"
        else "No signals yet"

        binding.btnToggleService.text = if (running) "STOP SENSOR" else "START SENSOR"
    }

    // ── Permissions ───────────────────────────────────────────────────────────

    private fun checkPermissions() {
        val needed = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION,
        ).apply {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val missing = needed.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (missing.isEmpty()) {
            initAttestation()
        } else {
            permLauncher.launch(missing.toTypedArray())
        }
    }

    private fun initAttestation() {
        val coupleId = Prefs.coupleId.ifBlank { return }
        if (Prefs.attestCert.isNotBlank()) {
            refreshStatus()
            return
        }
        executor.execute {
            AttestationManager.getOrCreateKey(this, coupleId.toByteArray(Charsets.UTF_8))
            runOnUiThread { refreshStatus() }
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private fun toast(msg: String) =
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
}
