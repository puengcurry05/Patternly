# Architecture

```
public/            Static site (index.html, styles.css, app.js, config.js)
                   Deploy to any CDN (Netlify / Vercel / Cloudflare Pages).
Supabase           Postgres database + auto REST API. All game logic lives in
                   SQL functions. No custom backend process.
```

The browser calls four database functions over Supabase's REST API. It never
reads a table directly.

## Answer secrecy (structural)

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
recorded in `app.plays` / `app.reports`, feeding the admin queue (see
[admin.md](admin.md)).
