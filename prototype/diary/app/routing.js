'use strict';

/* ── Routing ── */
var mapReady = false;

window.switchTo = function(id) {
  /* close movie panel if open */
  var _mvp = document.getElementById('movie-panel');
  if (_mvp && _mvp.classList.contains('open') && typeof window.closeMoviePanel === 'function') {
    window.closeMoviePanel();
  }
  document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
  ['s-home', 's-map', 's-bottle'].forEach(function(sid, i) {
    document.getElementById(['nb-home', 'nb-map', 'nb-btl'][i]).classList.toggle('active', sid === id);
  });
  var cal = document.getElementById('home-px-cal');
  if (cal) cal.classList.toggle('cal-on-home', id === 's-home');
  var nav = document.getElementById('home-state-nav');
  if (nav) nav.style.display = (id === 's-home') ? 'flex' : 'none';
  var poem = document.getElementById('home-poem');
  if (poem) poem.style.display = (id === 's-home') ? 'block' : 'none';
  var tz = document.getElementById('home-tap-zone');
  if (tz) tz.style.display = (id === 's-home') ? 'block' : 'none';
  /* TV icon: only on home + movie scene — driven by body class */
  var _curState = parseInt((document.getElementById('s-home') || {}).getAttribute('data-home-state'), 10);
  document.body.classList.toggle('scene-movie', id === 's-home' && _curState === 9);
  if (id === 's-map') {
    if (!mapReady) { mapReady = true; }
    if (typeof initLeaflet === 'function') initLeaflet();
    if (typeof updateMeetCountdown === 'function') updateMeetCountdown();
  }
  if (id === 's-home') {
    if (typeof refreshHomeScreenIfNewDay === 'function') refreshHomeScreenIfNewDay();
  }
};
