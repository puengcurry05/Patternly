/* Patternly client. The browser never holds an answer: it fetches examples +
   question from the API, sends each guess to the server, and only learns the
   rule/answer when the server says the game is over. Streak + stats are
   computed server-side from recorded plays. localStorage holds only the
   player's id (guest identity) and a couple of UI flags. */

'use strict';

const $ = (sel) => document.querySelector(sel);

// ---------- Supabase client ----------
// Using the official client (not raw fetch) so that once a player signs in,
// every RPC call below automatically carries their session token instead of
// the anon key. The database then prefers auth.uid() over the guest id we
// pass — see get_session/submit_guess/submit_report — with zero branching
// needed here. Signed out, it behaves exactly like the anon-key flow before.
const CFG = window.PATTERNLY_CONFIG;
const sbClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);

async function rpc(fn, params) {
  const { data, error } = await sbClient.rpc(fn, params || {});
  if (error) throw error;
  return data;
}
const API = {
  session: (pid) => rpc('get_session', { p_player_id: pid }),
  guess: (p) => rpc('submit_guess', {
    p_player_id: p.playerId, p_puzzle_id: p.puzzleId, p_guess: p.guess,
    p_context: p.context, p_difficulty: p.difficulty,
  }),
  report: (p) => rpc('submit_report', {
    p_player_id: p.playerId, p_puzzle_id: p.puzzleId, p_type: p.type,
    p_claimed_answer: p.claimedAnswer ?? null, p_note: p.note ?? null,
  }),
  archive: () => rpc('list_archive', {}),
};

// ---------- player identity (guest-first) ----------
function playerId() {
  let id = localStorage.getItem('patternly_player');
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || ('p_' + Math.random().toString(36).slice(2) + Date.now());
    localStorage.setItem('patternly_player', id);
  }
  return id;
}
const PID = playerId();

// ---------- app state (mirrors last server session) ----------
let session = null;     // { day, puzzles:{easy,hard}, results:{easy,hard}, stats }
let game = null;        // current play: { diff, puzzle, context, livesUsed, guesses, input, confirming }
let resultContext = null;

// ---------- screen router ----------
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`#screen-${id}`).classList.add('active');
}

// ---------- load / refresh session ----------
async function loadSession() {
  try {
    session = await API.session(PID);
  } catch (e) {
    toast('Connection problem — retrying…');
    setTimeout(loadSession, 2000);
    return;
  }
  renderHome();
}

// ---------- HOME ----------
function renderHome() {
  if (!session) { show('home'); return; }
  const now = new Date();
  $('#homeDate').textContent = now.toLocaleDateString(undefined,
    { weekday: 'long', month: 'long', day: 'numeric' }) + `  ·  No.${session.day}`;

  const streak = session.stats.streak;
  $('#homeStreak').innerHTML = streak > 0
    ? `🔥 <b>${streak}</b> day streak`
    : `<span style="color:var(--muted)">Start a streak today</span>`;

  ['easy', 'hard'].forEach(diff => {
    const r = session.results[diff];
    const card = $(`#card${cap(diff)}`);
    const status = $(`#${diff}Status`);
    const sub = $(`#${diff}Sub`);
    const done = r && r.gameOver;
    card.classList.toggle('solved', !!done && r.solved);
    card.classList.toggle('failed', !!done && !r.solved);
    if (done) {
      status.textContent = r.solved ? '✓' : '✕';
      status.style.color = r.solved ? 'var(--good)' : 'var(--bad)';
      const lost = r.livesUsed;
      sub.textContent = r.solved
        ? `Solved with ${lost} ${lost === 1 ? 'life' : 'lives'} lost`
        : 'Better luck tomorrow';
    } else if (r && r.guesses.length) {
      status.textContent = '›';
      status.style.color = '';
      sub.textContent = `In progress — ${3 - r.livesUsed} lives left`;
    } else {
      status.textContent = '›';
      status.style.color = '';
      sub.textContent = diff === 'easy' ? "Today's gentle warm-up" : 'For the pattern hunters';
    }
  });
  show('home');
}
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// ---------- start a puzzle ----------
function startDaily(diff) {
  if (!session) return;
  const r = session.results[diff];
  const puzzle = session.puzzles[diff];
  if (r && r.gameOver) { openResult(diff, puzzle, r); return; }   // already done → show result
  game = {
    diff, puzzle, context: 'daily',
    livesUsed: r ? r.livesUsed : 0,
    guesses: r ? r.guesses.slice() : [],
    input: '', confirming: false,
  };
  enterPuzzle();
}
function startArchive(puzzle) {
  game = { diff: puzzle.difficulty, puzzle, context: 'archive', livesUsed: 0, guesses: [], input: '', confirming: false };
  enterPuzzle();
}

