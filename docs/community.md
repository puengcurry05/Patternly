# Community — browse, submit, review

- **`/community.html`** lists every `published` puzzle (official + approved
  community), sorted by the two signals that matter: **most played** and
  **correction rate** (solve rate). Community puzzles show an author byline.
  Clicking one deep-links into `index.html?play=<id>`, which runs it in archive
  mode — no effect on the daily streak.
- **`/submit.html`** is the public submission form. It reuses the exact same
  ambiguity checker as the admin composer ([checker.js](../public/checker.js)),
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
