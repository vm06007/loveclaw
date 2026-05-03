const UI_SCALE_STORAGE_KEY = "signal-console-ui-scale";

function parseScaleQuery(raw) {
    if (!raw) {
        return null;
    }
    const n = String(raw).replace(/%$/, "").trim();
    if (n === "2" || n === "200" || n === "200%") {
        return true;
    }
    if (n === "1" || n === "100" || n === "100%") {
        return false;
    }
    return null;
}

function getInitialTwoXScale() {
    const fromQuery = parseScaleQuery(
        new URLSearchParams(window.location.search).get("scale"),
    );
    if (fromQuery !== null) {
        return fromQuery;
    }
    try {
        return sessionStorage.getItem(UI_SCALE_STORAGE_KEY) === "2";
    } catch (_) {
        return false;
    }
}

function setUiScaleTwoX(twoX) {
    const root = document.documentElement;
    if (twoX) {
        root.classList.add("lc-ui-scale-200");
    } else {
        root.classList.remove("lc-ui-scale-200");
    }
    try {
        sessionStorage.setItem(UI_SCALE_STORAGE_KEY, twoX ? "2" : "1");
    } catch (_) {}
    const b1 = document.getElementById("zoom1x");
    const b2 = document.getElementById("zoom2x");
    if (b1 && b2) {
        b1.classList.toggle("active", !twoX);
        b2.classList.toggle("active", twoX);
        b1.setAttribute("aria-pressed", String(!twoX));
        b2.setAttribute("aria-pressed", String(twoX));
    }
}

const RELAY = `http://${location.hostname}:9090`;
let allEntries = [];
let activeFilters = new Set(); // empty = show all (same as ALL)
let paused = false;
let stats = { total: 0, breach: 0, apps: 0 };

// ── SSE connection ─────────────────────────────────────────
let es = null;

function connect() {
    if (es) { es.close(); es = null; }
    setPill('connecting...', false, false);

    es = new EventSource(`${RELAY}/stream`);

    es.onopen = () => setPill('LIVE / streaming', true, false);

    es.onmessage = e => {
        try {
            const sig = JSON.parse(e.data);
            if (sig.type === '_clear') {
                if (sig.filter) {
                    allEntries = allEntries.filter(s => !matchFilterStr(s, sig.filter));
                } else {
                    allEntries = [];
                }
                recalcStats();
                renderAll();
                return;
            }
            // Deduplicate replayed signals (SSE replays last 50 on reconnect)
            if (sig._id != null && allEntries.some(s => s._id === sig._id)) return;
            allEntries.push(sig);
            updateStats(sig);
            if (!paused) appendEntry(sig);
        } catch(err) {}
    };

    es.onerror = () => {
        setPill('disconnected / retrying', false, true);
        setTimeout(connect, 3000);
    };
}

function setPill(label, live, err) {
    const pill = document.getElementById('conn-pill');
    const lbl  = document.getElementById('conn-label');
    pill.className = 'conn-pill' + (live ? ' live' : err ? ' error' : '');
    lbl.textContent = label;
}

// ── Stats ──────────────────────────────────────────────────
function recalcStats() {
    stats = { total: 0, breach: 0, apps: 0 };
    let lastHb = '-';
    for (const s of allEntries) {
        const t = s.type || '';
        stats.total++;
        switch (t) {
            case 'breach':
                stats.breach++;
                break;
            case 'heartbeat':
                lastHb = (s._ts || '').slice(11, 19);
                break;
            default:
                break;
        }
        if (t.includes('app') || t === 'apps_diff') {
            stats.apps++;
        }
    }
    document.getElementById('stat-total').textContent  = stats.total;
    document.getElementById('stat-breach').textContent = stats.breach;
    document.getElementById('stat-apps').textContent   = stats.apps;
    document.getElementById('stat-hb').textContent     = lastHb;
}

function updateStats(sig) {
    if (!sig) {
        recalcStats();
        return;
    }
    const type = sig.type || '';
    stats.total = allEntries.length;
    switch (type) {
        case 'breach':
            stats.breach++;
            break;
        case 'heartbeat':
            document.getElementById('stat-hb').textContent = (sig._ts || '').slice(11, 19);
            break;
        default:
            break;
    }
    if (type.includes('app') || type === 'apps_diff') {
        stats.apps++;
    }
    document.getElementById('stat-total').textContent  = stats.total;
    document.getElementById('stat-breach').textContent = stats.breach;
    document.getElementById('stat-apps').textContent   = stats.apps;
}

