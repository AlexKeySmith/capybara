import { CELL, COLS, ROWS, WORLD_HEIGHT, WORLD_WIDTH } from './constants.js';

export function resizeCanvas(canvas, viewportWidth, viewportHeight) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.floor(viewportWidth * dpr);
  const height = Math.floor(viewportHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.style.width = `${viewportWidth}px`;
  canvas.style.height = `${viewportHeight}px`;
  const context = canvas.getContext('2d');
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  return context;
}

export function drawSimulation(ctx, minimapCtx, simulation, viewportWidth, viewportHeight) {
  const background = ctx.createLinearGradient(0, 0, 0, viewportHeight);
  background.addColorStop(0, '#102449');
  background.addColorStop(1, '#07101d');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);

  drawBackgroundBands(ctx, simulation.cameraX, viewportWidth, viewportHeight);

  ctx.strokeStyle = 'rgba(100, 170, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-simulation.cameraX, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const startColumn = Math.max(0, ((simulation.cameraX / CELL) | 0) - 1);
  const endColumn = Math.min(COLS - 1, (((simulation.cameraX + viewportWidth) / CELL) | 0) + 1);
  for (let x = startColumn; x <= endColumn; x += 1) {
    const px = x * CELL - simulation.cameraX;
    for (let y = 0; y < ROWS; y += 1) {
      if (!simulation.terrain[y][x]) continue;
      const stain = simulation.stains[y][x];
      const shade = 70 + y * 0.7;
      ctx.fillStyle = `rgb(${Math.min(130, shade)}, ${Math.min(120, 50 + y * 0.55)}, ${Math.min(140, 86 + y * 0.32)})`;
      ctx.fillRect(px, y * CELL, CELL, CELL);
      if (stain > 0) {
        ctx.fillStyle = `rgba(255, 88, 108, ${Math.min(0.85, stain / 280)})`;
        ctx.fillRect(px, y * CELL, CELL, CELL);
      }
    }
  }

  for (const rope of simulation.ropes) drawRope(ctx, rope, simulation.cameraX);
  for (const bullet of simulation.bullets) drawBullet(ctx, bullet, simulation.cameraX);
  for (const player of simulation.players) drawPlayer(ctx, player, simulation.cameraX);
  for (const effect of simulation.fx) drawFx(ctx, effect, simulation.cameraX);

  if (simulation.spawnBeaconTicks > 0) drawBeacon(ctx, simulation.players[0], simulation.cameraX);
  if (!simulation.running) drawRoundEnd(ctx, viewportWidth, viewportHeight);

  if (minimapCtx) drawMinimap(minimapCtx, simulation, viewportWidth);
}

function drawBackgroundBands(ctx, cameraX, viewportWidth, viewportHeight) {
  const parallax = [-0.08, -0.16, -0.24];
  const colors = ['rgba(82, 131, 255, 0.15)', 'rgba(38, 80, 165, 0.2)', 'rgba(13, 33, 74, 0.32)'];
  parallax.forEach((factor, index) => {
    ctx.fillStyle = colors[index];
    ctx.beginPath();
    const offset = cameraX * factor;
    ctx.moveTo(0, viewportHeight);
    for (let x = 0; x <= viewportWidth; x += 60) {
      const y = viewportHeight * (0.42 + index * 0.1) + Math.sin((x + offset) / 120) * 24;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(viewportWidth, viewportHeight);
    ctx.closePath();
    ctx.fill();
  });
}

function drawPlayer(ctx, player, cameraX) {
  if (player.hp <= 0) return;
  const x = player.x - cameraX;
  const y = player.y;
  const bob = player.onGround ? Math.sin(player.step * 2) * 1.2 : 0;

  ctx.lineWidth = 2;
  ctx.strokeStyle = player.color;
  if (player.onGround) {
    const phase = player.step;
    const leftOffset = Math.sin(phase) * 3;
    const rightOffset = Math.sin(phase + Math.PI) * 3;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + player.h);
    ctx.lineTo(x + 3 + leftOffset, y + player.h + 6);
    ctx.moveTo(x + player.w - 3, y + player.h);
    ctx.lineTo(x + player.w - 3 + rightOffset, y + player.h + 6);
    ctx.stroke();
  }

  ctx.fillStyle = player.color;
  ctx.fillRect(x, y + 1 + bob, player.w, player.h - 3);
  ctx.fillStyle = '#f8fbff';
  ctx.beginPath();
  ctx.arc(x + player.w / 2, y - 2 + bob, 4, 0, Math.PI * 2);
  ctx.fill();

  const centerX = player.x + player.w / 2;
  const centerY = player.y + player.h / 2 - 2 + bob;
  const dx = Math.cos(player.aim) * player.face;
  const dy = Math.sin(player.aim);
  ctx.strokeStyle = player.color;
  ctx.beginPath();
  ctx.moveTo(centerX - cameraX, centerY);
  ctx.lineTo(centerX - cameraX + dx * 16, centerY + dy * 16);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 0, 50, 0.5)';
  ctx.fillRect(x, y - 7, 24, 4);
  ctx.fillStyle = 'rgba(78, 255, 170, 0.9)';
  ctx.fillRect(x, y - 7, 24 * (Math.max(0, player.hp) / 100), 4);

  ctx.fillStyle = 'rgba(5, 10, 17, 0.8)';
  ctx.fillRect(x - 2, y - 22, 54, 12);
  ctx.fillStyle = '#e8f2ff';
  ctx.font = '10px Inter, sans-serif';
  ctx.fillText(player.name, x + 2, y - 13);
}

