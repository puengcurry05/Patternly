# Optional login

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
