/* Community page. Lists every approved puzzle (official + community-submitted)
   you can replay anytime. Clicking one deep-links into the main game
   (index.html?play=<id>), which runs it in archive mode — no effect on your
   daily streak. Sortable by the two signals that matter most: how many people
   played it, and its correction rate (% who solved it correctly). */

'use strict';

const $ = (s) => document.querySelector(s);
const CFG = window.PATTERNLY_CONFIG;
let PUZZLES = [];
let SORT = 'plays';

async function rpc(fn, params) {
  const r = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': CFG.SUPABASE_KEY, 'Authorization': `Bearer ${CFG.SUPABASE_KEY}` },
    body: JSON.stringify(params || {}),
  });
  if (!r.ok) throw new Error('rpc ' + r.status);
  return r.json();
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function sortKey(p) {
  if (SORT === 'rate') return p.solveRate == null ? -1 : p.solveRate;
  return p.plays || 0;
}

function card(p) {
  const ex = p.examples[0];
  const rate = p.solveRate == null ? 'no plays yet' : `${p.solveRate}% solved it`;
  const author = p.source === 'community' && p.authorName ? ` · <span class="ai-author">by ${esc(p.authorName)}</span>` : '';
  return `<a class="arch-item" href="index.html?play=${encodeURIComponent(p.id)}">
    <span class="ai-eq">${ex[0]} → ${ex[1]}&nbsp;&nbsp;…</span>
    <span class="ai-meta">${p.plays || 0} played · ${rate}${author}</span>
  </a>`;
}

function section(title, arr) {
  if (!arr.length) return '';
  return `<div class="arch-section-title">${title}</div>${arr.map(card).join('')}`;
}

function render() {
  const sorted = PUZZLES.slice().sort((a, b) => sortKey(b) - sortKey(a));
  const easy = sorted.filter(p => p.difficulty === 'easy');
  const hard = sorted.filter(p => p.difficulty === 'hard');
  $('#communityList').innerHTML = section('Easy', easy) + section('Hard', hard);
}

async function load() {
  try {
    ({ puzzles: PUZZLES } = await rpc('list_archive', {}));
  } catch {
    $('#communityList').innerHTML = `<div class="community-empty">Couldn't load puzzles. Check your connection and refresh.</div>`;
    return;
  }
  render();
}

function initSort() {
  document.querySelectorAll('.sort-btn').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    SORT = btn.dataset.sort;
    render();
  }));
}

document.addEventListener('DOMContentLoaded', () => { initSort(); load(); });
