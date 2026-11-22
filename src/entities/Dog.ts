import { BED, FLOOR_Y, STAIRS, UPPER_MAX_X, UPPER_Y, WORLD_RIGHT_X, navStep, stairsYAt } from '../config/worldLayout';
import type { Level, Plane, Vec2 } from '../core/types';

/**
 * Everything the dog's animation layer can be asked to play. The view draws these procedurally; the brain only ever
 * picks one (plus sets `carrying`, `excitement`, `facing`...), it never worries about the drawing.
 */
export type DogAction =
  // locomotion (the view picks the gait from the real speed; these are what the brain asks for)
  | 'stand' | 'walk' | 'trot' | 'run'
  // resting poses
  | 'sit' | 'beg' | 'lie' | 'sleep'
  // small behaviours
  | 'sniff' | 'scratch' | 'shake' | 'yawn' | 'stretch' | 'tilt' | 'whine' | 'happy' | 'spin'
  // loud / athletic
  | 'bark' | 'leap'
  // belly rub
  | 'roll';

export const DOG_NAME = 'Pongo';

/** Walking speeds in px/s. */
export const DOG_SPEED = { walk: 64, trot: 120, run: 240 };

/** Where the dog may stand: the whole ground floor and garden, the bedroom floor beside (not on) the bed, the stairs. */
export function dogRange(plane: Plane): [number, number] {
  switch (plane) {
    case 'upper': return [BED.x + BED.w + 10, UPPER_MAX_X];
    case 'stairs': return [STAIRS.topX, STAIRS.footX];
    default: return [36, WORLD_RIGHT_X - 8];
  }
}

const clampRange = (x: number, plane: Plane): number => {
  const [lo, hi] = dogRange(plane);
  return Math.min(hi, Math.max(lo, x));
};

/** Physical presence of the dalmatian puppy. Kinematic: it walks, trots, climbs the stairs and leaps. */
export class Dog {
  readonly name = DOG_NAME;
  /** x of the middle of the body */
  x: number;
  /** y of the paws on the floor (the view adds `lift` while leaping) */
  y: number;
  plane: Plane = 'ground';
  facing: 1 | -1 = -1;
  vx = 0;
  /** Which floor it is heading for while on the stairs. */
  stairsGoal: Level = 'ground';
  action: DogAction = 'stand';
  /** Increments whenever a new action starts so the view restarts its animation clock. */
  actionSerial = 0;
  /** True while the ball is in its mouth. */
  carrying = false;
  /** 0 calm .. 1 bouncing off the walls: drives tail wag speed, ear perk and sparkle in the eyes. */
  excitement = 0.3;
  /** Height above the floor while leaping (px), and its vertical speed. */
  lift = 0;
  liftV = 0;
  /** accumulated distance for the paw-step sounds */
  private stepDistance = 0;
  /** True on the frame a paw touches down while moving. */
  pawStep = false;
  /** Set to true while it is wearing the happy "just got a belly rub" glow etc. */
  private desired = 0;

  constructor(x = 420) {
    this.x = x;
    this.y = FLOOR_Y;
  }

  get level(): Level {
    return this.plane === 'upper' ? 'upper' : this.plane === 'stairs' ? this.stairsGoal : 'ground';
  }

  get airborne(): boolean {
    return this.lift > 0.5 || this.liftV > 1;
  }

  /** Is it moving (for gait selection)? */
  get speed(): number {
    return Math.abs(this.vx);
  }

  play(action: DogAction, force = false): void {
    if (action !== this.action || force) {
      this.action = action;
      this.actionSerial++;
    }
  }

  faceToward(x: number): void {
    if (Math.abs(x - this.x) > 4) this.facing = x > this.x ? 1 : -1;
  }

  stop(): void {
    this.desired = 0;
  }

  /** Head and mouth positions in the world (for the ball, mosquitoes, thought bubbles and effects). */
  headPos(): Vec2 {
    const lowHead = this.action === 'sniff' || this.action === 'sleep' || this.action === 'lie' || this.action === 'roll';
    const sitting = this.action === 'sit' || this.action === 'beg';
    return { x: this.x + this.facing * (sitting ? 10 : 20), y: this.y - this.lift - (lowHead ? 14 : sitting ? 42 : 34) };
  }

  mouthPos(): Vec2 {
    const h = this.headPos();
    return { x: h.x + this.facing * 10, y: h.y + 6 };
  }

  teleport(x: number, plane: Plane = 'ground'): void {
    this.plane = plane;
    this.stairsGoal = plane === 'upper' ? 'upper' : 'ground';
    this.x = clampRange(x, plane);
    this.y = this.surfaceY();
    this.vx = 0;
    this.desired = 0;
    this.lift = 0;
    this.liftV = 0;
  }

  private surfaceY(): number {
    return this.plane === 'stairs' ? stairsYAt(this.x) : this.plane === 'upper' ? UPPER_Y : FLOOR_Y;
  }

  /**
   * Walk toward x on `level` at `speed`, taking the stairs when the floors differ.
   * Returns true when it has arrived (within `tolerance`).
   */
  moveToward(x: number, level: Level, speed: number, tolerance = 8): boolean {
    if (this.plane === 'stairs') this.stairsGoal = level;
    const nav = navStep(this.plane, x, level);
    const target = nav.then === undefined ? clampRange(nav.toX, this.plane) : nav.toX;
    const tol = nav.then === undefined ? tolerance : 3;
    const dx = target - this.x;
    if (Math.abs(dx) <= tol) {
      this.desired = 0;
      if (nav.then !== undefined) {
        this.stairsGoal = level;
        this.plane = nav.then;
        this.x = clampRange(this.x, this.plane);
        this.y = this.surfaceY();
        return false;
      }
      return true;
    }
    const dir = dx > 0 ? 1 : -1;
    this.facing = dir;
    const arrive = nav.then === undefined ? Math.min(1, Math.max(0.4, Math.abs(dx) / 36)) : 1;
    this.desired = dir * speed * (this.plane === 'stairs' ? 0.8 : 1) * arrive;
    return false;
  }

  /** Start a leap straight up (px/s): used for catching bugs and balls, and for happy hops. */
  leap(power: number): void {
    if (this.airborne) return;
    this.liftV = power;
  }

  update(dt: number): void {
    // smooth acceleration so gait changes don't snap
    const k = 1 - Math.exp(-9 * dt);
    this.vx += (this.desired - this.vx) * k;
    if (Math.abs(this.vx) < 0.5 && this.desired === 0) this.vx = 0;
    const px = this.x;
    this.x = clampRange(this.x + this.vx * dt, this.plane);
    if (this.x !== px + this.vx * dt && this.plane !== 'stairs') this.vx = 0; // bumped into the edge of the floor
    this.y = this.surfaceY();

    // leaping
    this.pawStep = false;
    if (this.lift > 0 || this.liftV > 0) {
      this.liftV -= 1500 * dt;
      this.lift += this.liftV * dt;
      if (this.lift <= 0) {
        this.lift = 0;
        this.liftV = 0;
      }
    } else if (Math.abs(this.vx) > 8) {
      this.stepDistance += Math.abs(this.x - px);
      const stride = Math.abs(this.vx) > 180 ? 54 : Math.abs(this.vx) > 90 ? 34 : 24;
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        this.pawStep = true;
      }
    }
  }
}
