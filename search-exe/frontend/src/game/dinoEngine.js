/* ===========================================================================
   T-Rex Runner - the game itself.

   Plain JavaScript, no React anywhere in this file. It exposes three things:

     createGame(highScore)  -> a fresh world, as one plain object
     updateGame(state, dt)  -> move the world on by dt seconds
     drawGame(ctx, state)   -> paint the world onto a canvas context

   Keeping the rules separate from the component means the physics can be run
   and checked without a browser, and the React side shrinks to "own a canvas,
   run a loop, forward key presses".

   The one idea worth understanding here is DELTA TIME. Every movement is
   multiplied by how many seconds passed since the previous frame, so the game
   runs at the same speed on a 60hz laptop and a 144hz monitor. Moving by a
   fixed number of pixels per frame would make it twice as fast on the latter.
   ========================================================================= */

// --- World constants -------------------------------------------------------
export const W = 640;        // logical canvas width (CSS stretches it to fit)
export const H = 200;
const GROUND_Y = 165;        // the line everything stands on

const GRAVITY = 1350;        // pixels per second, per second
const JUMP_VELOCITY = -430;  // negative is upwards
const FAST_FALL = 2.4;       // holding "down" mid-air drops you quicker

const START_SPEED = 330;
const MAX_SPEED = 800;
const ACCELERATION = 9;      // speed gained per second of survival

const DINO_X = 40;
const DINO_W = 44;
const DINO_H = 47;
const DUCK_W = 59;
const DUCK_H = 30;

const NIGHT_EVERY = 900;     // score points between day/night flips
const BIRDS_AFTER = 250;     // score at which pterodactyls start appearing
const BIRD_DUCK_LANE = GROUND_Y - 52; // the one height a ducking dino fits under

// Day and night palettes. Everything is drawn by mixing between the two, so
// the whole scene fades from one into the other instead of snapping.
const DAY = { sky: [247, 247, 247], ink: [83, 83, 83], far: [200, 200, 200] };
const NIGHT = { sky: [26, 26, 38], ink: [235, 235, 245], far: [58, 58, 78] };

// Cacti come in three shapes.
const CACTUS_TYPES = [
  { w: 17, h: 35, kind: 'cactus' },
  { w: 25, h: 48, kind: 'cactus' },
  { w: 46, h: 35, kind: 'cactus', double: true },
];

// --- Small helpers ---------------------------------------------------------
const randomBetween = (min, max) => min + Math.random() * (max - min);

/** Mix two [r,g,b] colours. t=0 gives a, t=1 gives b. */
function mixColor(a, b, t) {
  const channel = (i) => Math.round(a[i] + (b[i] - a[i]) * t);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/** Do two boxes overlap? The classic axis-aligned bounding box test. */
function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* =========================================================================
   State
   ========================================================================= */

export function createGame(highScore = 0) {
  return {
    status: 'ready', // 'ready' | 'running' | 'over'
    time: 0,
    speed: START_SPEED,
    distance: 0,
    score: 0,
    highScore,
    flashTimer: 0, // counts down while the score is blinking

    dino: { y: 0, vy: 0, onGround: true, ducking: false, frame: 0, frameTimer: 0 },

    obstacles: [],
    nextObstacleIn: 400, // pixels of travel until the next spawn
    clouds: [{ x: 420, y: 40 }, { x: 620, y: 70 }],
    nextCloudIn: 300,
    particles: [],

    // Background layers, generated once here and then scrolled forever.
    pebbles: Array.from({ length: 90 }, () => ({
      x: Math.random() * W * 2,
      y: Math.random() * 8,
      w: randomBetween(2, 11),
    })),
    mountains: Array.from({ length: 8 }, (_, i) => ({
      x: i * 170 + Math.random() * 60,
      w: randomBetween(60, 110),
      h: randomBetween(28, 58),
    })),
    stars: Array.from({ length: 42 }, () => ({
      x: Math.random() * W,
      y: Math.random() * 110,
      size: Math.random() < 0.25 ? 2 : 1,
      phase: Math.random() * Math.PI * 2,
    })),

    groundOffset: 0,
    night: 0,      // 0 = full day, 1 = full night
    nightTarget: 0,
    skyColor: 'rgb(247,247,247)',
    inkColor: 'rgb(83,83,83)',
    farColor: 'rgb(200,200,200)',
  };
}

/* =========================================================================
   Input - the only three things the outside world can do
   ========================================================================= */

/** Space / Up / tap: start, jump, or restart depending on the current status. */
export function jump(state) {
  if (state.status === 'ready') {
    state.status = 'running';
    return state;
  }

  if (state.status === 'over') {
    // Keep the best score, throw the rest of the world away.
    const restarted = createGame(state.highScore);
    restarted.status = 'running';
    return restarted;
  }

  if (state.dino.onGround) {
    state.dino.vy = JUMP_VELOCITY;
    state.dino.onGround = false;
    state.dino.ducking = false;
    addDust(state, 4, DINO_X + 8, GROUND_Y - 4);
  }

  return state;
}

export function setDucking(state, ducking) {
  state.dino.ducking = ducking;
}

function addDust(state, count, x, y) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x,
      y,
      vx: randomBetween(-70, -170),
      vy: randomBetween(-40, 10),
      size: Math.random() < 0.4 ? 3 : 2,
      life: 1, // counts down to 0, and doubles as the fade-out alpha
    });
  }
}

