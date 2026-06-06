const SIGNAL_VERSION = 'capybara-peer-1';

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

function base64ToBytes(value) {
  const binary = typeof atob === 'function'
    ? atob(value)
    : Buffer.from(value, 'base64').toString('binary');
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toUrlSafeBase64(value) {
  return value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromUrlSafeBase64(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return `${normalized}${padding}`;
}

export function encodePeerSignal(payload) {
  const json = JSON.stringify({
    version: SIGNAL_VERSION,
    ...payload,
  });
  const bytes = new TextEncoder().encode(json);
  return toUrlSafeBase64(bytesToBase64(bytes));
}

export function decodePeerSignal(token) {
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Missing peer signal.');
  }

  const bytes = base64ToBytes(fromUrlSafeBase64(token.trim()));
  const payload = JSON.parse(new TextDecoder().decode(bytes));
  if (payload?.version !== SIGNAL_VERSION) {
    throw new Error('Unsupported peer signal.');
  }
  return payload;
}

export async function waitForIceGatheringComplete(connection, timeoutMs = 4000) {
  if (connection.iceGatheringState === 'complete') return;

  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      connection.removeEventListener('icegatheringstatechange', onChange);
      window.clearTimeout(timeoutId);
      resolve();
    };
    const onChange = () => {
      if (connection.iceGatheringState === 'complete') finish();
    };
    const timeoutId = window.setTimeout(finish, timeoutMs);
    connection.addEventListener('icegatheringstatechange', onChange);
  });
}
