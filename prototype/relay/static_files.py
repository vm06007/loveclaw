"""Resolve console HTML and static paths under the repo (for same-origin assets)."""
import os

from . import config

def resolve_console_html():
    for candidate in (
        os.path.join(config.REPO_ROOT, "prototype", "console", "signal-console.html"),
        os.path.join(config.REPO_ROOT, "signal-console.html"),
    ):
        if os.path.isfile(candidate):
            return candidate
    return None

def static_file_path(url_path):
    p = (url_path or "").split("?")[0]
    if not (p.startswith("/examples/") or p.startswith("/prototype/")):
        return None
    rel = p.lstrip("/")
    if ".." in rel:
        return None
    if rel and rel.split("/")[0] in (".", ".."):
        return None
    local = os.path.normpath(os.path.join(config.REPO_ROOT, *rel.split("/")))
    rootn = os.path.normpath(os.path.abspath(config.REPO_ROOT))
    if not (local + os.sep).startswith(rootn + os.sep) and local != rootn:
        return None
    if os.path.isfile(local):
        return local
    return None

def static_content_type(path):
    ext = os.path.splitext(path)[1].lower()
    return {
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".map": "application/json; charset=utf-8",
    }.get(ext, "application/octet-stream")