function spawnObstacle(state) {
  // Pterodactyls only show up once the player has proven they can run.
  const flying = state.score > BIRDS_AFTER && Math.random() < 0.25;

  if (flying) {
    // Three flight lanes, all of them reachable. The highest one passes over a
    // ducking dino but hits a standing one, so ducking is the answer; the lower
    // two clip a ducking dino too, so those have to be jumped. A lane any
    // higher than this would sail over the dino entirely and be free.
    const heights = [BIRD_DUCK_LANE, GROUND_Y - 41, GROUND_Y - 30];
    state.obstacles.push({
      kind: 'bird',
      x: W + 20,
      y: heights[Math.floor(Math.random() * heights.length)],
      w: 46,
      h: 26,
      frame: 0,
      frameTimer: 0,
    });
  } else {
    const type = CACTUS_TYPES[Math.floor(Math.random() * CACTUS_TYPES.length)];
    state.obstacles.push({ ...type, x: W + 20, y: GROUND_Y - type.h });
  }

  // The gap has to stay wider than the distance a single jump covers, or the
  // player lands straight on the next cactus with no way to avoid it. A jump
  // lasts about 0.64s, so it travels speed * 0.64 pixels.
  const minGap = 190 + state.speed * 0.55;
  state.nextObstacleIn = randomBetween(minGap, minGap + 260);
}

/** The hitbox, shrunk a few pixels. The drawn dino is not a solid rectangle,
 *  so a slightly forgiving box feels fair rather than buggy. */
function dinoHitbox(state) {
  const ducking = state.dino.ducking && state.dino.onGround;
  const h = ducking ? DUCK_H : DINO_H;

  return {
    x: DINO_X + 6,
    y: GROUND_Y - h - state.dino.y + 4,
    w: (ducking ? DUCK_W : DINO_W) - 12,
    h: h - 6,
  };
}

function obstacleHitbox(obstacle) {
  return {
    x: obstacle.x + 4,
    y: (obstacle.kind === 'bird' ? obstacle.y : GROUND_Y - obstacle.h) + 3,
    w: obstacle.w - 8,
    h: obstacle.h - 6,
  };
}

/* =========================================================================
   Update
   ========================================================================= */

