import { createMessage, isProtocolMessage } from '../shared/protocol.js';

export function createRelayTransport({ sessionId, role, clientId, signalingUrl }) {
  const listeners = new Set();
  let socket;
  let isOpen = false;

  function emit(message) {
    listeners.forEach((listener) => listener(message));
  }

  return {
    mode: 'relay',
    async connect() {
      if (!signalingUrl) {
        throw new Error('A relay transport requires VITE_SIGNALING_URL.');
      }

      await new Promise((resolve, reject) => {
        const url = new URL(signalingUrl);
        url.searchParams.set('session', sessionId);
        url.searchParams.set('clientId', clientId);
        url.searchParams.set('role', role);

        socket = new WebSocket(url);
        socket.addEventListener('open', () => {
          isOpen = true;
          socket.send(JSON.stringify(createMessage('subscribe', { sessionId, clientId, role })));
          resolve();
        });
        socket.addEventListener('message', (event) => {
          try {
            const message = JSON.parse(event.data);
            if (isProtocolMessage(message) && message.sessionId === sessionId && message.clientId !== clientId) {
              emit(message);
            }
          } catch {
            // Ignore malformed relay payloads.
          }
        });
        socket.addEventListener('close', () => {
          isOpen = false;
          emit(createMessage('transport-closed', { sessionId, clientId: 'relay', role: 'system' }));
        });
        socket.addEventListener('error', () => reject(new Error('Could not connect to relay transport.')));
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(message) {
      if (!isOpen || !socket) return;
      socket.send(JSON.stringify({ ...message, clientId, role, sessionId }));
    },
    close() {
      listeners.clear();
      if (socket) socket.close();
    },
  };
}