function enterPuzzle() {
  renderExamples();
  renderLives();
  renderWrongList();
  updateGuessDisplay();
  show('puzzle');
}

function renderExamples() {
  const box = $('#examples');
  box.innerHTML = '';
  game.puzzle.examples.forEach(([i, o]) => {
    box.insertAdjacentHTML('beforeend',
      `<div class="eqrow"><div class="in">${i}</div><div class="arrow">→</div><div class="out">${o}</div></div>`);
  });
  box.insertAdjacentHTML('beforeend',
    `<div class="eqrow question"><div class="in">${game.puzzle.question}</div><div class="arrow">→</div><div class="out">?</div></div>`);
}
function renderLives() {
  const box = $('#lives');
  box.innerHTML = '';
  for (let i = 0; i < 3; i++)
    box.insertAdjacentHTML('beforeend', `<div class="dot ${i < game.livesUsed ? 'lost' : ''}"></div>`);
}
function renderWrongList() {
  $('#wrongList').innerHTML = game.guesses.length ? game.guesses.map(g => `<span>${g}</span>`).join('') : '';
}
function updateGuessDisplay() {
  const disp = $('#guessDisplay'), btn = $('#guessBtn');
  if (game.input === '') {
    disp.textContent = 'tap the numbers'; disp.classList.add('empty');
    btn.disabled = true; btn.textContent = 'Guess'; btn.classList.remove('confirm');
    game.confirming = false;
  } else {
    disp.textContent = game.input; disp.classList.remove('empty'); btn.disabled = false;
    btn.textContent = game.confirming ? `Lock in ${game.input}?` : 'Guess';
    btn.classList.toggle('confirm', game.confirming);
  }
}

function pressKey(val) {
  if (!game) return;
  game.confirming = false;
  if (val === 'clear') game.input = '';
  else if (val === 'back') game.input = game.input.slice(0, -1);
  else if (game.input.length < 9) game.input += val;
  updateGuessDisplay();
}

async function pressGuess() {
  if (!game || game.input === '' || game.submitting) return;
  if (!game.confirming) { game.confirming = true; updateGuessDisplay(); return; }

  game.submitting = true;
  $('#guessBtn').disabled = true;
  const value = Number(game.input);
  let res;
  try {
    res = await API.guess({
      playerId: PID, puzzleId: game.puzzle.id, guess: value,
      context: game.context, difficulty: game.diff,
    });
  } catch (e) {
    game.submitting = false; $('#guessBtn').disabled = false;
    toast('Connection problem — try again');
    return;
  }
  game.submitting = false;
  game.confirming = false;

  // server is source of truth for lives + guesses
  game.guesses = res.guesses;
  game.livesUsed = res.livesUsed;
  game.input = '';
  renderLives();
  renderWrongList();
  updateGuessDisplay();

  if (!res.correct) {
    const disp = $('#guessDisplay');
    disp.classList.remove('shake'); void disp.offsetWidth; disp.classList.add('shake');
  }

  if (res.gameOver) {
    if (game.context === 'daily' && session) session.results[game.diff] = clientResult(res);
    if (game.context === 'daily') loadSessionQuiet();   // refresh stats/streak in background
    openResult(game.diff, game.puzzle, res);
  }
}
function clientResult(res) {
  return { solved: res.solved, livesUsed: res.livesUsed, guesses: res.guesses, gameOver: true, reveal: res.reveal, solveRate: res.solveRate };
}
async function loadSessionQuiet() { try { session = await API.session(PID); } catch {} }

