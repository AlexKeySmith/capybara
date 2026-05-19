import QRCode from 'qrcode';
import { MolezSimulation } from '../game/simulation.js';
import { resolveFixture } from '../game/fixtures.js';
import { drawSimulation, resizeCanvas } from '../game/render.js';
import { createTransport, describeTransport } from '../network/createTransport.js';
import {
  APP_NAME,
  APP_TAGLINE,
  DEFAULT_TRANSPORT,
  REMOTE_HEARTBEAT_MS,
  REMOTE_TIMEOUT_MS,
  STATE_BROADCAST_MS,
} from '../shared/config.js';
import { createMessage, isProtocolMessage, normalizeInputState, normalizeJoinPayload } from '../shared/protocol.js';
import { parseAppQuery, syncHostUrl } from '../shared/query.js';
import { buildControllerUrl, ensureSessionId, shortCode } from '../shared/session.js';

export async function bootstrapHost(root) {
  const query = parseAppQuery();
  const fixture = resolveFixture(query.fixture);
  const sessionId = ensureSessionId(query.sessionId);
  const clientId = `host-${crypto.randomUUID()}`;
  const transport = createTransport({
    sessionId,
    role: 'host',
    clientId,
    requestedMode: query.transport || DEFAULT_TRANSPORT,
  });

  const state = {
    fixture: fixture.name,
    sessionId,
    seed: query.seed,
    testMode: query.testMode,
    transportMode: transport.mode,
    hostInput: normalizeInputState({}),
    simulation: new MolezSimulation({ seed: query.seed, fixture: query.fixture }),
    peers: new Map(),
    controllerAssignments: new Map(),
    lastStateBroadcast: 0,
    rafId: 0,
  };

  root.className = 'app-shell scanlines';
  root.innerHTML = `
    <div class="layout">
      <section class="stage-panel">
        <div class="stage-header">
          <div>
            <div class="hero-title">${APP_NAME}</div>
            <p class="hero-subtitle">${APP_TAGLINE}</p>
          </div>
          <div class="badge-row">
            <span class="badge" data-testid="host-fixture">${fixture.name}</span>
            <span class="badge" data-testid="host-transport">${transport.mode.toUpperCase()}</span>
            <span class="badge" data-testid="host-code">${shortCode(sessionId)}</span>
          </div>
        </div>
        <div class="canvas-wrap">
          <canvas class="game-canvas" data-testid="host-canvas"></canvas>
          <div class="canvas-overlay">
            <div class="overlay-stack">
              <div class="overlay-pill" data-testid="host-time">Time: --</div>
              <div class="overlay-pill" data-testid="host-last-action">${state.simulation.lastAction}</div>
            </div>
            <div class="overlay-stack">
              <div class="overlay-pill" data-testid="host-score">Score: 0</div>
              <div class="overlay-pill" data-testid="host-roster-count">Players: 1 / 4</div>
            </div>
          </div>
        </div>
      </section>

      <aside class="sidebar">
        <section class="sidebar-panel">
          <div class="sidebar-header">
            <div>
              <div class="controller-title">Join Session</div>
              <div class="transport-note" data-testid="transport-note"></div>
            </div>
          </div>
          <div class="sidebar-body">
            <div class="card">
              <div class="meta-label">Session code</div>
              <div class="code-value" data-testid="session-code">${shortCode(sessionId)}</div>
              <div class="helper-text">Share the controller URL or the QR code. The GUID remains stable in the host URL for reproducible test runs.</div>
            </div>
            <div class="card">
              <div class="meta-label">Controller URL</div>
              <div class="join-url" data-testid="join-url"></div>
            </div>
            <div class="qr-frame"><canvas data-testid="join-qr" width="160" height="160"></canvas></div>
          </div>
        </section>

        <section class="sidebar-panel">
          <div class="sidebar-header">
            <div>
              <div class="controller-title">Round Telemetry</div>
              <div class="helper-text">Deterministic fixture state and mobile join readiness.</div>
            </div>
          </div>
          <div class="sidebar-body">
            <div class="metric-grid">
              <div class="metric"><div class="metric-label">Seed</div><div class="metric-value" data-testid="metric-seed">${query.seed}</div></div>
              <div class="metric"><div class="metric-label">Fixture</div><div class="metric-value" data-testid="metric-fixture">${fixture.name}</div></div>
              <div class="metric"><div class="metric-label">Bots</div><div class="metric-value" data-testid="metric-bots">3</div></div>
              <div class="metric"><div class="metric-label">Remote pads</div><div class="metric-value" data-testid="metric-controllers">0</div></div>
            </div>
            <canvas class="minimap" width="300" height="132" data-testid="minimap"></canvas>
          </div>
        </section>

        <section class="sidebar-panel">
          <div class="sidebar-header">
            <div>
              <div class="controller-title">Controller Roster</div>
              <div class="helper-text">Remote peers take over bot slots. Local keyboard remains slot one.</div>
            </div>
          </div>
          <div class="sidebar-body">
            <ul class="roster-list" data-testid="roster-list"></ul>
            <div class="actions-row">
              <button type="button" data-action="reset">Reset arena</button>
              <button type="button" data-action="copy">Copy join link</button>
            </div>
          </div>
        </section>
      </aside>
    </div>
  `;

  const canvas = root.querySelector('[data-testid="host-canvas"]');
  const minimap = root.querySelector('[data-testid="minimap"]');
  const timeEl = root.querySelector('[data-testid="host-time"]');
  const scoreEl = root.querySelector('[data-testid="host-score"]');
  const lastActionEl = root.querySelector('[data-testid="host-last-action"]');
  const rosterCountEl = root.querySelector('[data-testid="host-roster-count"]');
  const transportNoteEl = root.querySelector('[data-testid="transport-note"]');
  const joinUrlEl = root.querySelector('[data-testid="join-url"]');
  const qrCanvas = root.querySelector('[data-testid="join-qr"]');
  const rosterList = root.querySelector('[data-testid="roster-list"]');
  const metricBotsEl = root.querySelector('[data-testid="metric-bots"]');
  const metricControllersEl = root.querySelector('[data-testid="metric-controllers"]');
  const copyButton = root.querySelector('[data-action="copy"]');
  const resetButton = root.querySelector('[data-action="reset"]');

  transportNoteEl.textContent = describeTransport(query.transport || transport.mode);

  syncHostUrl({
    sessionId,
    transport: query.transport || transport.mode,
    fixture: query.fixture,
    seed: query.seed,
    testMode: query.testMode,
  });

  const controllerUrl = buildControllerUrl(sessionId, query.transport || transport.mode).toString();
  joinUrlEl.textContent = controllerUrl;
  await QRCode.toCanvas(qrCanvas, controllerUrl, {
    width: 160,
    margin: 1,
    color: { dark: '#f8d95c', light: '#00000000' },
  });

  function renderRoster() {
    const roster = state.simulation.getRosterSnapshot();
    rosterList.innerHTML = '';
    for (const player of roster) {
      const item = document.createElement('li');
      item.className = 'roster-item';
      item.dataset.testid = `roster-slot-${player.slot}`;
      const swatch = document.createElement('span');
      swatch.className = 'roster-swatch';
      swatch.style.color = player.color;
      swatch.style.background = player.color;
      const info = document.createElement('div');
      info.innerHTML = `<div>${player.name}</div><div class="roster-meta">${player.label} · ${player.controllerId ? 'controller linked' : player.isBot ? 'bot standby' : 'keyboard host'}</div>`;
      const hp = document.createElement('div');
      hp.className = 'status-pill';
      hp.textContent = `${Math.max(0, player.hp)} HP`;
      item.append(swatch, info, hp);
      rosterList.append(item);
    }

    const controllers = roster.filter((player) => Boolean(player.controllerId)).length;
    const bots = roster.filter((player) => player.isBot).length;
    metricControllersEl.textContent = `${controllers}`;
    metricBotsEl.textContent = `${bots}`;
    rosterCountEl.textContent = `Players: ${1 + controllers} / 4`;
  }

  function broadcastState(force = false) {
    const now = performance.now();
    if (!force && now - state.lastStateBroadcast < STATE_BROADCAST_MS) return;
    state.lastStateBroadcast = now;

    transport.send(createMessage('state', {
      sessionId,
      targetId: 'all',
      snapshot: state.simulation.getPublicState(),
    }));
  }

  function removeTimedOutControllers() {
    const now = Date.now();
    for (const [controllerId, peer] of state.peers.entries()) {
      if (now - peer.lastSeen > REMOTE_TIMEOUT_MS) {
        state.peers.delete(controllerId);
        state.controllerAssignments.delete(controllerId);
        state.simulation.releaseController(controllerId);
      }
    }
  }

  function handleJoin(message) {
    const payload = normalizeJoinPayload(message);
    const slot = state.simulation.assignController(message.clientId, payload.controllerName);
    if (slot >= 0) {
      state.peers.set(message.clientId, {
        name: payload.controllerName,
        slot,
        lastSeen: Date.now(),
      });
      state.controllerAssignments.set(message.clientId, slot);
      transport.send(createMessage('assign', {
        sessionId,
        targetId: message.clientId,
        accepted: true,
        slot,
        controllerName: payload.controllerName,
        snapshot: state.simulation.getPublicState(),
      }));
    } else {
      transport.send(createMessage('assign', {
        sessionId,
        targetId: message.clientId,
        accepted: false,
        slot: -1,
        controllerName: payload.controllerName,
        reason: 'Arena full',
      }));
    }
    renderRoster();
    broadcastState(true);
  }

  function handleControllerInput(message) {
    const peer = state.peers.get(message.clientId);
    if (!peer) return;
    peer.lastSeen = Date.now();
    state.simulation.setRemoteInput(peer.slot, normalizeInputState(message.input));
  }

  function handleDisconnect(message) {
    state.peers.delete(message.clientId);
    state.controllerAssignments.delete(message.clientId);
    state.simulation.releaseController(message.clientId);
    renderRoster();
    broadcastState(true);
  }

  transport.subscribe((message) => {
    if (!isProtocolMessage(message)) return;
    switch (message.type) {
      case 'join':
        handleJoin(message);
        break;
      case 'heartbeat': {
        const peer = state.peers.get(message.clientId);
        if (peer) peer.lastSeen = Date.now();
        break;
      }
      case 'input':
        handleControllerInput(message);
        break;
      case 'disconnect':
      case 'transport-closed':
        handleDisconnect(message);
        break;
      default:
        break;
    }
  });

  const pressed = new Set();
  const keyBindings = {
    ArrowLeft: 'left',
    a: 'left',
    ArrowRight: 'right',
    d: 'right',
    ArrowUp: 'aimUp',
    w: 'aimUp',
    ArrowDown: 'aimDown',
    s: 'aimDown',
    ' ': 'jump',
    f: 'fire',
    g: 'grapple',
  };

  const onKeyChange = (event, isDown) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const mapped = keyBindings[key];
    if (!mapped) return;
    event.preventDefault();
    state.hostInput[mapped] = isDown;
    if (isDown) pressed.add(mapped);
    else pressed.delete(mapped);
  };

  window.addEventListener('keydown', (event) => onKeyChange(event, true));
  window.addEventListener('keyup', (event) => onKeyChange(event, false));

  copyButton.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(controllerUrl);
    copyButton.textContent = 'Copied';
    window.setTimeout(() => {
      copyButton.textContent = 'Copy join link';
    }, 1200);
  });

  resetButton.addEventListener('click', () => {
    state.simulation.reset({ seed: state.seed, fixture: query.fixture });
    renderRoster();
    broadcastState(true);
  });

  await transport.connect();
  renderRoster();

  let lastFrame = performance.now();
  const renderFrame = (time) => {
    const delta = Math.min(64, time - lastFrame);
    lastFrame = time;
    const viewportWidth = canvas.parentElement.clientWidth;
    const viewportHeight = Math.max(640, Math.min(window.innerHeight - 120, 820));
    const ctx = resizeCanvas(canvas, viewportWidth, viewportHeight);
    const minimapCtx = minimap.getContext('2d');

    removeTimedOutControllers();

    const steps = Math.max(1, Math.round(delta / (1000 / 60)));
    for (let step = 0; step < steps; step += 1) {
      state.simulation.tickFrame(state.hostInput, viewportWidth);
    }

    drawSimulation(ctx, minimapCtx, state.simulation, viewportWidth, viewportHeight);
    timeEl.textContent = `Time: ${Math.ceil(state.simulation.timeLeft)}`;
    scoreEl.textContent = `Score: ${state.simulation.score}`;
    lastActionEl.textContent = state.simulation.lastAction;

    renderRoster();
    broadcastState();
    state.rafId = requestAnimationFrame(renderFrame);
  };

  state.rafId = requestAnimationFrame(renderFrame);

  window.__molez = {
    host: {
      ready: true,
      sessionId,
      getState: () => state.simulation.getPublicState(),
    },
  };

  const heartbeatInterval = window.setInterval(() => {
    transport.send(createMessage('heartbeat', { sessionId }));
  }, REMOTE_HEARTBEAT_MS);

  window.addEventListener('beforeunload', () => {
    window.clearInterval(heartbeatInterval);
    cancelAnimationFrame(state.rafId);
    transport.send(createMessage('disconnect', { sessionId }));
    transport.close();
  }, { once: true });
}
