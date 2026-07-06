/* Public puzzle submission. Reuses the same ambiguity checker (checker.js) as
   the admin composer, so a community puzzle meets the same fairness bar before
   a human ever reviews it. Submissions land as 'in_review' — invisible on the
   Community page until an admin approves them. */

'use strict';

const $ = (s) => document.querySelector(s);
const CFG = window.PATTERNLY_CONFIG;

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

function exampleCount() { return $('#sDiff').value === 'easy' ? 3 : 4; }
function renderExampleRows() {
  const n = exampleCount();
  $('#sExamples').innerHTML = Array.from({ length: n }, (_, i) => `
    <div class="ex-row">
      <input class="ex-in" data-i="${i}" inputmode="numeric" placeholder="in" />
      <span class="arrow">→</span>
      <input class="ex-out" data-i="${i}" inputmode="numeric" placeholder="out" />
    </div>`).join('');
  $('#sExamples').querySelectorAll('input').forEach(el => el.addEventListener('input', runChecker));
}

function readForm() {
  const examples = [];
  const ins = [...document.querySelectorAll('.ex-in')], outs = [...document.querySelectorAll('.ex-out')];
  for (let i = 0; i < ins.length; i++) {
    const a = Number(ins[i].value), b = Number(outs[i].value);
    if (ins[i].value === '' || outs[i].value === '' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    examples.push([a, b]);
  }
  const q = Number($('#sQ').value), ans = Number($('#sA').value);
  if ($('#sQ').value === '' || $('#sA').value === '' || !Number.isFinite(q) || !Number.isFinite(ans)) return null;
  return { examples, q, ans };
}

function runChecker() {
  const box = $('#checker');
  const data = readForm();
  if (!data) { box.className = 'checker'; box.innerHTML = 'Fill in all examples, the question, and the answer to check for ambiguity.'; return; }
  return renderChecker(box, data.examples, data.q, data.ans);
}

async function submit() {
  const data = readForm();
  const name = $('#sName').value.trim(), rule = $('#sRule').value.trim();
  if (!data) { toast('Fill in all fields'); return; }
  if (!name) { toast('Your name is required'); return; }
  if (!rule) { toast('Rule name is required'); return; }

  const res = ambiguityCheck(data.examples, data.q, data.ans);
  if (res.altAnswers.length && !$('#sOverride').checked) {
    toast('Ambiguous — tighten your examples or tick the override');
    return;
  }

  $('#submitBtn').disabled = true;
  try {
    const out = await rpc('submit_puzzle', {
      p_difficulty: $('#sDiff').value, p_examples: data.examples, p_question: data.q, p_answer: data.ans,
      p_rule: rule, p_author_name: name,
      p_ambiguity_flag: res.altAnswers.length > 0,
    });
    if (out.error) { toast('Could not submit: ' + out.error); $('#submitBtn').disabled = false; return; }
    $('#form').style.display = 'none';
    $('#done').style.display = 'block';
    $('#doneMsg').textContent = `Puzzle ${out.id} is with the Patternly team. Once approved, it'll show up on the Community page credited to ${name}.`;
  } catch {
    toast('Connection problem — try again');
    $('#submitBtn').disabled = false;
  }
}

function init() {
  renderExampleRows();
  $('#sDiff').addEventListener('change', () => { renderExampleRows(); runChecker(); });
  ['sQ', 'sA'].forEach(f => $('#' + f).addEventListener('input', runChecker));
  $('#submitBtn').addEventListener('click', submit);
  runChecker();
}
document.addEventListener('DOMContentLoaded', init);
