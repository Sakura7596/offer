# offer contributor guide

`offer` is a privacy-first desktop recruitment tracker.

## Product rules

- The public app must start with zero companies, positions, JD text, timeline nodes, notes, intelligence results, and personal profile data.
- User data stays local. Never commit runtime files from an installed app.
- Navigation contains only `总览`, `时间轴`, and `情报台`.
- Overview is company-centered and uses a horizontally scrollable rail of circular company icons.
- The timeline is a directly editable Gantt view. Clicking a date creates or edits a node.
- Application progress is derived from timeline nodes. Do not create a separate progress-maintenance flow.
- JD belongs to one position only.
- Codex integration reads `workspace.json` before every run and writes sourced results to `intelligence.json`.
- Do not add example companies, fake dates, generated interview reports, or fabricated job opportunities to the default state.

## Development

- Build UI in `src/`.
- Desktop integration lives in `electron/`.
- Run `npm run build`, `npm run test:sites`, and `npm run desktop:dist` before a release.
- Keep all visible copy free of em dash and en dash characters.
