'use strict';

/* ── Miss You ── */
window.sendMiss = function() {
  var t = document.getElementById('mtst');
  t.classList.add('show');
  spawnParts(document.getElementById('hbtn'), ['♥', '✦', '·', '★']);
  setTimeout(function() { t.textContent = '♥ HE WILL KNOW.'; }, 600);
  setTimeout(function() {
    t.classList.remove('show');
    setTimeout(function() { t.textContent = '💌 SENDING MISS YOU…'; }, 400);
  }, 2800);
};

function spawnParts(el, chars) {
  var pr = document.querySelector('.phone').getBoundingClientRect();
  var er = el.getBoundingClientRect();
  for (var i = 0; i < 8; i++) (function(i) {
    var p = document.createElement('div');
    p.className = 'prt';
    p.textContent = chars[Math.floor(Math.random() * chars.length)];
    p.style.left  = (er.left - pr.left + er.width  / 2 + (Math.random() - .5) * 30) + 'px';
    p.style.top   = (er.top  - pr.top  + er.height / 2) + 'px';
    p.style.color = ['#e8708a','#f5c842','#f8b0c8','#c880c8'][Math.floor(Math.random() * 4)];
    p.style.zIndex = 150;
    p.style.setProperty('--px', ((Math.random() - .5) * 60) + 'px');
    p.style.setProperty('--py', (-40 - Math.random() * 30) + 'px');
    p.style.animationDelay = (i * .07) + 's';
    document.querySelector('.phone').appendChild(p);
    p.addEventListener('animationend', function() { p.remove(); });
  })(i);
}
window.spawnParts = spawnParts;

/* ── Bottle ── */
var bOpen = false, musicOn = false;

window.openBottle = function() {
  if (bOpen) return;
  var ck = document.createElement('div');
  ck.className = 'cpop';
  document.getElementById('bwrap').appendChild(ck);
  setTimeout(function() {
    ck.remove();
    bOpen = true;
    document.getElementById('rpanel').classList.add('open');
  }, 500);
};

window.closeRecv = function() {
  document.getElementById('rpanel').classList.remove('open');
  bOpen = false;
};

window.setTab = function(i, btn) {
  document.querySelectorAll('.btab').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  var wp = document.getElementById('wpanel');
  if (i === 1) {
    wp.classList.add('open');
    document.getElementById('dft').textContent = '~' + (Math.floor(Math.random() * 23) + 1) + ' HOURS';
  } else {
    wp.classList.remove('open');
  }
};

window.closeWrite = function() {
  document.getElementById('wpanel').classList.remove('open');
  document.querySelectorAll('.btab').forEach(function(b) { b.classList.remove('active'); });
  document.querySelectorAll('.btab')[0].classList.add('active');
};

window.sendBottle = function() {
  if (!document.getElementById('btxt').value.trim()) { showToast('WRITE SOMETHING FIRST!'); return; }
  showToast('🍾 BOTTLE THROWN INTO THE SEA!');
  document.getElementById('btxt').value = '';
  var w = document.getElementById('bwrap');
  w.style.transition = 'transform .8s, opacity .8s';
  w.style.transform  = 'translateX(200%) translateY(-100px) rotate(45deg)';
  w.style.opacity    = '0';
  setTimeout(function() {
    w.style.transition = 'none';
    w.style.transform  = 'translateX(-50%)';
    w.style.opacity    = '1';
  }, 1200);
  window.closeWrite();
};

window.toggleMusic = function() {
  musicOn = !musicOn;
  var btn = document.getElementById('mbtn');
  btn.style.background = musicOn ? '#4a9a4a' : '#3a2a6a';
  btn.innerHTML = musicOn ? '<span>▶</span> ATTACHED!' : '<span>📼</span> ATTACH SONG';
  if (musicOn) showToast('♪ SONG ATTACHED');
};