export function updateGame(state, dt) {
  state.time += dt;

  // Ease the palette towards whichever one we are heading for. Framing it as
  // "close a fraction of the remaining gap each frame" gives a smooth,
  // decelerating fade in a single line.
  state.night += (state.nightTarget - state.night) * Math.min(1, dt * 1.6);
  state.skyColor = mixColor(DAY.sky, NIGHT.sky, state.night);
  state.inkColor = mixColor(DAY.ink, NIGHT.ink, state.night);
  state.farColor = mixColor(DAY.far, NIGHT.far, state.night);

  // Particles keep drifting even on the game over screen; it looks alive.
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 220 * dt; // dust falls back down
    p.life -= dt * 1.8;
  }
  state.particles = state.particles.filter((p) => p.life > 0);

  if (state.status !== 'running') return;

  // --- Speed and score ---
  state.speed = Math.min(MAX_SPEED, state.speed + ACCELERATION * dt);
  const moved = state.speed * dt;
  state.distance += moved;
  state.groundOffset += moved;

  const previousScore = state.score;
  state.score = Math.floor(state.distance / 20);

  // Blink on every hundred points, and flip day/night every so often.
  if (Math.floor(state.score / 100) > Math.floor(previousScore / 100)) {
    state.flashTimer = 0.9;
  }
  if (Math.floor(state.score / NIGHT_EVERY) > Math.floor(previousScore / NIGHT_EVERY)) {
    state.nightTarget = state.nightTarget === 0 ? 1 : 0;
  }
  if (state.flashTimer > 0) state.flashTimer -= dt;

  // --- Dino physics ---
  const dino = state.dino;
  dino.vy += GRAVITY * dt * (!dino.onGround && dino.ducking ? FAST_FALL : 1);
  dino.y -= dino.vy * dt; // y is height above the ground, so subtract

  if (dino.y <= 0) {
    // The landing frame: settle onto the ground and kick up some dust.
    if (!dino.onGround) addDust(state, 6, DINO_X + 10, GROUND_Y - 4);
    dino.y = 0;
    dino.vy = 0;
    dino.onGround = true;
  }

  // Two-frame run cycle, stepped faster the quicker we are going.
  if (dino.onGround) {
    dino.frameTimer += dt * (state.speed / 200);
    if (dino.frameTimer > 0.09) {
      dino.frameTimer = 0;
      dino.frame = dino.frame === 0 ? 1 : 0;
      if (dino.frame === 0) addDust(state, 1, DINO_X + 6, GROUND_Y - 3);
    }
  }

  // --- Obstacles ---
  state.nextObstacleIn -= moved;
  if (state.nextObstacleIn <= 0) spawnObstacle(state);

  for (const obstacle of state.obstacles) {
    // Birds fly a little faster than the ground scrolls past.
    obstacle.x -= moved * (obstacle.kind === 'bird' ? 1.25 : 1);

    if (obstacle.kind === 'bird') {
      obstacle.frameTimer += dt;
      if (obstacle.frameTimer > 0.18) {
        obstacle.frameTimer = 0;
        obstacle.frame = obstacle.frame === 0 ? 1 : 0;
      }
    }
  }
  state.obstacles = state.obstacles.filter((o) => o.x + o.w > -20);

  // --- Clouds ---
  state.nextCloudIn -= moved;
  if (state.nextCloudIn <= 0) {
    state.clouds.push({ x: W + 20, y: randomBetween(20, 85) });
    state.nextCloudIn = randomBetween(300, 700);
  }
  for (const cloud of state.clouds) cloud.x -= moved * 0.32; // parallax
  state.clouds = state.clouds.filter((c) => c.x > -60);

  // --- Collision ---
  const box = dinoHitbox(state);
  for (const obstacle of state.obstacles) {
    if (overlaps(box, obstacleHitbox(obstacle))) {
      state.status = 'over';
      addDust(state, 14, DINO_X + 20, GROUND_Y - 20);
      if (state.score > state.highScore) state.highScore = state.score;
      break;
    }
  }
}

/* =========================================================================
   Drawing. Every shape is a plain rectangle in the current ink colour, which
   is what gives the whole thing its pixel-art look.
   ========================================================================= */

