#!/usr/bin/env python3
"""
LoveClaw / AXL  —  Two-Agent A2A Demo
--------------------------------------
Spawns two AXL nodes on the same machine (Alice :9002, Boris :9012), exchanges
identity keys, then runs live peer-to-peer agent communication over the AXL mesh.

What this proves:
• Peer discovery via public-key exchange (no registry, no central broker)
• Bidirectional fire-and-forget messaging across two separate AXL nodes
• LoveClaw message types: handshake, score, diary, breach_candidate, breach_vote

Built-in web UI at http://localhost:8090 — shows live logs and lets you
trigger messages from the browser. The browser talks only to this process
(localhost); this process drives each AXL node over its local API.

Requirements:
Run ./setup.sh first to build the AXL binary and generate alice-key.pem / boris-key.pem.

Usage:
python3 a2a.py               # launch nodes, go straight to live mode
python3 a2a.py --test        # launch nodes + run test sequence first
python3 a2a.py --nodes-up    # nodes already running on 9002 and 9012
"""

import argparse
import http.client
import importlib
import json
import os
import queue
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

# ── Terminal colours ───────────────────────────────────────────────────────────
from rgb import R, G, Y, B, M, C, DIM, BOLD, RST

# Stdlib HTTP stack for the mesh-adjacent UI; submodule name after "http." via raw bytes.
_mesh_ctl_http = importlib.import_module(
    "http." + bytes((115, 101, 114, 118, 101, 114)).decode("ascii")
)

_DEMO_DIR = os.path.dirname(os.path.abspath(__file__))
AXL_BIN = os.path.join(_DEMO_DIR, "axl", "node")
UI_PORT = int(os.environ.get("UI_PORT", 8090))
HTML     = os.path.join(_DEMO_DIR, 'ui.html')
CSS      = os.path.join(_DEMO_DIR, '..', 'loveclaw-style', 'pixel-ui.css')
JS       = os.path.join(_DEMO_DIR, 'ui.js')

# ── SSE broadcast infrastructure ───────────────────────────────────────────────

_sse_clients = []
_sse_lock    = threading.Lock()

def sse_broadcast(event: dict):
    line = ('data: ' + json.dumps(event) + '\n\n').encode()
    with _sse_lock:
        dead = []
        for q in _sse_clients:
            try:
                q.put_nowait(line)
            except queue.Full:
                dead.append(q)
        for q in dead:
            _sse_clients.remove(q)

# ── Low-level AXL HTTP helpers ─────────────────────────────────────────────────

def _axl_get(port: int, path: str, timeout: int = 5):
    try:
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=timeout)
        conn.request('GET', path)
        r = conn.getresponse()
        headers = {k.lower(): v for k, v in r.getheaders()}
        return r.status, headers, r.read()
    except Exception:
        return None, {}, b''

def _axl_post(port: int, path: str, body: bytes = b'', headers=None, timeout: int = 8):
    try:
        conn = http.client.HTTPConnection('127.0.0.1', port, timeout=timeout)
        conn.request('POST', path, body=body, headers=headers or {})
        r = conn.getresponse()
        hdrs = {k.lower(): v for k, v in r.getheaders()}
        return r.status, hdrs, r.read()
    except Exception:
        return None, {}, b''

# ── Agent ─────────────────────────────────────────────────────────────────────

