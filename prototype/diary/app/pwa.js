'use strict';

/* ── PWA：注册后主动检查更新（配合 sw 网络优先） ── */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker
    .register('sw.js', { scope: './' })
    .then(function (reg) {
      reg.update();
      setInterval(function () {
        reg.update();
      }, 60 * 60 * 1000);
    })
    .catch(function () {});
}
