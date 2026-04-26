"""Run the signal relay HTTP server."""
import http.server
import socket

from . import config
from .http_handler import Handler

class QuietServer(http.server.ThreadingHTTPServer):
    """Suppress connection-reset noise from SSE clients disconnecting."""

    def handle_error(self, request, client_address):
        import sys

        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, BrokenPipeError, ConnectionAbortedError)):
            return
        super().handle_error(request, client_address)


def main():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        lan_ip = s.getsockname()[0]
        s.close()
    except Exception:
        lan_ip = "?"

    server = QuietServer((config.HOST, config.PORT), Handler)

    print(f"\n{config.BOLD}LoveClaw Signal Relay{config.RESET}  port {config.PORT}\n")
    print(f"  Console   →  http://localhost:{config.PORT}/")
    print(f"  Stream    →  http://localhost:{config.PORT}/stream")
    print(f"  Signals   →  http://localhost:{config.PORT}/signals")
    print(f"\n  {config.Y}Tell LoveClaw to POST signals to:{config.RESET}")
    print(f"  {config.BOLD}http://{lan_ip}:{config.PORT}/signal{config.RESET}\n")
    print(f"  {config.DIM}Ctrl-C to stop{config.RESET}\n")
    print(f'  {"TIME":8s}  {"TYPE":<22}  DETAIL')
    print(f'  {"─" * 8}  {"─" * 22}  {"─" * 30}')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print(f"\n{config.DIM}Stopped.{config.RESET}")
