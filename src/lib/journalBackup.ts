import { mergeJournal, parseJournal, readJournal, type Journal, type Store } from './journal.ts';
import { mergeReflection, parseReflection, readReflection, type Reflection } from './reflection.ts';

export function personalBackup(storage: Store): string {
  return JSON.stringify({ ...readJournal(storage), personalReflection: readReflection(storage) }, null, 2);
}
export function importPersonalBackup(storage: Store, raw: string, today: string): {
  journal: Journal; added: number; reflection?: Reflection; reflectionFailed: boolean;
} {
  const imported = parseJournal(raw);
  if (imported.entries.some(e => e.date > today)) throw new Error('미래 날짜가 있는 백업은 가져올 수 없어요.');
  const reflection = imported.personalReflection === undefined ? undefined : parseReflection(JSON.stringify(imported.personalReflection));
  // Both payloads validate before any write. Daily records commit first. A second
  // key can fail independently: report partial success, never roll back with an
  // older snapshot that could erase work from another tab.
  const { personalReflection: _reflection, ...daily } = imported;
  const result = mergeJournal(storage, daily as Journal);
  if (!reflection) return { ...result, reflectionFailed: false };
  try { return { ...result, reflection: mergeReflection(storage, reflection), reflectionFailed: false }; }
  catch { return { ...result, reflectionFailed: true }; }
}
