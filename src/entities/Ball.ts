import { FLOOR_Y, WALL_OUTER_X, WORLD_RIGHT_X } from '../config/worldLayout';

export type BallState = 'held' | 'air' | 'rest' | 'carried';

export const BALL_RADIUS = 9;

/** The dog's ball for games of fetch: thrown by Carley, bounces and rolls across the garden, carried back by the dog. */
export class Ball {
  x = 0;
  /** centre height */
  y = FLOOR_Y - BALL_RADIUS;
  vx = 0;
  vy = 0;
  rot = 0;
  state: BallState = 'held';
  /** Frames since it last bounced, for the bounce sound. */
  bounced = false;

  /** True once something (the player's throw) has put it in play. */
  get inPlay(): boolean {
    return this.state !== 'held';
  }

  /** Launch it from a hand. `dir` is -1/1, `power` px/s horizontally, `lift` px/s upwards. */
  throwFrom(x: number, y: number, dir: 1 | -1, power: number, lift: number): void {
    this.x = x;
    this.y = y;
    this.vx = dir * power;
    this.vy = -lift;
    this.state = 'air';
  }

  rest(x: number): void {
    this.x = x;
    this.y = FLOOR_Y - BALL_RADIUS;
    this.vx = 0;
    this.vy = 0;
    this.state = 'rest';
  }

  /** Where it will first touch the ground if nothing interferes (for the dog's chase). */
  landingX(): number {
    if (this.state !== 'air') return this.x;
    const g = 1300;
    const floor = FLOOR_Y - BALL_RADIUS;
    const disc = this.vy * this.vy + 2 * g * (floor - this.y);
    const t = (this.vy + Math.sqrt(Math.max(0, disc))) / g;
    return Math.min(WORLD_RIGHT_X - 14, Math.max(WALL_OUTER_X + 40, this.x + this.vx * t));
  }

  update(dt: number): void {
    this.bounced = false;
    if (this.state === 'held' || this.state === 'carried') return;
    const floor = FLOOR_Y - BALL_RADIUS;
    this.vy += 1300 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += (this.vx / BALL_RADIUS) * dt;
    // the fence and the cottage wall keep it in the garden
    const lo = WALL_OUTER_X + 30;
    const hi = WORLD_RIGHT_X - 14;
    if (this.x < lo) {
      this.x = lo;
      this.vx = Math.abs(this.vx) * 0.6;
    } else if (this.x > hi) {
      this.x = hi;
      this.vx = -Math.abs(this.vx) * 0.6;
    }
    if (this.y >= floor) {
      this.y = floor;
      if (this.vy > 120) {
        this.vy = -this.vy * 0.52;
        this.vx *= 0.82;
        this.bounced = true;
        this.state = 'air';
      } else {
        this.vy = 0;
        this.vx *= Math.exp(-2.6 * dt);
        if (Math.abs(this.vx) < 6) {
          this.vx = 0;
          this.state = 'rest';
        }
      }
    }
  }
}
