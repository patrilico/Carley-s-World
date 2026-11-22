import type { ActivityLocation, Level, Plane } from '../core/types';

/** Fixed single-screen world, all coordinates in world pixels (1280 x 720). */
export const WORLD_W = 1280;
export const WORLD_H = 720;
export const FLOOR_Y = 600;

/** x where the cottage's doorway sits. Indoor = left of the split (~40% of width). */
export const ZONE_SPLIT_X = 512;
export const WALL_LEFT_X = 24;
export const WALL_OUTER_X = 524;
export const DOOR_TOP_Y = 458;
export const WORLD_RIGHT_X = WORLD_W - 24;

// ----------------------------------------------------------------------------------------------------
//  Two storeys: a bedroom loft over the kitchen, with a staircase rising along the back wall of the hall
// ----------------------------------------------------------------------------------------------------

/** Underside of the roof beam: the ceiling of the upstairs room. */
export const CEILING_Y = 216;
/** Surface Carley walks on upstairs. */
export const UPPER_Y = 410;
export const SLAB_H = 22;
/**
 * The staircase descends to the right: its top lands on the bedroom floor at `topX`, its foot meets the ground floor
 * at `footX`. It sits against the back wall, so the ground floor stays walkable in front of it (hall, dog bed...).
 */
export const STAIRS = { topX: 310, footX: 480, steps: 14 };
/** Right end of the upstairs floor slab (the stairwell is open to the right of it). */
export const SLAB_END_X = STAIRS.topX + 4;
/** Farthest right anyone may walk on the upstairs floor (the stairs take over from here). */
export const UPPER_MAX_X = STAIRS.topX + 4;

export const STAIR_RISE = FLOOR_Y - UPPER_Y;
export const STAIR_RUN = STAIRS.footX - STAIRS.topX;

/** y of the walkable stair surface at world x (clamped to the stairs). */
export function stairsYAt(x: number): number {
  const t = (Math.min(STAIRS.footX, Math.max(STAIRS.topX, x)) - STAIRS.topX) / STAIR_RUN;
  return UPPER_Y + t * STAIR_RISE;
}

export interface SolidBox {
  id: string;
  x: number; // left
  y: number; // top
  w: number;
  h: number;
  /** Low solids can be hopped over; high ones are walls. */
  hoppable: boolean;
  /** Standable on top (platform) */
  platform: boolean;
  /** Which floor this box belongs to (walls and the slab count as 'upper': they are what the upper floor stands on). */
  level: Level;
}

export const BED = { x: 30, w: 150, topY: UPPER_Y - 44 };
/** Bedside table upstairs (phone lives here, window above it). */
export const BEDSIDE_TABLE = { x: 200, topY: UPPER_Y - 50 };
/** Slim telephone table in the corner of the bedroom, with the retro phone on it. */
export const PHONE_TABLE = { x: 262, topY: UPPER_Y - 58 };
/** Dog's cushion under the stairs and the toy basket beside it. */
export const DOG_BED = { x: 424, w: 58 };
export const BASKET = { x: 398, w: 26, topY: 574 };
export const GARDEN_POT = { x: 914, w: 34, topY: 566 };
export const PLANT_XS = [628, 678, 728, 778, 828, 878];

/** Kitchen fixtures along the back wall of the ground floor (left to right). */
export const KITCHEN = {
  fridge: { x: 28, w: 50, h: 128 },
  counter: { x: 80, w: 96, h: 80 },
  stove: { x: 178, w: 48, h: 80 }
};
export const EASEL_X = 268;
export const ARMCHAIR_X = 352;

/** The bed is only a platform while Carley is climbing into it to sleep; otherwise she walks in front of it. */
export const BED_STATE = { active: false };

export const SOLIDS: SolidBox[] = [
  { id: 'bed', x: BED.x, y: BED.topY, w: BED.w, h: UPPER_Y - BED.topY, hoppable: true, platform: true, level: 'upper' },
  { id: 'slab', x: 0, y: UPPER_Y, w: SLAB_END_X, h: SLAB_H, hoppable: false, platform: false, level: 'upper' },
  { id: 'lintel', x: ZONE_SPLIT_X - 14, y: 0, w: 28, h: DOOR_TOP_Y, hoppable: false, platform: false, level: 'ground' }
];

export function levelOf(plane: Plane, stairsGoal: Level = 'ground'): Level {
  return plane === 'upper' ? 'upper' : plane === 'stairs' ? stairsGoal : 'ground';
}

/** Walkable x-range on a plane. */
export function planeRange(plane: Plane): [number, number] {
  switch (plane) {
    case 'upper': return [WALL_LEFT_X + 14, UPPER_MAX_X];
    case 'stairs': return [STAIRS.topX, STAIRS.footX];
    default: return [WALL_LEFT_X + 14, WORLD_RIGHT_X];
  }
}

/** Height (y of the walkable surface) at world x on a plane. Used by headless movement and bed hopping. */
export function surfaceYAt(x: number, plane: Plane = 'ground'): number {
  if (plane === 'stairs') return stairsYAt(x);
  const level: Level = plane === 'upper' ? 'upper' : 'ground';
  for (const s of SOLIDS) {
    if (s.id === 'bed' && !BED_STATE.active) continue;
    if (s.platform && s.level === level && x >= s.x && x <= s.x + s.w) return s.y;
  }
  return level === 'upper' ? UPPER_Y : FLOOR_Y;
}

export function clampToPlane(x: number, plane: Plane): number {
  const [lo, hi] = planeRange(plane);
  return Math.min(hi, Math.max(lo, x));
}