// ── Entry rendering ────────────────────────────────────────
function typeClass(type) {
    if (!type) {
        return 't-default';
    }
    switch (type) {
        case 'breach':
            return 't-breach';
        case 'apps_diff':
            return 't-apps_diff';
        case 'apps':
            return 't-apps';
        case '_clear':
            return 't-_clear';
        default:
            break;
    }
    switch (true) {
        case type.includes('app_installed'):
            return 't-app_installed';
        case type.includes('app_opened'):
            return 't-app_opened';
        case type.includes('notification'):
            return 't-notification';
        case type.includes('location'):
            return 't-location';
        case type.includes('call'):
            return 't-call';
        case type.includes('heartbeat'):
            return 't-heartbeat';
        case type.includes('score'):
            return 't-score';
        case type.includes('diary'):
            return 't-diary';
        case type.includes('axl'):
            return 't-axl_handshake';
        default:
            return 't-default';
    }
}

function detail(sig) {
    const t = sig.type || '';
    switch (true) {
        case t === 'breach':
            return `⚠ ${sig.app || '?'} · score=${sig.score} · ${(sig.narrative || '').slice(0, 80)}`;
        case t === 'apps_diff':
            return `+[${sig.added || ''}]  -[${sig.removed || ''}]`;
        case t.includes('notification'):
            return `${sig.package || ''}  "${sig.title || sig.text || ''}"`;
        case t.includes('app'):
            return sig.package || sig.app || sig.name || '';
        case t.includes('location'):
            return `${sig.area || sig.city || ''} ${sig.lat ? `(${(+sig.lat).toFixed(4)},${(+sig.lon).toFixed(4)})` : ''}`;
        case t.includes('call'):
            return `${sig.number || sig.contact || '?'}  ${sig.duration ? sig.duration + 's' : ''}`;
        case t === 'score':
            return `trust score → ${sig.score}`;
        case t === 'diary':
            return `"${(sig.text || '').slice(0, 80)}"`;
        case t === 'axl_handshake':
            return `from ${sig.name || '?'}  key=${(sig.key || '').slice(0, 16)}…`;
        case t === 'heartbeat':
            return sig.clean ? 'all clear' : (sig.detail || '');
        default: {
            const keys = Object.keys(sig).filter(k => !k.startsWith('_') && k !== 'type');
            return keys.map(k => `${k}=${JSON.stringify(sig[k])}`).join('  ').slice(0, 120);
        }
    }
}

function matchFilter(sig) {
    if (activeFilters.size === 0) return true; // no filter = show all
    return [...activeFilters].some(f => matchFilterStr(sig, f));
}

function makeEntryEl(sig) {
    const el = document.createElement('div');
    const type = sig.type || 'unknown';
    const isBreachEntry = type.includes('breach');
    el.className = 'entry' + (isBreachEntry ? ' breach-entry' : '');
    el.dataset.type = type;
    if (sig._id != null) el.dataset.id = sig._id;

    const ts   = (sig._ts || '').slice(11, 19);
    const det  = detail(sig);
    const json = JSON.stringify(sig, null, 2);

    const txHtml = (type === 'breach' && sig.tx_hash)
        ? `<a class="penalty-tx" href="https://etherscan.io/tx/${sig.tx_hash}" target="_blank" rel="noopener"
            onclick="event.stopPropagation()">⛓ Penalty applied: ${sig.tx_hash}</a>`
        : '';
    const narrativeHtml = (type === 'breach' && sig.narrative)
        ? `<div class="breach-card"><div class="breach-card-label">AI ASSESSMENT</div>${escHtml(sig.narrative)}${txHtml}</div>`
        : '';

    const lat = sig.lat || sig.latitude;
    const lon = sig.lon || sig.lng || sig.longitude;
    const mapsHtml = (type === 'location' && lat && lon)
        ? `<a class="maps-link" href="https://www.google.com/maps?q=${lat},${lon}" target="_blank" rel="noopener"
            onclick="event.stopPropagation()">📍 Open in Maps</a>`
        : '';

    el.innerHTML = `
        <div class="e-ts">${ts}</div>
        <div class="e-type ${typeClass(type)}">${type}</div>
        <div class="e-detail">${escHtml(det)}${mapsHtml}</div>
        <div class="e-expand">${narrativeHtml}<pre>${escHtml(json)}</pre></div>
    `;
    el.addEventListener('click', () => el.classList.toggle('expanded'));
    return el;
}

function escHtml(s) {
    return String(s)
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
}

function appendEntry(sig) {
    if (!matchFilter(sig)) return;
    const log = document.getElementById('log');
    // Remove empty state if present
    const empty = log.querySelector('.empty');
    if (empty) empty.remove();

    const el = makeEntryEl(sig);
    log.prepend(el);  // newest at top

    // Cap DOM entries to 500
    while (log.children.length > 500) log.removeChild(log.lastChild);
}

function renderAll() {
    const log = document.getElementById('log');
    log.innerHTML = '';
    const filtered = allEntries.filter(matchFilter);
    if (filtered.length === 0) {
        showEmpty();
        return;
    }
    // Render in reverse (newest first)
    for (let i = filtered.length - 1; i >= 0; i--) {
        log.appendChild(makeEntryEl(filtered[i]));
    }
}

