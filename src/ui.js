// Interface : écran titre, HUD, toasts de découverte, journal, célébration.
export function createUI() {
  const $ = (id) => document.getElementById(id);

  const els = {
    title: $('title-screen'), startBtn: $('btn-start'),
    hud: $('hud'), places: $('places-count'), dew: $('dew-count'),
    totalPlaces: $('places-total'), totalDew: $('dew-total'),
    hint: $('hint'), toast: $('toast'), journal: $('journal'),
    journalList: $('journal-list'), btnJournal: $('btn-journal'),
    btnSound: $('btn-sound'), btnClose: $('btn-journal-close'),
    vignette: $('vignette'), flash: $('flash'), reset: $('btn-reset'),
  };

  let toastTimer = null;
  let hintShown = false;

  function showTitle() { els.title.classList.remove('hidden'); }
  function hideTitle() {
    els.title.classList.add('gone');
    setTimeout(() => els.title.classList.add('hidden'), 900);
  }

  function toast(icon, title, subtitle, ms = 4200) {
    els.toast.innerHTML = `
      <div class="toast-card ui">
        <div class="toast-icon">${icon}</div>
        <div>
          <div class="toast-kicker">${subtitle}</div>
          <div class="toast-title">${title}</div>
        </div>
      </div>`;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
  }

  function showHint(text) {
    if (hintShown) return;
    els.hint.innerHTML = text;
    els.hint.classList.add('show');
  }
  function hideHint() {
    hintShown = true;
    els.hint.classList.remove('show');
  }

  function setCounts(places, totalPlaces, dew, totalDew) {
    els.places.textContent = places;
    els.dew.textContent = dew;
    els.totalPlaces.textContent = totalPlaces;
    els.totalDew.textContent = totalDew;
  }

  function setVignette(v) { els.vignette.style.opacity = v.toFixed(3); }

  function renderJournal(landmarks) {
    els.journalList.innerHTML = '';
    for (const lm of landmarks) {
      const row = document.createElement('div');
      row.className = 'jrow' + (lm.found ? ' found' : '');
      row.innerHTML = lm.found
        ? `<div class="jicon">${lm.icon}</div><div><div class="jname">${lm.name}</div><div class="jdesc">${lm.desc}</div></div>`
        : `<div class="jicon">❓</div><div><div class="jname">Lieu mystérieux</div><div class="jdesc">Continue d'explorer…</div></div>`;
      els.journalList.appendChild(row);
    }
  }

  function openJournal(landmarks) {
    renderJournal(landmarks);
    els.journal.classList.remove('hidden');
  }
  function closeJournal() { els.journal.classList.add('hidden'); }

  function celebrate() {
    els.flash.classList.add('go');
    setTimeout(() => els.flash.classList.remove('go'), 3800);
  }

  function setSoundIcon(muted) { els.btnSound.textContent = muted ? '🔇' : '🔊'; }

  return {
    els, showTitle, hideTitle, toast, showHint, hideHint, setCounts,
    setVignette, openJournal, closeJournal, celebrate, setSoundIcon,
    onStart(fn) { els.startBtn.addEventListener('click', fn); },
    onJournal(fn) { els.btnJournal.addEventListener('click', fn); },
    onCloseJournal(fn) { els.btnClose.addEventListener('click', fn); },
    onSound(fn) { els.btnSound.addEventListener('click', fn); },
    onReset(fn) { els.reset.addEventListener('click', fn); },
  };
}
