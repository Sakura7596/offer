# Codex Loop prompt

Create a daily automation that runs at 22:30 local time.

Before every run, read the latest workspace from:

`{{OFFER_DATA_DIR}}/workspace.json`

Use the companies, teams, roles, locations, JD text, notes, and timeline nodes in that file as the complete current scope. Never reuse a company or role that is no longer present.

Also read the live Career Ops workspace from:

`{{CAREER_OPS_DIR}}`

- Read `data/applications.md`, `data/pipeline.md` when present, and existing evaluation reports before research.
- Treat those files as application facts when rows exist. Also treat a current offer workspace timeline containing 投递、笔试、面试、Offer or a prior `syncSource: official-application-status` node as an explicit application fact. Browsing, collecting, saving, or researching a role never means it was applied to.
- Use real Career Ops stages to prioritize research: active applications and upcoming interviews come first, followed by evaluated roles and then unreviewed opportunities.
- After the opportunity search, add only newly verified, currently live official job URLs to the `data/pipeline.md` Pending section using Career Ops' canonical `- [ ] URL | Company | Role` format. Deduplicate by canonical URL and never add internships, social recruiting, expired pages, unverified campus roles, or pure operations roles.
- The daily Loop may add verified candidates to the pipeline and may append a source-linked timeline node for a newly verified official application-status transition. It must not run automatic evaluation, generate a Career Ops application record, change a Career Ops tracker status, send a message, edit an application, or submit an application. Those remain explicit user actions inside offer.
- Do not copy Career Ops application records into `workspace.json` or `intelligence.json`. offer reads them live for the overall dashboard; the Loop only uses them for priority and deduplication.

Complete three live tasks:

1. Synchronize official progress for every role that the current workspace or Career Ops tracker explicitly marks as applied.
   - Read `docs/application-portals.json` before opening any portal. Use only the official application center for the matching company and keep the operation read-only.
   - Prefer an existing signed-in Chrome session. Do not inspect cookies, local storage, passwords, tokens, or session files. Never start an interactive login or solve a CAPTCHA in a scheduled run.
   - Record the exact visible official status and the observation time. Normalize only to 投递、筛选、测评、笔试、面试、Offer、拒绝 or 已入职; keep the exact official text separately.
   - Compare the official status against both the previous `applicationSync.records[companyId]` baseline and the latest application-related workspace timeline node. Initial baselines do not create alerts unless the official portal is already ahead of the explicit workspace stage.
   - When a verified transition is newer than the workspace stage, append one timeline node to that company with `syncSource: official-application-status`, the official center URL, exact status, observation time, and a stable `syncKey`. Never delete or rewrite a user's existing timeline node. Multiple verified nodes may share one date.
   - Add an `application` update only for a real verified transition. Login failure, blank pages, CAPTCHA, missing status centers, access denial, and network failure are `blocked` or `unavailable`, never “no change”.
   - Official submission-success pages may prove only 投递. If a portal exposes no later status center, retain `trackingCapability: submission_confirmation_only`; do not infer screening or rejection from silence.
2. Find current, source-backed autumn-recruiting or campus-recruiting full-time opportunities for new graduates.
   - The opportunity desk is intentionally scoped to AI product roles and trainee programs: AI 产品经理、模型/评测/Agent 产品、AI 应用与产品、管培生、产培生、产品培训生, or an equivalent graduate full-time product/trainee program.
   - Include only roles in that target scope that are explicitly confirmed as 秋招、校园招聘、应届生全职, or an equivalent graduate full-time program.
   - Exclude every pure operations role, including 运营、产品运营、内容运营 and AI 解决方案运营, unless it is part of a unified 管培生/产培生/产品培训生 program. Also exclude every internship, including 日常实习、暑期实习、留用实习, and Internship, plus social-recruiting roles and roles whose campus/full-time status cannot be verified.
   - Prefer official company career pages and official announcements. Do not claim that a role is open when its status cannot be verified.
