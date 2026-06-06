import { describe, expect, it } from 'vitest';
import { decodePeerSignal, encodePeerSignal } from '../../src/shared/peerSignal.js';

describe('peerSignal helpers', () => {
  it('round-trips url-safe tokens', () => {
    const token = encodePeerSignal({
      type: 'offer',
      sessionId: 'test-peer-123',
      peerId: 'peer-abc',
      description: {
        type: 'offer',
        sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n',
      },
    });

    expect(token).not.toContain('+');
    expect(token).not.toContain('/');

    expect(decodePeerSignal(token)).toEqual({
      version: 'capybara-peer-1',
      type: 'offer',
      sessionId: 'test-peer-123',
      peerId: 'peer-abc',
      description: {
        type: 'offer',
        sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\n',
      },
    });
  });
});
