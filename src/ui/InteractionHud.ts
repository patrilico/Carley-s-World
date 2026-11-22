import Phaser from 'phaser';
import type { Prompt } from '../systems/PlayerControl';
import { UI_FONT } from './MoodMeter';

const INK = '#4a3560';

/** The small box beside Carley: "Press Space to Garden" (and why not, when she can't right now). */
export class PromptBubble {
  private g: Phaser.GameObjects.Graphics;
  private main: Phaser.GameObjects.Text;
  private sub: Phaser.GameObjects.Text;
  private alpha = 0;
  private t = 0;
  private last: Prompt | null = null;
  private shown = '';
  private colors = '';

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(95);
    this.main = scene.add.text(0, 0, '', { fontFamily: UI_FONT, fontSize: '17px', fontStyle: 'bold', color: INK }).setOrigin(0.5).setDepth(96);
    this.sub = scene.add.text(0, 0, '', { fontFamily: UI_FONT, fontSize: '12px', fontStyle: 'bold', color: '#46754d' }).setOrigin(0.5).setDepth(96);
  }

  /** `feet` is where Carley stands: the box sits just under her feet so it never covers her or her thoughts. */
  update(dt: number, prompt: Prompt | null, feet: { x: number; y: number }): void {
    this.t += dt;
    if (prompt) this.last = prompt;
    this.alpha += ((prompt ? 1 : 0) - this.alpha) * Math.min(1, dt * 14);
    const g = this.g;
    g.clear();
    const p = this.last;
    if (!p || this.alpha < 0.03) {
      this.main.setVisible(false);
      this.sub.setVisible(false);
      return;
    }
    const key = `${p.text}|${p.sub ?? ''}`;
    if (key !== this.shown) {
      this.shown = key;
      this.main.setText(p.text);
      this.sub.setText(p.sub ?? '');
    }
    const col = p.blocked ? '#a0527a' : p.kind === 'stop' ? '#a0527a' : INK;
    const subCol = p.blocked ? '#a0527a' : '#46754d';
    if (this.colors !== col + subCol) {
      this.colors = col + subCol;
      this.main.setColor(col);
      this.sub.setColor(subCol);
    }
    const hasSub = !!p.sub;
    const w = Math.max(this.main.width, hasSub ? this.sub.width : 0) + 38;
    const h = hasSub ? 54 : 38;
    const a = this.alpha;
    const x = Math.max(w / 2 + 8, Math.min(1280 - w / 2 - 8, feet.x));
    const pop = 0.9 + 0.1 * a;
    const bob = Math.sin(this.t * 3.2) * 1.4;
    const top = Math.min(604 - h, feet.y + 20) + bob;
    // little pointer up toward Carley
    g.fillStyle(0x6b5584, 0.18 * a);
    g.fillRoundedRect(x - (w * pop) / 2 + 2, top + 4, w * pop, h * pop, 14);
    g.fillStyle(0xfef6ef, 0.97 * a);
    g.lineStyle(3, 0x6b5584, a);
    g.fillRoundedRect(x - (w * pop) / 2, top, w * pop, h * pop, 14);
    g.strokeRoundedRect(x - (w * pop) / 2, top, w * pop, h * pop, 14);
    const px = Math.max(x - w / 2 + 22, Math.min(x + w / 2 - 22, feet.x));
    g.fillStyle(0xfef6ef, 0.97 * a);
    g.fillTriangle(px - 7, top + 1, px + 7, top + 1, px, top - 9);
    g.lineStyle(3, 0x6b5584, a);
    g.beginPath();
    g.moveTo(px - 7, top + 1);
    g.lineTo(px, top - 9);
    g.lineTo(px + 7, top + 1);
    g.strokePath();
    g.fillStyle(0xfef6ef, 0.97 * a);
    g.fillRect(px - 6, top - 1, 12, 4);
    this.main.setVisible(true).setAlpha(a).setPosition(x, top + (hasSub ? 18 : h / 2)).setScale(pop);
    this.sub.setVisible(hasSub).setAlpha(a).setPosition(x, top + 39).setScale(pop);
  }
}

/** Short messages near the bottom of the screen ("It's raining outside!", "Belly rubs for Pongo!"). */
export class Toast {
  private text: Phaser.GameObjects.Text;
  private t = 0;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(640, 588, '', { fontFamily: UI_FONT, fontSize: '18px', fontStyle: 'bold', color: '#ffffff', stroke: '#4a3560', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(120)
      .setAlpha(0);
  }

  show(msg: string, ok = true): void {
    this.text.setText(msg).setColor(ok ? '#ffffff' : '#fcd9d9').setAlpha(1);
    this.t = 2.6;
  }

  update(dt: number): void {
    if (this.t > 0) {
      this.t -= dt;
      this.text.setAlpha(Math.min(1, this.t / 0.6)).setY(588 - (2.6 - this.t) * 3);
    } else this.text.setAlpha(0);
  }
}

/** A quiet reminder of the controls along the bottom edge, which fades back once you have had a chance to read it. */
export class ControlsHint {
  private text: Phaser.GameObjects.Text;
  private t = 0;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(640, 598, '← →  walk      ↑ ↓  stairs      Space  do / stop      Shift  run      P  pause', {
        fontFamily: UI_FONT, fontSize: '13px', fontStyle: 'bold', color: '#ffffff', stroke: '#4a3560', strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(110)
      .setAlpha(0);
  }

  update(dt: number, keysUsed: boolean): void {
    this.t += dt;
    const target = this.t < 25 && !keysUsed ? 0.95 : 0.42;
    this.text.setAlpha(this.text.alpha + (Math.min(target, this.t * 1.5) - this.text.alpha) * Math.min(1, dt * 3));
  }
}
