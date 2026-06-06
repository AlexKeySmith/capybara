import { PLAYER_COLORS, PLAYER_LABELS } from '../shared/config.js';
import { clamp, createSeededRandom } from '../shared/random.js';
import { CELL, COLS, GRAVITY, HOST_SLOT, MAX_PLAYERS, ROWS, TICK_RATE, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js';
import { resolveFixture } from './fixtures.js';

class Rope {
  constructor(player, anchor, len) {
    this.player = player;
    this.anchor = { x: anchor.x, y: anchor.y };
    this.len = len;
    this.minLen = 60;
    this.maxLen = 220;
    this.reelRate = 2.2;
    this.damp = 0.995;
  }
}

class GrappleFailFx {
  constructor(origin, direction, maxLen) {
    this.origin = origin;
    this.direction = direction;
    this.len = maxLen;
    this.age = 0;
    this.ttl = 22;
  }
}

class Bullet {
  constructor(x, y, vx, vy, ownerSlot) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.r = 2.3;
    this.life = 200;
    this.ownerSlot = ownerSlot;
  }
}

function createPlayer(slot, x, y, isBot) {
  return {
    slot,
    x,
    y,
    vx: 0,
    vy: 0,
    w: 12,
    h: 12,
    color: PLAYER_COLORS[slot],
    label: PLAYER_LABELS[slot],
    name: PLAYER_LABELS[slot],
    isBot,
    controllerId: null,
    aim: 0,
    face: 1,
    onGround: false,
    jumpCd: 0,
    fireCd: 0,
    hookCd: 0,
    hp: 100,
    rope: null,
    grappleHeldPrev: false,
    step: 0,
  };
}

export class CapybaraSimulation {
  constructor({ seed, fixture }) {
    this.reset({ seed, fixture });
  }

  reset({ seed, fixture }) {
    this.seed = seed;
    this.fixture = resolveFixture(fixture);
    this.random = createSeededRandom(seed);
    this.terrain = this.generateTerrain();
    this.stains = Array.from({ length: ROWS }, () => new Uint8ClampedArray(COLS));
    this.bullets = [];
    this.ropes = [];
    this.fx = [];
    this.tick = 0;
    this.score = 0;
    this.running = true;
    this.timeLeft = this.fixture.timeLimit;
    this.cameraX = 0;
    this.renderVersion = 1;
    this.spawnBeaconTicks = this.fixture.showBeaconTicks;
    this.lastAction = 'Awaiting controller join...';
    this.remoteInputs = Array.from({ length: MAX_PLAYERS }, () => this.emptyInput());
    this.players = this.spawnPlayers();
  }

  emptyInput() {
    return {
      left: false,
      right: false,
      aimUp: false,
      aimDown: false,
      jump: false,
      fire: false,
      grapple: false,
      ready: false,
    };
  }

