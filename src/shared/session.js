import { APP_BASE_PATH, DEFAULT_TRANSPORT } from './config.js';

const SESSION_ID_PATTERN = /^[a-z0-9-]{6,64}$/i;

export function sanitizeSessionId(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  return SESSION_ID_PATTERN.test(normalized) ? normalized : '';
}

export function createSessionId() {
  const uuid = crypto.randomUUID().replace(/[^a-z0-9]/gi, '').toLowerCase();
  return `${uuid.slice(0, 4)}-${uuid.slice(4, 8)}-${uuid.slice(8, 12)}`;
}

export function ensureSessionId(value) {
  return sanitizeSessionId(value) || createSessionId();
}

export function safePlayerName(value, fallback = 'Ranger') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().replace(/[^\w\- ]/g, '').slice(0, 20);
  return normalized || fallback;
}

export function buildControllerUrl(sessionId, transport = DEFAULT_TRANSPORT) {
  const url = new URL(`${APP_BASE_PATH}controller/`, window.location.origin);
  url.searchParams.set('session', ensureSessionId(sessionId));
  url.searchParams.set('transport', transport);
  return url;
}

export function shortCode(sessionId) {
  return ensureSessionId(sessionId).split('-').join('').slice(0, 8).toUpperCase();
}
