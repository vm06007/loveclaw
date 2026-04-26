"""Threading HTTP server request handler."""
import http.server

from . import relay_delete
from . import relay_get
from . import relay_post


class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass

    def cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.cors_headers()
        self.end_headers()

    def do_GET(self):
        if not relay_get.handle_get(self):
            self.send_error(404)

    def do_POST(self):
        if not relay_post.handle_post(self):
            self.send_error(404)

    def do_DELETE(self):
        if not relay_delete.handle_delete(self):
            self.send_error(404)
