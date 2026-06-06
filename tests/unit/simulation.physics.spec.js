import { describe, expect, test } from 'vitest';
import { CapybaraSimulation } from '../../src/game/simulation.js';
import { CELL, COLS, GRAVITY, ROWS, WORLD_WIDTH } from '../../src/game/constants.js';

function createSimulation() {
  return new CapybaraSimulation({ seed: 1337, fixture: 'training' });
}

function blankTerrain() {
  return Array.from({ length: ROWS }, () => new Uint8Array(COLS));
}

function clearTerrain(simulation) {
  simulation.terrain = blankTerrain();
}

function fillTerrainRect(simulation, x, y, width, height) {
  const startCol = Math.floor(x / CELL);
  const endCol = Math.floor((x + width - 1) / CELL);
  const startRow = Math.floor(y / CELL);
  const endRow = Math.floor((y + height - 1) / CELL);

  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS) simulation.terrain[row][col] = 1;
    }
  }
}

function freezePlayers(simulation) {
  for (const player of simulation.players) {
    player.hp = 0;
    player.vx = 0;
    player.vy = 0;
  }
}

function createRope(player, anchor, len, overrides = {}) {
  return {
    player,
    anchor: { ...anchor },
    len,
    minLen: 60,
    maxLen: 220,
    reelRate: 2.2,
    damp: 0.995,
    ...overrides,
  };
}

