// src/game/dinoEngine.test.js
//
// Tests for the game, using Node's built-in test runner: `npm test`.
//
// The game can be tested at all only because the rules live in a plain module
// with no React and no DOM in it. The drawing functions take a canvas context as
// an argument, so a stub object that records the calls stands in for a real one.

import test from 'node:test';
import assert from 'node:assert';
import { W, H, createGame, updateGame, drawGame, jump, setDucking } from './dinoEngine.js';

const DT = 1 / 60;         // one frame at 60fps
const AIRTIME = 0.637;     // how long a jump lasts, from the physics constants

/** A fake 2d context that records what was drawn instead of painting it. */
function stubContext() {
  const rects = [];
  const calls = [];
  return {
    rects,
    calls,
    globalAlpha: 1,
    fillStyle: '',
    font: '',
    textAlign: '',
    fillRect: (x, y, w, h) => { rects.push({ x, y, w, h }); calls.push('fillRect'); },
    fillText: () => calls.push('fillText'),
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    fill: () => calls.push('fill'),
  };
}

/** Run the world forward, ignoring deaths, and report what was observed. */
function simulate(seconds, { onFrame } = {}) {
  let game = createGame(0);
  game.status = 'running';

  const seen = new Set();
  let spawned = 0;
  let birds = 0;
  let peakObstacles = 0;
  let peakParticles = 0;
  let deaths = 0;

  for (let i = 0; i < seconds * 60; i++) {
    updateGame(game, DT);

    if (game.status === 'over') {
      deaths++;
      game.status = 'running'; // keep the simulation going past a crash
    }

    for (const obstacle of game.obstacles) {
      if (!seen.has(obstacle)) {
        seen.add(obstacle);
        spawned++;
        if (obstacle.kind === 'bird') birds++;
      }
    }

    peakObstacles = Math.max(peakObstacles, game.obstacles.length);
    peakParticles = Math.max(peakParticles, game.particles.length);

    if (onFrame) onFrame(game);
  }

  return { game, spawned, birds, peakObstacles, peakParticles, deaths };
}

// --- Status transitions -----------------------------------------------------

test('a new game waits on the ready screen', () => {
  const game = createGame(0);
  assert.strictEqual(game.status, 'ready');
  assert.strictEqual(game.score, 0);
});

test('jumping from the ready screen starts the run', () => {
  const game = jump(createGame(0));
  assert.strictEqual(game.status, 'running');
});

test('nothing moves until the game is started', () => {
  const game = createGame(0);
  for (let i = 0; i < 60; i++) updateGame(game, DT);
  assert.strictEqual(game.distance, 0);
  assert.strictEqual(game.score, 0);
  assert.strictEqual(game.obstacles.length, 0);
});

// --- Jump physics -----------------------------------------------------------

test('a jump rises, then lands back on the ground', () => {
  let game = jump(createGame(0)); // start
  game = jump(game);              // jump

  let peak = 0;
  let frames = 0;
  while (!game.dino.onGround && frames < 600) {
    updateGame(game, DT);
    peak = Math.max(peak, game.dino.y);
    frames++;
  }

  assert.ok(game.dino.onGround, 'dino should have landed');
  // The tallest cactus is 48px, so a jump has to clear that with room to spare.
  assert.ok(peak > 55, `peak was only ${peak.toFixed(1)}px`);
  assert.ok(Math.abs(frames * DT - AIRTIME) < 0.05, `airtime was ${(frames * DT).toFixed(3)}s`);
});

test('you cannot jump again while already in the air', () => {
  let game = jump(createGame(0));
  game = jump(game);
  updateGame(game, DT);

  const heightBefore = game.dino.y;
  const velocityBefore = game.dino.vy;
  jump(game); // should be ignored
  assert.strictEqual(game.dino.vy, velocityBefore);
  assert.ok(game.dino.y >= heightBefore);
});

