'use strict';

/* ── Global toast ── */
var tT;
function showToast(msg) {
  var t = document.getElementById('gtst');
  t.textContent = msg;
  t.style.opacity   = '1';
  t.style.transform = 'translateX(-50%) translateY(0)';
  clearTimeout(tT);
  tT = setTimeout(function() {
    t.style.opacity   = '0';
    t.style.transform = 'translateX(-50%) translateY(60px)';
  }, 2600);
}
window.showToast = showToast;

/* ── Search shortcut (Enter key) ── */
(function() {
  var srch = document.getElementById('srch');
  if (srch) {
    srch.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && typeof window.doSearch === 'function') window.doSearch();
    });
  }
})();
