import { safePlayerName, sanitizeSessionId } from './session.js';

export const PROTOCOL_VERSION = 'molez-tribute-1';
export const INPUT_KEYS = ['left', 'right', 'aimUp', 'aimDown', 'jump', 'fire', 'grapple', 'ready'];

export function normalizeInputState(input) {
  const state = {};
  for (const key of INPUT_KEYS) {
    state[key] = Boolean(input?.[key]);
  }
  return state;
}

export function createMessage(type, payload = {}) {
  return {
    type,
    version: PROTOCOL_VERSION,
    sentAt: Date.now(),
    ...payload,
  };
}

export function isProtocolMessage(message) {
  return Boolean(message && typeof message === 'object' && message.version === PROTOCOL_VERSION && typeof message.type === 'string');
}

export function normalizeJoinPayload(payload) {
  return {
    sessionId: sanitizeSessionId(payload?.sessionId),
    controllerName: safePlayerName(payload?.controllerName, 'Ranger'),
    ready: Boolean(payload?.ready),
  };
}

export function normalizeAssignment(payload) {
  return {
    accepted: Boolean(payload?.accepted),
    slot: Number.isInteger(payload?.slot) ? payload.slot : -1,
    controllerName: safePlayerName(payload?.controllerName, 'Ranger'),
    reason: typeof payload?.reason === 'string' ? payload.reason : '',
  };
}