test('movement is frame-rate independent', () => {
  // This is what multiplying by delta time buys: the same simulated duration
  // has to produce the same result at 60hz and at 144hz. Moving by a fixed
  // amount per frame would put the 144hz run more than twice as far along.
  const heightAfter = (dt) => {
    let game = jump(createGame(0));
    game = jump(game);
    for (let t = 0; t < 0.3; t += dt) updateGame(game, dt);
    return game.dino.y;
  };

  const at60 = heightAfter(1 / 60);
  const at144 = heightAfter(1 / 144);
  assert.ok(Math.abs(at60 - at144) < 6, `60hz=${at60.toFixed(1)} vs 144hz=${at144.toFixed(1)}`);
});

test('ducking is held while the key is down and released on key up', () => {
  const game = createGame(0);
  game.status = 'running';

  setDucking(game, true);
  updateGame(game, DT);
  assert.strictEqual(game.dino.ducking, true);

  setDucking(game, false);
  updateGame(game, DT);
  assert.strictEqual(game.dino.ducking, false);
});

// --- Progression ------------------------------------------------------------

test('the score climbs and the speed is capped', () => {
  const { game } = simulate(180);
  assert.ok(game.score > 2000, `score was ${game.score}`);
  assert.ok(game.speed <= 800.001, `speed reached ${game.speed}`);
});

test('obstacles spawn, and pterodactyls appear once the score is high enough', () => {
  const { spawned, birds } = simulate(180);
  assert.ok(spawned > 50, `only ${spawned} obstacles spawned`);
  assert.ok(birds > 0, 'no pterodactyls ever appeared');
});

test('night falls as the score climbs', () => {
  const { game } = simulate(180);
  assert.ok(game.night > 0.5 || game.nightTarget === 1, `night was ${game.night}`);
});

// --- Fairness: the check that caught a real bug -----------------------------

test('every obstacle gap is wider than the distance one jump covers', () => {
  // If a gap were shorter than a jump, the player would come down on top of the
  // next cactus with no possible way to avoid it. This has to hold at every
  // speed, including the maximum.
  let game = createGame(0);
  game.status = 'running';

  let tightest = Infinity;
  let atSpeed = 0;

  for (let i = 0; i < 60 * 240; i++) {
    const before = game.obstacles.length;
    updateGame(game, DT);
    if (game.status === 'over') game.status = 'running';

    if (game.obstacles.length > before) {
      const margin = game.nextObstacleIn - game.speed * AIRTIME;
      if (margin < tightest) {
        tightest = margin;
        atSpeed = game.speed;
      }
    }
  }

  assert.ok(tightest > 0,
    `gap was ${tightest.toFixed(0)}px too tight at speed ${atSpeed.toFixed(0)}`);
});

// --- Collision and restart --------------------------------------------------

test('hitting a cactus ends the game and records the high score', () => {
  const game = createGame(0);
  game.status = 'running';
  game.distance = 2000; // so there is a score worth saving
  game.score = 100;
  game.obstacles = [{ kind: 'cactus', x: 40, y: 165 - 48, w: 25, h: 48 }];

  updateGame(game, DT);

  assert.strictEqual(game.status, 'over');
  assert.strictEqual(game.highScore, game.score);
});

test('ducking under a high-flying pterodactyl avoids it', () => {
  // 52px up is the one lane a ducking dino fits under. Standing, the same bird
  // is a hit - which is what makes ducking a real decision rather than decoration.
  const overhead = () => ({ kind: 'bird', x: 40, y: 165 - 52, w: 46, h: 26 });

  const standing = createGame(0);
  standing.status = 'running';
  standing.obstacles = [overhead()];
  updateGame(standing, DT);

  const ducking = createGame(0);
  ducking.status = 'running';
  ducking.obstacles = [overhead()];
  setDucking(ducking, true);
  updateGame(ducking, DT);

  assert.strictEqual(standing.status, 'over', 'standing should be hit');
  assert.strictEqual(ducking.status, 'running', 'ducking should slip under');
});

