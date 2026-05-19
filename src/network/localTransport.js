import { createMessage, isProtocolMessage } from '../shared/protocol.js';

export function createLocalTransport({ sessionId, role, clientId }) {
  const channel = new BroadcastChannel(`molez:${sessionId}`);
  const listeners = new Set();

  channel.addEventListener('message', (event) => {
    const message = event.data;
    if (!isProtocolMessage(message)) return;
    if (message.sessionId !== sessionId) return;
    if (message.clientId === clientId) return;
    listeners.forEach((listener) => listener(message));
  });

  return {
    mode: 'local',
    async connect() {
      channel.postMessage(createMessage('presence', { clientId, role, sessionId }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(message) {
      channel.postMessage({ ...message, clientId, role, sessionId });
    },
    close() {
      channel.close();
      listeners.clear();
    },
  };
}
