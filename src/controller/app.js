import { createTransport, describeTransport } from '../network/createTransport.js';
import {
  APP_NAME,
  APP_TAGLINE,
  DEFAULT_TRANSPORT,
  INPUT_SEND_MS,
  REMOTE_HEARTBEAT_MS,
} from '../shared/config.js';
import { createMessage, normalizeAssignment, normalizeInputState } from '../shared/protocol.js';
import { parseAppQuery } from '../shared/query.js';
import { ensureSessionId, safePlayerName } from '../shared/session.js';

const CONTROL_KEYS = [
  ['left', '◀'],
  ['right', '▶'],
  ['aimUp', '▲'],
  ['aimDown', '▼'],
  ['jump', 'JUMP'],
  ['fire', 'FIRE'],
  ['grapple', 'HOOK'],
  ['ready', 'READY'],
];

export async function bootstrapController(root) {
  const query = parseAppQuery();
  const sessionId = ensureSessionId(query.sessionId);
  const preferredName = safePlayerName(query.preferredName || localStorage.getItem('capybara.controllerName') || 'Ranger');
  const clientId = `controller-${crypto.randomUUID()}`;
  const transport = createTransport({
    sessionId,
    role: 'controller',
    clientId,
    requestedMode: query.transport || DEFAULT_TRANSPORT,
  });

  const state = {
    name: preferredName,
    input: normalizeInputState({ ready: true }),
    assignedSlot: null,
    status: 'Connecting…',
    transportLabel: describeTransport(query.transport || transport.mode),
    roster: [],
  };

  root.className = 'controller-page scanlines';
  root.innerHTML = `
    <section class="controller-shell">
      <div class="stage-header">
        <div>
          <div class="controller-title">${APP_NAME}</div>
          <p class="controller-subtitle">${APP_TAGLINE}</p>
        </div>
        <div class="status-pill" data-testid="controller-transport">${transport.mode.toUpperCase()}</div>
      </div>
      <div class="controller-body">
        <div class="controller-card">
          <div class="controller-status">
            <div>
              <div class="meta-label">Session</div>
              <div class="code-value" data-testid="controller-session">${sessionId}</div>
            </div>
            <div>
              <div class="meta-label">Status</div>
              <div class="info-value" data-testid="controller-status">${state.status}</div>
            </div>
          </div>
          <p class="transport-note" data-testid="controller-note">${state.transportLabel}</p>
        </div>

        <div class="controller-card">
          <label class="meta-label" for="controller-name">Call sign</label>
          <input id="controller-name" class="text-input" maxlength="20" value="${state.name}" />
          <div class="helper-text">Names are sanitized before entering the roster. Session GUIDs are validated before connecting.</div>
        </div>

        <div class="controller-card">
          <div class="info-grid">
            <div>
              <div class="meta-label">Assigned slot</div>
              <div class="info-value" data-testid="controller-slot">Waiting</div>
            </div>
            <div>
              <div class="meta-label">Linked players</div>
              <div class="info-value" data-testid="controller-roster">0</div>
            </div>
          </div>
        </div>

        <div class="controller-card">
          <div class="controller-grid">
            <div class="controller-cluster">
              <div class="controller-row"><button class="controller-button" data-control="aimUp" type="button">▲</button></div>
              <div class="controller-row">
                <button class="controller-button" data-control="left" type="button">◀</button>
                <button class="controller-button" data-control="aimDown" type="button">▼</button>
                <button class="controller-button" data-control="right" type="button">▶</button>
              </div>
            </div>
            <div></div>
            <div class="action-cluster">
              <div class="controller-row"><button class="controller-button action wide" data-control="jump" type="button">JUMP</button></div>
              <div class="controller-row"><button class="controller-button action" data-control="fire" type="button">FIRE</button></div>
              <div class="controller-row"><button class="controller-button action" data-control="grapple" type="button">HOOK</button></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;

  const nameInput = root.querySelector('#controller-name');
  const statusEl = root.querySelector('[data-testid="controller-status"]');
  const slotEl = root.querySelector('[data-testid="controller-slot"]');
  const rosterEl = root.querySelector('[data-testid="controller-roster"]');

  const sendJoin = () => {
    state.name = safePlayerName(nameInput.value, 'Ranger');
    localStorage.setItem('capybara.controllerName', state.name);
    transport.send(createMessage('join', {
      sessionId,
      controllerName: state.name,
      ready: state.input.ready,
    }));
  };

  const setStatus = (text, tone = 'status-good') => {
    statusEl.textContent = text;
    statusEl.className = `info-value ${tone}`;
    state.status = text;
  };

  const sendInput = () => {
    transport.send(createMessage('input', {
      sessionId,
      input: normalizeInputState(state.input),
    }));
  };

  const bindPressButton = (button, control) => {
    const activate = (active) => {
      state.input[control] = active;
      button.classList.toggle('is-active', active);
      sendInput();
    };

    const down = (event) => {
      event.preventDefault();
      activate(true);
    };
    const up = (event) => {
      event.preventDefault();
      activate(false);
    };

    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('pointerleave', up);
  };

  root.querySelectorAll('[data-control]').forEach((button) => {
    bindPressButton(button, button.dataset.control);
  });

  nameInput.addEventListener('change', sendJoin);

  transport.subscribe((message) => {
    if (message.targetId && message.targetId !== clientId && message.targetId !== 'all') return;
    switch (message.type) {
      case 'assign': {
        const assignment = normalizeAssignment(message);
        if (assignment.accepted) {
          state.assignedSlot = assignment.slot;
          slotEl.textContent = `P${assignment.slot + 1}`;
          setStatus('Connected', 'status-good');
          navigator.vibrate?.(18);
        } else {
          state.assignedSlot = null;
          slotEl.textContent = 'Waiting';
          setStatus(assignment.reason || 'Arena full', 'status-warning');
        }
        break;
      }
      case 'state': {
        const roster = message.snapshot?.roster || [];
        state.roster = roster;
        rosterEl.textContent = `${roster.filter((player) => player.controllerId).length}`;
        if (state.assignedSlot !== null) {
          const mine = roster.find((player) => player.slot === state.assignedSlot);
          if (mine) slotEl.textContent = `${mine.label} · ${mine.hp} HP`;
        }
        break;
      }
      case 'transport-closed':
        setStatus('Relay unavailable', 'status-danger');
        break;
      default:
        break;
    }
  });

  await transport.connect();
  setStatus('Joining…', 'status-warning');
  sendJoin();
  sendInput();

  const inputInterval = window.setInterval(sendInput, INPUT_SEND_MS);
  const heartbeatInterval = window.setInterval(() => {
    if (state.assignedSlot === null) sendJoin();
    transport.send(createMessage('heartbeat', { sessionId }));
  }, REMOTE_HEARTBEAT_MS);

  window.__capybara = {
    controller: {
      ready: true,
      sessionId,
      clientId,
    },
  };

  window.addEventListener('beforeunload', () => {
    window.clearInterval(inputInterval);
    window.clearInterval(heartbeatInterval);
    transport.send(createMessage('disconnect', { sessionId }));
    transport.close();
  }, { once: true });
}
