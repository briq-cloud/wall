// The briq mark (a fat B in three bricks) and the agent bot, on their 16-unit grid.

/** The mark's drawing spans x 1–15, y 2–14. */
export const MARK = [
  { x: 1, y: 2, width: 4, height: 12 },
  { x: 6, y: 2, width: 7, height: 5 },
  { x: 6, y: 8, width: 9, height: 6 },
];
export const MARK_BOX = { x: 1, y: 2, width: 14, height: 12 };

/** The bot's drawing spans x 1–15, y 1–14: an antenna, a head, two eyes cut out of it. */
export const BOT = {
  antenna: { x: 7, y: 1, width: 2, height: 2 },
  head: { x: 1, y: 4, width: 14, height: 10 },
  eyes: [
    { x: 4, y: 7, width: 2, height: 3 },
    { x: 10, y: 7, width: 2, height: 3 },
  ],
};
export const BOT_BOX = { x: 1, y: 1, width: 14, height: 13 };

/** A rect's centre relative to its drawing's centre, y up, in grid units. */
export function offset(rect, box) {
  return {
    x: rect.x + rect.width / 2 - (box.x + box.width / 2),
    y: box.y + box.height / 2 - (rect.y + rect.height / 2),
  };
}
