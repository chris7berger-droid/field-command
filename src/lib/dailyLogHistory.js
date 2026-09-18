import { createdOnLocalYmd, localYmd } from './utils';

/** Local YYYY-MM-DD work dates for this job's Daily Log, plus today. No future dates. */
export function dailyLogWorkDates(entries, today) {
  const dates = new Set();
  if (today) dates.add(today);
  for (const e of entries || []) {
    if (!e?.created_at || !today) continue;
    const when = new Date(e.created_at);
    if (Number.isNaN(when.getTime())) continue;
    const ymd = localYmd(when);
    if (ymd && ymd <= today) dates.add(ymd);
  }
  return [...dates].sort();
}

export function dailyLogEntriesOnDate(entries, ymd) {
  return (entries || []).filter((e) => createdOnLocalYmd(e.created_at, ymd));
}

export function adjacentLogDate(dates, viewDate, dir) {
  if (!dates?.length || !viewDate || !dir) return null;
  if (dir < 0) {
    for (let i = dates.length - 1; i >= 0; i -= 1) {
      if (dates[i] < viewDate) return dates[i];
    }
    return null;
  }
  for (let i = 0; i < dates.length; i += 1) {
    if (dates[i] > viewDate) return dates[i];
  }
  return null;
}
