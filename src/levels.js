// Each level: rows of running bond, a colour per brick, the B and the sleeping agents set into it.
// `col` counts bricks from the left on an even row (fractions allowed), `row` from the top.
// `bombs` are "row:brick" slots holding a bomb brick.

/** What a caught agent does for you; `seconds` or `hits` for the powers that last. */
export const TOOLS = {
  fork: { label: 'Three balls', note: 'the ball splits into three' },
  bomb: { label: 'Bomb ball', note: 'the next 3 bricks explode', hits: 3 },
  rockets: { label: 'Rockets', note: 'your paddle fires for 8 s', seconds: 8 },
  fire: { label: 'Fireball', note: 'burns through for 7 s', seconds: 7 },
  large: { label: 'Wider paddle', note: 'for 15 seconds', seconds: 15 },
  start: { label: 'Extra ball', note: 'a lost ball comes back' },
};

const BLOCKS = ['cobalt', 'amber', 'moss', 'plum'];
const stone = { color: 'stone', hits: 2 };

export const LEVELS = [
  {
    name: 'Running bond',
    rows: 7,
    brick: (r) => ['plum', 'plum', 'cobalt', 'cobalt', 'amber', 'amber', 'moss'][r],
    mark: { col: 5.5, row: 2 },
    agents: [
      { col: 2, row: 5, tool: 'fork' },
      { col: 9, row: 5, tool: 'rockets' },
      { col: 0, row: 2, tool: 'bomb' },
      { col: 11, row: 2, tool: 'fire' },
      { col: 3, row: 0, tool: 'start' },
      { col: 5.5, row: 0, tool: 'large' },
      { col: 8, row: 0, tool: 'bomb' },
    ],
    bombs: ['1:2', '1:10', '3:3', '3:9', '4:1', '4:11'],
  },
  {
    name: 'Stack',
    rows: 8,
    brick: (r, c) => (r === 0 ? stone : BLOCKS[(r + Math.floor(c / 3)) % 4]),
    agents: [
      { col: 1, row: 2, tool: 'fork' },
      { col: 10, row: 2, tool: 'bomb' },
      { col: 3.5, row: 4, tool: 'rockets' },
      { col: 7.5, row: 4, tool: 'fire' },
      { col: 5.5, row: 1, tool: 'start' },
      { col: 5.5, row: 6, tool: 'large' },
      { col: 0, row: 5, tool: 'rockets' },
      { col: 11, row: 5, tool: 'fork' },
    ],
    bombs: ['1:3', '1:8', '3:5', '3:7', '6:2', '6:9', '7:5', '7:7'],
  },
  {
    name: 'Arches',
    rows: 9,
    brick: (r, c, x) => {
      const arch = r >= 6 && Math.abs(((((x + 13) % 6.5) + 6.5) % 6.5) - 3.25) < 1.3;
      if (arch) return null;
      return r === 8 || r === 0 ? stone : BLOCKS[(c + r) % 4];
    },
    mark: { col: 5.5, row: 1 },
    agents: [
      { col: 1, row: 3, tool: 'fork' },
      { col: 10, row: 3, tool: 'bomb' },
      { col: 5.5, row: 5, tool: 'fire' },
      { col: 3, row: 1, tool: 'rockets' },
      { col: 8, row: 1, tool: 'large' },
      { col: 3, row: 6, tool: 'start' },
      { col: 8, row: 6, tool: 'rockets' },
    ],
    bombs: ['5:2', '5:10', '2:1', '2:11', '7:6', '0:6'],
  },
];
