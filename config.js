// Supabase connection. The publishable key is meant to live in the browser —
// it only grants the anon role, which can execute the four Patternly RPCs and
// nothing else. All tables live in a private schema the anon role cannot read,
// so the answer never leaves the database until a game is over.
window.PATTERNLY_CONFIG = {
  SUPABASE_URL: 'https://eimytioxyzdxtcrctjmw.supabase.co',
  SUPABASE_KEY: 'sb_publishable_bWH5l-6boQ7n7qHBgDEGHA_R5CpFcdl',
};
