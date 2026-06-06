import { describe, expect, test } from 'vitest';
import { CapybaraSimulation } from '../../src/game/simulation.js';
import { TICK_RATE, WORLD_HEIGHT, WORLD_WIDTH } from '../../src/game/constants.js';

describe('CapybaraSimulation dynamics', () => {
  test('counts down round time and stops the match at zero', () => {
    const simulation = new CapybaraSimulation({ seed: 1337, fixture: 'training' });

    simulation.timeLeft = 1 / TICK_RATE;
    simulation.tickFrame({}, 1024);

    expect(simulation.timeLeft).toBe(0);
    expect(simulation.running).toBe(false);
    expect(simulation.lastAction).toContain('Round complete');
  });

  test('assigns and releases remote controllers on non-host slots', () => {
    const simulation = new CapybaraSimulation({ seed: 2024, fixture: 'classic' });

    const slot = simulation.assignController('controller-1', 'Ace');
    expect(slot).toBe(1);
    expect(simulation.players[slot].controllerId).toBe('controller-1');
    expect(simulation.players[slot].name).toBe('Ace');
    expect(simulation.players[slot].isBot).toBe(false);

    simulation.releaseController('controller-1');

    expect(simulation.players[slot].controllerId).toBeNull();
    expect(simulation.players[slot].isBot).toBe(true);
    expect(simulation.players[slot].name).toBe('P2');
  });

  test('applies projectile damage and score updates on hit', () => {
    const simulation = new CapybaraSimulation({ seed: 99, fixture: 'training' });
    const target = simulation.players[1];
    const spawn = simulation.safeSpawn(WORLD_WIDTH * 0.3);

    target.hp = 100;
    target.x = spawn.x;
    target.y = spawn.y;

    simulation.bullets.push({
      x: target.x + target.w / 2,
      y: target.y + target.h / 2,
      vx: 0,
      vy: 0,
      r: 2.3,
      life: 20,
      ownerSlot: 0,
    });

    simulation.updateBullets();

    expect(target.hp).toBe(82);
    expect(simulation.score).toBe(1);
    expect(simulation.lastAction).toContain('tagged');
  });

  test('creates a grapple rope when the hook hits terrain', () => {
    const simulation = new CapybaraSimulation({ seed: 4242, fixture: 'classic' });
    const host = simulation.players[0];

    host.x = WORLD_WIDTH * 0.35;
    host.y = WORLD_HEIGHT - 300;
    host.aim = Math.PI / 2;
    host.face = 1;

    simulation.shootGrapple(host);

    expect(host.rope).not.toBeNull();
    expect(simulation.ropes.length).toBeGreaterThan(0);
    expect(simulation.lastAction).toContain('anchored a grapple');
  });
});
