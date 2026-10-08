# Monthly reflection and weekly promise

The personal journal now connects saved days to a monthly reflection and one optional promise for next week. This extends the existing weekly review; daily recording, the public read-only archive and free JSON backup remain available without login.

## Product behavior

- `월간 회고` shows the selected month's actual saved amount, recorded days and explicit missing days. A missing day is never treated as zero. Current-month sums stop at today's KST date.
- The five most recent days appear first. All days can be expanded. A remembered older day remains visible in the selected-day summary, and `기록 열기` opens the original day for inspection or editing.
- A remembered day and an optional 140-character reflection save separately from the original record. Monthly drafts survive app tabs, record drilldown and browser back while this page remains open. Month changes ask before discarding an unsaved reflection. Before-unload protection asks before refreshing or closing where the browser supports that event; unsaved drafts are not permanent backups.
- The next-week promise uses **today's KST Monday + 7 days**, including while reviewing an older month. Its date range and year are shown explicitly. Example text is optional and editable; one promise per target week can be revised.
- The promise appears only on dates in its target week. A daily save never marks it completed. After a day is saved, the person can choose `해봤어요`, `바꿔보고 싶어요` or `아직 못 해봤어요`. These are self-reflections, not proof of saved money or achievement.
- Editing a promise preserves earlier answers with the wording seen at the time. The UI labels an earlier answer's original wording when it differs from the current promise.

## Storage and privacy

`savelog_personal_journal_v1` remains version 1. Its validated date/amount/note/timestamp fields and opaque record/root extensions are preserved on read, edit, backup and import. A synthetic photo payload is tested; the personal journal has no new photo-upload control. Existing legacy photo/archive code is unchanged.

`savelog_personal_reflection_v1` is an additive device-local key containing versioned `months` and `promises`. Save operations re-read storage first to preserve work on other dates, months and weeks. Parse or quota failures keep the editor and original storage; a corrupt reflection does not prevent saving a daily record. No new Supabase tables, requests, login, external analytics events, notifications, reward or payment features are introduced.

New JSON backups add `personalReflection` alongside the existing version-1 journal. Old daily-only files still work. Both payloads validate before writing. Existing dates/months/weeks win on import. If daily import succeeds but reflection storage fails, the UI explicitly reports partial success and retains the prior reflection. It never rolls back with a potentially stale snapshot.

## Local verification

`bun run test` covers month/year/leap/KST week boundaries, corruption and quota errors, multiple-tab reads, promise-wording history, extension preservation, old/new backups and partial import failure. `bunx tsc --noEmit` checks types; `bun run build` creates the web bundle and local AIT archive. The repository has no lint script or lint configuration.

Mobile browser evidence uses synthetic records, blocked external requests and isolated Mac Chrome/WebKit contexts. It is not evidence of physical-device/native SDK behavior, real API/ad operation, user satisfaction or improved retention. No production records are inspected. Commit, browser evidence and limitations are recorded in the enclosing task's handoff notes.
