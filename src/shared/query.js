import { DEFAULT_FIXTURE, DEFAULT_SEED, DEFAULT_TRANSPORT } from './config.js';
import { ensureSessionId, sanitizeSessionId } from './session.js';

export function parseAppQuery(search = window.location.search) {
  const params = new URLSearchParams(search);
  const seedValue = Number.parseInt(params.get('seed') || `${DEFAULT_SEED}`, 10);

  return {
    fixture: params.get('fixture') || DEFAULT_FIXTURE,
    renderMode: 'webcanvas',
    seed: Number.isFinite(seedValue) ? seedValue : DEFAULT_SEED,
    testMode: params.get('test') === '1',
    sessionId: sanitizeSessionId(params.get('session')),
    transport: params.get('transport') || DEFAULT_TRANSPORT,
    preferredName: params.get('name') || '',
  };
}

export function syncHostUrl({ sessionId, transport, fixture, seed, testMode, renderMode }) {
  const url = new URL(window.location.href);
  url.searchParams.set('session', ensureSessionId(sessionId));
  url.searchParams.set('transport', transport);
  url.searchParams.set('fixture', fixture);
  url.searchParams.set('seed', `${seed}`);
  if (testMode) url.searchParams.set('test', '1');
  else url.searchParams.delete('test');
  url.searchParams.set('render', renderMode || 'webcanvas');
  url.searchParams.delete('power');
  history.replaceState({}, '', url);
}
