'use strict';

/* ====== DATOS DEL JUEGO ====== */
const KEY = 'bajan-pantalla-v1';

// Estado oculto de la ciudad (pesos)
const STATES = {
  normal: { n: 'Normal',    e: '☀️', w: 50 },
  lluvia: { n: 'Lluvia',    e: '🌧️', w: 30 },
  pico:   { n: 'Hora pico', e: '🚗', w: 20 },
};

// Eventos y efectos
const EVENTS = {
  nada:    { n: 'Nada',               e: '😌', c: '#74d9c3', fx: 'No pasa nada. Sigue la ruta.' },
  manif:   { n: 'Manifestación',      e: '📢', c: '#ffb04a', fx: 'Todos tiran 1 dado: con par continúan, con impar pierden 2 turnos.' },
  feriado: { n: 'Día feriado',        e: '🎉', c: '#b9a3f0', fx: 'El resto de la ronda se tira 1 solo dado en Suben y Bajan.' },
  moderna: { n: 'Maldita modernidad', e: '📱', c: '#ff7b7b', fx: 'Todos pierden 5 pasajeros con sus respectivos pasajes.' },
  sismo:   { n: 'Sismo',              e: '🏚️', c: '#f3d23c', fx: 'Todos los jugadores que no estén en una terminal toman una carta Chingadera.' },
};

// Probabilidad de cada evento según el estado oculto
const PROB = {
  normal: { nada: .50, manif: .20, feriado: .15, moderna: .10, sismo: .05 },
  lluvia: { nada: .30, manif: .40, feriado: .10, moderna: .15, sismo: .05 },
  pico:   { nada: .35, manif: .35, feriado: .00, moderna: .25, sismo: .05 },
};

/* ====== UTILIDADES ====== */
const $ = id => document.getElementById(id);

function pick(weights) {               // {clave: peso} -> clave
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [k, w] of Object.entries(weights)) {
    if ((r -= w) < 0) return k;
  }
  return Object.keys(weights)[0];
}

const fresh = () => ({ round: 1, phase: 'start', hidden: null, events: [], holiday: false });

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch (_) { return null; }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {}
}

let S = load() || fresh();
let busy = false;
let wakeLock = null;

async function keepAwake() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
}

/* ====== ACCIONES ====== */
function startRound() {
  // El estado se guarda codificado y NUNCA se muestra hasta terminar la ronda
  S.hidden = btoa(pick(Object.fromEntries(Object.entries(STATES).map(([k, v]) => [k, v.w]))));
  S.events = [];
  S.holiday = false;
  S.phase = 'play';
  save(); render(); keepAwake();
}

function dobles() {
  if (busy) return;
  busy = true;
  const btn = $('btnDobles');
  btn.disabled = true;

  // animación de sorteo
  const faces = Object.values(EVENTS).map(x => x.e);
  let i = 0;
  $('resName').textContent = 'Sorteando…';
  $('resFx').textContent = '';
  const timer = setInterval(() => { $('resEmoji').textContent = faces[i++ % faces.length]; }, 90);

  setTimeout(() => {
    clearInterval(timer);
    const state = atob(S.hidden);
    const id = pick(PROB[state]);
    S.events.push(id);
    if (id === 'feriado') S.holiday = true;
    save();
    busy = false;
    btn.disabled = false;
    render();
    const card = $('result');
    card.classList.remove('shake');
    void card.offsetWidth;
    if (id === 'sismo') { card.classList.add('shake'); navigator.vibrate && navigator.vibrate([200, 80, 200, 80, 400]); }
    else navigator.vibrate && navigator.vibrate(60);
  }, 1000);
}

function endRound() {
  if (!confirm('¿Terminar la ronda y revelar el estado de la ciudad?')) return;
  S.phase = 'end';
  save(); render();
}

function nextRound() {
  S.round += 1;
  S.phase = 'start';
  S.hidden = null; S.events = []; S.holiday = false;
  save(); render();
}

function resetAll() {
  if (!confirm('¿Reiniciar toda la partida?')) return;
  S = fresh(); save(); render();
}

/* ====== RENDER ====== */
function render() {
  $('roundTag').textContent = 'RONDA ' + S.round;
  ['start', 'play', 'end'].forEach(v => $('view-' + v).classList.toggle('hidden', S.phase !== v));

  if (S.phase === 'play') {
    $('holiday').classList.toggle('hidden', !S.holiday);
    $('count').textContent = S.events.length;

    const last = S.events[S.events.length - 1];
    if (last) {
      const ev = EVENTS[last];
      $('resEmoji').textContent = ev.e;
      $('resName').textContent = ev.n;
      $('resFx').textContent = ev.fx;
      $('result').style.background = ev.c;
    } else {
      $('resEmoji').textContent = '🎲';
      $('resName').textContent = 'Esperando dobles…';
      $('resFx').textContent = 'Presiona el botón cuando alguien saque dobles al moverse.';
      $('result').style.background = '';
    }

    $('log').innerHTML = S.events.map((id, i) =>
      `<li style="--c:${EVENTS[id].c}"><b>#${i + 1}</b><span>${EVENTS[id].e} ${EVENTS[id].n}</span></li>`
    ).reverse().join('');
  }

  if (S.phase === 'end') renderReveal();
}

function renderReveal() {
  const key = atob(S.hidden);
  const st = STATES[key];
  $('revEmoji').textContent = st.e;
  $('revName').textContent = st.n;

  const n = S.events.length;
  const counts = Object.fromEntries(Object.keys(EVENTS).map(k => [k, 0]));
  S.events.forEach(id => counts[id]++);

  const rows = Object.keys(EVENTS).map(k => ({ k, obs: counts[k], exp: n * PROB[key][k] }));
  const max = Math.max(1, ...rows.map(r => Math.max(r.obs, r.exp)));

  $('histo').innerHTML =
    `<div class="legend"><span>▮ SALIERON</span><span>▨ ESPERADOS (${st.n})</span></div>` +
    rows.map(r => `
      <div class="hrow">
        <div class="lab"><span>${EVENTS[r.k].e} ${EVENTS[r.k].n}</span><span>${r.obs} / ${r.exp.toFixed(1)}</span></div>
        <div class="bar obs" style="width:${(r.obs / max) * 100}%"></div>
        <div class="bar exp" style="width:${(r.exp / max) * 100}%"></div>
      </div>`).join('');

  $('histoNote').textContent = n
    ? `Total de eventos en la ronda: ${n}.`
    : 'No salió ningún evento en esta ronda.';
}

/* ====== EVENTOS DE UI ====== */
$('btnStart').onclick = startRound;
$('btnDobles').onclick = dobles;
$('btnEnd').onclick = endRound;
$('btnNext').onclick = nextRound;
$('btnReset').onclick = resetAll;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.phase === 'play') keepAwake();
});

render();