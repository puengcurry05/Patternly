# Security notes

- Supabase's linter flags that anon can execute the four `SECURITY DEFINER`
  RPCs. That is **intentional** — those functions are the public API and are the
  reason answers stay hidden. Everything else (tables, `app.*` helpers) is
  unreachable by anon.
- Rate limiting / abuse protection on the RPCs is a future step (Supabase edge
  rate limits or a lightweight token) before heavy public traffic.

For admin-key handling specifics, see [admin.md](admin.md#admin-auth). For
login/session security notes, see [auth.md](auth.md).
