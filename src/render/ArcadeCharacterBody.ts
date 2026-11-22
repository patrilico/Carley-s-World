import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import { BED_STATE, FLOOR_Y, SOLIDS, STAIRS, UPPER_MAX_X, UPPER_Y, WALL_LEFT_X, WORLD_RIGHT_X, clampToPlane, stairsYAt } from '../config/worldLayout';
import { approach, clamp } from '../core/math';
import type { Plane } from '../core/types';
import type { CharacterBody } from '../entities/Carley';

const BODY_W = 22;
const BODY_H = 86;

/**
 * Carley's Arcade Physics body: gravity, floor and furniture collisions, world bounds.
 * The AI sets a desired horizontal velocity; this class handles acceleration and hopping.
 * Walking on the staircase is driven directly (a ramp): gravity and collisions are switched off while she is on it.
 */
export class ArcadeCharacterBody implements CharacterBody {
  readonly obj: Phaser.GameObjects.Rectangle;
  readonly arcade: Phaser.Physics.Arcade.Body;
  readonly solids: Phaser.Physics.Arcade.StaticGroup;
  vx = 0;
  vy = 0;
  onGround = true;
  blocked = false;
  plane: Plane = 'ground';
  private desired = 0;
  private hopLock = 0;
  private airVx = 0;
  /** Seconds after stepping onto a floor during which she counts as grounded while physics settles. */
  private grace = 0;
  private bedBody: Phaser.Physics.Arcade.StaticBody | null = null;

  constructor(scene: Phaser.Scene, x: number) {
    // static colliders: the bed, the upstairs floor slab and the door lintel
    this.solids = scene.physics.add.staticGroup();
    for (const s of SOLIDS) {
      const r = scene.add.rectangle(s.x + s.w / 2, s.y + s.h / 2, s.w, s.h, 0x000000, 0);
      scene.physics.add.existing(r, true);
      this.solids.add(r);
      if (s.id === 'bed') this.bedBody = r.body as Phaser.Physics.Arcade.StaticBody;
    }
    this.obj = scene.add.rectangle(x, FLOOR_Y - BODY_H / 2, BODY_W, BODY_H, 0xec1313, 0);
    scene.physics.add.existing(this.obj);
    this.arcade = this.obj.body as Phaser.Physics.Arcade.Body;
    this.arcade.setGravityY(GAME_CONFIG.physics.gravity);
    this.arcade.setMaxVelocity(500, 1100);
    this.arcade.setCollideWorldBounds(true);
    scene.physics.world.setBounds(WALL_LEFT_X + BODY_W / 2 + 2, 0, WORLD_RIGHT_X - WALL_LEFT_X - BODY_W / 2, FLOOR_Y);
    scene.physics.add.collider(this.obj, this.solids);
  }

  get x(): number {
    return this.obj.x;
  }
  set x(v: number) {
    this.obj.x = v;
  }
  get y(): number {
    return this.arcade.bottom;
  }
  set y(_v: number) {
    /* driven by physics */
  }

  setVelocityX(vx: number): void {
    this.desired = vx;
  }

  hop(vx: number, vy: number): void {
    if (this.hopLock > 0 || this.plane === 'stairs') return;
    this.arcade.setVelocityY(vy);
    this.airVx = vx;
    this.arcade.setVelocityX(vx);
    this.hopLock = 0.35;
    this.onGround = false;
  }

  /** Step onto a floor or onto the staircase (the ramp: no gravity, no collisions, y follows the steps). */
  setPlane(plane: Plane): void {
    this.plane = plane;
    const stairs = plane === 'stairs';
    this.arcade.setAllowGravity(!stairs);
    this.arcade.checkCollision.none = stairs;
    this.arcade.setVelocity(0, 0);
    this.hopLock = 0;
    this.airVx = 0;
    this.onGround = true;
    this.blocked = false;
    if (stairs) {
      this.obj.x = clamp(this.obj.x, STAIRS.topX, STAIRS.footX);
      this.obj.y = stairsYAt(this.obj.x) - BODY_H / 2;
    } else {
      this.obj.x = clampToPlane(this.obj.x, plane);
      // rest just above the floor so gravity settles her onto it without a pop
      this.obj.y = (plane === 'upper' ? UPPER_Y : FLOOR_Y) - BODY_H / 2 - 0.5;
      this.grace = 0.15;
    }
  }

  teleport(x: number, plane: Plane = 'ground'): void {
    this.plane = plane;
    this.arcade.setAllowGravity(plane !== 'stairs');
    this.arcade.checkCollision.none = plane === 'stairs';
    const nx = clampToPlane(x, plane);
    const y = plane === 'upper' ? UPPER_Y : plane === 'stairs' ? stairsYAt(nx) : FLOOR_Y;
    this.arcade.reset(nx, y - BODY_H / 2 - (plane === 'stairs' ? 0 : 0.5));
    this.desired = 0;
    this.vx = 0;
    this.vy = 0;
    this.hopLock = 0;
    this.grace = 0.15;
  }

  update(dt: number): void {
    if (this.bedBody) this.bedBody.enable = BED_STATE.active;
    if (this.plane === 'stairs') {
      this.updateStairs(dt);
      return;
    }
    const b = this.arcade;
    this.hopLock = Math.max(0, this.hopLock - dt);
    this.grace = Math.max(0, this.grace - dt);
    // the upstairs floor ends at the stairwell: nobody walks off the edge
    if (this.plane === 'upper' && this.obj.x > UPPER_MAX_X) {
      this.obj.x = UPPER_MAX_X;
      b.setVelocityX(0);
    }
    this.onGround = b.blocked.down || b.touching.down || this.grace > 0;
    const grounded = this.onGround && this.hopLock <= 0;
    if (grounded) {
      b.setVelocityX(approach(b.velocity.x, this.desired, 16, dt));
    } else if (!this.onGround) {
      // in the air she keeps steering toward her desired direction, gently
      const target = Math.abs(this.desired) > 1 ? Math.sign(this.desired) * Math.max(Math.abs(this.airVx), 90) : this.airVx;
      b.setVelocityX(approach(b.velocity.x, target, 6, dt));
    }
    this.vx = b.velocity.x;
    this.vy = b.velocity.y;
    const pushing = Math.abs(this.desired) > 1;
    const hit = (b.touching.left && this.desired < 0) || (b.touching.right && this.desired > 0) || (b.blocked.left && this.desired < 0) || (b.blocked.right && this.desired > 0);
    this.blocked = pushing && hit;
    if (this.onGround) this.airVx = 0;
  }

  private updateStairs(dt: number): void {
    this.vx = approach(this.vx, this.desired, 16, dt);
    this.obj.x = clamp(this.obj.x + this.vx * dt, STAIRS.topX, STAIRS.footX);
    this.obj.y = stairsYAt(this.obj.x) - BODY_H / 2;
    this.arcade.setVelocity(0, 0);
    this.vy = 0;
    this.onGround = true;
    this.blocked = false;
  }
}
