import { GAME_CONFIG } from '../config/gameConfig';
import { BED_STATE, FLOOR_Y, SOLIDS, STAIRS, UPPER_Y, clampToPlane, levelOf, navStep, planeRange, standableX, surfaceYAt } from '../config/worldLayout';
import type { FaceParams } from '../config/emotionConfig';
import { clamp } from '../core/math';
import type { ActionId, EmotionType, Level, Plane, Posture, PropId, Vec2 } from '../core/types';

/** Abstraction over Carley's physical body so the AI is testable without Phaser. */
export interface CharacterBody {
  x: number;
  /** y of the feet */
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  /** True while pressed against a solid obstacle in the movement direction. */
  blocked: boolean;
  /** Which floor she is on, or the staircase between them. */
  plane: Plane;
  /** Step onto a floor or onto the stairs (the movement code calls this at the ends of the staircase). */
  setPlane(plane: Plane): void;
  /** Desired horizontal velocity (px/s). The body handles acceleration, gravity and collisions. */
  setVelocityX(vx: number): void;
  hop(vx: number, vy: number): void;
  teleport(x: number, plane?: Plane): void;
  update(dt: number): void;
}

/** Deterministic body used by tests and as a fallback; obeys world bounds, platform heights and the staircase. */
export class KinematicBody implements CharacterBody {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  onGround = true;
  blocked = false;
  plane: Plane = 'ground';
  private desired = 0;

  constructor(x = 360) {
    this.x = x;
    this.y = surfaceYAt(x);
  }

  setVelocityX(vx: number): void {
    this.desired = vx;
  }

  setPlane(plane: Plane): void {
    this.plane = plane;
    this.x = clampToPlane(this.x, plane);
    this.y = surfaceYAt(this.x, plane);
  }

  hop(): void {
    /* instantaneous in kinematic mode */
  }

  teleport(x: number, plane: Plane = 'ground'): void {
    this.plane = plane;
    this.x = clampToPlane(x, plane);
    this.y = surfaceYAt(this.x, plane);
    this.vx = 0;
    this.desired = 0;
  }

  update(dt: number): void {
    this.vx = this.desired;
    this.x = clampToPlane(this.x + this.vx * dt, this.plane);
    this.y = surfaceYAt(this.x, this.plane);
    this.onGround = true;
    this.blocked = false;
  }
}

export interface FaceDirective {
  emotion?: EmotionType;
  override?: Partial<FaceParams>;
  talking?: boolean;
  /** world position (or function) Carley's eyes follow */
  gaze?: Vec2 | (() => Vec2 | null) | null;
  /** keep eyes closed (sleep) */
  eyesClosed?: boolean;
}

export type MoveStyle = 'walk' | 'run';

/**
 * Carley's physical presence: body, posture, held prop, and what the animation layer should currently play.
 * The AI (brain/steps) writes to this; CarleyView reads it.
 */
export class Carley {
  posture: Posture = 'standing';
  prop: PropId = null;
  action: ActionId = 'idle';
  /** Increments whenever a new action starts so the animator restarts its clock. */
  actionSerial = 0;
  face: FaceDirective = {};
  facing: 1 | -1 = 1;
  /** Which way her head points when lying down (-1 = left). */
  lieDir: 1 | -1 = -1;
  moving: 'none' | MoveStyle = 'none';
  stuck = false;
  /** Set by the brain each frame: movement speed multiplier from emotion/pain. */
  speedMultiplier = 1;
  /** 0..1 magical glow used by the healing effect */
  glow = 0;
  /** milk moustache amount 0..1 (fades) */
  stache = 0;
  /** Extra animation parameter, e.g. which mosquito she swats at. */
  actionData: Record<string, number> = {};
  private stuckTimer = 0;
  private lastProgressX = 0;
  /** The floor she is heading for while she is on the staircase. */
  stairsGoal: Level = 'ground';
  /** accumulated distance for footstep sounds */
  stepDistance = 0;
  footstep = false;

  constructor(public body: CharacterBody) {}

  get x(): number {
    return this.body.x;
  }
  get y(): number {
    return this.body.y;
  }
  get plane(): Plane {
    return this.body.plane;
  }

  /** The floor she is on (while on the stairs: the floor she is heading for). */
  get level(): Level {
    return levelOf(this.body.plane, this.stairsGoal);
  }

  play(action: ActionId, force = false): void {
    if (action !== this.action || force) {
      this.action = action;
      this.actionSerial++;
    }
  }

  faceToward(x: number): void {
    if (Math.abs(x - this.body.x) > 3) this.facing = x > this.body.x ? 1 : -1;
  }

  stop(): void {
    this.body.setVelocityX(0);
    this.moving = 'none';
  }

