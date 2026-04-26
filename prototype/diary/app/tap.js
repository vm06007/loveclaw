'use strict';

/* ══ TAP INTERACTION: hearts · stars · bubble · ripple · combo ══ */

var TAP_BUBBLE_MSGS = [
  'hihi !', '\u2665  \u2665', '*blush*', 'yay ~!',
  '\u2661  !!', 'hehe~', '\u2665\u2665\u2665', 'so cute~', 'aww !!'
];
var TAP_COMBO_MSGS = {
  3:  'LOVELY \u2665',
  5:  'SO CUTE !!',
  8:  'LOVE MAX \u2665',
  12: '\u221e LOVE \u221e'
};
var _tapCount = 0, _tapTimer = null;

function _spawnOne(phone, cls, text, x, y, props, delay) {
  var el = document.createElement('div');
  el.className = cls;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
  for (var k in props) el.style.setProperty(k, props[k]);
  if (delay) el.style.animationDelay = delay + 's';
  phone.appendChild(el);
  el.addEventListener('animationend', function() { el.remove(); });
  return el;
}

window.spawnTapEffect = function(x, y) {
  var phone = document.querySelector('.phone');
  if (!phone) return;
  var pw = phone.clientWidth || 320;

  /* — ripple ring — */
  var rip = document.createElement('div');
  rip.className = 'tap-ripple';
  rip.style.left = x + 'px';
  rip.style.top  = y + 'px';
  phone.appendChild(rip);
  rip.addEventListener('animationend', function() { rip.remove(); });

  /* — hearts (6, float upward with spread) — */
  var hChars  = ['\u2665', '\u2764', '\u2661'];
  var hColors = ['#ff6b8a','#ff9eb5','#f5c842','#ff4d6d','#e87898','#c880c8'];
  for (var i = 0; i < 6; i++) {
    (function(i) {
      _spawnOne(phone, 'tap-heart', hChars[i % hChars.length],
        x + (Math.random() - 0.5) * 40, y,
        {
          '--hx':  ((Math.random() - 0.5) * 70) + 'px',
          '--hy':  -(50 + Math.random() * 80) + 'px',
          '--rot':  ((Math.random() - 0.5) * 28) + 'deg',
          '--rot2': ((Math.random() - 0.5) * 45) + 'deg',
          '--dur':  (0.8 + Math.random() * 0.6) + 's',
          'color':     hColors[Math.floor(Math.random() * hColors.length)],
          'font-size': (10 + Math.floor(Math.random() * 14)) + 'px'
        },
        i * 0.07
      );
    })(i);
  }

  /* — stars (8, burst in all directions) — */
  var sChars  = ['\u2726', '\u2605', '\u2727', '\u22c6', '\u2729', '\u00b7'];
  var sColors = ['#f5c842','#ffffff','#b0d8f8','#ffbcd9','#ffe066','#c8f0b0'];
  for (var j = 0; j < 8; j++) {
    (function(j) {
      var angle = (j / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
      var dist  = 38 + Math.random() * 55;
      _spawnOne(phone, 'tap-star', sChars[j % sChars.length],
        x + (Math.random() - 0.5) * 14, y + (Math.random() - 0.5) * 14,
        {
          '--sx':  (Math.cos(angle) * dist) + 'px',
          '--sy':  (Math.sin(angle) * dist) + 'px',
          '--sr':  (120 + Math.random() * 200) + 'deg',
          '--dur': (0.65 + Math.random() * 0.5) + 's',
          'color':     sColors[j % sColors.length],
          'font-size': (8 + Math.floor(Math.random() * 10)) + 'px'
        },
        j * 0.04
      );
    })(j);
  }

  /* — speech bubble — */
  var bub = document.createElement('div');
  bub.className = 'tap-bubble';
  bub.textContent = TAP_BUBBLE_MSGS[Math.floor(Math.random() * TAP_BUBBLE_MSGS.length)];
  bub.style.left = Math.max(8, Math.min(x - 34, pw - 110)) + 'px';
  bub.style.top  = Math.max(8, y - 65) + 'px';
  phone.appendChild(bub);
  bub.addEventListener('animationend', function() { bub.remove(); });

  /* — background bounce — */
  var activeBg = document.querySelector('#phone-home-bg .phone-bg-img.active');
  if (activeBg) {
    activeBg.classList.remove('tap-bounce');
    void activeBg.offsetWidth;
    activeBg.classList.add('tap-bounce');
    setTimeout(function() { activeBg.classList.remove('tap-bounce'); }, 460);
  }

  /* — combo tracking — */
  _tapCount++;
  clearTimeout(_tapTimer);
  var cnt = _tapCount;
  var comboMsg = cnt >= 12 ? TAP_COMBO_MSGS[12]
               : cnt >= 8  ? TAP_COMBO_MSGS[8]
               : cnt >= 5  ? TAP_COMBO_MSGS[5]
               : cnt >= 3  ? TAP_COMBO_MSGS[3]
               : null;
  if (comboMsg) {
    var combo = document.createElement('div');
    combo.className = 'tap-combo';
    combo.textContent = comboMsg;
    combo.style.left = Math.max(8, Math.min(x - 45, pw - 130)) + 'px';
    combo.style.top  = Math.max(8, y - 95) + 'px';
    phone.appendChild(combo);
    combo.addEventListener('animationend', function() { combo.remove(); });
  }
  _tapTimer = setTimeout(function() { _tapCount = 0; }, 1100);
};

/* — tap handler called by #home-tap-zone onclick — */
window._htap = function(e) {
  var pr = document.querySelector('.phone').getBoundingClientRect();
  window.spawnTapEffect(e.clientX - pr.left, e.clientY - pr.top);
};