function drawDino(ctx, state) {
  const { dino } = state;
  const ducking = dino.ducking && dino.onGround;
  const h = ducking ? DUCK_H : DINO_H;
  const x = DINO_X;
  const y = GROUND_Y - h - dino.y; // dino.y is height above ground
  const box = (bx, by, bw, bh) => ctx.fillRect(x + bx, y + by, bw, bh);

  if (ducking) {
    box(0, 6, 8, 8);    // tail
    box(6, 8, 40, 16);  // body, stretched flat
    box(38, 2, 18, 12); // head
    box(52, 8, 6, 4);   // snout
    box(14, 24, 6, 6);  // legs, tucked under
    box(30, 24, 6, 6);

    ctx.fillStyle = state.skyColor;
    ctx.fillRect(x + 46, y + 5, 3, 3); // eye, punched out in sky colour
    ctx.fillStyle = state.inkColor;
    return;
  }

  box(0, 22, 6, 8);   // tail
  box(20, 0, 24, 16); // head
  box(38, 12, 6, 6);  // snout
  box(18, 12, 8, 14); // neck
  box(4, 24, 26, 15); // body
  box(26, 26, 7, 4);  // little arm

  // Legs: in the air both stay extended; on the ground they alternate between
  // a planted and a lifted pose, which reads as running.
  if (!dino.onGround) {
    box(6, 38, 7, 7);
    box(18, 38, 7, 9);
  } else if (dino.frame === 0) {
    box(6, 38, 7, 9);
    box(18, 38, 7, 5);
  } else {
    box(6, 38, 7, 5);
    box(18, 38, 7, 9);
  }

  ctx.fillStyle = state.skyColor;
  ctx.fillRect(x + 33, y + 4, 3, 3); // eye
  ctx.fillStyle = state.inkColor;
}

function drawCactus(ctx, obstacle) {
  const { x, w, h } = obstacle;
  const stem = Math.max(5, Math.round(w * 0.32));

  const drawOne = (ox, oh) => {
    const oy = GROUND_Y - oh;
    ctx.fillRect(ox, oy, stem, oh);                                // trunk
    ctx.fillRect(ox - stem, oy + oh * 0.3, stem, stem);            // left arm, out
    ctx.fillRect(ox - stem, oy + oh * 0.3, stem * 0.7, oh * 0.4);  // left arm, up
    ctx.fillRect(ox + stem, oy + oh * 0.45, stem, stem);           // right arm, out
    ctx.fillRect(ox + stem * 1.3, oy + oh * 0.2, stem * 0.7, oh * 0.45);
  };

  drawOne(x + stem, h);
  if (obstacle.double) drawOne(x + w - stem * 1.5, h * 0.75);
}

function drawPterodactyl(ctx, obstacle) {
  const { x, y, w } = obstacle;

  ctx.fillRect(x + 10, y + 10, 26, 7); // body
  ctx.fillRect(x + 32, y + 7, 14, 4);  // head
  ctx.fillRect(x + w - 6, y + 9, 6, 2); // beak

  // Two-frame flap: wings up on one frame, down on the next.
  if (obstacle.frame === 0) {
    ctx.fillRect(x + 12, y, 18, 10);
    ctx.fillRect(x + 4, y + 2, 10, 6);
  } else {
    ctx.fillRect(x + 12, y + 16, 18, 9);
    ctx.fillRect(x + 4, y + 20, 10, 5);
  }
}

function drawCloud(ctx, cloud) {
  ctx.fillRect(cloud.x + 8, cloud.y, 26, 6);
  ctx.fillRect(cloud.x, cloud.y + 5, 42, 6);
  ctx.fillRect(cloud.x + 6, cloud.y + 10, 30, 4);
}

