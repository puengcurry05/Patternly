# Deploy

1. Push `public/` to any static host.
2. Done — Supabase is already live. Update `config.js` if you rotate keys.

## Run locally

Any static server pointed at `public/` works, e.g.:

```bash
python3 -m http.server 4310 --directory public   # http://localhost:4310
```

The app talks to hosted Supabase, so it works the same locally or deployed —
that's what fixed the earlier "connection problem" (no local server to depend on).
