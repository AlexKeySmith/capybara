import { DEFAULT_TRANSPORT, LOCAL_TRANSPORT, RELAY_TRANSPORT, SIGNALING_URL } from '../shared/config.js';
import { createLocalTransport } from './localTransport.js';
import { createRelayTransport } from './relayTransport.js';

export function createTransport({ sessionId, role, clientId, requestedMode = DEFAULT_TRANSPORT }) {
  if (requestedMode === RELAY_TRANSPORT && SIGNALING_URL) {
    return createRelayTransport({ sessionId, role, clientId, signalingUrl: SIGNALING_URL });
  }

  return createLocalTransport({ sessionId, role, clientId });
}

export function describeTransport(mode) {
  if (mode === RELAY_TRANSPORT && SIGNALING_URL) {
    return 'Managed relay active — remote mobile controllers can join from shared URLs.';
  }
  if (mode === RELAY_TRANSPORT) {
    return 'Relay mode requested, but no VITE_SIGNALING_URL is configured; local BroadcastChannel mode is active.';
  }
  return 'Local BroadcastChannel mode is active for fast iteration and same-browser device testing.';
}
