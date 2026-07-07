/* Shared ambiguity checker — used by both the admin composer and the public
   submission form, so a community puzzle is held to the exact same fairness
   bar as an official one. Runs a library of ~2,600 candidate rules against
   the given examples; if any rule besides the intended one also fits every
   example but yields a different answer, the puzzle is ambiguous. */

'use strict';

function digits(n) { return String(Math.abs(n)).split('').map(Number); }
function isPrime(n) { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }
function nthPrime(n) { if (n < 1) return null; let c = 0, x = 1; while (c < n) { x++; if (isPrime(x)) c++; } return x; }
function nextPrime(n) { let x = n + 1; while (!isPrime(x)) x++; return x; }
function nthFib(n) { if (n < 1) return null; let a = 1, b = 1; for (let i = 3; i <= n; i++) { [a, b] = [b, a + b]; } return n <= 2 ? 1 : b; }
function digitalRoot(n) { n = Math.abs(n); while (n >= 10) n = digits(n).reduce((a, b) => a + b, 0); return n; }

function buildRuleLibrary() {
  const R = [];
  // linear a*n + b covers add/subtract/multiply/k-n
  for (let a = -6; a <= 12; a++) for (let b = -60; b <= 60; b++) {
    if (a === 0 && b === 0) continue;
    R.push({ name: `${a}·n${b >= 0 ? '+' + b : b}`, fn: (n) => a * n + b });
  }
  // nonlinear specials
  const specials = [
    ['n²', n => n * n], ['n³', n => n * n * n],
    ['n²+1', n => n * n + 1], ['n²−1', n => n * n - 1],
    ['(n+1)²', n => (n + 1) ** 2], ['(n−1)²', n => (n - 1) ** 2],
    ['n(n+1)', n => n * (n + 1)], ['n(n−1)', n => n * (n - 1)],
    ['n²+n', n => n * n + n], ['n²−n', n => n * n - n],
    ['n³−n', n => n ** 3 - n],
    ['2^n', n => (n >= 0 && n <= 40) ? 2 ** n : null], ['3^n', n => (n >= 0 && n <= 25) ? 3 ** n : null],
    ['n/2', n => n % 2 === 0 ? n / 2 : null],
    ['triangular n(n+1)/2', n => n >= 0 ? n * (n + 1) / 2 : null],
    ['nth prime', n => nthPrime(n)], ['next prime after n', n => n >= 0 ? nextPrime(n) : null],
    ['nth Fibonacci', n => nthFib(n)],
    ['digit sum', n => digits(n).reduce((a, b) => a + b, 0)],
    ['digit product', n => digits(n).reduce((a, b) => a * b, 1)],
    ['reverse digits', n => n >= 0 ? Number(String(n).split('').reverse().join('')) : null],
    ['first digit', n => digits(n)[0]],
    ['last digit', n => digits(n).slice(-1)[0]],
    ['digital root', n => digitalRoot(n)],
    ['sum of digit squares', n => digits(n).reduce((a, b) => a + b * b, 0)],
    ['(digit sum)²', n => { const s = digits(n).reduce((a, b) => a + b, 0); return s * s; }],
    ['n + reverse(n)', n => n >= 0 ? n + Number(String(n).split('').reverse().join('')) : null],
    ['n × digit sum', n => n * digits(n).reduce((a, b) => a + b, 0)],
    ['100 − n', n => 100 - n],
  ];
  specials.forEach(([name, fn]) => R.push({ name, fn }));
  return R;
}
const RULES = buildRuleLibrary();

function ambiguityCheck(examples, q, intended) {
  const consistent = [];
  for (const rule of RULES) {
    let ok = true;
    for (const [i, o] of examples) {
      let v; try { v = rule.fn(i); } catch { v = null; }
      if (v === null || v === undefined || !Number.isFinite(v) || v !== o) { ok = false; break; }
    }
    if (!ok) continue;
    let qv; try { qv = rule.fn(q); } catch { qv = null; }
    if (qv === null || !Number.isFinite(qv)) continue;
    consistent.push({ name: rule.name, qOut: qv });
  }
  const alts = consistent.filter(c => c.qOut !== intended);
  const altAnswers = [...new Set(alts.map(a => a.qOut))];
  return { consistentCount: consistent.length, alts, altAnswers };
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// Renders a checker result into a `.checker` box element. Returns the result
// object so callers can gate a submit button on `.altAnswers.length`.
function renderChecker(box, examples, q, ans) {
  const res = ambiguityCheck(examples, q, ans);
  if (res.altAnswers.length) {
    box.className = 'checker bad';
    box.innerHTML = `<div class="ck-title">⚠ Ambiguous — other rules also fit</div>
      These simpler/known rules match every example but give a different answer:
      ${res.alts.slice(0, 6).map(a => `<div class="alt">• ${esc(a.name)} → ${a.qOut}</div>`).join('')}
      <div style="margin-top:6px">Tighten your examples so only your rule survives, or override below.</div>`;
  } else if (res.consistentCount === 0) {
    box.className = 'checker warn';
    box.innerHTML = `<div class="ck-title">Couldn't verify</div>
      No rule in the checker's library reproduces these examples. That's fine for a
      genuinely novel rule, but double-check your answer by hand — the auto-check can't help here.`;
  } else {
    box.className = 'checker safe';
    box.innerHTML = `<div class="ck-title">✓ Looks unique</div>
      ${res.consistentCount} known rule(s) fit the examples, and all of them give <b>${ans}</b>. No competing answer found.`;
  }
  return res;
}