function showEmpty() {
    const log = document.getElementById('log');
    log.innerHTML = `
        <div class="empty">
            <div class="empty-icon" aria-hidden="true">~</div>
            <div class="empty-title">NO SIGNALS YET</div>
            <div class="empty-sub">
                Tell LoveClaw to POST signals to:<br>
                <strong style="color:var(--teal)">${RELAY}/signal</strong><br><br>
                Or send a test:<br>
                <code style="color:var(--amber);font-size:6px">curl -X POST ${RELAY}/signal \\<br>
                -H "Content-Type: application/json" \\<br>
                -d '{"type":"heartbeat","clean":true}'</code>
            </div>
        </div>`;
}

// ── Filter ─────────────────────────────────────────────────
function toggleFilter(f, btn) {
    if (activeFilters.has(f)) {
        activeFilters.delete(f);
        btn.classList.remove('active');
    } else {
        activeFilters.add(f);
        btn.classList.add('active');
    }
    // Sync ALL button state
    document.getElementById('btn-all').classList.toggle('active', activeFilters.size === 0);
    renderAll();
}

function toggleAll() {
    activeFilters.clear();
    document.querySelectorAll('.filter-btn[data-filter]').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-all').classList.add('active');
    renderAll();
}

// ── Clear menu ─────────────────────────────────────────────
function toggleClearMenu() {
    document.getElementById('clear-menu').classList.toggle('open');
}
function closeClearMenu() {
    document.getElementById('clear-menu').classList.remove('open');
}
document.addEventListener('click', e => {
    if (!e.target.closest('.clear-wrap')) closeClearMenu();
});

// ── Pause ──────────────────────────────────────────────────
function togglePause() {
    paused = !paused;
    const btn = document.getElementById('pause-btn');
    btn.textContent = paused ? '► RESUME' : '▐▐ PAUSE';
    btn.classList.toggle('paused', paused);
    if (!paused) renderAll();
}

// ── Clear by type ──────────────────────────────────────────
async function clearType(typeFilter) {
    try {
        await fetch(`${RELAY}/signals?type=${encodeURIComponent(typeFilter)}`, { method: 'DELETE' });
    } catch(e) {}
    allEntries = allEntries.filter(s => !matchFilterStr(s, typeFilter));
    recalcStats();
    renderAll();
    showToast(`Cleared all ${typeFilter} signals`);
}

function matchFilterStr(sig, f) {
    const t = (sig.type || '').toLowerCase();
    switch (f) {
        case 'breach':
            return t === 'breach';
        case 'app':
            return t.includes('app') || t === 'apps_diff';
        case 'location':
            return t.includes('location');
        case 'notification':
            return t.includes('notification');
        case 'call':
            return t.includes('call');
        default:
            return false;
    }
}

function showToast(msg) {
    let t = document.getElementById('_toast');
    if (!t) {
        t = document.createElement('div');
        t.id = '_toast';
        t.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#16162a;border:1px solid #1D9E75;border-radius:6px;padding:8px 16px;font-size:7px;color:#5DCAA5;z-index:9999;transition:opacity .3s;pointer-events:none';
        document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.style.opacity = '0', 2000);
}

// ── Clear all ──────────────────────────────────────────────
async function clearLog() {
    try {
        await fetch(`${RELAY}/signals`, { method: 'DELETE' });
    } catch(e) {}
    allEntries = [];
    recalcStats();
    document.getElementById('log').innerHTML = '';
    showEmpty();
}

// ── Keyboard shortcuts ─────────────────────────────────────
document.addEventListener('keydown', e => {
    switch (e.key) {
        case ' ':
            e.preventDefault();
            togglePause();
            break;
        case 'c':
            if (e.metaKey) {
                /* let browser copy */
            }
            break;
        case 'k':
            clearLog();
            break;
        case '1':
            toggleAll();
            break;
        case '2':
            toggleFilter('breach', document.querySelector('.f-breach'));
            break;
        case '3':
            toggleFilter('app', document.querySelector('.f-app'));
            break;
        case '4':
            toggleFilter('location', document.querySelector('.f-location'));
            break;
        case '5':
            toggleFilter('notification', document.querySelector('.f-notif'));
            break;
        default:
            break;
    }
});

// ── Init ───────────────────────────────────────────────────
const z1 = document.getElementById("zoom1x");
const z2 = document.getElementById("zoom2x");
if (z1 && z2) {
    z1.addEventListener("click", () => setUiScaleTwoX(false));
    z2.addEventListener("click", () => setUiScaleTwoX(true));
}
setUiScaleTwoX(getInitialTwoXScale());
showEmpty();
connect();
