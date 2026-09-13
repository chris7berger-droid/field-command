/**
 * Today's expected work: SOD / MOD / EOD / PRT.
 * Windows are counted from clock-in so a late start still has a real due time.
 * Clock-out is blocked until all four are done.
 */
export const DUTY_LOGS = [
  { key: 'SOD', label: 'START OF DAY', short: 'SOD', dueAfterMs: 15 * 60 * 1000, dueHour: null },
  { key: 'MOD', label: 'MID DAY', short: 'MOD', dueAfterMs: 4 * 60 * 60 * 1000, dueHour: 12 },
  { key: 'EOD', label: 'END OF DAY', short: 'EOD', dueAfterMs: 6 * 60 * 60 * 1000, dueHour: 15 },
];

export const PRT_DUTY = {
  key: 'PRT',
  label: 'PRODUCTION REPORT',
  short: 'PRT',
  dueAfterMs: 6 * 60 * 60 * 1000,
  dueHour: 15,
};

export function isDutyDue(clockInTime, now, dueAfterMs, dueHour) {
  if (!clockInTime) return false;
  const elapsed = now.getTime() - new Date(clockInTime).getTime();
  if (elapsed >= dueAfterMs) return true;
  if (dueHour != null && now.getHours() >= dueHour) return true;
  return false;
}

export function dutyState({ done, clockInTime, now, dueAfterMs, dueHour }) {
  if (done) return 'done';
  if (isDutyDue(clockInTime, now, dueAfterMs, dueHour)) return 'due';
  return 'upcoming';
}

export function missingClockOutDuties({ logTypes, prtSubmitted }) {
  const missing = [];
  if (!logTypes.has('SOD')) missing.push('start-of-day log');
  if (!logTypes.has('MOD')) missing.push('mid-day log');
  if (!logTypes.has('EOD')) missing.push('end-of-day log');
  if (!prtSubmitted) missing.push('production report');
  return missing;
}
