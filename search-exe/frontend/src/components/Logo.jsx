// The wordmark. Each letter is its own <span> so the CSS can stagger a
// drop-in animation across them, and so hovering bounces one letter at a time.

const LETTERS = [
  { char: 's', color: 'var(--blue)' },
  { char: 'e', color: 'var(--red)' },
  { char: 'a', color: 'var(--yellow)' },
  { char: 'r', color: 'var(--blue)' },
  { char: 'c', color: 'var(--green)' },
  { char: 'h', color: 'var(--red)' },
];

export default function Logo() {
  return (
    <div style={{ textAlign: 'center' }}>
      <h1 className="logo">
        {LETTERS.map((letter, i) => (
          <span
            key={i}
            className="logo__letter"
            // 60ms apart, so the letters land one after another rather than together.
            style={{ color: letter.color, animationDelay: `${i * 60}ms` }}
          >
            {letter.char}
          </span>
        ))}
        <span className="logo__suffix">.exe</span>
      </h1>
    </div>
  );
}