3. Build a source-linked interview experience library for every role in the workspace.
   - Process roles in priority order. First complete roles with an explicit application or recruiting-progress fact in the workspace timeline or Career Ops tracker. Only then continue to the remaining selected roles.
   - Search Xiaohongshu specifically for the exact company, program/team, role, recruiting cohort, interview experience, consultation, written test, group interview, first round, second round, third round, HR round, and preparation.
   - Treat 10 independently opened and content-verified Xiaohongshu posts per role as a minimum coverage floor, not a stopping point. Continue a multi-round query matrix across exact role aliases, recruiting cohorts, each process stage, and available sort orders; open every newly surfaced, valuable exact-role post before stopping. A role is saturated only after every planned query slice has run and at least three consecutive expansion rounds produce no new valuable exact-role content (only already-seen, adjacent-track, promotional, or low-information results). Record the queries, rounds, exclusions, actual count, and saturation decision. Include both interview-process posts and assessment/written-test posts; aim for at least 4 assessment or written-test posts and 6 interview posts when exact-role evidence exists. If fewer exact matches exist, record the actual count and limitation. Never pad the target with adjacent programs or generic company posts.
   - Match the exact selected program. Sources about adjacent trainee tracks cannot support the selected program brief unless the source explicitly separates and verifies the selected track.
   - Match the selected direction inside a trainee program. Exclude other directions unless the source explicitly separates and supports the selected direction.
   - Search both the current cohort and earlier cohorts. Older posts are useful for recurring process and question patterns, but retain their year and never present an old process as the confirmed current process.
   - Supplement Xiaohongshu with official recruiting pages and other public interview experiences when useful.
   - Use only posts that are publicly accessible without bypassing login, paywalls, robots restrictions, or access controls. Keep the original post URL. Do not retain author names, account handles, avatars, or other personal identifiers.
   - Paraphrase and structure the useful information instead of copying whole posts. Do not reproduce long verbatim passages.
   - Separate official facts, single-post experiences, multi-post patterns, and analyst synthesis. When sources conflict, state the disagreement instead of silently choosing one.

Use the installed `xiaohongshu-skill` as the dedicated Xiaohongshu collector:

- Resolve it from `$CODEX_HOME/skills/xiaohongshu-skill`. Run its CLI from that directory with its Python 3.10+ virtual environment.
- Use only the read-only commands `check-login`, `search`, and `feed`. Never call publish, comment, reply, like, collect, or any other account-changing command from this Loop.
- Run `check-login` before any Xiaohongshu request. If login is unavailable, a CAPTCHA appears, the browser cannot start, or network policy blocks access, stop Xiaohongshu collection for that run and record `xiaohongshuStatus: blocked`. A scheduled run must not start an interactive QR-code login.
- Use `search` for every recorded query. Take each current `id` and `xsec_token` from that search result, then call `feed` before treating the note as collected. Do not reuse an old or guessed `xsec_token`.
- For every entry in `xiaohongshuProvidedLinks`, first search by its known title or the role-specific query to obtain a current token, then call `feed` for the matching note ID. A bare shared URL is discovery input, not verified content.
- A successful `feed` result must contain a readable title and non-empty note content. Record a short paraphrased `contentDigest` of the facts that will be used in questions. Do not persist raw cookies, tokens, full post text, author identifiers, avatars, or long verbatim passages in `intelligence.json`.
- Build question answers from collected evidence first. Inside each answer, separate `【资料结论】` from `【Codex 分析与作答建议】`. Only the material conclusion may be attributed to the post's `sourceIds`; Codex analysis must be clearly labeled as analysis.
- Keep conflicting posts as separate answer units. Never merge disagreement into a false consensus.

For each role, organize evidence into only the sections that have useful evidence, in this preferred order:

1. 背景与筛选
2. 整体流程
3. 笔试 / 测评 / 群面
4. 一面
5. 二面
6. 三面
7. HR 面 / 终面
8. 准备清单

Every section contains questions. Every question contains a short synthesis and one or more independently sourced answer units. Each answer unit must point to the source IDs that support it. Use question wording that the user can directly practice, such as “一面通常会问什么？” or “为什么选择这个岗位？”

Write the result atomically to:

`{{OFFER_DATA_DIR}}/intelligence.json`

Also append a sanitized run summary atomically to:

`{{OFFER_DATA_DIR}}/loop-runs.json`

