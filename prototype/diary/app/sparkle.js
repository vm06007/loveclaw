'use strict';

/* ══ BG SPARKLE: twinkling pixel dots on the background ══ */
(function startBgSparkle() {
  var bg = document.getElementById('phone-home-bg');
  if (!bg) return;
  function spawn() {
    var dot = document.createElement('div');
    var size = Math.random() < 0.55 ? 2 : 3;
    var warm = Math.random() < 0.55;
    dot.style.cssText = [
      'position:absolute', 'pointer-events:none', 'z-index:5',
      'width:' + size + 'px', 'height:' + size + 'px', 'border-radius:1px',
      'left:' + (4 + Math.random() * 90) + '%',
      'top:'  + (4 + Math.random() * 82) + '%',
      'background:' + (warm ? 'rgba(255,235,140,0.92)' : 'rgba(255,255,255,0.95)')
    ].join(';');
    var dur = (0.6 + Math.random() * 0.9).toFixed(2);
    dot.style.animation = 'sparkDot ' + dur + 's ease-in-out forwards';
    bg.appendChild(dot);
    dot.addEventListener('animationend', function() { if (dot.parentNode) dot.remove(); });
  }
  setInterval(function() {
    var n = 3 + Math.floor(Math.random() * 4);
    for (var i = 0; i < n; i++) setTimeout(spawn, Math.random() * 350);
  }, 480);
})();