describe('CapybaraSimulation physics regression', () => {
  test('accelerates horizontally with a deterministic cap', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    player.vx = 0;
    for (let step = 0; step < 10; step += 1) {
      simulation.applyInput(player, { ...simulation.emptyInput(), right: true });
    }

    expect(player.vx).toBe(2.1);
    expect(player.face).toBe(1);
  });

  test('applies friction decay when no movement input is held', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    player.vx = 1.5;
    simulation.applyInput(player, simulation.emptyInput());

    expect(player.vx).toBeCloseTo(1.29, 10);
  });

  test('skips idle friction while a rope is attached', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    player.vx = 1.5;
    player.rope = createRope(player, { x: 100, y: 100 }, 90);
    simulation.applyInput(player, simulation.emptyInput());

    expect(player.vx).toBe(1.5);
  });

  test('only jumps when grounded', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    player.onGround = false;
    player.vy = -1.75;
    simulation.applyInput(player, { ...simulation.emptyInput(), jump: true });

    expect(player.vy).toBe(-1.75);
    expect(player.jumpCd).toBe(0);
  });

  test('grounded jump applies a fixed impulse and starts cooldown', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    player.onGround = true;
    player.vy = 0;
    simulation.applyInput(player, { ...simulation.emptyInput(), jump: true });

    expect(player.vy).toBe(-5.2);
    expect(player.onGround).toBe(false);
    expect(player.jumpCd).toBe(13);
  });

  test('jump cooldown prevents an immediate second jump', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    player.onGround = true;
    simulation.applyInput(player, { ...simulation.emptyInput(), jump: true });

    player.onGround = true;
    player.vy = 0;
    simulation.applyInput(player, { ...simulation.emptyInput(), jump: true });

    expect(player.vy).toBe(0);
    expect(player.jumpCd).toBe(12);
  });

  test('airborne jump input does not add variable jump height', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    player.onGround = false;
    player.jumpCd = 0;
    player.vy = -3.1;
    simulation.applyInput(player, { ...simulation.emptyInput(), jump: true });

    expect(player.vy).toBe(-3.1);
    expect(player.jumpCd).toBe(0);
  });

  test('rope reeling clamps to its minimum and maximum lengths', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    player.rope = createRope(player, { x: 120, y: 80 }, 61);
    simulation.applyInput(player, { ...simulation.emptyInput(), left: true });
    expect(player.rope.len).toBe(60);

    player.rope.len = 219;
    simulation.applyInput(player, { ...simulation.emptyInput(), right: true });
    expect(player.rope.len).toBe(220);
  });

  test('taut ropes clamp the player back to the configured maximum length', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];
    const rope = createRope(player, { x: 100, y: 100 }, 40);

    clearTerrain(simulation);
    fillTerrainRect(simulation, 100, 100, CELL, CELL);
    player.x = 140;
    player.y = 94;

    simulation.updateRope(rope);

    const centerX = player.x + player.w / 2;
    const centerY = player.y + player.h / 2;
    expect(Math.hypot(centerX - rope.anchor.x, centerY - rope.anchor.y)).toBeCloseTo(40, 10);
  });

  test('taut ropes remove outward radial velocity before damping', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];
    const rope = createRope(player, { x: 100, y: 100 }, 40);

    clearTerrain(simulation);
    fillTerrainRect(simulation, 100, 100, CELL, CELL);
    player.x = 140;
    player.y = 94;
    player.vx = 3;
    player.vy = 0;

    simulation.updateRope(rope);

    expect(player.vx).toBeCloseTo(0, 10);
    expect(player.vy).toBeCloseTo(GRAVITY * 0.16, 10);
  });

  test('slack ropes apply damping and gravity without repositioning the player', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];
    const rope = createRope(player, { x: 100, y: 100 }, 40);

    clearTerrain(simulation);
    fillTerrainRect(simulation, 100, 100, CELL, CELL);
    player.x = 114;
    player.y = 94;
    player.vx = 4;
    player.vy = 2;

    simulation.updateRope(rope);

    expect(player.x).toBe(114);
    expect(player.y).toBe(94);
    expect(player.vx).toBeCloseTo(3.98, 10);
    expect(player.vy).toBeCloseTo(2.0348, 10);
  });

  test('detaches ropes when the anchor cell is no longer solid', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];
    const rope = createRope(player, { x: 100, y: 100 }, 40);

    clearTerrain(simulation);
    player.rope = rope;
    simulation.ropes = [rope];

    simulation.updateRope(rope);

    expect(player.rope).toBeNull();
    expect(simulation.ropes).toHaveLength(0);
  });

  test('horizontal collisions zero horizontal velocity while allowing vertical sliding', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    clearTerrain(simulation);
    fillTerrainRect(simulation, 132, 40, 20, 140);
    player.x = 117;
    player.y = 60;
    player.vx = 5;
    player.vy = 2;

    simulation.updatePlayer(player);

    expect(player.x).toBe(117);
    expect(player.vx).toBe(0);
    expect(player.y).toBeCloseTo(62.28, 10);
    expect(player.onGround).toBe(false);
  });

  test('players lose grounded state after stepping beyond a platform edge', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    clearTerrain(simulation);
    fillTerrainRect(simulation, 80, 200, 40, 40);
    player.x = 121;
    player.y = 187;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;

    simulation.updatePlayer(player);

    expect(player.onGround).toBe(false);
    expect(player.y).toBeCloseTo(187.28, 10);
  });

  test('repeated floor updates keep a falling player bounded near the landing surface', () => {
    const simulation = createSimulation();
    const player = simulation.players[0];

    clearTerrain(simulation);
    fillTerrainRect(simulation, 0, 200, WORLD_WIDTH, 80);
    player.x = 96;
    player.y = 120;
    player.vx = 0;
    player.vy = 0;

    for (let step = 0; step < 40; step += 1) simulation.updatePlayer(player);

    expect(player.y).toBeGreaterThanOrEqual(187);
    expect(player.y).toBeLessThan(188);
    expect(player.vy).toBe(0);
  });

  test('projectiles keep horizontal speed while gravity advances the arc', () => {
    const simulation = createSimulation();

    clearTerrain(simulation);
    freezePlayers(simulation);
    simulation.bullets.push({ x: 100, y: 100, vx: 3.2, vy: -1, r: 2.3, life: 10, ownerSlot: 0 });

    simulation.updateBullets();

    expect(simulation.bullets).toHaveLength(1);
    expect(simulation.bullets[0].vx).toBe(3.2);
    expect(simulation.bullets[0].vy).toBeCloseTo(-0.88, 10);
    expect(simulation.bullets[0].x).toBeCloseTo(103.2, 10);
    expect(simulation.bullets[0].y).toBeCloseTo(99.12, 10);
    expect(simulation.bullets[0].life).toBe(9);
  });

  test('projectile terrain impacts resolve by carving and expiring the bullet', () => {
    const simulation = createSimulation();

    clearTerrain(simulation);
    freezePlayers(simulation);
    fillTerrainRect(simulation, 96, 96, 20, 20);
    simulation.bullets.push({ x: 100, y: 100, vx: 0, vy: 0, r: 2.3, life: 10, ownerSlot: 0 });

    simulation.updateBullets();

    expect(simulation.bullets[0].life).toBe(0);
    expect(simulation.isSolid(100, 100)).toBe(false);
  });

  test('camera eases twelve percent toward the host target each frame', () => {
    const simulation = createSimulation();
    const host = simulation.players[0];

    freezePlayers(simulation);
    host.x = 1000;
    simulation.cameraX = 0;

    simulation.tickFrame({}, 400);

    expect(simulation.cameraX).toBeCloseTo(98.4, 10);
  });

  test('camera convergence follows the same deterministic easing formula toward max scroll', () => {
    const simulation = createSimulation();
    const host = simulation.players[0];

    freezePlayers(simulation);
    host.x = WORLD_WIDTH;
    simulation.cameraX = 0;

    for (let step = 0; step < 5; step += 1) simulation.tickFrame({}, 400);

    expect(simulation.cameraX).toBeCloseTo(491.158806528, 10);
  });

  test('camera eases back toward zero when the host is near the left edge', () => {
    const simulation = createSimulation();
    const host = simulation.players[0];

    freezePlayers(simulation);
    host.x = 50;
    simulation.cameraX = 200;

    simulation.tickFrame({}, 400);

    expect(simulation.cameraX).toBeCloseTo(176, 10);
  });
});
