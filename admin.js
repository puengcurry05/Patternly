/* Patternly admin. Talks to the same Supabase project via admin_* RPCs, each
   gated by an admin key checked server-side. The key lives only in sessionStorage
   for this tab. Nothing here can be reached without the key. */

'use strict';

const $ = (s) => document.querySelector(s);
const CFG = window.PATTERNLY_CONFIG;
let KEY = sessionStorage.getItem('patternly_admin_key') || null;
let DATA = null;   // last admin_overview payload

async function rpc(fn, params) {
  const r = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': CFG.SUPABASE_KEY, 'Authorization': `Bearer ${CFG.SUPABASE_KEY}` },
    body: JSON.stringify(params || {}),
  });
  if (!r.ok) { const t = await r.text(); throw new Error(r.status + ' ' + t); }
  return r.json();
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- auth ----------
async function unlock(key) {
  try {
    DATA = await rpc('admin_overview', { p_key: key });
    KEY = key;
    sessionStorage.setItem('patternly_admin_key', key);
    $('#lock').style.display = 'none';
    $('#panel').style.display = 'block';
    render();
  } catch (e) {
    $('#lockErr').textContent = 'Wrong key, or connection problem.';
    sessionStorage.removeItem('patternly_admin_key');
  }
}
async function refresh() { DATA = await rpc('admin_overview', { p_key: KEY }); render(); }

// ---------- render ----------
function render() {
  const t = DATA.totals;
  $('#totals').innerHTML = `
    <div class="t"><b>${t.players}</b><span>Players</span></div>
    <div class="t"><b>${t.plays}</b><span>Plays</span></div>
    <div class="t"><b>${t.openReports}</b><span>Reports</span></div>
    <div class="t"><b>${t.puzzles}</b><span>Puzzles</span></div>`;
  const subTab = document.querySelector('.tab[data-tab="submissions"]');
  if (subTab) subTab.textContent = t.pendingSubmissions ? `Submissions (${t.pendingSubmissions})` : 'Submissions';
  renderQueue();
  renderSubmissions();
  renderSchedule();
  suggestId();
}

// ---------- SUBMISSIONS (community puzzles awaiting review) ----------
function renderSubmissions() {
  const pending = DATA.puzzles.filter(p => p.status === 'in_review');
  $('#subHint').textContent = pending.length
    ? `${pending.length} community submission${pending.length === 1 ? '' : 's'} waiting for review.`
    : 'No pending submissions.';
  $('#submissionsList').innerHTML = pending.map(p => `
    <div class="qcard ${p.ambiguityFlag ? 'flag' : ''}">
      <div class="qcard-top">
        <span class="pill ${p.difficulty}">${p.difficulty}</span>
        <span class="qid">${p.id}</span>
        <span class="qrule">${esc(p.rule)}</span>
        <span class="qeq">${p.question} → ${p.answer}</span>
        <span class="pill status">by ${esc(p.authorName || 'anonymous')}</span>
      </div>
      <div class="qmeta">
        <div>Examples: <span class="mono">${p.examples.map(([i, o]) => `${i}→${o}`).join('  ')}</span></div>
        ${p.ambiguityFlag ? `<div class="warnrow">⚠ Submitter overrode the ambiguity checker — review the examples carefully.</div>` : ''}
      </div>
      <div class="qactions">
        <button class="sm-btn" data-act="approve" data-id="${p.id}">Approve &amp; publish</button>
        <button class="sm-btn danger" data-act="reject" data-id="${p.id}">Reject</button>
      </div>
    </div>`).join('');
}

