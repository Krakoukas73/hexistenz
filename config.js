export const HEX_SIZE = 1;
export const GRID_RADIUS = 10;
export const DECK_SIZE = 5;

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
  field: 0xF2D16B,
  forest: 0x2F7D32,
  water: 0x3A7DFF,
  rail: 0xDDDDDD,
  house: 0xD14B4B,
  grass: 0x2ECC71
};

export const TILE_VISUAL = {
  radiusScale: 1,
  centerRadiusScale: 0.33,
  sectorY: 0.012,
  centerY: 0.018,
  outlineY: 0.024,
  labelY: 0.07,
  railY: 0.052,
  outlineColor: 0x151A21,
  outlineOpacity: 0.75
};