// ---------- RESULT ----------
let countdownTimer = null;
function openResult(diff, puzzle, res) {
  const solved = res.solved;
  const lost = res.livesUsed;
  $('#resultEmoji').textContent = solved ? '🎉' : '🧠';
  const title = $('#resultTitle');
  title.textContent = solved ? 'Solved!' : 'Out of lives';
  title.className = 'result-title ' + (solved ? 'win' : 'lose');
  $('#resultSub').textContent = solved
    ? (lost === 0 ? 'Flawless — first try.' : `You got it with ${lost} ${lost === 1 ? 'life' : 'lives'} lost.`)
    : 'The rule is revealed below.';

  const reveal = res.reveal;
  $('#revealRule').textContent = reveal.rule;
  $('#revealEq').innerHTML = `${reveal.question} <span style="color:var(--muted)">→</span> <b>${reveal.answer}</b>`;
  $('#solveRate').innerHTML = res.solveRate != null
    ? `<b>${res.solveRate}%</b> of players solved this one`
    : `You're one of the first to play this — solve rate coming soon`;

  const cd = $('#countdown');
  if (countdownTimer) clearInterval(countdownTimer);
  if (game && game.context === 'archive') {
    cd.innerHTML = '';
  } else {
    const tick = () => {
      const now = new Date();
      const nextMidnightUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      const diffMs = nextMidnightUTC - now.getTime();
      const h = String(Math.floor(diffMs / 3.6e6)).padStart(2, '0');
      const m = String(Math.floor((diffMs % 3.6e6) / 6e4)).padStart(2, '0');
      const s = String(Math.floor((diffMs % 6e4) / 1e3)).padStart(2, '0');
      cd.innerHTML = `Next puzzle in <b>${h}:${m}:${s}</b>`;
    };
    tick(); countdownTimer = setInterval(tick, 1000);
  }
  resultContext = { diff, puzzle, archive: !!(game && game.context === 'archive') };
  show('result');
}

// ---------- SHARE ----------
function buildShareText() {
  if (!session) return '';
  const lines = [`Patternly No.${session.day}`];
  ['easy', 'hard'].forEach(diff => {
    const r = session.results[diff];
    if (!r || !r.gameOver) return;
    const label = cap(diff);
    let squares = '';
    const misses = r.solved ? r.livesUsed : 3;
    for (let i = 0; i < misses; i++) squares += '🟥';
    if (r.solved) squares += '🟩';
    lines.push(`${label} ${squares || '—'}`);
  });
  if (session.stats.streak > 0) lines.push(`🔥 ${session.stats.streak} day streak`);
  lines.push('https://puengcurry05.github.io/Patternly/');
  return lines.join('\n');
}
function doShare() {
  const text = buildShareText();
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'), () => toast('Could not copy'));
}

// ---------- REPORT ----------
let reportType = null;
async function submitReport() {
  if (!reportType || !resultContext) return;
  const claimed = reportType === 'alt_answer' ? Number($('#altAnswerInput').value) : undefined;
  try {
    await API.report({ playerId: PID, puzzleId: resultContext.puzzle.id, type: reportType, claimedAnswer: claimed });
    closeOverlay($('#overlay-report'));
    toast('Report sent — thank you');
  } catch { toast('Could not send report'); }
}