// ---------- QUEUE ----------
function needsAttention(p) {
  if (p.openReports > 0) return true;
  const cl = p.clusters || {};
  return Object.values(cl).some(c => c >= 3);   // a wrong answer repeated ≥3× = ambiguity smell
}
function renderQueue() {
  const puzzles = DATA.puzzles.filter(p => p.status !== 'in_review' && p.status !== 'rejected').slice().sort((a, b) => {
    const an = needsAttention(a) ? 1 : 0, bn = needsAttention(b) ? 1 : 0;
    if (an !== bn) return bn - an;
    return b.openReports - a.openReports;
  });
  const flagged = puzzles.filter(needsAttention).length;
  $('#queueHint').textContent = flagged
    ? `${flagged} puzzle${flagged === 1 ? '' : 's'} need${flagged === 1 ? 's' : ''} a look — reports or clustered wrong answers.`
    : 'Nothing flagged. Everything below is for reference.';

  $('#queueList').innerHTML = puzzles.map(p => {
    const flag = needsAttention(p);
    const clusters = Object.entries(p.clusters || {}).sort((a, b) => b[1] - a[1]);
    const alts = (p.altAnswers || []).filter(x => x != null);
    const rate = p.solveRate == null ? '—' : p.solveRate + '%';
    return `
      <div class="qcard ${flag ? 'flag' : ''} ${p.status === 'retired' ? 'retired' : ''}">
        <div class="qcard-top">
          <span class="pill ${p.difficulty}">${p.difficulty}</span>
          <span class="qid">${p.id}</span>
          <span class="qrule">${esc(p.rule)}</span>
          <span class="qeq">${p.question} → ${p.answer}</span>
          <span class="pill rate">${rate} · ${p.plays} plays</span>
          ${p.openReports ? `<span class="pill rep">${p.openReports} report${p.openReports === 1 ? '' : 's'}</span>` : ''}
          ${p.status !== 'published' ? `<span class="pill status">${p.status}</span>` : ''}
        </div>
        <div class="qmeta">
          ${alts.length ? `<div class="warnrow">⚠ Players claim other answers: <span class="mono">${alts.join(', ')}</span></div>` : ''}
          ${p.brokenReports ? `<div class="warnrow">⚠ ${p.brokenReports} "broken" report(s)</div>` : ''}
          ${clusters.length ? `<div>Wrong-guess clusters: <span class="mono">${clusters.map(([v, c]) => `${v}×${c}`).join('  ')}</span></div>` : ''}
        </div>
        <div class="qactions">
          ${p.openReports ? `<button class="sm-btn" data-act="resolve" data-id="${p.id}">Mark reports reviewed</button>` : ''}
          ${p.status === 'published'
            ? `<button class="sm-btn danger" data-act="retire" data-id="${p.id}">Retire</button>`
            : `<button class="sm-btn" data-act="publish" data-id="${p.id}">Re-publish</button>`}
        </div>
      </div>`;
  }).join('');
}

async function queueAction(act, id) {
  try {
    if (act === 'resolve') { await rpc('admin_resolve_reports', { p_key: KEY, p_puzzle_id: id }); toast('Reports marked reviewed'); }
    if (act === 'retire')  { await rpc('admin_set_status', { p_key: KEY, p_id: id, p_status: 'retired' }); toast(`${id} retired`); }
    if (act === 'publish') { await rpc('admin_set_status', { p_key: KEY, p_id: id, p_status: 'published' }); toast(`${id} re-published`); }
    if (act === 'approve') { await rpc('admin_set_status', { p_key: KEY, p_id: id, p_status: 'published' }); toast(`${id} approved — now live in Community`); }
    if (act === 'reject')  { await rpc('admin_set_status', { p_key: KEY, p_id: id, p_status: 'rejected' }); toast(`${id} rejected`); }
    await refresh();
  } catch { toast('Action failed'); }
}

