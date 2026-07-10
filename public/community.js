/* Community page. Lists every approved puzzle (official + community-submitted)
   you can replay anytime. Clicking one deep-links into the main game
   (index.html?play=<id>), which runs it in archive mode — no effect on your
   daily streak. Sortable by the two signals that matter most: how many people
   played it, and its correction rate (% who solved it correctly). */
/* community.js */

'use strict';

const $ = (s) => document.querySelector(s);
const CFG = window.PATTERNLY_CONFIG;
let PUZZLES = [];
let SORT = 'plays';   // 기본 정렬 기준
let ORDER = 'desc';   // 기본 정렬 방향 (desc: 내림차순, asc: 오름차순)

async function rpc(fn, params) {
  const r = await fetch(`${CFG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': CFG.SUPABASE_KEY, 'Authorization': `Bearer ${CFG.SUPABASE_KEY}` },
    body: JSON.stringify(params || {}),
  });
  if (!r.ok) throw new Error('rpc ' + r.status);
  return r.json();
}

// XSS 방지 (싱글 쿼트 포함)
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function card(p) {
  const ex = p.examples[0];
  const rate = p.solveRate == null ? 'no plays yet' : `${p.solveRate}% solved it`;
  const author = p.source === 'community' && p.authorName ? ` · <span class="ai-author">by ${esc(p.authorName)}</span>` : '';

  // 난이도 태그(뱃지)
  const diffBadge = p.difficulty === 'hard'
      ? `<span class="mc-badge hard" style="font-size:10px; padding:2px 6px; margin-right:6px; vertical-align:middle;">HARD</span>`
      : `<span class="mc-badge" style="font-size:10px; padding:2px 6px; margin-right:6px; vertical-align:middle;">EASY</span>`;

  return `<a class="arch-item" href="index.html?play=${encodeURIComponent(p.id)}">
    <span class="ai-eq">${diffBadge} ${ex[0]} → ${ex[1]}&nbsp;&nbsp;…</span>
    <span class="ai-meta">${p.plays || 0} played · ${rate}${author}</span>
  </a>`;
}

function render() {
  const sorted = PUZZLES.slice().sort((a, b) => {
    let cmp = 0;

    if (SORT === 'plays') {
      cmp = (a.plays || 0) - (b.plays || 0);
    } else if (SORT === 'rate') {
      cmp = (a.solveRate ?? -1) - (b.solveRate ?? -1);
    } else if (SORT === 'recent') {
      // ID 문자열을 비교하여 최신 등록순 판별 (예: E10은 E2보다 크다)
      cmp = a.id.localeCompare(b.id, undefined, { numeric: true });
    }

    // ORDER === 'desc' 이면 -cmp 반환(내림차순), 'asc' 이면 cmp 반환(오름차순)
    return ORDER === 'desc' ? -cmp : cmp;
  });

  if (!sorted.length) {
    $('#communityList').innerHTML = `<div class="community-empty">No puzzles found.</div>`;
    return;
  }

  // 섹션 구분 없이 하나의 통짜 리스트로 렌더링
  $('#communityList').innerHTML = sorted.map(card).join('');
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
  const btns = document.querySelectorAll('.sort-btn');

  function updateBtnLabels() {
    btns.forEach(b => {
      let baseText = '';
      if (b.dataset.sort === 'plays') baseText = 'Most played';
      else if (b.dataset.sort === 'rate') baseText = 'Correction rate';
      else if (b.dataset.sort === 'recent') baseText = 'Recent';

      if (b.dataset.sort === SORT) {
        b.textContent = baseText + (ORDER === 'desc' ? ' ↓' : ' ↑');
      } else {
        b.textContent = baseText;
      }
    });
  }

  btns.forEach(btn => btn.addEventListener('click', () => {
    const clickedSort = btn.dataset.sort;
    if (SORT === clickedSort) {
      // 이미 활성화된 버튼을 또 누르면 정렬 방향 토글
      ORDER = ORDER === 'desc' ? 'asc' : 'desc';
    } else {
      // 다른 버튼을 누르면 해당 기준으로 바꾸고 기본값(내림차순)으로 리셋
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      SORT = clickedSort;
      ORDER = 'desc';
    }
    updateBtnLabels();
    render();
  }));

  updateBtnLabels(); // 초기 화살표 렌더링
}

document.addEventListener('DOMContentLoaded', () => { initSort(); load(); });
