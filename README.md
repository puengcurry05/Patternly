# Patternly

A daily number-pattern puzzle. **Static frontend + Supabase** — no server to run.

Play Online:
https://puengcurry05.github.io/Patternly/

## Architecture

```
public/            Static site (index.html, styles.css, app.js, config.js)
                   Deploy to any CDN (Netlify / Vercel / Cloudflare Pages).
Supabase           Postgres database + auto REST API. All game logic lives in
                   SQL functions. No custom backend process.
```

The browser calls four database functions over Supabase's REST API. It never
reads a table directly.

### Answer secrecy (structural)

- All data tables live in a **private `app` schema** that PostgREST does **not**
  expose. The anon client gets `PGRST106 / PGRST205` if it tries to read them.
- The only things the anon role can call are four `SECURITY DEFINER` functions in
  `public`: `get_session`, `submit_guess`, `submit_report`, `list_archive`.
- Those functions return **examples + question only**. The rule and answer are
  released **exclusively** after a game ends (solved, or 3 lives used).

So today's answer cannot be pulled from the page source, the network tab, or the
REST API — it only exists in the database and in the winning/finished response.

## Config

`public/config.js` holds the Supabase URL + publishable key. The publishable key
is **meant** to be in the browser — it only grants the `anon` role, which can do
nothing but call the four RPCs above.

```js
window.PATTERNLY_CONFIG = {
  SUPABASE_URL: 'https://<project>.supabase.co',
  SUPABASE_KEY: 'sb_publishable_...',
};
```

Supabase project: ref `eimytioxyzdxtcrctjmw`, region ap-northeast-2. The project's
internal Supabase name is still `logicle` — cosmetic only (no rename API is
exposed via tooling), doesn't affect anything functional. The app itself is
branded **Patternly** everywhere a user sees it.

## Run locally

Any static server pointed at `public/` works, e.g.:

```bash
python3 -m http.server 4310 --directory public   # http://localhost:4310
```

The app talks to hosted Supabase, so it works the same locally or deployed —
that's what fixed the earlier "connection problem" (no local server to depend on).

## Database (managed via Supabase migrations)

| Schema | Object | Purpose |
|---|---|---|
| `app` | `puzzles` | puzzle bank incl. answers — never exposed |
| `app` | `plays` | one row per player-per-puzzle; source of solve rate, streak, stats |
| `app` | `reports` | fairness reports (alt_answer / broken / difficulty) |
| `public` | `get_session(player)` | today's Easy+Hard (examples only) + results + stats/streak |
| `public` | `submit_guess(...)` | validates a guess, records the play, reveals only when over |
| `public` | `submit_report(...)` | files a report |
| `public` | `list_archive()` | published puzzles (examples + play stats + author) for Community |
| `public` | `submit_puzzle(...)` | public submission entry point → status `in_review` |

Ambiguity smoke-detector (wrong-answer clustering) and open-report counts are
recorded in `app.plays` / `app.reports`, feeding the admin queue below.

## Community — browse, submit, review

- **`/community.html`** lists every `published` puzzle (official + approved
  community), sorted by the two signals that matter: **most played** and
  **correction rate** (solve rate). Community puzzles show an author byline.
  Clicking one deep-links into `index.html?play=<id>`, which runs it in archive
  mode — no effect on the daily streak.
- **`/submit.html`** is the public submission form. It reuses the exact same
  ambiguity checker as the admin composer ([checker.js](public/checker.js)),
  so a submitter is held to the same fairness bar before a human ever sees it.
  A submission always lands as `status='in_review'` — invisible everywhere
  until reviewed. If the submitter overrides an ambiguity warning, the
  submission is flagged (`ambiguity_flag`) for the reviewer.
- Approval is **admin-only, one click, in the "Submissions" tab of
  `/admin.html`**: reject → `status='rejected'` (hidden forever), approve →
  `status='published'` (appears on Community immediately).
- Community puzzles **never enter the automatic daily rotation** — only
  official puzzles cycle automatically. An admin can still hand-pick any
  community puzzle for a specific day via the Schedule tab (`admin_schedule`),
  same as any official puzzle. Promotion is always a deliberate choice.

## Admin panel — `/admin.html`

A separate page for running the game day to day. Three tabs:

