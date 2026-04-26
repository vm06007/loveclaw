'use strict';

var lmap = null;
var leafMarkers = [];
var addActive = false;
var pendingLL = null;

var PCFG = {
  purple: { color: '#9b59d0', label: 'MY PAST',    badge: 'bpu', emo: '📍' },
  blue:   { color: '#3a8fd8', label: 'HIS PAST',   badge: 'bbl', emo: '🗾' },
  green:  { color: '#3aad5a', label: 'PLANNED ✈',  badge: 'bgr', emo: '✈️' },
  pink:   { color: '#e8708a', label: 'TOGETHER ♥', badge: 'bpk', emo: '❤️' }
};
/* ── Pixel-art SVG pin icon ── */
function makePinIcon(type) {
  var c = PCFG[type].color;
  var icons = { purple: '★', blue: '♦', green: '▲', pink: '♥' };
  var html =
    '<div style="position:relative;width:30px;height:42px">' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 30 42">' +
    '<rect x="3" y="1" width="24" height="26" fill="' + c + '" stroke="#1a0a00" stroke-width="3"/>' +
    '<text x="15" y="20" text-anchor="middle" font-size="14" fill="white" font-weight="bold">' + icons[type] + '</text>' +
    '<polygon points="15,42 4,27 26,27" fill="' + c + '" stroke="#1a0a00" stroke-width="2"/>' +
    '</svg></div>';
  return L.divIcon({ html: html, className: '', iconSize: [30, 42], iconAnchor: [15, 42], popupAnchor: [0, -44] });
}

/* ── Popup HTML ── */
function popupHTML(name, type, note) {
  var cfg = PCFG[type];
  return '<div class="pop">' +
    '<div class="pop-title">' + esc(name) + '</div>' +
    '<div class="pop-thumb">' + cfg.emo + '</div>' +
    '<span class="pop-badge ' + cfg.badge + '">' + cfg.label + '</span>' +
    '<div class="pop-note">"' + esc(note) + '"</div>' +
    '<button class="pop-del" onclick="mapDelPin(this)">🗑 DELETE MARK</button>' +
    '</div>';
}
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Delete marker ── */
window.mapDelPin = function(btn) {
  var ll = lmap._popup && lmap._popup._latlng;
  if (!ll) return;
  leafMarkers = leafMarkers.filter(function(m) {
    var p = m.getLatLng();
    if (Math.abs(p.lat - ll.lat) < 0.0001 && Math.abs(p.lng - ll.lng) < 0.0001) {
      lmap.removeLayer(m); return false;
    }
    return true;
  });
  lmap.closePopup();
  updateMapStats();
  mapToast('MARK DELETED');
};

function updateMapStats() {
  var c = { purple: 0, blue: 0, green: 0, pink: 0 };
  leafMarkers.forEach(function(m) { c[m._ptype]++; });
  document.getElementById('c-pp').textContent = 'YIYING: '  + c.purple;
  document.getElementById('c-bp').textContent = 'VITALIK: ' + c.blue;
  document.getElementById('c-gp').textContent = 'PLAN: ' + c.green;
  document.getElementById('c-pk').textContent = 'DONE: ' + c.pink;
}

function addLeafPin(lat, lng, type, name, note, fly) {
  var m = L.marker([lat, lng], { icon: makePinIcon(type) })
    .bindPopup(popupHTML(name, type, note), { className: 'px-popup', maxWidth: 230 })
    .addTo(lmap);
  m._ptype = type;
  leafMarkers.push(m);
  if (fly) lmap.flyTo([lat, lng], 12, { duration: 1.3 });
  updateMapStats();
}

/* ── Init Leaflet ── */
window.initLeaflet = function() {
  if (lmap) {
    requestAnimationFrame(function() {
      lmap.invalidateSize();
      setTimeout(function() { lmap.invalidateSize(); }, 120);
    });
    return;
  }

  lmap = L.map('leaflet-map', {
    center: [25, 15],
    zoom: 2,
    minZoom: 0,
    maxZoom: 19,
    zoomControl: true,
    attributionControl: true
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    minZoom: 0,
    maxZoom: 19,
    detectRetina: false
  }).addTo(lmap);

  /* Click to place pin */
  lmap.on('click', function(e) {
    if (!addActive) return;
    pendingLL = e.latlng;
    document.getElementById('amp-loc').textContent =
      e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4) + ' (geocoding…)';
    fetch(
      'https://nominatim.openstreetmap.org/reverse?format=json' +
      '&lat=' + e.latlng.lat.toFixed(5) +
      '&lon=' + e.latlng.lng.toFixed(5) +
      '&zoom=10'
    )
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (d && d.display_name) {
        var name = d.display_name.split(',').slice(0, 2).join(', ').trim();
        pendingLL.name = name;
        document.getElementById('amp-loc').textContent = name;
      }
    })
    .catch(function() {});
  });

  /* Sample pins */
  [
    { lat:  48.8584, lng:   2.2945, type: 'purple', name: 'Paris, France',       note: '"cafe de flore, autumn light." — HER 2023' },
    { lat:  35.6762, lng: 139.6503, type: 'blue',   name: 'Tokyo, Japan',         note: '"shibuya at midnight, missing you." — HIM 2024' },
    { lat:  35.0116, lng: 135.7681, type: 'blue',   name: 'Kyoto, Japan',         note: '"bamboo forest. left a stone with your name." — HIM' },
    { lat:  64.9631, lng: -19.0208, type: 'green',  name: 'Iceland (planned)',    note: '"northern lights — booked for feb!!" — BOTH' },
    { lat:  -1.2921, lng:  36.8219, type: 'pink',   name: 'Nairobi, Kenya',       note: '"safari sunrise 2023. we both cried. ♥" — BOTH' },
    { lat:  52.3676, lng:   4.9041, type: 'purple', name: 'Amsterdam, NL',        note: '"canal boats + rijksmuseum." — HER 2022' }
  ].forEach(function(p) { addLeafPin(p.lat, p.lng, p.type, p.name, p.note, false); });

  lmap.whenReady(function() {
    requestAnimationFrame(function() {
      lmap.invalidateSize();
      setTimeout(function() { lmap.invalidateSize(); }, 150);
    });
  });
};