  /**
   * Walk/run to x on `level` (default: the floor she is on). Returns true once within `tolerance` of the final spot.
   * Crossing floors always goes via the staircase: she walks to its foot/top, climbs, and carries on.
   */
  moveToward(x: number, run: boolean, tolerance = 6, level: Level = this.level): boolean {
    if (this.body.plane === 'stairs') this.stairsGoal = level; // may turn around mid-staircase
    const nav = navStep(this.body.plane, x, level);
    if (nav.then === undefined) return this.walkTo(nav.toX, run, tolerance, true);
    // intermediate waypoint (stair foot / top / far end of the stairs): precise, no slowing down on arrival
    if (this.walkTo(nav.toX, run, run ? 5 : 3, false)) {
      this.stairsGoal = level;
      this.body.setPlane(nav.then);
    }
    return false;
  }

  /** Keep walking/running in a direction while the player holds a key (auto-hops the bed; stops at the end of the floor). */
  walkDir(dir: -1 | 1, run: boolean): void {
    const [lo, hi] = planeRange(this.body.plane);
    this.walkTo(dir > 0 ? hi : lo, run, 0, false);
  }

  /** Plain horizontal walk on the current plane (auto-hops low obstacles such as the bed). */
  private walkTo(x: number, run: boolean, tolerance: number, slowAtEnd: boolean): boolean {
    const dx = x - this.body.x;
    if (Math.abs(dx) <= tolerance) {
      this.stop();
      return true;
    }
    const dir = dx > 0 ? 1 : -1;
    this.facing = dir;
    let speed = (run ? GAME_CONFIG.physics.runSpeed : GAME_CONFIG.physics.walkSpeed) * this.speedMultiplier;
    if (this.body.plane === 'stairs') speed *= 0.8;
    // slow down smoothly when arriving
    const arrive = slowAtEnd ? clamp(Math.abs(dx) / 40, 0.35, 1) : 1;
    this.body.setVelocityX(dir * speed * (run ? 1 : arrive));
    this.moving = run ? 'run' : 'walk';

    if (this.body.blocked && this.body.onGround) {
      const top = this.obstacleTopAhead(dir);
      if (top !== null && this.body.y - top <= 64) {
        const h = this.body.y - top + 16;
        const vy = Math.sqrt(2 * GAME_CONFIG.physics.gravity * Math.max(h, 24));
        this.body.hop(dir * Math.max(speed, 105), -vy);
      }
    }
    return false;
  }

  private obstacleTopAhead(dir: number): number | null {
    const reach = this.body.x + dir * 20;
    const level: Level = this.body.plane === 'upper' ? 'upper' : 'ground';
    for (const s of SOLIDS) {
      if (s.hoppable && s.level === level && (s.id !== 'bed' || BED_STATE.active) && reach >= s.x - 2 && reach <= s.x + s.w + 2) return s.y;
    }
    return null;
  }

  /** Per-frame update: moves the body, tracks progress/stuck state and footsteps. */
  update(dt: number): void {
    const px = this.body.x;
    this.body.update(dt);
    this.footstep = false;
    if (this.moving !== 'none' && this.body.onGround) {
      this.stepDistance += Math.abs(this.body.x - px);
      const stride = this.moving === 'run' ? 62 : this.body.plane === 'stairs' ? 26 : 40;
      if (this.stepDistance >= stride) {
        this.stepDistance = 0;
        this.footstep = true;
      }
    }
    if (this.moving !== 'none') {
      if (Math.abs(this.body.x - this.lastProgressX) > 4) {
        this.lastProgressX = this.body.x;
        this.stuckTimer = 0;
      } else {
        this.stuckTimer += dt;
        if (this.stuckTimer > 4) this.stuck = true;
      }
    } else {
      this.stuckTimer = 0;
      this.lastProgressX = this.body.x;
    }
  }

  clearStuck(): void {
    this.stuck = false;
    this.stuckTimer = 0;
  }

  /** Put her back on a bare spot of floor (never on furniture or mid-staircase), keeping her floor. */
  placeSafely(): void {
    const onStairs = this.body.plane === 'stairs';
    const level: Level = onStairs
      ? this.body.x - STAIRS.topX < STAIRS.footX - this.body.x ? 'upper' : 'ground'
      : this.level;
    const x = onStairs ? (level === 'upper' ? STAIRS.topX : STAIRS.footX) : this.body.x;
    this.stairsGoal = level;
    this.body.teleport(standableX(x, level), level === 'upper' ? 'upper' : 'ground');
  }

  /** Is Carley standing on bare floor (not on top of furniture or on the stairs)? */
  get onFloor(): boolean {
    if (this.body.plane === 'stairs') return false;
    return Math.abs(this.body.y - (this.body.plane === 'upper' ? UPPER_Y : FLOOR_Y)) < 2;
  }
}
