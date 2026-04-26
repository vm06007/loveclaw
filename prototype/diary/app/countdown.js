'use strict';

/* ══ MAP COUNTDOWN ══ */
window.toggleMapCountdown = function() {
  var popup = document.getElementById('map-countdown');
  if (!popup) return;
  var showing = popup.style.display !== 'none';
  popup.style.display = showing ? 'none' : 'block';
  if (!showing) updateMeetCountdown();
};

window.editMeetDate = function() {
  var edit = document.getElementById('mcd-edit');
  var btn  = document.getElementById('mcd-edit-btn');
  if (!edit) return;
  var showing = edit.style.display !== 'none';
  edit.style.display = showing ? 'none' : 'flex';
  if (btn) btn.textContent = showing ? '✎ SET DATE' : '✕ CANCEL';
};

window.saveMeetDate = function() {
  var inp = document.getElementById('mcd-date-input');
  if (!inp || !inp.value) return;
  try { localStorage.setItem('pixelMeetDate', inp.value); } catch(e) {}
  window.editMeetDate();
  updateMeetCountdown();
};

function updateMeetCountdown() {
  var dEl = document.getElementById('mcd-days');
  var hEl = document.getElementById('mcd-hrs');
  var mEl = document.getElementById('mcd-mins');
  if (!dEl) return;
  var ds = '';
  try { ds = localStorage.getItem('pixelMeetDate') || ''; } catch(e) {}
  if (!ds) { dEl.textContent = hEl.textContent = mEl.textContent = '--'; return; }
  var target = new Date(ds + 'T00:00:00');
  var diff = target - new Date();
  if (diff <= 0) {
    dEl.textContent = hEl.textContent = mEl.textContent = '00'; return;
  }
  var days = Math.floor(diff / 86400000);
  var hrs  = Math.floor((diff % 86400000) / 3600000);
  var mins = Math.floor((diff % 3600000)  / 60000);
  dEl.textContent = String(days).padStart(2, '0');
  hEl.textContent = String(hrs).padStart(2, '0');
  mEl.textContent = String(mins).padStart(2, '0');
}
window.updateMeetCountdown = updateMeetCountdown;

setInterval(updateMeetCountdown, 30000);
updateMeetCountdown();
