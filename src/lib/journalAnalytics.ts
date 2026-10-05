type JournalEvent = 'open' | 'record_start' | 'record_saved' | 'record_failed' | 'history_open' |
  'backup_export' | 'backup_import' | 'legacy_open';
type EventDetail = { kind?: 'zero' | 'spend'; action?: 'create' | 'edit'; has_history?: boolean };

const health = { sent: 0, submitted: 0, failed: 0 };
export function getJournalAnalyticsHealth() { return { ...health }; }

// No amount, note, date, nickname, or app-supplied identity enters analytics.
// Toss SDK may attach its platform anonymous key. Logging never blocks saving.
export function trackJournal(event: JournalEvent, detail: EventDetail = {}) {
  if (!import.meta.env.PROD) return;
  // Copy only allowed fields: TypeScript alone does not constrain runtime objects.
  const params: { experience: string } & EventDetail = { experience: 'personal_v1' };
  if (detail.kind === 'zero' || detail.kind === 'spend') params.kind = detail.kind;
  if (detail.action === 'create' || detail.action === 'edit') params.action = detail.action;
  if (typeof detail.has_history === 'boolean') params.has_history = detail.has_history;
  health.sent++;
  void import('@apps-in-toss/web-framework').then(({ Analytics }) =>
    Analytics.log({ log_type: 'event', log_name: `journal_${event}`, params }),
  ).then(() => { health.submitted++; }).catch(() => {
    if (health.failed++ === 0) console.warn('Journal analytics unavailable; local saving is unaffected');
  });
}