// ---------- COMPOSE ----------
function exampleCount() { return $('#cDiff').value === 'easy' ? 3 : 4; }
function renderExampleRows() {
  const n = exampleCount();
  $('#cExamples').innerHTML = Array.from({ length: n }, (_, i) => `
    <div class="ex-row">
      <input class="ex-in" data-i="${i}" inputmode="numeric" placeholder="in" />
      <span class="arrow">→</span>
      <input class="ex-out" data-i="${i}" inputmode="numeric" placeholder="out" />
    </div>`).join('');
  $('#cExamples').querySelectorAll('input').forEach(el => el.addEventListener('input', runChecker));
}
function suggestId() {
  const diff = $('#cDiff').value;
  const prefix = diff === 'easy' ? 'E' : 'H';
  const nums = (DATA?.puzzles || []).filter(p => p.id.startsWith(prefix))
    .map(p => parseInt(p.id.slice(1), 10)).filter(Number.isFinite);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  $('#cId').value = prefix + next;
}
function readCompose() {
  const examples = [];
  const ins = [...document.querySelectorAll('.ex-in')], outs = [...document.querySelectorAll('.ex-out')];
  for (let i = 0; i < ins.length; i++) {
    const a = Number(ins[i].value), b = Number(outs[i].value);
    if (ins[i].value === '' || outs[i].value === '' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    examples.push([a, b]);
  }
  const q = Number($('#cQ').value), ans = Number($('#cA').value);
  if ($('#cQ').value === '' || $('#cA').value === '' || !Number.isFinite(q) || !Number.isFinite(ans)) return null;
  return { examples, q, ans };
}

function runChecker() {
  const box = $('#checker');
  const data = readCompose();
  if (!data) { box.className = 'checker'; box.innerHTML = 'Fill in all examples, the question, and the answer to check for ambiguity.'; return; }
  return renderChecker(box, data.examples, data.q, data.ans);
}

async function savePuzzle() {
  const data = readCompose();
  if (!data) { toast('Fill in all fields'); return; }
  const id = $('#cId').value.trim(), rule = $('#cRule').value.trim();
  if (!id || !rule) { toast('ID and rule name required'); return; }
  const res = ambiguityCheck(data.examples, data.q, data.ans);
  if (res.altAnswers.length && !$('#cOverride').checked) { toast('Ambiguous — fix it or tick "Publish anyway"'); return; }
  try {
    const out = await rpc('admin_create_puzzle', {
      p_key: KEY, p_id: id, p_difficulty: $('#cDiff').value,
      p_examples: data.examples, p_question: data.q, p_answer: data.ans,
      p_rule: rule,
    });
    if (out.error === 'id_exists') { toast('That ID already exists'); return; }
    toast(`${id} created`);
    ['cQ', 'cA', 'cRule'].forEach(f => $('#' + f).value = '');
    $('#cOverride').checked = false;
    renderExampleRows(); runChecker();
    await refresh();
  } catch { toast('Create failed'); }
}

// ---------- SCHEDULE ----------
function renderSchedule() {
  const today = DATA.today, day = DATA.day;
  const sched = {};
  DATA.schedule.forEach(s => { sched[`${s.date}:${s.difficulty}`] = s.puzzleId; });
  const opts = (diff, selected) => {
    const list = DATA.puzzles.filter(p => p.difficulty === diff && p.status === 'published');
    return `<option value="">— auto (cycle) —</option>` +
      list.map(p => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${p.id} · ${esc(p.rule)}</option>`).join('');
  };
  const base = new Date(today + 'T00:00:00Z');
  let html = '';
  for (let i = 0; i < 14; i++) {
    const d = new Date(base); d.setUTCDate(d.getUTCDate() + i);
    const ds = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    html += `<div class="sched-day">
      <div class="sd-date">${label} <span class="no">· No.${day + i}${i === 0 ? ' · today' : ''}</span></div>
      ${['easy', 'hard'].map(diff => {
        const sel = sched[`${ds}:${diff}`] || '';
        return `<div class="sched-slot"><span class="sl-lbl">${diff}</span>
          <select class="${sel ? 'pinned' : ''}" data-date="${ds}" data-diff="${diff}">${opts(diff, sel)}</select></div>`;
      }).join('')}
    </div>`;
  }
  $('#scheduleList').innerHTML = html;
  const pinned = DATA.schedule.length;
  $('#runway').textContent = pinned
    ? `${pinned} day-slot(s) pinned ahead. Unpinned slots fall back to the automatic cycle.`
    : 'No days pinned — every day currently uses the automatic puzzle cycle. Pin a slot to override.';
}
async function setSchedule(date, diff, puzzleId) {
  try {
    await rpc('admin_schedule', { p_key: KEY, p_date: date, p_difficulty: diff, p_puzzle_id: puzzleId || null });
    toast(puzzleId ? `Pinned ${puzzleId}` : 'Reverted to auto');
    await refresh();
  } catch { toast('Schedule failed'); }
}

// Ambiguity rule library (buildRuleLibrary, ambiguityCheck, esc, renderChecker)
// lives in checker.js, shared with the public submission form.

// ---------- wiring ----------
function init() {
  $('#unlockBtn').addEventListener('click', () => unlock($('#keyInput').value));
  $('#keyInput').addEventListener('keydown', e => { if (e.key === 'Enter') unlock($('#keyInput').value); });
  $('#refreshBtn').addEventListener('click', () => refresh().then(() => toast('Refreshed')));

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tabpane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('#pane-' + tab.dataset.tab).classList.add('active');
  }));

  $('#queueList').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]'); if (btn) queueAction(btn.dataset.act, btn.dataset.id);
  });
  $('#submissionsList').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]'); if (btn) queueAction(btn.dataset.act, btn.dataset.id);
  });

  $('#cDiff').addEventListener('change', () => { renderExampleRows(); suggestId(); runChecker(); });
  ['cQ', 'cA'].forEach(f => $('#' + f).addEventListener('input', runChecker));
  $('#saveBtn').addEventListener('click', savePuzzle);
  renderExampleRows();

  $('#scheduleList').addEventListener('change', e => {
    const sel = e.target.closest('select'); if (sel) setSchedule(sel.dataset.date, sel.dataset.diff, sel.value);
  });

  if (KEY) unlock(KEY); else $('#keyInput').focus();
}
document.addEventListener('DOMContentLoaded', init);