- **Review queue** — every puzzle with its solve rate, play count, open reports
  (incl. the specific "other answers" players claim), and **wrong-answer
  clusters** (the ambiguity smoke-detector). Flagged puzzles sort to the top.
  Actions: mark reports reviewed, retire / re-publish.
- **Compose** — create a puzzle with a **live ambiguity checker**: it runs the
  examples against ~2,600 candidate rules and, if any other rule fits every
  example but yields a different answer, blocks publishing (with an override).
  This is what keeps puzzles fair. It catches classic traps like n² vs 2ⁿ.
- **Schedule** — pin any puzzle (official or, later, community) to a specific
  day's Easy/Hard slot. Unpinned days fall back to the automatic cycle.

### Admin auth

The admin key is checked **server-side** (bcrypt, via `app.check_admin`) and is
**not stored in this repo** — it only exists as a bcrypt hash in the database.
Whoever runs this project keeps the plaintext key privately (a password
manager, not a file that gets committed).

**Rotate it any time** by running this in the Supabase SQL editor:

```sql
update app.admin_config
set value = extensions.crypt('YOUR-NEW-KEY', extensions.gen_salt('bf'))
where key = 'admin_key_hash';
```

The `/admin.html` page is reachable by anyone, but it's useless without the key
(the 5 `admin_*` RPCs reject every call that fails the key check, and
`admin_overview` is also how every puzzle's answer becomes readable — so treat
this key as a real secret, not a cosmetic login). Don't link to `/admin.html`
from the public app, and never commit the plaintext key to git, docs, or chat
history that ends up in the repo.

**Security note:** for MVP the admin key travels in the RPC body over HTTPS and
the admin RPCs are technically callable (they just fail without the key). Before
serious traffic, move admin behind Supabase Auth + a role check, and add rate
limiting. Documented, not yet done.

## Optional login

Signing in is **never required** — guests play fully featured, identified only
by a random id in `localStorage`. Logging in just lets the *same* streak and
history follow you to another device.

- **Where:** a single gray line at the top of the **Your stats** panel —
  `Not signed in · Sign in…` or `Signed in as you@example.com · Sign out`.
  There's no separate profile page.
- **How:** plain email + password via Supabase Auth (`signInWithPassword` /
  `signUp`). Deliberately simple for now — swapped in from an earlier magic-link
  version specifically to avoid Supabase's low-volume test-tier email limits
  (every magic-link *sign-in* sends an email; password auth sends one only for
  the one-time signup confirmation, if your project requires it). Worth
  revisiting later (stronger password rules, "forgot password", etc.).
- **How it stays simple server-side:** `get_session` / `submit_guess` /
  `submit_report` compute the effective player id as
  `coalesce(auth.uid()::text, p_player_id)`. If the request carries a valid
  Supabase session — however the user authenticated — the account's id
  silently wins over the local guest id. No client-side branching, and guests
  are completely unaffected. This logic didn't need to change when the auth
  method did.

**Signup confirmation note:** if the project's default "Confirm email" setting
is on, `signUp` won't return a session until the user clicks the confirmation
link in their inbox — the UI shows "Check your email to confirm, then sign in"
in that case. Subsequent sign-ins never touch email at all.

**Known limitation:** if a guest had progress *before* their first sign-in, it
stays under the old guest id and isn't merged into the account — kept out of
scope on purpose to avoid streak-merging complexity. Worth revisiting later if
it turns out to matter.

**Email delivery note:** Supabase's built-in email sender is a low-volume
testing tier (a handful of emails per hour, project-wide) — relevant only to
the one-time signup confirmation now, not to every sign-in. Before real users
arrive, configure a custom SMTP provider under Authentication → Email in the
dashboard.

**Recommended follow-up:** now that real passwords exist, turn on **Authentication
→ Providers → Email → Leaked password protection** (checks new passwords
against HaveIBeenPwned) — Supabase's security advisor flags this as off by
default. Dashboard-only, no API for it.

## Deploy

1. Push `public/` to any static host.
2. Done — Supabase is already live. Update `config.js` if you rotate keys.

## Security notes

- Supabase's linter flags that anon can execute the four `SECURITY DEFINER`
  RPCs. That is **intentional** — those functions are the public API and are the
  reason answers stay hidden. Everything else (tables, `app.*` helpers) is
  unreachable by anon.
- Rate limiting / abuse protection on the RPCs is a future step (Supabase edge
  rate limits or a lightweight token) before heavy public traffic.