// ---------- STATS ----------
function renderStats() {
  const st = session ? session.stats : { played: 0, winPct: 0, streak: 0, maxStreak: 0, distribution: { 0:0,1:0,2:0,fail:0 } };
  $('#statsGrid').innerHTML = `
    <div><div class="num">${st.played}</div><div class="lbl">Played</div></div>
    <div><div class="num">${st.winPct}</div><div class="lbl">Win %</div></div>
    <div><div class="num">${st.streak}</div><div class="lbl">Streak</div></div>
    <div><div class="num">${st.maxStreak}</div><div class="lbl">Max</div></div>`;
  const d = st.distribution;
  const rows = [['1st try', d[0], false], ['2nd try', d[1], false], ['3rd try', d[2], false], ['Failed', d.fail, true]];
  const max = Math.max(1, ...rows.map(r => r[1]));
  $('#distBox').innerHTML = rows.map(([label, count, fail]) => `
    <div class="dist-row"><div class="k">${label}</div>
      <div class="dist-bar ${fail ? 'fail' : ''}" style="width:${(count / max) * 100}%">${count}</div></div>`).join('');
}

// ---------- OPTIONAL LOGIN ----------
// Entirely optional — guests play fully featured with no account. Signing in
// just lets the same streak/history follow you to another device: the backend
// transparently prefers the authenticated user's id over the local guest id
// (see get_session/submit_guess), so nothing here needs to branch on it.
// Email + password (not magic-link) — simpler and avoids Supabase's low-volume
// test-tier email sending limits. Can be revisited later.
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
let authSession = null;   // { email } | null
let authNotice = null;    // one-line status shown instead of the form, e.g. "check your email"

function renderAuthRow() {
  const box = $('#statsAuth');
  if (!box) return;
  if (authSession) {
    box.innerHTML = `Signed in as ${esc(authSession.email)} · <button class="link-btn auth-link" id="signOutBtn">Sign out</button>`;
  } else if (authNotice) {
    box.innerHTML = `${esc(authNotice)} · <button class="link-btn auth-link" id="signInToggle">Back to sign in</button>`;
  } else {
    box.innerHTML = `Not signed in · <button class="link-btn auth-link" id="signInToggle">Sign in to keep your streak on any device</button>
      <div id="signInForm" style="display:none;">
        <input id="authEmail" class="report-input" placeholder="you@example.com" inputmode="email" autocomplete="email" />
        <input id="authPassword" class="report-input" type="password" placeholder="Password" autocomplete="current-password" />
        <div class="auth-btn-row">
          <button class="modal-btn" id="signInBtn">Sign in</button>
          <button class="modal-btn secondary" id="signUpBtn">Create account</button>
        </div>
      </div>`;
  }
}

async function doSignIn() {
  const email = $('#authEmail').value.trim(), password = $('#authPassword').value;
  if (!email || !password) { toast('Enter your email and password'); return; }
  $('#signInBtn').disabled = true;
  const { error } = await sbClient.auth.signInWithPassword({ email, password });
  if (error) { toast(error.message); $('#signInBtn').disabled = false; return; }
  // onAuthStateChange handles the rest (SIGNED_IN → re-render + reload session)
}

async function doSignUp() {
  const email = $('#authEmail').value.trim(), password = $('#authPassword').value;
  if (!email || !password) { toast('Enter your email and password'); return; }
  $('#signUpBtn').disabled = true;
  const { data, error } = await sbClient.auth.signUp({ email, password });
  if (error) { toast(error.message); $('#signUpBtn').disabled = false; return; }
  if (!data.session) {
    // Project requires email confirmation before first sign-in.
    authNotice = `Check ${email} to confirm your account, then sign in`;
    renderAuthRow();
  }
  // If a session came back immediately, onAuthStateChange handles the rest.
}

