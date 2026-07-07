# Admin panel — `/admin.html`

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

## Admin auth

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
