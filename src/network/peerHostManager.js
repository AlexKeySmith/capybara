import { encodePeerSignal, decodePeerSignal, waitForIceGatheringComplete } from '../shared/peerSignal.js';
import { createMessage, isProtocolMessage } from '../shared/protocol.js';
import { buildControllerUrl } from '../shared/session.js';

const ICE_SERVERS = [
  {
    urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  },
];

function closePeer(peer) {
  peer.channel?.close();
  peer.connection?.close();
}

export function createPeerHostManager({ sessionId }) {
  const listeners = new Set();
  const peers = new Set();
  let pendingPeer = null;

  function emit(message) {
    listeners.forEach((listener) => listener(message));
  }

  function bindPeer(peer) {
    peer.channel.addEventListener('open', () => {
      peers.add(peer);
      if (pendingPeer === peer) pendingPeer = null;
      emit(createMessage('transport-open', {
        sessionId,
        clientId: peer.clientId || peer.peerId,
        role: 'system',
      }));
    });
    peer.channel.addEventListener('close', () => {
      peers.delete(peer);
      if (pendingPeer === peer) pendingPeer = null;
      emit(createMessage('transport-closed', {
        sessionId,
        clientId: peer.clientId || peer.peerId,
        role: 'system',
      }));
    });
    peer.channel.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (!isProtocolMessage(message) || message.sessionId !== sessionId) return;
        peer.clientId = message.clientId || peer.clientId;
        emit(message);
      } catch {
        // Ignore malformed peer payloads.
      }
    });
    peer.connection.addEventListener('connectionstatechange', () => {
      if (['closed', 'disconnected', 'failed'].includes(peer.connection.connectionState)) {
        closePeer(peer);
      }
    });
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async createInvite() {
      if (pendingPeer) closePeer(pendingPeer);

      const connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const channel = connection.createDataChannel('capybara');
      const peer = {
        peerId: `peer-${crypto.randomUUID()}`,
        clientId: '',
        connection,
        channel,
      };
      bindPeer(peer);

      const offer = await connection.createOffer();
      await connection.setLocalDescription(offer);
      await waitForIceGatheringComplete(connection);

      const offerToken = encodePeerSignal({
        type: 'offer',
        sessionId,
        peerId: peer.peerId,
        description: connection.localDescription,
      });

      const inviteUrl = buildControllerUrl(sessionId, 'peer');
      inviteUrl.searchParams.set('offer', offerToken);
      peer.inviteUrl = inviteUrl.toString();
      pendingPeer = peer;
      return peer.inviteUrl;
    },
    async applyAnswer(answerToken) {
      if (!pendingPeer) {
        throw new Error('Create a fresh invite before applying a reply code.');
      }

      const signal = decodePeerSignal(answerToken);
      if (
        signal.type !== 'answer'
        || signal.sessionId !== sessionId
        || signal.peerId !== pendingPeer.peerId
      ) {
        throw new Error('The reply code does not match the active invite.');
      }

      await pendingPeer.connection.setRemoteDescription(signal.description);
    },
    send(message) {
      const encoded = JSON.stringify({ ...message, role: 'host', sessionId });
      for (const peer of peers) {
        if (peer.channel.readyState === 'open') peer.channel.send(encoded);
      }
    },
    close() {
      listeners.clear();
      if (pendingPeer) closePeer(pendingPeer);
      for (const peer of peers) closePeer(peer);
      peers.clear();
      pendingPeer = null;
    },
  };
}
