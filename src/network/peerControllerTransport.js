import { decodePeerSignal, encodePeerSignal, waitForIceGatheringComplete } from '../shared/peerSignal.js';
import { createMessage, isProtocolMessage } from '../shared/protocol.js';

const ICE_SERVERS = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
];

export function createPeerControllerTransport({ sessionId, role, clientId, offerToken }) {
  const listeners = new Set();
  let channel = null;
  let connection = null;
  let isOpen = false;
  let answerToken = '';

  function emit(message) {
    listeners.forEach((listener) => listener(message));
  }

  function attachChannel(nextChannel) {
    channel = nextChannel;
    channel.addEventListener('open', () => {
      isOpen = true;
      emit(createMessage('transport-open', { sessionId, clientId, role }));
    });
    channel.addEventListener('close', () => {
      isOpen = false;
      emit(createMessage('transport-closed', { sessionId, clientId, role }));
    });
    channel.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (!isProtocolMessage(message) || message.sessionId !== sessionId) return;
        emit(message);
      } catch {
        // Ignore malformed peer payloads.
      }
    });
  }

  return {
    mode: 'peer',
    async connect() {
      const signal = decodePeerSignal(offerToken);
      if (signal.type !== 'offer' || signal.sessionId !== sessionId) {
        throw new Error('The peer invite does not match this session.');
      }

      connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      connection.addEventListener('datachannel', (event) => attachChannel(event.channel));
      connection.addEventListener('connectionstatechange', () => {
        if (['closed', 'disconnected', 'failed'].includes(connection.connectionState)) {
          isOpen = false;
          emit(createMessage('transport-closed', { sessionId, clientId, role }));
        }
      });

      await connection.setRemoteDescription(signal.description);
      const answer = await connection.createAnswer();
      await connection.setLocalDescription(answer);
      await waitForIceGatheringComplete(connection);

      answerToken = encodePeerSignal({
        type: 'answer',
        sessionId,
        peerId: signal.peerId,
        description: connection.localDescription,
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send(message) {
      if (!isOpen || !channel || channel.readyState !== 'open') return;
      channel.send(JSON.stringify({ ...message, clientId, role, sessionId }));
    },
    close() {
      listeners.clear();
      if (channel) channel.close();
      if (connection) connection.close();
    },
    getPendingAnswer() {
      return answerToken;
    },
    isReady() {
      return isOpen;
    },
  };
}