function drawBullet(ctx, bullet, cameraX) {
  ctx.fillStyle = '#ffe27a';
  ctx.beginPath();
  ctx.arc(bullet.x - cameraX, bullet.y, bullet.r, 0, Math.PI * 2);
  ctx.fill();
}

function drawRope(ctx, rope, cameraX) {
  const centerX = rope.player.x + rope.player.w / 2;
  const centerY = rope.player.y + rope.player.h / 2;
  ctx.strokeStyle = '#84d9ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX - cameraX, centerY);
  ctx.lineTo(rope.anchor.x - cameraX, rope.anchor.y);
  ctx.stroke();
}

function drawFx(ctx, effect, cameraX) {
  const progress = effect.age / effect.ttl;
  const extend = progress < 0.6 ? progress / 0.6 : Math.max(0, 1 - (progress - 0.6) / 0.4);
  const len = effect.len * extend;
  const x1 = effect.origin.x - cameraX;
  const y1 = effect.origin.y;
  const x2 = x1 + effect.direction.x * len;
  const y2 = y1 + effect.direction.y * len;
  const blink = effect.age % 4 < 2;
  ctx.strokeStyle = blink ? '#ff7b7b' : '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath();
  ctx.arc(x2, y2, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawBeacon(ctx, player, cameraX) {
  const x = player.x + player.w / 2 - cameraX;
  const y = player.y - 32;
  ctx.strokeStyle = 'rgba(248, 217, 92, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.stroke();
}

function drawRoundEnd(ctx, viewportWidth, viewportHeight) {
  ctx.fillStyle = 'rgba(3, 7, 14, 0.68)';
  ctx.fillRect(0, 0, viewportWidth, viewportHeight);
  ctx.fillStyle = '#eef4ff';
  ctx.font = '700 36px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Round Complete', viewportWidth / 2, viewportHeight / 2);
  ctx.font = '16px Inter, sans-serif';
  ctx.fillText('Reset the arena or change the fixture to iterate again.', viewportWidth / 2, viewportHeight / 2 + 32);
  ctx.textAlign = 'start';
}

function drawMinimap(ctx, simulation, viewportWidth) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#071225';
  ctx.fillRect(0, 0, width, height);
  const sx = width / WORLD_WIDTH;
  const sy = height / WORLD_HEIGHT;

  ctx.fillStyle = '#375c9a';
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (simulation.terrain[y][x]) {
        ctx.fillRect(x * CELL * sx, y * CELL * sy, Math.max(1, CELL * sx), Math.max(1, CELL * sy));
      }
    }
  }

  ctx.strokeStyle = '#f8d95c';
  ctx.lineWidth = 2;
  ctx.strokeRect(simulation.cameraX * sx, 0, Math.max(4, viewportWidth * sx), height);

  for (const player of simulation.players) {
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x * sx, player.y * sy, 4, 4);
  }
}