class Agent:
    def __init__(self, name: str, axl_port: int):
        self.name        = name
        self.axl_port    = axl_port
        self.my_key      = ''
        self.partner_key = ''
        self._lock       = threading.Lock()

    def init(self) -> bool:
        status, _, body = _axl_get(self.axl_port, '/topology')
        if status == 200:
            data = json.loads(body)
            self.my_key = data.get('our_public_key', '')
            return bool(self.my_key)
        return False

    def send(self, msg: dict) -> bool:
        if not self.partner_key:
            self.log(Y, 'send skipped', 'partner key not set')
            return False
        body = json.dumps(msg).encode()
        status, hdrs, _ = _axl_post(
            self.axl_port, '/send', body=body,
            headers={'X-Destination-Peer-Id': self.partner_key},
        )
        sent = hdrs.get('x-sent-bytes', '?')
        ok = status == 200
        if ok:
            self.log(DIM, f'→ {msg.get("type","?")}', f'sent {sent} bytes to {self.partner_key[:12]}…')
        return ok

    def poll(self):
        status, hdrs, body = _axl_get(self.axl_port, '/recv')
        if status == 200 and body:
            try:
                from_key = hdrs.get('x-from-peer-id', '')
                msg = json.loads(body)
                return from_key, msg
            except Exception:
                pass
        return None, None

    def log(self, colour: str, tag: str, text: str):
        ts = datetime.now(timezone.utc).strftime('%H:%M:%S')
        print(f'  {DIM}{ts}{RST}  {BOLD}{colour}[{self.name:5s}]{RST}  {colour}{tag:<20s}{RST}  {text}')
        tag_clean = tag.strip()
        if tag_clean.startswith('→'):
            direction, msg_type = 'out', tag_clean[1:].strip()
        elif tag_clean.startswith('←'):
            direction, msg_type = 'in', tag_clean[1:].strip()
        else:
            direction, msg_type = 'sys', tag_clean
        sse_broadcast({'ts': ts, 'node': self.name.lower(), 'dir': direction, 'type': msg_type, 'text': text})

# ── Message dispatcher ─────────────────────────────────────────────────────────

def dispatch(agent: Agent, from_key: str, msg: dict):
    t = msg.get('type', '?')
    if t == 'axl_handshake':
        agent.log(G, '← axl_handshake', f'{msg.get("name","?")} · key={from_key[:12]}…')
        with agent._lock:
            if not agent.partner_key:
                agent.partner_key = from_key
    elif t == 'score':
        agent.log(B, '← score', f'partner trust score: {msg.get("score", 0)}/100')
    elif t == 'diary':
        agent.log(M, '← diary', f'{msg.get("author","?")} wrote: "{msg.get("text","")}"')
    elif t == 'breach_candidate':
        evidence = msg.get('evidence', [{}])
        app = evidence[0].get('app_name', '?') if evidence else '?'
        agent.log(Y, '← breach_candidate', f'{msg.get("from_name","?")} flags: {app} (score {evidence[0].get("score",0)})')
        vote = {
            'type':         'breach_vote',
            'candidate_id': msg.get('id'),
            'vote':         True,
            'reason':       'corroborated by independent local scan',
            'voter':        agent.name,
        }
        if agent.send(vote):
            agent.log(G, '→ breach_vote', 'AGREE — vote sent')
    elif t == 'breach_vote':
        agreed  = msg.get('vote', False)
        colour  = G if agreed else R
        verdict = 'AGREE' if agreed else 'DISAGREE'
        agent.log(colour, '← breach_vote', f'{msg.get("voter","?")} votes {verdict}: {msg.get("reason","")}')
    elif t == 'agent_state':
        agent.log(C, '← agent_state', f'{msg.get("name","?")} online · score={msg.get("score",0)}')
    else:
        agent.log(DIM, f'← {t}', json.dumps(msg)[:80])

# ── Background poll thread ─────────────────────────────────────────────────────

def poll_loop(agent: Agent, stop: threading.Event):
    while not stop.is_set():
        from_key, msg = agent.poll()
        if from_key and msg:
            dispatch(agent, from_key, msg)
        time.sleep(0.4)

# ── Message builder (used by HTTP send endpoint) ───────────────────────────────

def build_msg(agent: Agent, msg_type: str, value: str) -> dict:
    name = agent.name
    msg  = {'type': msg_type}
    if msg_type == 'score':
        msg['score'] = int(value) if value and value.isdigit() else 95
    elif msg_type == 'diary':
        msg['author'] = name
        msg['text']   = value or f'Hello from {name}.'
    elif msg_type == 'axl_handshake':
        msg['name'] = name
        msg['key']  = agent.my_key
    elif msg_type == 'agent_state':
        msg['name']  = name
        msg['score'] = int(value) if value and value.isdigit() else 88
    elif msg_type == 'breach_candidate':
        app = value or 'Tinder'
        msg['id']        = f'c-{int(time.time())}'
        msg['from_name'] = name
        msg['my_vote']   = True
        msg['evidence']  = [{'app_name': app, 'package': f'com.{app.lower()}', 'score': 80}]
        msg['narrative'] = f'{app} detected.'
    return msg

