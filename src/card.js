// The score card: a picture to post, drawn on canvas in the game's look. The same drawing makes
// the page's preview image (`assets/og.png`) when there is no score.

import { shade } from './icons.js';
import { BLOCK, C } from './palette.js';
import { BOT, BOT_BOX, MARK, MARK_BOX } from './shapes.js';

export const CARD = { w: 1200, h: 630 };
const FONTS = ['700 48px "Bricolage Grotesque"', '400 24px "IBM Plex Mono"', '600 20px "Instrument Sans"'];
const ON_BLOCK = '#17130f';
const LIP = '#8f3a1c';

/** Waits for the card's fonts, so the first card is not drawn in a fallback. */
export function cardFonts() {
  return Promise.all(FONTS.map((f) => document.fonts?.load(f).catch(() => {}))).catch(() => {});
}

/**
 * Draws the card. With `score`: what you scored, the level, bricks and agents, the best.
 * Without: the wall's preview. `host` is where the wall can be played.
 */
export function drawCard(ctx, { score, level, bricks, caught, best = false, host }) {
  const { w, h } = CARD;
  ctx.save();
  ctx.fillStyle = C.kiln;
  ctx.fillRect(0, 0, w, h);
  field(ctx, 660, 44, 492, 542);

  const x = 64;
  brand(ctx, x, 104);

  if (score === undefined) {
    ctx.fillStyle = C.inkMuted;
    ctx.font = '400 26px "IBM Plex Mono"';
    ctx.fillText('a brick breaker my AI agent deployed', x, 196);
    ctx.fillStyle = C.ink;
    ctx.font = '700 128px "Bricolage Grotesque"';
    ctx.fillText('Break', x - 4, 330);
    ctx.fillText('the wall', x - 4, 450);
  } else {
    ctx.fillStyle = C.inkMuted;
    ctx.font = '400 30px "IBM Plex Mono"';
    ctx.fillText('I scored', x, 204);
    if (best) {
      const lw = ctx.measureText('I scored').width;
      block(ctx, x + lw + 20, 174, 150, 40, C.brick, LIP, 6);
      ctx.fillStyle = C.onBrick;
      ctx.font = '700 24px "Bricolage Grotesque"';
      ctx.textAlign = 'center';
      ctx.fillText('new best', x + lw + 95, 202);
      ctx.textAlign = 'left';
    }
    const text = score.toLocaleString('en');
    let size = 176;
    ctx.font = `700 ${size}px "Bricolage Grotesque"`;
    while (ctx.measureText(text).width > 540 && size > 80) {
      size -= 8;
      ctx.font = `700 ${size}px "Bricolage Grotesque"`;
    }
    ctx.fillStyle = C.ink;
    ctx.fillText(text, x - 6, 362);
    const stats = [
      [level, 'level', BLOCK.cobalt],
      [bricks, bricks === 1 ? 'brick' : 'bricks', BLOCK.amber],
      [caught, caught === 1 ? 'agent caught' : 'agents caught', BLOCK.plum],
    ];
    let sx = x;
    for (const [n, label, color] of stats) {
      ctx.font = '600 19px "Instrument Sans"';
      const bw = Math.max(126, ctx.measureText(label).width + 36);
      block(ctx, sx, 398, bw, 82, color, shade(color, 0.45), 7);
      ctx.fillStyle = ON_BLOCK;
      ctx.font = '700 38px "Bricolage Grotesque"';
      ctx.fillText(Number(n).toLocaleString('en'), sx + 18, 440);
      ctx.font = '600 19px "Instrument Sans"';
      ctx.fillText(label, sx + 18, 466);
      sx += bw + 14;
    }
  }

  ctx.fillStyle = C.inkMuted;
  ctx.font = '400 22px "IBM Plex Mono"';
  ctx.fillText(host, x, 532);
  block(ctx, x, 552, 470, 50, C.brick, LIP, 8);
  ctx.fillStyle = C.onBrick;
  ctx.font = '700 25px "Bricolage Grotesque"';
  ctx.fillText('Deploy your own on briq.cloud', x + 22, 585);
  arrow(ctx, x + 440, 577);
  ctx.restore();
}

/** A block with its lip underneath, like the game's bricks and the page's buttons. */
function block(ctx, x, y, w, h, color, lip, r) {
  ctx.fillStyle = lip;
  round(ctx, x, y + 5, w, h, r);
  ctx.fill();
  ctx.fillStyle = color;
  round(ctx, x, y, w, h, r);
  ctx.fill();
}

