'use strict';

/* ── Entry point ──
 * The original monolithic app.js was split into focused modules under app/.
 * This loader keeps the public surface unchanged (window.* globals) and the
 * load order identical to the old single-file version.
 */
(function () {
  var v = '?v=' + Date.now();
  var files = [
    'app/toast.js',       // showToast + search-Enter shortcut
    'app/routing.js',     // switchTo between screens
    'app/home.js',        // home screen state, labels, poem, calendar + init IIFE
    'app/sparkle.js',     // background sparkle dots
    'app/tap.js',         // tap hearts/stars/bubble/ripple/combo
    'app/bottle.js',      // bottle + miss-you
    'app/movies.js',      // movie watchlist panel
    'app/countdown.js',   // map meeting countdown
    'app/pwa.js'          // service worker registration
  ];
  function load(i) {
    if (i >= files.length) return;
    var s = document.createElement('script');
    s.src = files[i] + v;
    s.onload = function () { load(i + 1); };
    s.onerror = function () { load(i + 1); };
    document.body.appendChild(s);
  }
  load(0);
})();
