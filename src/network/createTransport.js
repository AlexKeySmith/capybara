import {
  DEFAULT_TRANSPORT,
  LOCAL_TRANSPORT,
  PEER_TRANSPORT,
  RELAY_TRANSPORT,
  SIGNALING_URL,
} from '../shared/config.js';
import { createLocalTransport } from './localTransport.js';
import { createPeerControllerTransport } from './peerControllerTransport.js';
import { createRelayTransport } from './relayTransport.js';

export function createTransport({
  sessionId,
  role,
  clientId,
  requestedMode = DEFAULT_TRANSPORT,
  offerToken = '',
}) {
  if (requestedMode === PEER_TRANSPORT && role === 'controller') {
    return createPeerControllerTransport({ sessionId, role, clientId, offerToken });
  }

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
  if (mode === PEER_TRANSPORT) {
    return 'Peer-to-peer mode uses a manual WebRTC reply code instead of a signaling server.';
  }
  return 'Local BroadcastChannel mode is active for fast iteration and same-browser device testing.';
}