/* ── Geolocation (HTTPS or localhost) ── */
window.mapLocateMe = function() {
  if (!lmap) return;
  if (!navigator.geolocation) {
    mapToast('NO GPS ON THIS DEVICE');
    return;
  }
  mapToast('LOCATING…');
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      var lat = pos.coords.latitude;
      var lng = pos.coords.longitude;
      lmap.flyTo([lat, lng], 14, { duration: 1.25 });
      mapToast('YOU ARE HERE');
    },
    function() {
      mapToast('LOCATION BLOCKED');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
};

/* ── Add mode ── */
window.toggleAdd = function() {
  addActive = !addActive;
  var btn   = document.getElementById('addbtn');
  var panel = document.getElementById('amp');
  if (addActive) {
    btn.textContent = '×'; btn.style.background = '#f5c842'; btn.style.color = '#1a0a00';
    panel.classList.add('open'); pendingLL = null;
    document.getElementById('amp-loc').textContent = 'TAP ON THE MAP TO PLACE PIN';
    document.getElementById('amp-note').value = '';
    document.getElementById('mmode').textContent = 'TAP MAP → PLACE PIN';
    if (lmap) lmap.getContainer().style.cursor = 'crosshair';
  } else {
    cancelAdd();
  }
};

function cancelAdd() {
  addActive = false; pendingLL = null;
  var btn = document.getElementById('addbtn');
  btn.textContent = '+'; btn.style.background = ''; btn.style.color = '';
  document.getElementById('amp').classList.remove('open');
    document.getElementById('mmode').textContent = 'OSM · PIXEL STYLE · TAP + TO MARK';
  if (lmap) lmap.getContainer().style.cursor = '';
}
window.cancelAdd = cancelAdd;

window.savePin = function() {
  if (!pendingLL) { mapToast('TAP THE MAP FIRST!'); return; }
  var type = document.getElementById('amp-type').value;
  var note = document.getElementById('amp-note').value || 'no note yet.';
  var name = pendingLL.name || (pendingLL.lat.toFixed(3) + ', ' + pendingLL.lng.toFixed(3));
  addLeafPin(pendingLL.lat, pendingLL.lng, type, name, note, true);
  mapToast('📍 MARK SAVED!');
  cancelAdd();
};

/* ── Search ── */
window.doSearch = function() {
  var q = document.getElementById('srch').value.trim();
  if (!q) return;
  if (!lmap) {
    mapToast('OPEN MAP TAB FIRST');
    return;
  }
  mapToast('SEARCHING…');
  fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q) + '&limit=1')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (!data || !data.length) { mapToast('NOT FOUND!'); return; }
      var r   = data[0];
      var lat = parseFloat(r.lat), lng = parseFloat(r.lon);
      var name = r.display_name.split(',').slice(0, 2).join(', ').trim();
      pendingLL = { lat: lat, lng: lng, name: name };
      lmap.flyTo([lat, lng], 13, { duration: 1.4 });
      addActive = true;
      document.getElementById('addbtn').textContent = '×';
      document.getElementById('addbtn').style.background = '#f5c842';
      document.getElementById('addbtn').style.color = '#1a0a00';
      document.getElementById('amp').classList.add('open');
      document.getElementById('amp-loc').textContent = name;
      document.getElementById('amp-note').value = '';
      document.getElementById('mmode').textContent = 'CHOOSE TYPE & SAVE';
      document.getElementById('srch').value = '';
      if (lmap) lmap.getContainer().style.cursor = 'crosshair';
    })
    .catch(function() { mapToast('SEARCH ERROR'); });
};

/* ── Toast ── */
var mtT;
function mapToast(msg) {
  var t = document.getElementById('mtoast');
  t.textContent = msg;
  t.style.opacity = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(mtT);
  mtT = setTimeout(function() {
    t.style.opacity = '0';
    t.style.transform = 'translateX(-50%) translateY(50px)';
  }, 2400);
}