# offer contributor guide

`offer` is a privacy-first Windows-local recruitment tracker.

## Product rules

- The public app must start with zero companies, positions, JD text, timeline nodes, notes, intelligence results, and personal profile data.
- User data stays local. Never commit runtime files from an installed app.
- Keep the five core work areas focused: `首页`, `投递总表`, `岗位`, `时间规划`, and `数据分析`. Settings is a utility entry, not another work area.
- Keep `当前状态` and `当前进度` separate. User-confirmed values remain authoritative; timeline-derived progress may be suggested but must never silently overwrite them.
- Timeline nodes are the shared source for schedules and process history. Adding or editing a node must update every timeline view without requiring duplicate entry.
- General timeline entry points must require an explicit role selection. Role-specific entry points may preselect that role.
- The product is a local personal tool. Do not add accounts, remote databases, cloud synchronization, or team permissions without an explicit user request.
- JD belongs to one position only.
- Codex integration reads `workspace.json` before every run and writes sourced results to `intelligence.json`.
- Do not add example companies, fake dates, generated interview reports, or fabricated job opportunities to the default state.

## Development

- Build UI in `src/`.
- The supported daily-use path is the Windows shortcut backed by the local Vite service and `%LOCALAPPDATA%\Offer-AutumnRecruitment`.
- Run `npm test` and `npm run build` before delivery. Use a separate `OFFER_DEV_DATA_DIR` for write-path browser tests; never exercise destructive tests against the installed workspace.
- Keep all visible copy free of em dash and en dash characters.