function drawSky(ctx, state) {
  ctx.fillStyle = state.skyColor;
  ctx.fillRect(0, 0, W, H);

  // Stars exist only at night, so their opacity rides the night mix directly.
  if (state.night > 0.05) {
    ctx.fillStyle = '#ffffff';
    for (const star of state.stars) {
      // A sine wave per star, each with its own phase, so they twinkle
      // independently rather than pulsing in unison.
      const twinkle = 0.5 + 0.5 * Math.sin(state.time * 2 + star.phase);
      ctx.globalAlpha = state.night * twinkle;
      ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
  }

  // The sun and the moon share one slot in the sky and cross-fade.
  const cx = W - 90;
  const cy = 42;

  ctx.globalAlpha = 1 - state.night;
  ctx.fillStyle = '#fbbc05';
  ctx.beginPath();
  ctx.arc(cx, cy, 14, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = state.night;
  ctx.fillStyle = '#f5f5f5';
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fill();
  // Punch a sky-coloured circle out of the moon to carve a crescent.
  ctx.fillStyle = state.skyColor;
  ctx.beginPath();
  ctx.arc(cx + 7, cy - 4, 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
}

function drawMountains(ctx, state) {
  ctx.fillStyle = state.farColor;

  for (const mountain of state.mountains) {
    // Parallax: the far layer scrolls at a fraction of the world speed, which
    // is what makes it read as distant.
    const x = (mountain.x - state.groundOffset * 0.12) % (W * 2);
    const wrapped = x < 0 ? x + W * 2 : x;

    ctx.beginPath();
    ctx.moveTo(wrapped - mountain.w, GROUND_Y);
    ctx.lineTo(wrapped, GROUND_Y - mountain.h);
    ctx.lineTo(wrapped + mountain.w, GROUND_Y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawGround(ctx, state) {
  ctx.fillStyle = state.inkColor;
  ctx.fillRect(0, GROUND_Y, W, 2);

  // The pebble positions were generated once over twice the canvas width, then
  // wrapped with a modulo, so the texture repeats seamlessly and no memory is
  // allocated per frame.
  for (const pebble of state.pebbles) {
    const x = (pebble.x - state.groundOffset) % (W * 2);
    const wrapped = x < 0 ? x + W * 2 : x;
    if (wrapped < W) ctx.fillRect(wrapped, GROUND_Y + 4 + pebble.y, pebble.w, 2);
  }
}

function drawParticles(ctx, state) {
  ctx.fillStyle = state.inkColor;
  for (const p of state.particles) {
    ctx.globalAlpha = Math.max(0, p.life) * 0.6; // life doubles as the fade
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawHud(ctx, state) {
  ctx.fillStyle = state.inkColor;
  ctx.font = 'bold 14px "Courier New", monospace';
  ctx.textAlign = 'right';

  const pad = (n) => String(Math.floor(n)).padStart(5, '0');

  if (state.highScore > 0) {
    ctx.globalAlpha = 0.5;
    ctx.fillText(`HI ${pad(state.highScore)}`, W - 100, 26);
    ctx.globalAlpha = 1;
  }

  // On reaching a new hundred the score blinks, as in the original game.
  const blinking = state.flashTimer > 0 && Math.floor(state.flashTimer * 8) % 2 === 0;
  if (!blinking) ctx.fillText(pad(state.score), W - 20, 26);

  ctx.textAlign = 'left';
}

function drawOverlay(ctx, state) {
  if (state.status === 'running') return;

  ctx.fillStyle = state.inkColor;
  ctx.textAlign = 'center';

  if (state.status === 'ready') {
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillText('PRESS SPACE TO RUN', W / 2, 70);
    ctx.font = '12px "Courier New", monospace';
    ctx.globalAlpha = 0.7;
    ctx.fillText('SPACE / UP to jump   -   DOWN to duck', W / 2, 92);
  } else {
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText('G A M E   O V E R', W / 2, 62);
    ctx.font = '12px "Courier New", monospace';
    ctx.globalAlpha = 0.7;
    ctx.fillText('press SPACE to try again', W / 2, 86);
  }

  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

/** Paint one frame, back to front. */
export function drawGame(ctx, state) {
  drawSky(ctx, state);
  drawMountains(ctx, state);

  ctx.fillStyle = state.farColor;
  for (const cloud of state.clouds) drawCloud(ctx, cloud);

  drawGround(ctx, state);
  drawParticles(ctx, state);

  ctx.fillStyle = state.inkColor;
  for (const obstacle of state.obstacles) {
    if (obstacle.kind === 'bird') drawPterodactyl(ctx, obstacle);
    else drawCactus(ctx, obstacle);
  }

  drawDino(ctx, state);
  drawHud(ctx, state);
  drawOverlay(ctx, state);
}
