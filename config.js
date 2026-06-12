export const HEX_SIZE = 1;
export const GRID_RADIUS = 10;
export const DECK_SIZE = 50;

export const EDGE_ORDER = ['n', 'ne', 'se', 's', 'sw', 'nw'];

export const EDGE_TYPES = {
  field: 'field',
  forest: 'forest',
  water: 'water',
  rail: 'rail',
  house: 'house',
  grass: 'grass'
};

export const EDGE_WEIGHTS = {
  field: 30,
  forest: 30,
  grass: 24,
  house: 18,
  water: 7,
  rail: 5
};

export const NETWORK_EDGE_TYPES = [EDGE_TYPES.water, EDGE_TYPES.rail];

export const EDGE_COLOR = {
  field: 0xE5C65A,
  forest: 0x1F5A2B,
  water: 0x5FA8D3,
  rail: 0xDDDDDD,
  house: 0x8E4A34,
  grass: 0x78A84A
};

export const TILE_VISUAL = {
  radiusScale: 1,
  centerRadiusScale: 0.33,
  sectorY: 0,
  centerY: 0,
  waterY: -0.075,
  tileThickness: 0.12,
  waterThickness: 0.06,
  outlineY: 0.036,
  labelY: 0.58,
  valueLabelHoverLift: 0.07,
  railY: 0.052,
  outlineColor: 0x151A21,
  outlineOpacity: 0.75
};
