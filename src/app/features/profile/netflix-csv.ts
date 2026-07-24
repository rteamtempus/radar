// Netflix viewing-history CSV parsing + episode→show grouping. PURE module —
// no Angular imports — tested via `npx tsx src/app/features/profile/netflix-csv.test.ts`.
//
// Source file: Netflix → Account → profile → Viewing activity → "Download all".
// Simple export columns: Title, Date. The fuller privacy-report
// ViewingActivity.csv also has a Title column, so both work.
//
// Series rows look like "Show: Season 1: Episode Name" (3+ colon segments) —
// grouped under the first segment. Two-segment titles stay whole so movies
// like "Mission: Impossible" aren't mangled.

export interface HistoryItem {
  title: string;
  isSeries: boolean;
  /** number of CSV rows that collapsed into this title */
  rowCount: number;
  /** most recent watch date, ISO — null if unparseable */
  lastWatchedAt: string | null;
}

/** Minimal CSV parser: quoted fields, "" escapes, CR/LF row ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/**
 * Parse a Netflix history CSV into deduped, most-recent-first titles.
 * Throws if no Title column is found (probably not a Netflix export).
 */
export function parseNetflixHistory(text: string): HistoryItem[] {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('The file is empty.');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const titleCol = header.indexOf('title');
  const dateCol = header.indexOf('date');
  if (titleCol === -1) {
    throw new Error("No 'Title' column found — is this a Netflix viewing-activity CSV?");
  }

  const byKey = new Map<string, HistoryItem>();
  for (const row of rows.slice(1)) {
    const raw = (row[titleCol] ?? '').trim();
    if (!raw) continue;
    const segments = raw.split(': ');
    const isSeries = segments.length >= 3;
    const title = isSeries ? segments[0].trim() : raw;

    let watchedAt: string | null = null;
    if (dateCol !== -1 && row[dateCol]) {
      const d = new Date(row[dateCol].trim());
      if (!Number.isNaN(d.getTime())) watchedAt = d.toISOString();
    }

    const key = title.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.rowCount++;
      existing.isSeries ||= isSeries;
      if (watchedAt && (!existing.lastWatchedAt || watchedAt > existing.lastWatchedAt)) {
        existing.lastWatchedAt = watchedAt;
      }
    } else {
      byKey.set(key, { title, isSeries, rowCount: 1, lastWatchedAt: watchedAt });
    }
  }

  return [...byKey.values()].sort((a, b) =>
    (b.lastWatchedAt ?? '').localeCompare(a.lastWatchedAt ?? ''),
  );
}