  generateTerrain() {
    const grid = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const base = y < ROWS * 0.45 ? 0 : this.random() < 0.56 ? 1 : 0;
        grid[y][x] = base;
      }
    }

    export { CapybaraSimulation as MolezSimulation };

    for (let pass = 0; pass < 4; pass += 1) {
      const next = Array.from({ length: ROWS }, () => new Uint8Array(COLS));
      for (let y = 1; y < ROWS - 1; y += 1) {
        for (let x = 1; x < COLS - 1; x += 1) {
          let count = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (grid[y + dy][x + dx]) count += 1;
            }
          }
          next[y][x] = count >= 5 ? 1 : 0;
        }
      }
      for (let y = 1; y < ROWS - 1; y += 1) {
        for (let x = 1; x < COLS - 1; x += 1) {
          grid[y][x] = next[y][x];
        }
      }
    }

    for (let y = Math.floor(ROWS * 0.82); y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) grid[y][x] = 1;
    }

    return grid;
  }

  spawnPlayers() {
    const xs = [50, 700, 1100, 1400];
    return xs.map((x, slot) => {
      const spawn = this.safeSpawn(x);
      return createPlayer(slot, spawn.x, spawn.y, slot !== HOST_SLOT);
    });
  }

  centerOf(player) {
    return { x: player.x + player.w / 2, y: player.y + player.h / 2 };
  }

  safeSpawn(xGuess) {
    const x = clamp(xGuess, 10, WORLD_WIDTH - 10);
    let y = 40;
    for (let yy = 0; yy < WORLD_HEIGHT - 30; yy += 1) {
      if (this.isSolid(x, yy + 18)) {
        y = yy - 18;
        break;
      }
    }
    this.carve(x, y + 6, 14);
    return { x: clamp(x - 6, 0, WORLD_WIDTH), y: clamp(y, 0, WORLD_HEIGHT) };
  }

  isSolid(px, py) {
    const cx = (px / CELL) | 0;
    const cy = (py / CELL) | 0;
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return true;
    return this.terrain[cy][cx] !== 0;
  }

  hitSolidAabb(x, y, w, h) {
    return this.isSolid(x, y) || this.isSolid(x + w, y) || this.isSolid(x, y + h) || this.isSolid(x + w, y + h);
  }

  carve(px, py, radius) {
    const cx = (px / CELL) | 0;
    const cy = (py / CELL) | 0;
    const rr = Math.ceil(radius / CELL);
    const rr2 = (radius / CELL) * (radius / CELL);

    let changed = false;
    for (let y = cy - rr; y <= cy + rr; y += 1) {
      for (let x = cx - rr; x <= cx + rr; x += 1) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rr2) {
          if (this.terrain[y][x] || this.stains[y][x]) changed = true;
          this.terrain[y][x] = 0;
          this.stains[y][x] = 0;
        }
      }
    }
    if (changed) this.renderVersion += 1;
  }

  addStainCircle(px, py, radius, amount = 180) {
    const cx = (px / CELL) | 0;
    const cy = (py / CELL) | 0;
    const rr = Math.ceil(radius / CELL);
    const rr2 = (radius / CELL) * (radius / CELL);

    let changed = false;
    for (let y = cy - rr; y <= cy + rr; y += 1) {
      for (let x = cx - rr; x <= cx + rr; x += 1) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= rr2 && this.terrain[y][x]) {
          const next = Math.min(255, this.stains[y][x] + amount);
          if (next !== this.stains[y][x]) changed = true;
          this.stains[y][x] = next;
        }
      }
    }
    if (changed) this.renderVersion += 1;
  }

  rayToSurface(ox, oy, dx, dy, maxLen, step = 2) {
    for (let t = 0; t <= maxLen; t += step) {
      const x = ox + dx * t;
      const y = oy + dy * t;
      if (this.isSolid(x, y)) return { x: ox + dx * Math.max(0, t - 2), y: oy + dy * Math.max(0, t - 2), hit: true };
    }
    return { x: ox + dx * maxLen, y: oy + dy * maxLen, hit: false };
  }

  assignController(controllerId, controllerName) {
    const existing = this.players.find((player) => player.controllerId === controllerId);
    if (existing) {
      existing.name = controllerName;
      existing.isBot = false;
      return existing.slot;
    }

    const freePlayer = this.players.find((player) => player.slot !== HOST_SLOT && !player.controllerId);
    if (!freePlayer) return -1;

    freePlayer.controllerId = controllerId;
    freePlayer.name = controllerName;
    freePlayer.label = PLAYER_LABELS[freePlayer.slot];
    freePlayer.isBot = false;
    freePlayer.hp = 100;
    freePlayer.vx = 0;
    freePlayer.vy = 0;
    this.remoteInputs[freePlayer.slot] = this.emptyInput();
    this.lastAction = `${controllerName} joined ${freePlayer.label}`;
    return freePlayer.slot;
  }

  releaseController(controllerId) {
    const player = this.players.find((entry) => entry.controllerId === controllerId);
    if (!player) return;
    player.controllerId = null;
    player.name = PLAYER_LABELS[player.slot];
    player.isBot = true;
    player.hp = Math.max(player.hp, 72);
    player.rope = null;
    this.remoteInputs[player.slot] = this.emptyInput();
    this.lastAction = `${player.label} reverted to bot coverage.`;
  }

  setRemoteInput(slot, input) {
    if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) return;
    this.remoteInputs[slot] = { ...this.emptyInput(), ...input };
  }

  botInputFor(player) {
    const livingTargets = this.players.filter((target) => target.slot !== player.slot && target.hp > 0);
    const input = this.emptyInput();
    if (!livingTargets.length) return input;

    const target = livingTargets.reduce((best, candidate) => {
      const bestDx = best.x - player.x;
      const bestDy = best.y - player.y;
      const candidateDx = candidate.x - player.x;
      const candidateDy = candidate.y - player.y;
      return candidateDx * candidateDx + candidateDy * candidateDy < bestDx * bestDx + bestDy * bestDy ? candidate : best;
    });

    if (target.x < player.x - 10) input.left = true;
    if (target.x > player.x + 10) input.right = true;
    if (target.y < player.y - 8) input.aimUp = true;
    if (target.y > player.y + 22) input.aimDown = true;
    if (player.onGround && this.tick % (70 + player.slot * 17) === 0) input.jump = true;
    if (this.tick % (34 + player.slot * 9) === 0) input.fire = true;
    if (!player.rope && target.y + 16 < player.y && this.tick % (180 + player.slot * 20) === 0) input.grapple = true;

    return input;
  }

  shoot(player) {
    const center = this.centerOf(player);
    const dx = Math.cos(player.aim) * player.face;
    const dy = Math.sin(player.aim);
    const speed = 3.2;
    this.bullets.push(new Bullet(center.x + dx * 8, center.y + dy * 8, dx * speed, dy * speed, player.slot));
  }

  shootGrapple(player) {
    const center = this.centerOf(player);
    const maxLen = 260;
    const step = 4;
    const dirX = Math.cos(player.aim) * player.face;
    const dirY = Math.sin(player.aim);

    for (let t = 8; t < maxLen; t += step) {
      const tx = center.x + dirX * t;
      const ty = center.y + dirY * t;
      if (this.isSolid(tx, ty)) {
        const len = clamp(t, 80, 200);
        const rope = new Rope(player, { x: tx, y: ty }, len);
        player.rope = rope;
        this.ropes.push(rope);
        this.lastAction = `${player.name} anchored a grapple.`;
        return;
      }
    }

    this.fx.push(new GrappleFailFx(center, { x: dirX, y: dirY }, maxLen));
  }

  detachRope(rope) {
    if (rope.player.rope === rope) rope.player.rope = null;
    const index = this.ropes.indexOf(rope);
    if (index >= 0) this.ropes.splice(index, 1);
  }

  applyInput(player, input) {
    const acceleration = 0.4;
    const maxSpeed = 2.1;
    if (input.left) {
      player.vx = Math.max(-maxSpeed, player.vx - acceleration);
      player.face = -1;
      if (player.rope) player.rope.len = Math.max(player.rope.minLen, player.rope.len - player.rope.reelRate);
    }
    if (input.right) {
      player.vx = Math.min(maxSpeed, player.vx + acceleration);
      player.face = 1;
      if (player.rope) player.rope.len = Math.min(player.rope.maxLen, player.rope.len + player.rope.reelRate);
    }
    if (!input.left && !input.right && !player.rope) player.vx *= 0.86;

    const aimStep = 0.06;
    if (input.aimUp) player.aim -= aimStep;
    if (input.aimDown) player.aim += aimStep;
    player.aim = clamp(player.aim, -Math.PI / 2, Math.PI / 2);

    if (input.grapple && !player.grappleHeldPrev && player.hookCd <= 0) {
      if (player.rope) this.detachRope(player.rope);
      else this.shootGrapple(player);
      player.hookCd = 12;
    }
    if (input.jump && player.jumpCd <= 0 && player.onGround) {
      player.vy = -5.2;
      player.onGround = false;
      player.jumpCd = 14;
      this.lastAction = `${player.name} jumped.`;
    }
    if (input.fire && player.fireCd <= 0) {
      this.shoot(player);
      player.fireCd = 12;
      this.lastAction = `${player.name} fired.`;
    }

    player.grappleHeldPrev = Boolean(input.grapple);
    player.jumpCd = Math.max(0, player.jumpCd - 1);
    player.fireCd = Math.max(0, player.fireCd - 1);
    player.hookCd = Math.max(0, player.hookCd - 1);
  }

  updatePlayer(player) {
    if (player.hp <= 0) return;
    if (player.onGround) player.step += Math.abs(player.vx) * 0.3;
    else player.step *= 0.95;

    player.vy += GRAVITY;
    player.x += player.vx;
    if (this.hitSolidAabb(player.x, player.y, player.w, player.h)) {
      player.x -= player.vx;
      player.vx = 0;
    }

    player.y += player.vy;
    if (this.hitSolidAabb(player.x, player.y, player.w, player.h)) {
      if (player.vy > 0) {
        while (this.hitSolidAabb(player.x, player.y, player.w, player.h)) player.y -= 1;
        player.onGround = true;
      }
      player.vy = 0;
    } else {
      player.onGround = false;
    }

    player.x = clamp(player.x, 0, WORLD_WIDTH - player.w);
    player.y = clamp(player.y, 0, WORLD_HEIGHT - player.h);
  }

  updateRope(rope) {
    const ax = (rope.anchor.x / CELL) | 0;
    const ay = (rope.anchor.y / CELL) | 0;
    if (ay < 0 || ay >= ROWS || ax < 0 || ax >= COLS || this.terrain[ay][ax] === 0) {
      this.detachRope(rope);
      return;
    }

    const center = this.centerOf(rope.player);
    let dx = center.x - rope.anchor.x;
    let dy = center.y - rope.anchor.y;
    const distance = Math.hypot(dx, dy) || 1;
    dx /= distance;
    dy /= distance;

    if (distance > rope.len) {
      const targetX = rope.anchor.x + dx * rope.len;
      const targetY = rope.anchor.y + dy * rope.len;
      rope.player.x += targetX - center.x;
      rope.player.y += targetY - center.y;
      const velocityDot = rope.player.vx * dx + rope.player.vy * dy;
      if (velocityDot > 0) {
        rope.player.vx -= velocityDot * dx;
        rope.player.vy -= velocityDot * dy;
      }
    }

    rope.player.vx *= rope.damp;
    rope.player.vy = rope.player.vy * rope.damp + GRAVITY * 0.16;
  }

  updateBullets() {
    this.bullets = this.bullets.filter((bullet) => bullet.life > 0);
    for (const bullet of this.bullets) {
      bullet.vy += 0.12;
      bullet.x += bullet.vx;
      bullet.y += bullet.vy;

      if (this.isSolid(bullet.x, bullet.y)) {
        this.carve(bullet.x, bullet.y, 10);
        bullet.life = 0;
        continue;
      }

      for (const player of this.players) {
        if (player.slot === bullet.ownerSlot || player.hp <= 0) continue;
        const dx = player.x + player.w / 2 - bullet.x;
        const dy = player.y + player.h / 2 - bullet.y;
        if (dx * dx + dy * dy < (bullet.r + 6) * (bullet.r + 6)) {
          player.hp = Math.max(0, player.hp - 18);
          for (let index = 0; index < 6; index += 1) {
            const spread = -0.3 + index * 0.12;
            const angle = Math.atan2(bullet.vy, bullet.vx) + spread;
            const hit = this.rayToSurface(bullet.x, bullet.y, Math.cos(angle), Math.sin(angle), 40, 2);
            if (hit.hit) this.addStainCircle(hit.x, hit.y, 4 + index, 180);
          }
          this.carve(bullet.x, bullet.y, 12);
          this.score += 1;
          bullet.life = 0;
          this.lastAction = `${this.players[bullet.ownerSlot].name} tagged ${player.name}.`;
          break;
        }
      }

      bullet.life -= 1;
    }
  }

  updateFx() {
    this.fx = this.fx.filter((effect) => effect.age < effect.ttl);
    for (const effect of this.fx) effect.age += 1;
  }

  tickFrame(hostInput, viewportWidth) {
    if (!this.running) return;

    this.tick += 1;
    this.timeLeft -= 1 / TICK_RATE;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.running = false;
      this.lastAction = 'Round complete — reset to run another deterministic session.';
    }

    for (const player of this.players) {
      const input = player.slot === HOST_SLOT
        ? { ...this.emptyInput(), ...hostInput }
        : player.controllerId
          ? { ...this.emptyInput(), ...this.remoteInputs[player.slot] }
          : this.botInputFor(player);
      this.applyInput(player, input);
    }

    for (const rope of [...this.ropes]) this.updateRope(rope);
    for (const player of this.players) this.updatePlayer(player);
    this.updateBullets();
    this.updateFx();

    const hostPlayer = this.players[HOST_SLOT];
    const targetCamera = clamp(hostPlayer.x - viewportWidth * 0.45, 0, Math.max(0, WORLD_WIDTH - viewportWidth));
    this.cameraX += (targetCamera - this.cameraX) * 0.12;

    if (this.spawnBeaconTicks > 0) this.spawnBeaconTicks -= 1;
  }

  getRosterSnapshot() {
    return this.players.map((player) => ({
      slot: player.slot,
      label: player.label,
      name: player.name,
      color: player.color,
      controllerId: player.controllerId,
      isBot: player.isBot,
      hp: player.hp,
    }));
  }

  getPublicState() {
    return {
      score: this.score,
      tick: this.tick,
      running: this.running,
      timeLeft: this.timeLeft,
      lastAction: this.lastAction,
      roster: this.getRosterSnapshot(),
    };
  }
}
