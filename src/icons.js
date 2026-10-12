// One icon per power, on a 24-unit grid: the menu draws them as SVG, the game on canvas
// (badges on the agents), from the same paths.

const ON_BLOCK = '#17130f';

/** Each power's badge: its colour, the colour of the icon on it, the icon's shapes. */
export const ICONS = {
  fork: {
    bg: '#6b86f5',
    ink: ON_BLOCK,
    shapes: [
      { stroke: 'M12 15.5 6 9.5M12 15.5l6-6', width: 2.2 },
      { fill: 'M9.5 14h5v5h-5zM3 5h5v5H3zM16 5h5v5h-5z' },
    ],
  },
  bomb: {
    bg: '#2b2420',
    ink: '#f06a3c',
    shapes: [
      { fill: 'M11 22a7 7 0 1 1 0-14 7 7 0 0 1 0 14z' },
      { stroke: 'M14.5 9.5c.5-3 2.5-4.5 5-4.5', width: 2 },
      { fill: 'M20.5 2.2l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z' },
    ],
  },
  rockets: {
    bg: '#f0b43a',
    ink: ON_BLOCK,
    shapes: [
      { fill: 'M12 1.5c3 2.8 4.2 6.5 4.2 10.5v4.5H7.8V12c0-4 1.2-7.7 4.2-10.5z' },
      { fill: 'M7.8 12.5 4.5 16v3.5l3.3-2zM16.2 12.5l3.3 3.5v3.5l-3.3-2z' },
      { fill: 'M9.8 18h4.4L12 22.5z' },
    ],
  },
  fire: {
    bg: '#f06a3c',
    ink: ON_BLOCK,
    shapes: [
      {
        fill: 'M12.5 1.5c.6 4.2 6 6.2 6 12.5a6.5 6.5 0 0 1-13 0c0-3.2 1.8-5.3 3-7.2.2 2.2 1.1 3.4 2.4 3.6-.4-3.2-.2-6 1.6-8.9z',
      },
    ],
  },
  large: {
    bg: '#4fb47e',
    ink: ON_BLOCK,
    shapes: [{ fill: 'M7.5 10h9v4h-9zM1.5 12 6 7.5v9zM22.5 12 18 7.5v9z' }],
  },
  start: {
    bg: '#b48cf0',
    ink: ON_BLOCK,
    shapes: [{ fill: 'M2.5 10.5h8v8h-8zM16 5h2.4v4.3h4.3v2.4h-4.3V16H16v-4.3h-4.3V9.3H16z' }],
  },
};

/** The icon alone, as SVG markup, in the icon's own colour. */
export function iconSvg(tool) {
  const { ink, shapes } = ICONS[tool];
  const parts = shapes.map((s) =>
    s.fill
      ? `<path d="${s.fill}" fill="${ink}"/>`
      : `<path d="${s.stroke}" fill="none" stroke="${ink}" stroke-width="${s.width}" stroke-linecap="round"/>`,
  );
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${parts.join('')}</svg>`;
}

/** `hex` darkened towards black by `k` (0 … 1): the lip under a block. */
export function shade(hex, k) {
  const n = Number.parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

/** The colour of text on the power's colour. */
export const textOn = (tool) => (tool === 'bomb' ? '#f3eee8' : ON_BLOCK);

/** Draws the icon at (x, y), `size` pixels square. */
export function drawIcon(ctx, tool, x, y, size) {
  const { ink, shapes } = ICONS[tool];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size / 24, size / 24);
  for (const s of shapes) {
    if (s.fill) {
      ctx.fillStyle = ink;
      ctx.fill(new Path2D(s.fill));
    } else {
      ctx.strokeStyle = ink;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.stroke(new Path2D(s.stroke));
    }
  }
  ctx.restore();
}
