/**
 * Canonical Field Command activation + identity helpers.
 *
 * Source of truth: team_members.active + team_members.apps includes "field".
 */

const MISSING_ID_CODE = 'FC_MISSING_TEAM_MEMBER_ID';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeAppToken(value) {
  return normalizeString(value).toLowerCase();
}

function parseAppsFromString(raw) {
  const text = normalizeString(raw);
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    return parseAppsPayload(parsed);
  } catch {
    // Fall back to simple delimited parsing for legacy/plain-text values.
    return text
      .split(/[,\s]+/)
      .map(normalizeAppToken)
      .filter(Boolean);
  }
}

function objectApps(payload) {
  const apps = [];
  for (const [key, enabled] of Object.entries(payload || {})) {
    const app = normalizeAppToken(key);
    if (!app) continue;
    if (enabled === true || enabled === 1 || enabled === '1') {
      apps.push(app);
      continue;
    }
    if (typeof enabled === 'string') {
      const flag = enabled.trim().toLowerCase();
      if (flag === 'true' || flag === 'enabled' || flag === 'yes') {
        apps.push(app);
      }
    }
  }
  return apps;
}

export function parseAppsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload
      .map(normalizeAppToken)
      .filter(Boolean);
  }
  if (typeof payload === 'string') {
    return parseAppsFromString(payload);
  }
  if (payload && typeof payload === 'object') {
    return objectApps(payload);
  }
  return [];
}

export function normalizeTeamMemberId(value) {
  const id = normalizeString(value);
  return id || null;
}

export function isTeamMemberActive(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const flag = value.trim().toLowerCase();
    return flag === 'true' || flag === '1' || flag === 'yes' || flag === 'active';
  }
  return false;
}

export function hasFieldEntitlement(appsValue) {
  return parseAppsPayload(appsValue).includes('field');
}

export function evaluateFieldActivation(teamMember) {
  const id = normalizeTeamMemberId(teamMember?.id);
  if (!id) {
    return { allowed: false, reason: 'missing_id' };
  }
  if (!isTeamMemberActive(teamMember?.active)) {
    return { allowed: false, reason: 'inactive' };
  }
  if (!hasFieldEntitlement(teamMember?.apps)) {
    return { allowed: false, reason: 'missing_field_app' };
  }
  return { allowed: true, id };
}

export function requireCanonicalTeamMemberId(value, context = 'operation write') {
  const id = normalizeTeamMemberId(value);
  if (id) return id;
  const err = new Error(`Blocked ${context}: missing canonical team_members.id`);
  err.code = MISSING_ID_CODE;
  throw err;
}

export function isMissingTeamMemberIdError(error) {
  return error?.code === MISSING_ID_CODE;
}
