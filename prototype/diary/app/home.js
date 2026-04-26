'use strict';

/* 改这个数字，刷新后看右下角：若显示 v3 说明新代码生效，否则是缓存 */
window.PIXEL_VER = 3;

var HOME_BG_FILES = [
  'images/carcamping.png',   // 1  FOREST
  'images/beachparty.jpg',   // 2  SEASIDE
  'images/citywalk.jpg',     // 3  CITY
  'images/diving.jpg',       // 4  DIVING
  'images/citymotor.jpg',    // 5  MOTO
  'images/driving.jpg',      // 6  DRIVE
  'images/working.png',      // 7  WORK
  'images/sleep.png',        // 8  SLEEP
  'images/movie.png',        // 9  MOVIE
  'images/adventure.png'     // 10 ADVENTURE
];

var HOME_LABELS = ['FOREST', 'SEASIDE', 'CITY', 'DIVING', 'MOTO', 'DRIVE', 'WORK', 'SLEEP', 'MOVIE', 'ADVENTURE'];

var DAILY_POEMS = [
  'I carry your heart with me.',
  'You are my sun in winter.',
  'Love is the only gold.',
  'You and me. Always.',
  'Together is beautiful.',
  'You make me whole.',
  'My heart is yours.',
  'Every day I think of you.',
  'Still I love you.',
  'You are my peace.',
  'Near or far, we are ours.',
  'Two hearts, one path.',
  'Thank you. For all of it.',
  'You complete me.',
  'I love you more today.',
  'Missing you always.',
  'Home is where you are.',
  'You are my light.',
  'Always and forever, yours.',
  'Love never ends.',
  'You are enough.',
  'My favorite person.',
  'Stay with me. Please.',
  'Our story is my favorite.',
  'I found you. Lucky me.',
  'You are the poem.',
  'Forever is not long enough.',
  'Counting days. Not long now.',
  'I think of you. Always.',
  'Soon. Very soon. Promise.',
  'You are worth every mile.'
];

/** 换素材后改成 2、3… 即可让浏览器重新拉图片 */
var HOME_ASSET_V = '2';

var homeDayKey = '';

function dayKey(d) {
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

function homeBgUrl(n) {
  var path = HOME_BG_FILES[n - 1] || 'images/home' + n + '.png';
  var sep = path.indexOf('?') >= 0 ? '&' : '?';
  return path + sep + 'v=' + encodeURIComponent(HOME_ASSET_V);
}

function applyHomeLabels() {
  var btns = document.querySelectorAll('.home-state-btn .home-state-label');
  for (var i = 0; i < btns.length; i++) {
    if (HOME_LABELS[i]) btns[i].textContent = HOME_LABELS[i];
  }
}

window.setHomeState = function(n) {
  n = parseInt(n, 10);
  if (n < 1 || n > 10) return;
  var root = document.getElementById('s-home');
  if (!root) return;
  root.setAttribute('data-home-state', String(n));
  document.querySelectorAll('#phone-home-bg .phone-bg-img').forEach(function(img) {
    img.classList.toggle('active', parseInt(img.getAttribute('data-state'), 10) === n);
  });
  document.querySelectorAll('.home-state-btn').forEach(function(b) {
    b.classList.toggle('active', parseInt(b.getAttribute('data-state'), 10) === n);
  });
  /* TV icon: body class controls visibility — only home + state 9 */
  var onHome = document.getElementById('s-home').classList.contains('active');
  document.body.classList.toggle('scene-movie', n === 9 && onHome);
  try {
    localStorage.setItem('pixelHomeScene', String(n));
  } catch (e) {}
};

function renderDailyPoem() {
  var el = document.getElementById('poem-text');
  if (!el) return;
  var d = new Date();
  var start = new Date(d.getFullYear(), 0, 0);
  var dayOfYear = Math.floor((d - start) / 86400000);
  var idx = dayOfYear % DAILY_POEMS.length;
  el.textContent = '\u201c' + DAILY_POEMS[idx] + '\u201d';
}

function renderHomeCalendar() {
  var now = new Date();
  var mons = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  var elM = document.getElementById('cal-month-abbr');
  var elD = document.getElementById('cal-day-n');
  if (elM) elM.textContent = mons[now.getMonth()];
  if (elD) elD.textContent = String(now.getDate());
}

function applyHudDate() {
  var el = document.getElementById('hud-date');
  if (!el) return;
  var n = new Date();
  var wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  el.textContent = wk[n.getDay()] + ' · 今日 ' + n.getDate() + ' 日';
}

function initHomeScreen() {
  applyHomeLabels();
  applyHudDate();
  renderHomeCalendar();
  renderDailyPoem();
  homeDayKey = dayKey(new Date());
  var saved = 10; // default: ADVENTURE
  try {
    saved = parseInt(localStorage.getItem('pixelHomeScene'), 10) || 10;
  } catch (e) {}
  if (saved < 1 || saved > 10) saved = 10;
  setHomeState(saved);
}

function refreshHomeScreenIfNewDay() {
  var k = dayKey(new Date());
  if (k !== homeDayKey) {
    homeDayKey = k;
    applyHudDate();
    renderHomeCalendar();
    renderDailyPoem();
  }
}

window.homeBgUrl = homeBgUrl;
window.refreshHomeScreenIfNewDay = refreshHomeScreenIfNewDay;

(function() {
  initHomeScreen();
  var v = document.createElement('div');
  v.className = 'pixel-ver';
  v.textContent = 'v' + (window.PIXEL_VER || 1);
  v.title = '改 app.js 里 PIXEL_VER 再刷新，数字变了就说明新代码生效';
  var home = document.getElementById('s-home');
  if (home) home.appendChild(v);
})();
