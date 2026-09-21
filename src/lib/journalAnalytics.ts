type JournalEvent = 'open' | 'record_start' | 'record_saved' | 'record_failed' | 'history_open' |
  'backup_export' | 'backup_import' | 'legacy_open';
type EventDetail = { kind?: 'zero' | 'spend'; action?: 'create' | 'edit'; has_history?: boolean };

// No amount, note, date, nickname, or app-supplied identity enters analytics.
// Toss SDK may attach its platform anonymous key. Logging never blocks saving.
export function trackJournal(event: JournalEvent, detail: EventDetail = {}) {
  if (!import.meta.env.PROD) return;
  void import('@apps-in-toss/web-framework').then(({ Analytics }) =>
    Analytics.log({ log_type: 'event', log_name: `journal_${event}`, params: { experience: 'personal_v1', ...detail } }),
  ).catch(() => {});
}
