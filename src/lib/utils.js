/**
 * Shared utility functions for Field Command
 */

// Format dollar amount, no decimals
export function fmt$(n) {
  if (n == null || isNaN(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

// Format date string to "Jan 1, 2026"
export function fmtD(d) {
  if (!d) return '—';
  const date = new Date(d + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Today's date as YYYY-MM-DD
export function tod() {
  return new Date().toISOString().slice(0, 10);
}

// Format time as "1:30 PM"
export function fmtTime(d) {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

// Parse JSON safely (for field_sow, materials, tasks stored as text in PowerSync)
export function parseJSON(text, fallback = []) {
  if (!text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

// Format hours as "8.5 hrs"
export function fmtHrs(n) {
  if (n == null || isNaN(n)) return '—';
  return `${Number(n).toFixed(1)} hrs`;
}

// Format percentage as "45%"
export function fmtPct(n) {
  if (n == null || isNaN(n)) return '—';
  return `${Math.round(n)}%`;
}

// Get initials from a full name (max 2 chars)
export function inits(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