function wireAuthRow() {
  $('#statsAuth').addEventListener('click', (e) => {
    if (e.target.id === 'signInToggle') { authNotice = null; renderAuthRow(); $('#signInForm').style.display = 'block'; }
    else if (e.target.id === 'signInBtn') doSignIn();
    else if (e.target.id === 'signUpBtn') doSignUp();
    else if (e.target.id === 'signOutBtn') sbClient.auth.signOut();
  });
  sbClient.auth.onAuthStateChange((event, sessionObj) => {
    authSession = sessionObj && sessionObj.user ? { email: sessionObj.user.email } : null;
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      authNotice = null;
      loadSession();   // re-fetch: the effective player identity just changed
    }
    renderAuthRow();
  });
}

// ---------- deep link from Community page (index.html?play=<id>) ----------
async function maybeStartFromUrl() {
  const pid = new URLSearchParams(location.search).get('play');
  if (!pid) return;
  history.replaceState({}, '', location.pathname);   // clean the URL
  try {
    const puzzle = (await API.archive()).puzzles.find(p => p.id === pid);
    if (puzzle) startArchive(puzzle);
  } catch { toast('Could not load that puzzle'); }
}

// ---------- overlays + toast ----------
function openOverlay(id) { $(`#overlay-${id}`).classList.add('active'); }
function closeOverlay(el) { el.classList.remove('active'); }
let toastTimer = null;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- wiring ----------
function buildKeypad() {
  const pad = $('#keypad');
  const keys = ['1','2','3','4','5','6','7','8','9','clear','0','back'];
  pad.innerHTML = keys.map(k => {
    if (k === 'clear') return `<button class="key util" data-k="clear">Clear</button>`;
    if (k === 'back')  return `<button class="key util" data-k="back">⌫</button>`;
    return `<button class="key" data-k="${k}">${k}</button>`;
  }).join('');
  pad.addEventListener('click', e => { const b = e.target.closest('.key'); if (b) pressKey(b.dataset.k); });
}

function init() {
  buildKeypad();
  wireAuthRow();

  $('#brandBtn').addEventListener('click', renderHome);
  $('#howBtn').addEventListener('click', () => openOverlay('how'));
  $('#statsBtn').addEventListener('click', () => { renderStats(); renderAuthRow(); openOverlay('stats'); });

  $('#cardEasy').addEventListener('click', () => startDaily('easy'));
  $('#cardHard').addEventListener('click', () => startDaily('hard'));

  $('#puzzleBack').addEventListener('click', renderHome);
  $('#guessBtn').addEventListener('click', pressGuess);

  document.addEventListener('keydown', e => {
    if (!$('#screen-puzzle').classList.contains('active')) return;
    if (document.querySelector('.overlay.active')) return;
    if (e.key >= '0' && e.key <= '9') pressKey(e.key);
    else if (e.key === 'Backspace') pressKey('back');
    else if (e.key === 'Enter') pressGuess();
  });

  $('#shareBtn').addEventListener('click', doShare);
  $('#reportLink').addEventListener('click', () => {
    reportType = null;
    document.querySelectorAll('.report-opt').forEach(o => o.classList.remove('selected'));
    $('#altAnswerWrap').style.display = 'none';
    $('#altAnswerInput').value = '';
    $('#reportSubmit').disabled = true;
    openOverlay('report');
  });
  document.querySelectorAll('.report-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.report-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      reportType = opt.dataset.rtype;
      $('#altAnswerWrap').style.display = reportType === 'alt_answer' ? 'block' : 'none';
      $('#reportSubmit').disabled = reportType === 'alt_answer' ? $('#altAnswerInput').value === '' : false;
    });
  });
  $('#altAnswerInput').addEventListener('input', e => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    if (reportType === 'alt_answer') $('#reportSubmit').disabled = e.target.value === '';
  });
  $('#reportSubmit').addEventListener('click', submitReport);

  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-close]')) closeOverlay(ov); });
  });

  if (!localStorage.getItem('patternly_seenHow')) { openOverlay('how'); localStorage.setItem('patternly_seenHow', '1'); }

  loadSession().then(maybeStartFromUrl);
}

document.addEventListener('DOMContentLoaded', init);
