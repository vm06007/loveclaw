// ── Config ────────────────────────────────────────────────────────────────────

const NODES = {
    alice: { name: 'ALICE', port: 9002 },
    boris: { name: 'BORIS', port: 9012 },
};

const urlParam    = new URLSearchParams(location.search).get('node');

const activeNodes = urlParam && NODES[urlParam]
    ? [urlParam]
    : Object.keys(NODES);

if (activeNodes.length === 1) {
    document.getElementById('tab-links').style.display = 'none';
}

// ── Build panels ──────────────────────────────────────────────────────────────

function buildPanel(id) {
    const cfg = NODES[id];
    const div = document.createElement('div');
    div.className = `panel panel-${id}${activeNodes.length === 1 ? ' solo' : ''}`;
    div.id = `panel-${id}`;
    div.innerHTML = `
        <div class="panel-head">
            <div class="panel-head-label">${cfg.name}</div>
            <div class="panel-head-key" id="${id}-key">…</div>
            <div class="panel-head-port">:${cfg.port}</div>
            <div class="panel-head-status" id="${id}-dot"></div>
        </div>
        <div class="log-wrap" id="${id}-log"></div>
        <div class="send-area">
            <div class="send-row">
                <select id="${id}-type">
                    <option value="score">score</option>
                    <option value="diary">diary</option>
                    <option value="axl_handshake">axl_handshake</option>
                    <option value="breach_candidate">breach_candidate</option>
                    <option value="agent_state">agent_state</option>
                </select>
                <input type="text" id="${id}-input" placeholder="value / text…" />
                <button class="send-btn" onclick="sendMsg('${id}')">SEND →</button>
            </div>
            <div class="quick-row">
                <button class="qbtn" onclick="quickSend('${id}','score','95')">score 95</button>
                <button class="qbtn" onclick="quickSend('${id}','score','42')">score 42</button>
                <div class="sep"></div>
                <button class="qbtn" onclick="quickSend('${id}','diary','Thinking of you.')">diary</button>
                <button class="qbtn" onclick="quickSend('${id}','axl_handshake','')">handshake</button>
                <div class="sep"></div>
                <button class="qbtn breach" onclick="quickSend('${id}','breach_candidate','Tinder')">⚠ breach</button>
            </div>
        </div>
    `;
    return div;
}

const panelsEl = document.getElementById('panels');
activeNodes.forEach(id => panelsEl.appendChild(buildPanel(id)));

// ── Logging ───────────────────────────────────────────────────────────────────

function typeBadgeClass(type) {
    switch (type) {
        case 'axl_handshake':
        case 'identity':
            return 't-handshake';
        case 'score':
            return 't-score';
        case 'diary':
            return 't-diary';
        case 'breach_candidate':
        case 'breach':
            return 't-breach';
        case 'breach_vote':
            return 't-vote';
        case 'agent_state':
            return 't-state';
        case 'sys':
            return 't-sys';
        default:
            return 't-other';
    }
}

function addEntry(nodeId, dir, type, text) {
    const log = document.getElementById(`${nodeId}-log`);
    if (!log) return;
    const el  = document.createElement('div');
    const cls = ['entry'];
    if (type === 'breach_candidate' || type === 'breach') cls.push('breach-entry');
    el.className = cls.join(' ');

    const arrow = dir === 'out' ? '→' : dir === 'in' ? '←' : '·';
    const badge = dir === 'sys' ? type : `${arrow} ${type}`;

    el.innerHTML = `
        <div class="e-ts">${new Date().toTimeString().slice(0, 8)}</div>
        <div class="e-type ${typeBadgeClass(type)}">${esc(badge)}</div>
        <div class="e-detail">${esc(text)}</div>
    `;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
}

function esc(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── SSE connection ────────────────────────────────────────────────────────────

const pill   = document.getElementById('conn-pill');
const label  = document.getElementById('conn-label');
const banner = document.getElementById('offline-banner');

function connect() {
    const es = new EventSource('/events');

    es.onopen = () => {
        pill.className    = 'conn-pill live';
        label.textContent = 'LIVE';
        banner.classList.remove('visible');
        // mark all active panels as online
        activeNodes.forEach(id => {
            const dot = document.getElementById(`${id}-dot`);
            if (dot) dot.className = 'panel-head-status online';
        });
    };

    es.onmessage = (e) => {
        let ev;
        try { ev = JSON.parse(e.data); } catch { return; }

        const nodeId = ev.node; // 'alice' or 'boris'
        if (!activeNodes.includes(nodeId)) return;

        // update key display on identity event
        if (ev.type === 'identity' && ev.key) {
            const keyEl = document.getElementById(`${nodeId}-key`);
            if (keyEl) keyEl.textContent = ev.key;
        }

        addEntry(nodeId, ev.dir, ev.type, ev.text);
    };

    es.onerror = () => {
        pill.className    = 'conn-pill error';
        label.textContent = 'offline';
        banner.classList.add('visible');
        activeNodes.forEach(id => {
            const dot = document.getElementById(`${id}-dot`);
            if (dot) dot.className = 'panel-head-status';
        });
        es.close();
        setTimeout(connect, 3000);
    };
}

connect();

// ── Send (POSTs to a2a.py /send — no CORS needed, same origin) ───────────────

async function sendMsg(id) {
    const type  = document.getElementById(`${id}-type`).value;
    const input = document.getElementById(`${id}-input`);
    const value = input.value.trim();

    const r = await fetch('/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: id, type, value }),
    }).catch(() => null);

    if (r && r.ok) {
        input.value = '';
    } else {
        addEntry(id, 'sys', 'sys', `send failed${r ? ' (' + r.status + ')' : ' — a2a.py offline?'}`);
    }
}

function quickSend(id, type, value) {
    document.getElementById(`${id}-type`).value  = type;
    document.getElementById(`${id}-input`).value = value;
    sendMsg(id);
}

// ── Enter key ─────────────────────────────────────────────────────────────────

activeNodes.forEach(id => {
    const inp = document.getElementById(`${id}-input`);
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') sendMsg(id); });
});
