"""Outbound TLS context (relaxed verification for local dev)."""
import ssl

_ssl_ctx = ssl.create_default_context()
_ssl_ctx.check_hostname = False
_ssl_ctx.verify_mode = ssl.CERT_NONE

def get_ssl_ctx():
    return _ssl_ctx
