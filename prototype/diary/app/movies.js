'use strict';

/* ══ MOVIE LIST ══ */
var _mvMovies = [];

function _mvLoad() {
  try { _mvMovies = JSON.parse(localStorage.getItem('pixelMovies') || '[]'); }
  catch(e) { _mvMovies = []; }
}
function _mvSave() {
  try { localStorage.setItem('pixelMovies', JSON.stringify(_mvMovies)); } catch(e) {}
}

function _mvRender() {
  var list  = document.getElementById('mv-list');
  var stats = document.getElementById('mv-stats');
  if (!list) return;
  var watched = _mvMovies.filter(function(m) { return m.done; }).length;
  if (stats) stats.textContent = watched + ' / ' + _mvMovies.length + ' WATCHED';
  if (!_mvMovies.length) {
    list.innerHTML = '<div class="mvp-empty">🎬<br><br>NO MOVIES YET<br><br>ADD SOMETHING TO WATCH !</div>';
    return;
  }
  list.innerHTML = '';
  _mvMovies.forEach(function(movie, idx) {
    var item  = document.createElement('div');
    item.className = 'mvp-item' + (movie.done ? ' watched' : '');

    var chk = document.createElement('div');
    chk.className = 'mvp-check';
    chk.textContent = movie.done ? '✓' : '';
    chk.onclick = function() { _mvToggle(idx); };

    var txt = document.createElement('div');
    txt.className = 'mvp-text';
    txt.textContent = movie.title;
    txt.onclick = function() { _mvToggle(idx); };

    var del = document.createElement('button');
    del.className = 'mvp-del';
    del.textContent = '×';
    del.onclick = function(e) { e.stopPropagation(); _mvDelete(idx); };

    item.appendChild(chk);
    item.appendChild(txt);
    item.appendChild(del);
    list.appendChild(item);
  });
}

window._mvToggle = function(idx) {
  if (_mvMovies[idx]) {
    _mvMovies[idx].done = !_mvMovies[idx].done;
    _mvSave(); _mvRender();
  }
};
window._mvDelete = function(idx) {
  _mvMovies.splice(idx, 1);
  _mvSave(); _mvRender();
};

window.openMoviePanel = function() {
  _mvLoad(); _mvRender();
  var panel = document.getElementById('movie-panel');
  if (!panel) return;
  panel.style.display = 'flex';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { panel.classList.add('open'); });
  });
  setTimeout(function() {
    var inp = document.getElementById('mv-inp');
    if (inp) inp.focus();
  }, 350);
};

window.closeMoviePanel = function() {
  var panel = document.getElementById('movie-panel');
  if (!panel) return;
  panel.classList.remove('open');
  setTimeout(function() { panel.style.display = 'none'; }, 340);
};

window.addMovie = function() {
  var inp = document.getElementById('mv-inp');
  if (!inp) return;
  var title = inp.value.trim();
  if (!title) return;
  _mvMovies.unshift({ title: title, done: false });
  _mvSave(); _mvRender();
  inp.value = '';
  inp.focus();
};
