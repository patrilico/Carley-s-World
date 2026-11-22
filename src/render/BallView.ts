import Phaser from 'phaser';
import { FLOOR_Y } from '../config/worldLayout';
import { BALL_RADIUS } from '../entities/Ball';
import type { Simulation } from '../sim/Simulation';
import { COL } from './draw';

/** The red fetch ball: flying, bouncing, lying in the grass, or held in the dog's mouth. */
export class BallView {
  private g: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth = 49) {
    this.shadow = scene.add.graphics().setDepth(depth - 2);
    this.g = scene.add.graphics().setDepth(depth);
  }

  update(sim: Simulation): void {
    const b = sim.ball;
    const g = this.g;
    g.clear();
    this.shadow.clear();
    if (b.state === 'held') return;
    let x = b.x;
    let y = b.y;
    if (b.state === 'carried') {
      const m = sim.dog.mouthPos();
      x = m.x - sim.dog.facing * 2;
      y = m.y + 2;
    } else {
      // soft shadow on the ground, shrinking as the ball rises
      const height = Math.max(0, FLOOR_Y - BALL_RADIUS - b.y);
      const s = 1 - Math.min(0.6, height / 300);
      this.shadow.fillStyle(0x2f363f, 0.2 * s);
      this.shadow.fillEllipse(b.x, FLOOR_Y + 1, 20 * s, 5 * s);
    }
    const r = BALL_RADIUS;
    g.fillStyle(COL.outline, 1);
    g.fillCircle(x, y, r + 1.8);
    g.fillStyle(0xf08a7a, 1);
    g.fillCircle(x, y, r);
    // a white swirl that turns with the ball
    g.lineStyle(3, 0xfdf1e4, 1);
    g.beginPath();
    g.arc(x, y, r * 0.62, b.rot, b.rot + 2.4, false);
    g.strokePath();
    g.fillStyle(0xffffff, 0.65);
    g.fillCircle(x - r * 0.35, y - r * 0.38, r * 0.26);
  }

  destroy(): void {
    this.g.destroy();
    this.shadow.destroy();
  }
}