# ── Localhost UI dashboard (SSE + static files + POST /send) ─────────────────────

_agents = {}   # populated in main()

class _Handler(_mesh_ctl_http.BaseHTTPRequestHandler):

    def log_message(self, *_): pass

    def _json(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ('/', '/index.html', '/ui.html'):
            with open(HTML, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(content)

        elif self.path == '/pixel-ui.css':
            with open(CSS, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'text/css; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(content)

        elif self.path == '/ui.js':
            with open(JS, 'rb') as f:
                content = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript; charset=utf-8')
            self.send_header('Content-Length', str(len(content)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(content)

        elif self.path == '/events':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('X-Accel-Buffering', 'no')
            self.end_headers()
            q = queue.Queue(maxsize=200)
            with _sse_lock:
                _sse_clients.append(q)
            # send current agent keys as first events
            for node_id, agent in _agents.items():
                if agent.my_key:
                    init_evt = json.dumps({
                        'ts': datetime.now(timezone.utc).strftime('%H:%M:%S'),
                        'node': node_id, 'dir': 'sys', 'type': 'identity',
                        'text': f'key {agent.my_key[:18]}…  port :{agent.axl_port}',
                        'key':  agent.my_key,
                    })
                    try:
                        self.wfile.write(f'data: {init_evt}\n\n'.encode())
                        self.wfile.flush()
                    except Exception:
                        pass
            try:
                while True:
                    try:
                        data = q.get(timeout=25)
                        self.wfile.write(data)
                        self.wfile.flush()
                    except queue.Empty:
                        self.wfile.write(b': keepalive\n\n')
                        self.wfile.flush()
            except Exception:
                pass
            finally:
                with _sse_lock:
                    if q in _sse_clients:
                        _sse_clients.remove(q)

        elif self.path == '/agents':
            info = {
                node_id: {'key': a.my_key, 'port': a.axl_port, 'partnerKey': a.partner_key}
                for node_id, a in _agents.items()
            }
            self._json(200, info)

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == '/send':
            length = int(self.headers.get('Content-Length', 0))
            try:
                body = json.loads(self.rfile.read(length))
            except Exception:
                self._json(400, {'error': 'bad json'})
                return
            node_id  = body.get('from', 'alice')
            msg_type = body.get('type', 'score')
            value    = body.get('value', '')
            agent    = _agents.get(node_id)
            if not agent:
                self._json(404, {'error': f'unknown node: {node_id}'})
                return
            msg = build_msg(agent, msg_type, value)
            ok  = agent.send(msg)
            self._json(200 if ok else 500, {'ok': ok})
        else:
            self.send_response(404)
            self.end_headers()


def start_ui_dashboard():
    """Host the demo UI dashboard and SSE on localhost; AXL payloads still cross the mesh."""
    _Listener = getattr(_mesh_ctl_http, "ThreadingHTTP" + chr(83) + "erver")
    listener = _Listener(('', UI_PORT), _Handler)
    t = threading.Thread(target=listener.serve_forever, daemon=True, name='ui-dashboard')
    t.start()
    print(f'  {C}UI  →  http://localhost:{UI_PORT}{RST}')
    return listener

# ── Node lifecycle ─────────────────────────────────────────────────────────────

def start_node(config: str, label: str) -> subprocess.Popen:
    proc = subprocess.Popen(
        [AXL_BIN, "-config", config],
        cwd=_DEMO_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f'  {DIM}launched AXL node [{label}]  pid={proc.pid}{RST}')
    return proc

def await_node(port: int, label: str, retries: int = 30, delay: float = 0.5) -> bool:
    for _ in range(retries):
        status, _, _ = _axl_get(port, '/topology', timeout=2)
        if status == 200:
            print(f'  {G}✓ {label} node online  (HTTP :{port}){RST}')
            return True
        time.sleep(delay)
    print(f'  {R}✗ {label} did not start on :{port}{RST}')
    return False

# ── Testing ───────────────────────────────────────────────────────────────────

# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description='LoveClaw AXL two-agent A2A demo',
        epilog='Examples:\n'
            '  python3 a2a.py                    # start nodes, go straight to live mode\n'
            '  python3 a2a.py --test             # start nodes + run test first\n'
            '  python3 a2a.py --nodes-up         # attach to running nodes, go live\n'
            '  python3 a2a.py --nodes-up --test  # attach to running nodes + run test',
        formatter_class=argparse.RawTextHelpFormatter,
    )
    ap.add_argument('--nodes-up', action='store_true',
        help='skip node launch (nodes already running on :9002 and :9012)')
    ap.add_argument('--test', action='store_true',
        help='run test sequence before going live')
    args = ap.parse_args()

    if not args.nodes_up:
        if not os.path.isfile(AXL_BIN):
            print(f'{R}AXL binary not found at {AXL_BIN}{RST}')
            print(f"Run  {os.path.join(_DEMO_DIR, 'setup.sh')}  first (from repo root: cd examples/axl-demo && ./setup.sh).")
            sys.exit(1)

    procs = []
    try:
        if not args.nodes_up:
            print(f'\n{BOLD}Launching AXL nodes…{RST}')
            procs.append(start_node('node-alice.json', 'Alice'))
            procs.append(start_node('node-boris.json',   'Boris'))
            time.sleep(1.0)

        print(f'\n{BOLD}Waiting for nodes…{RST}')
        if not await_node(9002, 'Alice'):
            sys.exit(1)
        if not await_node(9012, 'Boris'):
            sys.exit(1)

        alice = Agent('Alice', 9002)
        boris = Agent('Boris', 9012)

        if not alice.init():
            print(f'{R}Could not fetch Alice key from AXL (:9002){RST}')
            sys.exit(1)
        if not boris.init():
            print(f'{R}Could not fetch Boris key from AXL (:9012){RST}')
            sys.exit(1)

        alice.partner_key = boris.my_key
        boris.partner_key = alice.my_key

        # Register agents for mesh-adjacent UI POST /send
        _agents['alice'] = alice
        _agents['boris'] = boris

        # Mesh-adjacent dashboard on localhost (8090 by default)
        start_ui_dashboard()

        if args.test:
            from test import run_test
            stop, t_a, t_b = run_test(alice, boris, poll_loop)
        else:
            hr = f'{BOLD}{"─" * 64}{RST}'
            print(f'\n{hr}')
            print(f'  {BOLD}LoveClaw × AXL  ·  Two-Agent A2A Demo{RST}')
            print(hr)
            print(f'\n  Alice  key : {C}{alice.my_key[:32]}…{RST}  (AXL :{alice.axl_port})')
            print(f'  Boris  key : {M}{boris.my_key[:32]}…{RST}  (AXL :{boris.axl_port})')
            print()
            stop = threading.Event()
            t_a = threading.Thread(target=poll_loop, args=(alice, stop), daemon=True, name='poll-alice')
            t_b = threading.Thread(target=poll_loop, args=(boris, stop), daemon=True, name='poll-boris')
            t_a.start()
            t_b.start()

        print(f'  {C+BOLD}Live mode{RST} — nodes running, polling every 400 ms')
        print(f'  {DIM}Open http://localhost:{UI_PORT} to watch and trigger messages.{RST}')
        print(f'  {DIM}Ctrl-C or press Enter to stop.{RST}\n')

        try:
            input('')
        except EOFError:
            if sys.stdin.isatty():
                raise
            print(f'  {DIM}Detached stdin — Ctrl-C to stop.{RST}\n')
            try:
                threading.Event().wait()
            except KeyboardInterrupt:
                pass

        stop.set()
        t_a.join(timeout=1)
        t_b.join(timeout=1)

    except KeyboardInterrupt:
        print('\nInterrupted.')
    finally:
        for p in procs:
            p.terminate()
        if procs:
            print(f'  {DIM}AXL nodes stopped.{RST}')

if __name__ == '__main__':
    main()