The run log is the source for the offer “Loop 日报” page. Append a record for every run, including partial, blocked, unavailable, and no-change runs; keep newest first and retain at most 60. Record the run ID, start/end time, status, short summary, counts, newly added pipeline opportunities, verified official progress changes, homepage reminders, failures, and a per-role Xiaohongshu summary with queries, exact-role candidate count, content-verified post titles/direct URLs/digests, category (`assessment` or `interview`), actual count, target count, and limitations. Never store cookies, tokens, raw post text, author/account identifiers, avatars, candidate IDs, or personal query parameters in this file.

Use this JSON structure:

```json
{
  "generatedAt": "ISO timestamp",
  "opportunities": [
    {
      "id": "stable id",
      "company": "company",
      "title": "role",
      "role": "role",
      "location": "location or not specified",
      "summary": "why it matters",
      "url": "primary source URL",
      "source": "source name",
      "publishedAt": "date or null",
      "employmentType": "campus_full_time",
      "recruitingTrack": "autumn or campus",
      "eligibility": "verified graduating cohort or new-graduate eligibility",
      "tags": ["AI product"]
    }
  ],
  "roleBriefs": {
    "workspace company id": {
      "companyId": "workspace company id",
      "updatedAt": "ISO timestamp",
      "summary": "most important current judgment",
      "signals": ["three to six concise signals for backward compatibility"],
      "questions": ["three to six highest-priority practice questions for backward compatibility"],
      "processTimeline": [
        {
          "id": "stable process node id",
          "order": 1,
          "title": "网申开放 / 截止 / 笔试 / 一面 / 二面 / 终面 / Offer",
          "date": "exact YYYY-MM-DD only when verified, otherwise null",
          "dateStart": "verified range start or null",
          "dateEnd": "verified range end or null",
          "estimateStart": "MM-DD approximate range start from experience evidence, otherwise null",
          "estimateEnd": "MM-DD approximate range end from experience evidence, otherwise null",
          "dateLabel": "reader-facing exact date, range, or evidence-limited relative timing",
          "description": "what happens at this stage",
          "evidenceType": "official, verified_listing, experience_consensus, or experience_single",
          "confidence": "high, medium, low, or pending",
          "basis": "short reader-facing explanation of how the date or range was established",
          "sourceIds": ["source id"]
        }
      ],
      "experienceSections": [
        {
          "id": "stable section id such as background, process, round-1, round-2, round-3, hr, preparation",
          "title": "背景与筛选 / 整体流程 / 一面 / 二面 / 三面 / HR 面 / 准备清单",
          "summary": "what this section establishes and its evidence limits",
          "questions": [
            {
              "id": "stable question id",
              "question": "a direct practice question ending with a question mark",
              "synthesis": "short cross-source synthesis; distinguish pattern from inference",
              "answers": [
                {
                  "text": "one concise, structured answer unit paraphrased from the evidence",
                  "note": "optional cohort, conflict, confidence, or applicability note",
                  "sourceIds": ["source id"]
                }
              ]
            }
          ]
        }
      ],
      "sources": [
        {
          "id": "stable source id",
          "title": "post or page title",
          "url": "direct source URL",
          "source": "小红书 / official platform / other platform",
          "kind": "official or experience",
          "publishedAt": "date or null",
          "year": "cohort or publication year, or null",
          "accessedAt": "ISO timestamp",
          "captureStatus": "content_verified for a successfully read Xiaohongshu post, otherwise omitted",
          "capturedAt": "ISO timestamp for a successfully read Xiaohongshu post, otherwise omitted",
          "contentDigest": ["short paraphrased evidence claim from the collected post"]
        }
      ],
      "researchCoverage": {
        "aliases": ["company, program, team, product, and role aliases actually searched"],
        "queries": ["search query actually used"],
        "xiaohongshuStatus": "success, blocked, or not_run",
        "xiaohongshuPosts": 0,
        "xiaohongshuCollector": {
          "name": "xiaohongshu-skill",
          "loginStatus": "available, unavailable, or not_checked",
          "searchesSucceeded": 0,
          "feedsSucceeded": 0,
          "checkedAt": "ISO timestamp",
          "failures": ["login, CAPTCHA, browser, network, empty-content, or token failure"]
        },
        "xiaohongshuCandidates": [
          {
            "id": "stable candidate id",
            "title": "visible Xiaohongshu result title",
            "query": "query that surfaced it",
            "visibleDate": "visible date text or null",
            "likes": "visible like count or null",
            "url": "direct note URL when verified, otherwise null",
            "status": "verified or link_required",
            "evidence": "how this result was observed"
          }
        ],
        "xiaohongshuProvidedLinks": [
          {
            "noteId": "note id parsed from the user-provided URL",
            "url": "canonical Xiaohongshu note URL",
            "originalUrl": "complete user-provided share URL",
            "providedAt": "ISO timestamp",
            "status": "access_blocked or verified",
            "title": "verified title or null",
            "matchedCandidateId": "matching candidate id or null"
          }
        ],
        "saturation": {
          "status": "expanding, saturated, or blocked",
          "roundsCompleted": 0,
          "consecutiveNoNewRounds": 0,
          "decision": "short evidence-bounded explanation"
        },
        "otherExperiencePosts": 0,
        "officialSources": 0,
        "limitations": ["missing stage, access limitation, date uncertainty, or source conflict"]
      }
    }
  },
  "applicationSync": {
    "checkedAt": "ISO timestamp",
    "status": "complete, partial, blocked, or not_configured",
    "appliedCount": 0,
    "checkedCount": 0,
    "records": {
      "workspace company id": {
        "companyId": "workspace company id",
        "company": "company",
        "role": "role",
        "portalId": "id from application-portals.json",
        "sourceUrl": "official application center URL without credentials, tokens, candidate ids, or personal query parameters",
        "checkedAt": "ISO timestamp",
        "accessStatus": "verified, blocked, or unavailable",
        "trackingCapability": "full_status_center or submission_confirmation_only",
        "officialStatus": "exact visible official text or null",
        "normalizedStage": "投递、筛选、测评、笔试、面试、Offer、拒绝、已入职 or null",
        "detail": "short evidence-bounded explanation",
        "fingerprint": "stable hash or normalized status key"
      }
    },
    "changes": [
      {
        "id": "stable transition id",
        "runId": "current generatedAt",
        "createdAt": "ISO timestamp",
        "type": "application",
        "company": "company",
        "companyId": "workspace company id",
        "role": "role",
        "fromStatus": "previous verified status",
        "toStatus": "new verified status",
        "title": "short homepage reminder title",
        "summary": "evidence-bounded transition summary",
        "url": "official application center URL"
      }
    ]
  },
  "updates": [
    {
      "id": "stable run-scoped update id",
      "runId": "current generatedAt or another stable run id",
      "createdAt": "ISO timestamp",
      "type": "sync, opportunity, interview, source, process, or application",
      "title": "short update title",
      "summary": "what changed and why it matters",
      "company": "company or null",
      "companyId": "workspace company id or null",
      "url": "direct relevant source URL or null"
    }
  ],
  "automation": {
    "name": "秋招情报 Loop",
    "schedule": "每天 22:30",
    "status": "active"
  }
}
```

