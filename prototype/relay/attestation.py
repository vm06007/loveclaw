"""Verify TEE-backed ECDSA signatures on Android-originated signals (optional cryptography)."""
import base64
import hashlib
import json

def verify_signal_attestation(sig):
    """
    Verify the _attest block on a signal from the Android sensor service.

    Returns dict: ok (True/False/None), hw, fingerprint, reason.
    """
    attest = sig.get("_attest")
    if not attest:
        return {"ok": None, "hw": False, "fingerprint": "", "reason": "no attestation"}

    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.x509 import load_der_x509_certificate
        from cryptography.exceptions import InvalidSignature

        sig_b64 = attest.get("sig", "")
        cert_b64 = attest.get("cert", "")
        hw = attest.get("hw", False)

        if not sig_b64 or not cert_b64:
            return {"ok": False, "hw": False, "fingerprint": "", "reason": "missing sig or cert"}

        sig_bytes = base64.b64decode(sig_b64)
        cert_bytes = base64.b64decode(cert_b64)

        fp = ":".join("%02X" % b for b in hashlib.sha256(cert_bytes).digest()[:8])

        cert = load_der_x509_certificate(cert_bytes)
        pub = cert.public_key()

        canonical_obj = {
            k: v
            for k, v in sig.items()
            if not k.startswith("_attest") and not k.startswith("_id")
        }
        for relay_field in ("_id",):
            canonical_obj.pop(relay_field, None)
        canonical = json.dumps(
            dict(sorted(canonical_obj.items())),
            separators=(",", ":"),
            ensure_ascii=False,
        )

        pub.verify(sig_bytes, canonical.encode("utf-8"), ec.ECDSA(hashes.SHA256()))
        return {"ok": True, "hw": hw, "fingerprint": fp, "reason": "verified"}

    except ImportError:
        return {"ok": None, "hw": False, "fingerprint": "", "reason": "cryptography not installed"}
    except InvalidSignature:
        return {"ok": False, "hw": False, "fingerprint": "", "reason": "invalid signature"}
    except Exception as e:
        return {"ok": None, "hw": False, "fingerprint": "", "reason": f"verify error: {e}"}