export function clampToWorld(x: number): number {
  return clampToPlane(x, 'ground');
}

/** True if x sits on top of a solid (bed/...) on this level - used to restore saved positions safely. */
export function isOnSolid(x: number, level: Level = 'ground'): boolean {
  return surfaceYAt(x, level === 'upper' ? 'upper' : 'ground') !== (level === 'upper' ? UPPER_Y : FLOOR_Y);
}

/** Nearest x on this level that is on bare floor (not on top of the bed). */
export function standableX(x: number, level: Level): number {
  let nx = clampToPlane(x, level === 'upper' ? 'upper' : 'ground');
  for (const s of SOLIDS) {
    if (!s.platform || s.level !== level || s.id === 'bed') continue;
    if (nx >= s.x - 6 && nx <= s.x + s.w + 6) {
      const right = s.x + s.w + 24;
      const left = s.x - 24;
      const [lo, hi] = planeRange(level === 'upper' ? 'upper' : 'ground');
      const fitsRight = right <= hi;
      const fitsLeft = left >= lo;
      nx = fitsRight && (!fitsLeft || right - nx <= nx - left) ? right : fitsLeft ? left : right;
    }
  }
  return clampToPlane(nx, level === 'upper' ? 'upper' : 'ground');
}

export interface NavStep {
  /** x to walk toward on the current plane. */
  toX: number;
  /** Plane to switch to once `toX` is reached (undefined = `toX` is the final destination). */
  then?: Plane;
}

/**
 * One leg of a route to (targetX, targetLevel): walk straight there on the same level, otherwise walk to the stairs,
 * climb/descend them, and carry on. Shared by Carley and the dog so both always use the stairs.
 */
export function navStep(plane: Plane, targetX: number, targetLevel: Level): NavStep {
  if (plane === 'stairs') {
    return targetLevel === 'upper' ? { toX: STAIRS.topX, then: 'upper' } : { toX: STAIRS.footX, then: 'ground' };
  }
  const here: Level = plane === 'upper' ? 'upper' : 'ground';
  if (here === targetLevel) return { toX: clampToPlane(targetX, plane) };
  return here === 'ground' ? { toX: STAIRS.footX, then: 'stairs' } : { toX: STAIRS.topX, then: 'stairs' };
}

export const LOCATIONS: ActivityLocation[] = [
  { id: 'bed', zone: 'indoor', level: 'upper', x: 132, y: BED.topY, interactionRadius: 30, supportedActivities: ['sleeping'] },
  { id: 'bedside', zone: 'indoor', level: 'upper', x: 212, y: UPPER_Y, interactionRadius: 18, supportedActivities: ['sleeping'] },
  { id: 'windowTable', zone: 'indoor', level: 'upper', x: 262, y: UPPER_Y, interactionRadius: 24, supportedActivities: ['phone'] },
  { id: 'windowUp', zone: 'indoor', level: 'upper', x: 214, y: UPPER_Y, interactionRadius: 24, supportedActivities: ['windowWatching'] },
  { id: 'windowDown', zone: 'indoor', level: 'ground', x: 128, y: FLOOR_Y, interactionRadius: 24, supportedActivities: ['windowWatching'] },
  { id: 'fridge', zone: 'indoor', level: 'ground', x: 96, y: FLOOR_Y, interactionRadius: 20, supportedActivities: [] },
  { id: 'readingChair', zone: 'indoor', level: 'ground', x: ARMCHAIR_X, y: FLOOR_Y, interactionRadius: 24, supportedActivities: ['reading'] },
  { id: 'easel', zone: 'indoor', level: 'ground', x: EASEL_X - 40, y: FLOOR_Y, interactionRadius: 20, supportedActivities: ['painting'] },
  { id: 'shelter', zone: 'indoor', level: 'ground', x: 452, y: FLOOR_Y, interactionRadius: 40, supportedActivities: ['idle'] },
  { id: 'wateringCan', zone: 'outdoor', level: 'ground', x: 574, y: FLOOR_Y, interactionRadius: 20, supportedActivities: ['gardening'] },
  { id: 'flowerbed', zone: 'outdoor', level: 'ground', x: 750, y: FLOOR_Y, interactionRadius: 130, supportedActivities: ['gardening'] },
  { id: 'blanket', zone: 'outdoor', level: 'ground', x: 1030, y: FLOOR_Y, interactionRadius: 50, supportedActivities: ['sunbathing'] },
  { id: 'tree', zone: 'outdoor', level: 'ground', x: 1150, y: FLOOR_Y, interactionRadius: 60, supportedActivities: ['idle'] }
];

export function getLocation(id: string): ActivityLocation {
  const l = LOCATIONS.find((x) => x.id === id);
  if (!l) throw new Error(`Unknown location ${id}`);
  return l;
}

/** Interior lamp positions (warm lighting that stays on after sunset). */
export const LAMPS = [
  { x: 200, y: 338 }, // bedside table lamp
  { x: 422, y: 292 }, // pendant lantern over the stairwell
  { x: 128, y: 438 } // kitchen ceiling light
];

export interface WindowRect {
  id: 'up' | 'down';
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The two windows on the back wall: the bedroom window upstairs and the kitchen window over the sink. */
export const WINDOWS: WindowRect[] = [
  { id: 'up', x: 158, y: 234, w: 84, h: 82 },
  { id: 'down', x: 88, y: 446, w: 80, h: 62 }
];

export function getWindow(id: 'up' | 'down'): WindowRect {
  return WINDOWS.find((w) => w.id === id)!;
}
