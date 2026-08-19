import { useEffect, useRef } from 'react';
import { W, H, createGame, updateGame, drawGame, jump, setDucking } from '../game/dinoEngine';

const HIGH_SCORE_KEY = 'dino-high-score';

/* ===========================================================================
   The React side of the game. It owns three things and nothing else: the
   canvas, the animation loop, and the keyboard.

   All the rules live in ../game/dinoEngine.js.

   The world lives in a useRef rather than useState. State would re-render the
   component 60 times a second for no reason - nothing in the JSX depends on
   the score, because the canvas draws it. A ref is mutable and does not
   trigger renders, which is exactly what a game loop wants.
   ========================================================================= */

export default function DinoGame({ onClose }) {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);

  // onClose is kept in a ref so the effect below can depend on nothing. If it
  // depended on the prop, any re-render of the parent would tear down the loop
  // and restart the game mid-jump.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // A canvas is a bitmap of a fixed pixel size. On a high-DPI screen we make
    // that bitmap bigger and scale all drawing up to match, otherwise the game
    // renders blurry. The engine still works in plain 640x200 coordinates.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    gameRef.current = createGame(Number(localStorage.getItem(HIGH_SCORE_KEY) || 0));

    // --- The loop ---------------------------------------------------------
    let frameId;
    let lastTime = performance.now();

    function loop(now) {
      // Clamped: switching browser tabs pauses requestAnimationFrame, and
      // without a cap the first frame back would carry a huge delta and
      // teleport the dino straight through an obstacle.
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const wasRunning = gameRef.current.status === 'running';
      updateGame(gameRef.current, dt);
      drawGame(ctx, gameRef.current);

      // Persist on the frame the player dies, so localStorage is written once
      // per game rather than once per frame.
      if (wasRunning && gameRef.current.status === 'over') {
        localStorage.setItem(HIGH_SCORE_KEY, String(gameRef.current.highScore));
      }

      frameId = requestAnimationFrame(loop);
    }
    frameId = requestAnimationFrame(loop);

    // --- Input ------------------------------------------------------------
    // jump() returns the state to keep, because restarting after a game over
    // hands back a brand new world.
    const handleJump = () => {
      gameRef.current = jump(gameRef.current);
    };

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onCloseRef.current();
      } else if (event.code === 'Space' || event.key === 'ArrowUp') {
        event.preventDefault(); // Space would otherwise scroll the page
        handleJump();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setDucking(gameRef.current, true);
      }
    }

    function handleKeyUp(event) {
      if (event.key === 'ArrowDown') setDucking(gameRef.current, false);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('pointerdown', handleJump);

    // Cleanup, and the reason this component does not leak: without it, closing
    // the modal would leave the animation frame and the key listeners running.
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('pointerdown', handleJump);
    };
  }, []); // set up once, on mount

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__panel">
        <div className="modal__header">
          <h2 className="modal__title">T-Rex Runner</h2>
          <button className="modal__close" onClick={onClose} aria-label="Close game">
            &times;
          </button>
        </div>

        <canvas ref={canvasRef} className="game-canvas" />

        <p className="game-hint">
          <kbd>Space</kbd> jump &middot; <kbd>&darr;</kbd> duck &middot; <kbd>Esc</kbd> close
          &mdash; keep running to reach nightfall
        </p>
      </div>
    </div>
  );
}
