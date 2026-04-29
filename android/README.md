# LoveClaw Android Sensor

Tamper-resistant background service that collects device signals and signs them
with a **TEE-backed (hardware) key** so the partner's relay can verify every payload
was produced by an unmodified LoveClaw APK running on an unrooted device.

## What it does

| Signal | How | Tamper-proof? |
|---|---|---|
| App installs | `PackageManager.getInstalledPackages()` — OS level | ✅ Can't be mocked |
| GPS location | `LocationManager` — flags if mock location is on | ⚠ Flags spoofing |
| Heartbeat | Proof the sensor is alive | ✅ Silence = breach |
| Every payload | ECDSA-signed with Android Keystore TEE key | ✅ Private key never leaves chip |

## Build

Requires: Android Studio (Hedgehog+) or command-line Gradle with JDK 17+

```bash
cd android

# Debug APK (install directly)
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk

# Release APK (requires signing config)
./gradlew assembleRelease
```

Install on device:
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

On dGen1 / ethOS — install as system app for maximum tamper-resistance:
```bash
adb root
adb remount
adb push app-debug.apk /system/priv-app/LoveClaw/LoveClaw.apk
adb reboot
```

## Setup flow

1. Both partners install the APK
2. Open app → enter same **Couple ID** (e.g. `A3F9`) on both phones
3. Enter **Relay URL** — the Mac IP where `signal-relay.py` is running: `http://192.168.1.x:9090`
4. Tap **SAVE + GENERATE KEY** — generates TEE key, binds attestation cert to couple ID
5. Tap **START SENSOR** — foreground service starts, heartbeat every 5 min
6. Share attestation fingerprints with each other (shown on screen) — store in pact

## Attestation verification

`signal-relay.py` verifies every signal automatically.

To enable full ECDSA verification:
```bash
pip3 install cryptography   # one-time
python3 signal-relay.py
```

Without `cryptography` installed: relay still accepts all signals, just marks
`_verified: null` instead of `true/false`.

## Signal format

```json
{
  "type":    "app_installed",
  "package": "com.tinder",
  "name":    "Tinder",
  "_ts":     "2026-04-22T10:00:00Z",
  "_attest": {
    "sig":   "<base64 ECDSA signature>",
    "cert":  "<base64 DER leaf certificate>",
    "chain": "<base64 DER chain: leaf|intermediate|root>",
    "hw":    true
  }
}
```

The `_attest.cert` is an Android Keystore attestation certificate. Its extension fields
(OID 1.3.6.1.4.1.11129.2.1.17) contain:
- `packageName`: `ai.loveclaw.android` — proves unmodified APK
- `verifiedBootState`: `Verified` — proves locked bootloader
- `securityLevel`: `TrustedEnvironment` or `StrongBox` — proves hardware TEE

## Security properties

| Attack | Result |
|---|---|
| User modifies APK | Package name in cert changes → relay rejects |
| User roots device | `verifiedBootState = Unverified` → relay flags |
| User enables mock location | `mock: true` on every location signal → relay flags |
| User kills service | Heartbeat stops → trust score drops, partner notified |
| User reboots phone | `BootReceiver` restarts service automatically |
| User uninstalls app | Pact broken — partner notified via AXL dark signal |
| User extracts private key | Impossible — key lives in TEE, never exported |
| User sends fake hash | Signature won't verify without TEE private key |

## Permissions required

| Permission | Why |
|---|---|
| `ACCESS_FINE_LOCATION` | GPS signal collection |
| `ACCESS_BACKGROUND_LOCATION` | Location while app is backgrounded |
| `QUERY_ALL_PACKAGES` | Read full installed app list |
| `FOREGROUND_SERVICE` | Keep sensor alive |
| `RECEIVE_BOOT_COMPLETED` | Auto-start after reboot |
| `INTERNET` | POST signals to relay |