Validation rules:

- Keep only verified information. Do not create sample companies, fake roles, invented dates, fabricated interview questions, or fabricated answers.
- Every opportunity must have `employmentType: campus_full_time` and `recruitingTrack` equal to `autumn` or `campus`. Reject the complete opportunity if its title, summary, tags, or source evidence indicates an internship, social recruiting, or an unverified recruiting track.
- Every opportunity must also match the target role scope: AI product or a management/product trainee program. Reject pure operations roles even when they are AI-adjacent; a unified trainee program may remain when the official role explicitly includes a product track.
- `applicationSync.appliedCount` must equal the number of unique current workspace roles or Career Ops rows explicitly marked as applied. `checkedCount` counts only records with a visible official status; blocked and unavailable records remain in `records` but do not count as checked.
- Never persist account names, phone numbers, email addresses, candidate IDs, cookies, tokens, session values, or status URLs containing personal query parameters. `sourceUrl` and update URLs must be the clean official application-center URL.
- Every `applicationSync.changes` item must correspond to a newly observed transition from a previous explicit local or verified official stage. Preserve prior changes, deduplicate by `id`, sort newest first, and retain at most 100. Access failure never creates a transition.
- Before appending an official status node to `workspace.json`, re-read the current file, verify the same `companyId` still exists, deduplicate by `syncKey`, preserve every user field and timeline node, validate the full JSON, and replace it atomically. If that validation fails, leave `workspace.json` unchanged and record the sync as partial.
- `roleBriefs` keys and `companyId` values must exactly match current workspace company IDs.
- Build `processTimeline` from official schedules first. Official dates use `evidenceType: official`, exact `date/dateStart/dateEnd`, and `confidence: high`. A recruiter-posted current job listing may use `evidenceType: verified_listing` only when recruiter/company identity and current recruiting cohort are both visible.
- Experience posts may establish approximate ranges. If at least two independent posts contain explicit interview-event dates for the same project and stage, write `evidenceType: experience_consensus`, keep `date/dateStart/dateEnd` null, store the normalized month-day window in `estimateStart/estimateEnd`, use a qualified `dateLabel` such as “往届常见：8 月下旬—10 月中旬”, and cite every supporting source. Use `confidence: medium` by default; only use high when the sources are recent, consistent, and cover the same track.
- A single first-person post may use `evidenceType: experience_single`, but the label must name that cohort or candidate timeline and must not generalize it into a project-wide window. Publication dates, search-result dates, comment dates, and unrelated recruiting tracks are not interview-event dates and cannot be used to infer a range.
- When mapping historical ranges onto the current cohort, explicitly label them as “往届参考” or “按往届推测”; never present them as the current official schedule. If no event-date evidence exists, keep `confidence: pending` and say that the time range is still being collected rather than silently inventing one.
- Every `sourceIds` entry must resolve to a source in the same role brief.
- Every source must have a direct URL; search-result URLs without an accessible underlying source do not count as collected posts.
- Deduplicate sources by canonical URL and questions by meaning.
- Preserve contradictory answers as separate answer units with clear notes.
- `researchCoverage.xiaohongshuPosts` must equal the number of unique collected sources whose platform is 小红书.
- A Xiaohongshu source counts as collected only when `captureStatus` is `content_verified`, `contentDigest` is non-empty, the direct note URL is present, and a current `feed` call returned readable content. Search metadata, a note ID, a share URL, or a successful navigation alone is insufficient.
- `researchCoverage.xiaohongshuCollector.feedsSucceeded` must equal the number of successful unique note-detail extractions in the current run. Do not include cached or blocked links.
- Preserve visible Xiaohongshu search results in `xiaohongshuCandidates` even when an access restriction prevents opening the note. A candidate is discovery evidence, not a collected source, and must not increase `xiaohongshuPosts` until its direct URL and contents are verified.
- Candidate titles, dates, and engagement counts must come from an observed search result or user-provided screenshot. Never invent missing fields. Use `status: link_required` and `url: null` when the direct note URL is unavailable.
- Preserve every entry in `xiaohongshuProvidedLinks` across runs. These links were explicitly supplied by the user and must never be dropped when replacing `intelligence.json`.
- When Xiaohongshu access is available, open each provided link, verify its title and contents, match it to an existing candidate when possible, and promote the verified note into `sources`. Until the contents are readable, keep `status: access_blocked`; the link alone does not increase `xiaohongshuPosts`.
- `researchCoverage.xiaohongshuStatus` must be `success`, `blocked`, or `not_run`. Use `blocked` when login, robots, network policy, or another access restriction prevents a trustworthy search. Never report an access failure as a successful search with zero results.
- Report `xiaohongshuPosts: 0` as a true zero only when `xiaohongshuStatus` is `success` and the recorded queries completed successfully.
- Before replacing the file, compare the new result with the previous valid `intelligence.json`. Append concise update records for added/removed opportunities, recruiting-status changes, official application-status transitions, new interview questions or sources, and changed process nodes or time ranges. Always append one `sync` record for the completed run, even when there is no substantive change. Preserve prior updates, deduplicate by `id`, sort newest first, and retain at most 100.
- Validate the complete JSON before replacing the existing file. Write to a temporary file in the same directory, parse and validate it, then atomically rename it.
- If research or validation fails, keep the last valid `intelligence.json` unchanged and report the failure.

For the macOS app, replace `{{OFFER_DATA_DIR}}` with:

`~/Library/Application Support/offer/data`

Replace `{{CAREER_OPS_DIR}}` with the absolute path to the user's separately
installed local career-ops repository.

For local development, replace it with the absolute path to this repository's `data` directory.