test('restarting clears the world but keeps the best score', () => {
  const game = createGame(0);
  game.status = 'over';
  game.highScore = 500;
  game.score = 120;
  game.obstacles = [{ kind: 'cactus', x: 100, y: 130, w: 25, h: 35 }];

  const fresh = jump(game);

  assert.strictEqual(fresh.status, 'running');
  assert.strictEqual(fresh.highScore, 500);
  assert.strictEqual(fresh.score, 0);
  assert.deepStrictEqual(fresh.obstacles, []);
});

// --- No leaks ---------------------------------------------------------------

test('offscreen obstacles, clouds and dead particles are all discarded', () => {
  // A game loop that appends without removing grows forever and eventually
  // stutters. These arrays have to stay small no matter how long the run is.
  const { game, peakObstacles, peakParticles } = simulate(180);

  assert.ok(peakObstacles < 12, `up to ${peakObstacles} obstacles were alive at once`);
  assert.ok(peakParticles < 300, `up to ${peakParticles} particles were alive at once`);
  assert.ok(game.clouds.length < 20, `${game.clouds.length} clouds accumulated`);
});

// --- Drawing ----------------------------------------------------------------

test('a frame draws the scene and the score', () => {
  const game = createGame(1234);
  game.status = 'running';

  const ctx = stubContext();
  drawGame(ctx, game);

  assert.ok(ctx.rects.length > 50, `only ${ctx.rects.length} rectangles drawn`);
  assert.ok(ctx.calls.includes('fillText'), 'the HUD should draw text');
  assert.strictEqual(ctx.globalAlpha, 1, 'alpha must be reset for the next frame');
});

test('no frame in a long run produces NaN or off-canvas geometry', () => {
  let checked = 0;
  let bad = 0;

  simulate(60, {
    onFrame: (game) => {
      // Sampling every 20th frame keeps the test quick while still covering
      // day, dusk, night, jumps, crashes and every obstacle type.
      if (checked++ % 20 !== 0) return;

      const ctx = stubContext();
      drawGame(ctx, game); // a bad call would throw here

      for (const r of ctx.rects) {
        if (![r.x, r.y, r.w, r.h].every(Number.isFinite)) bad++;
        if (r.y > H + 40) bad++;
        if (r.w < 0 || r.h < 0) bad++;
      }
    },
  });

  assert.strictEqual(bad, 0, `${bad} bad rectangles found`);
});

test('the night scene, and both overlays, draw without throwing', () => {
  const game = createGame(500);
  game.status = 'running';
  game.night = 1;
  game.nightTarget = 1;

  const night = stubContext();
  drawGame(night, game);
  assert.ok(night.rects.length > 50, 'stars and scenery should be drawn at night');

  for (const status of ['ready', 'over']) {
    game.status = status;
    const ctx = stubContext();
    drawGame(ctx, game);
    const textCalls = ctx.calls.filter((c) => c === 'fillText').length;
    assert.ok(textCalls >= 2, `the "${status}" overlay drew only ${textCalls} strings`);
  }
});

test('the canvas size is exported for the component to use', () => {
  assert.strictEqual(W, 640);
  assert.strictEqual(H, 200);
});

test('no pterodactyl lane flies clear over a standing dino', () => {
  // A bird the player can simply ignore is a bug, not an obstacle. Every lane
  // has to be a hit for a dino that does nothing about it.
  for (const height of [165 - 52, 165 - 41, 165 - 30]) {
    const game = createGame(0);
    game.status = 'running';
    game.obstacles = [{ kind: 'bird', x: 40, y: height, w: 46, h: 26 }];
    updateGame(game, DT);
    assert.strictEqual(game.status, 'over', `a bird at ${165 - height}px up missed a standing dino`);
  }
});