function round(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function arrow(ctx, x, y) {
  ctx.strokeStyle = C.onBrick;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 9, y);
  ctx.lineTo(x + 9, y);
  ctx.moveTo(x + 2, y - 7);
  ctx.lineTo(x + 9, y);
  ctx.lineTo(x + 2, y + 7);
  ctx.stroke();
}

/** The briq mark and the words "briq wall". */
function brand(ctx, x, base) {
  const s = 3.1;
  ctx.fillStyle = C.brick;
  for (const r of MARK) {
    round(ctx, x + (r.x - MARK_BOX.x) * s, base - (MARK_BOX.y + MARK_BOX.height - r.y) * s, r.width * s, r.height * s, 1.2);
    ctx.fill();
  }
  ctx.font = '700 46px "Bricolage Grotesque"';
  const wx = x + MARK_BOX.width * s + 10;
  ctx.fillStyle = C.ink;
  ctx.fillText('briq', wx, base);
  ctx.fillStyle = C.inkFaint;
  ctx.fillText('wall', wx + ctx.measureText('briq ').width, base);
}

/** The bot: an antenna, a head, two eyes cut out. */
function bot(ctx, cx, cy, s, antenna) {
  const ox = cx - (BOT_BOX.x + BOT_BOX.width / 2) * s;
  const oy = cy - (BOT_BOX.y + BOT_BOX.height / 2) * s;
  const r = (q) => [ox + q.x * s, oy + q.y * s, q.width * s, q.height * s];
  ctx.fillStyle = antenna;
  round(ctx, ...r(BOT.antenna), s * 0.4);
  ctx.fill();
  ctx.fillStyle = '#8f857b';
  round(ctx, ...r({ ...BOT.head, y: BOT.head.y + 0.5 }), s * 0.4);
  ctx.fill();
  ctx.fillStyle = C.ink;
  round(ctx, ...r(BOT.head), s * 0.4);
  ctx.fill();
  ctx.fillStyle = C.surface;
  for (const e of BOT.eyes) ctx.fillRect(...r(e));
}

/** A corner of the game: the wall with bricks knocked out, an agent falling, the ball, the paddle. */
function field(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = C.surface;
  round(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.fillStyle = C.lineStrong;
  round(ctx, x, y, w, 12, 6);
  ctx.fill();
  round(ctx, x, y, 12, h, 6);
  ctx.fill();
  round(ctx, x + w - 12, y, 12, h, 6);
  ctx.fill();

  ctx.beginPath();
  ctx.rect(x + 12, y + 12, w - 24, h - 12);
  ctx.clip();
  const colors = ['plum', 'cobalt', 'amber', 'moss', 'plum', 'cobalt'];
  // Knocked out: row → bricks gone.
  const gone = { 2: [3], 3: [1, 2], 4: [0, 1, 2, 4], 5: [1, 2, 3, 4, 5] };
  const bw = 88;
  const bh = 32;
  const gap = 8;
  for (let row = 0; row < colors.length; row++) {
    const shift = row % 2 ? -bw / 2 : 0;
    for (let i = 0; i < 6; i++) {
      if (gone[row]?.includes(i)) continue;
      const color = row === 1 && i === 2 ? BLOCK.bomb : BLOCK[colors[row]];
      const bx = x + 16 + shift + i * (bw + gap);
      const by = y + 26 + row * (bh + gap);
      block(ctx, bx, by, bw, bh - 5, color, shade(color, 0.4), 4);
      if (color === BLOCK.bomb) {
        ctx.fillStyle = C.brick;
        ctx.shadowColor = C.brick;
        ctx.shadowBlur = 14;
        round(ctx, bx + bw / 2 - 16, by + 8, 32, 10, 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
  bot(ctx, x + 196, y + 330, 5.2, C.brick);
  // The ball's dotted path, then the ball.
  ctx.fillStyle = C.lineStrong;
  for (let i = 1; i <= 7; i++) {
    ctx.beginPath();
    ctx.arc(x + 331 - i * 11, y + 371 + i * 15, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowColor = C.ink;
  ctx.shadowBlur = 18;
  ctx.fillStyle = C.ink;
  round(ctx, x + 320, y + 360, 22, 22, 4);
  ctx.fill();
  ctx.shadowBlur = 0;
  block(ctx, x + 170, y + h - 62, 170, 30, C.brick, LIP, 6);
  ctx.restore();
}
