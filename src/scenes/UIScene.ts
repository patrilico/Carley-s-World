import Phaser from 'phaser';
import { GAME_CONFIG } from '../config/gameConfig';
import type { CarleyView } from '../render/CarleyView';
import type { Simulation } from '../sim/Simulation';
import type { AudioSystem } from '../systems/AudioSystem';
import type { PlayerKeys } from '../systems/PlayerControl';
import { SaveSystem, type Settings } from '../systems/SaveSystem';
import { DebugPanel } from '../ui/DebugPanel';
import { ControlsHint, PromptBubble, Toast } from '../ui/InteractionHud';
import { MoodMeter, UI_FONT } from '../ui/MoodMeter';
import { MeterPanel } from '../ui/MeterPanel';
import { SettingsPanel } from '../ui/SettingsPanel';
import { StatusDisplay } from '../ui/StatusDisplay';
import { ThoughtBubble } from '../ui/ThoughtBubble';
import type { WorldScene } from './WorldScene';
import { heart } from '../ui/icons';

const KEY_MAP: Record<string, keyof PlayerKeys> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Shift: 'run'
};

/** All 2D UI: mood meter, status, meters, interaction prompt, thought bubbles, splash. Reads the simulation; never owns it. */
export class UIScene extends Phaser.Scene {
  private sim!: Simulation;
  private audio!: AudioSystem;
  private world!: WorldScene;
  private mood!: MoodMeter;
  private status!: StatusDisplay;
  private meters!: MeterPanel;
  private bubble!: ThoughtBubble;
  private prompt!: PromptBubble;
  private toast!: Toast;
  private hint!: ControlsHint;
  private debug!: DebugPanel;
  private settingsPanel!: SettingsPanel;
  private time0 = 0;
  private hudAcc = 0;
  private cursorPointer = false;
  private keysUsed = false;
  private splash: { g: Phaser.GameObjects.Graphics; texts: Phaser.GameObjects.Text[]; alpha: number; gone: boolean } | null = null;
  private pausedBeforeSettings = false;

  constructor() {
    super('UIScene');
  }

  create(): void {
    this.sim = this.registry.get('sim') as Simulation;
    this.audio = this.registry.get('audio') as AudioSystem;
    this.world = this.registry.get('worldScene') as WorldScene;
    const view = this.registry.get('carleyView') as CarleyView;
    const settings = this.registry.get('settings') as Settings;

    this.buildDock();
    this.mood = new MoodMeter(this);
    this.status = new StatusDisplay(this);
    this.meters = new MeterPanel(this);
    this.prompt = new PromptBubble(this);
    this.toast = new Toast(this);
    this.hint = new ControlsHint(this);
    this.bubble = new ThoughtBubble(this, this.sim, () => ({ x: view.world.head.x, y: view.world.head.y - GAME_CONFIG.worldScrollY }));
    this.debug = new DebugPanel(this.sim);
    this.settingsPanel = new SettingsPanel(
      settings,
      this.audio,
      () => this.world.resetWorld(),
      (open) => {
        if (open) {
          this.pausedBeforeSettings = this.sim.paused;
          this.sim.paused = true;
          this.sim.player.releaseAll();
        } else this.sim.paused = this.pausedBeforeSettings;
      }
    );

    this.input.setTopOnly(false);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    // the arrow keys and Space belong to the game (no page scrolling)
    this.input.keyboard?.addCapture([37, 38, 39, 40, 32]);
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => this.onKeyDown(e));
    this.input.keyboard?.on('keyup', (e: KeyboardEvent) => this.onKeyUp(e));
    window.addEventListener('blur', () => this.sim.player.releaseAll());
    this.buildSplash();
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.splash && !this.splash.gone) {
      this.dismissSplash();
      this.audio.click();
      return;
    }
    if (this.settingsPanel.isOpen) return;
    const hud = this.status.hitTest(p.x, p.y);
    if (hud === 'pause') {
      this.sim.paused = !this.sim.paused;
      this.audio.click();
    } else if (hud === 'auto') {
      this.toggleAutopilot();
      this.audio.click();
    } else if (hud === 'settings') {
      this.audio.click();
      this.settingsPanel.open();
    }
  }

  private toggleAutopilot(): void {
    this.sim.autopilot = !this.sim.autopilot;
    this.sim.player.releaseAll();
    this.toast.show(this.sim.autopilot ? 'Autopilot on: Carley chooses for herself (press A to take over)' : 'Autopilot off: you steer Carley with the arrow keys', true);
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (this.splash && !this.splash.gone && (e.key === ' ' || e.key === 'Enter')) {
      this.dismissSplash();
      return;
    }
    if (this.settingsPanel.isOpen) return;
    const k = KEY_MAP[e.key];
    if (k) {
      this.sim.player.setKey(k, true);
      if (k !== 'run') this.keysUsed = true;
      e.preventDefault();
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      if (e.repeat || (this.splash && !this.splash.gone)) return;
      const res = this.sim.player.action();
      this.keysUsed = true;
      if (res) {
        this.toast.show(res.message, res.ok);
        this.audio.click();
      }
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      this.sim.paused = !this.sim.paused;
      if (this.sim.paused) this.sim.player.releaseAll();
    } else if (e.key === 'a' || e.key === 'A') {
      this.toggleAutopilot();
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const k = KEY_MAP[e.key];
    if (k) this.sim.player.setKey(k, false);
  }

  /** A soft scalloped shelf along the bottom of the screen that the meters sit on. */
  private buildDock(): void {
    const g = this.add.graphics().setDepth(98);
    const y = GAME_CONFIG.dockY;
    g.fillStyle(0x4a3560, 0.18);
    g.fillRect(0, y - 8, 1280, 8);
    g.fillStyle(0xf6e4e4, 1);
    g.fillRect(0, y, 1280, 720 - y);
    g.fillStyle(0xfbeee9, 1);
    g.fillRect(0, y, 1280, 22);
    g.fillStyle(0xf6e4e4, 1);
    for (let x = 0; x < 1300; x += 32) g.fillCircle(x, y + 20, 18);
    g.lineStyle(3, 0x6b5584, 1);
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x < 1300; x += 32) g.arc(x + 16, y + 2, 16, Math.PI, 0, true);
    g.strokePath();
    g.fillStyle(0xe9c7c9, 0.55);
    for (let x = 14; x < 1280; x += 46) g.fillCircle(x, 716, 2.4);
  }

  private buildSplash(): void {
    const g = this.add.graphics().setDepth(200);
    const saved = !!this.registry.get('loadedSave');
    const style = (size: number, color: string, extra: object = {}) => ({ fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: 'bold', color, align: 'center', ...extra });
    const title = this.add.text(640, 270, "Carley's World", style(64, '#e99f8a', { stroke: '#ffffff', strokeThickness: 10 })).setOrigin(0.5).setDepth(201);
    const sub2 = this.add
      .text(
        640, 392,
        (saved ? `Welcome back! Day ${this.sim.clock.day + 1} is waiting.\n` : '') + 'Walk Carley around with the arrow keys.\nWalk up to things and press Space to do them!',
        style(18, '#866b5e')
      )
      .setOrigin(0.5)
      .setDepth(201);
    const go = this.add.text(640, 482, 'Click anywhere to begin', style(26, '#4a3560', { stroke: '#ffffff', strokeThickness: 6 })).setOrigin(0.5).setDepth(201);
    this.splash = { g, texts: [title, sub2, go], alpha: 1, gone: false };
  }

  private dismissSplash(): void {
    if (this.splash) this.splash.gone = true;
  }

  update(_t: number, delta: number): void {
    const dt = Math.min(delta / 1000, 0.1);
    this.time0 += dt;
    const ptr = this.input.activePointer;
    const hud = this.status.hitTest(ptr.x, ptr.y);
    this.status.hover = hud;
    // the HUD panels are redrawn ~30x per second; they are static-ish and expensive to re-tessellate
    this.hudAcc += dt;
    if (this.hudAcc >= 1 / 32) {
      const hd = this.hudAcc;
      this.hudAcc = 0;
      this.mood.update(hd, this.sim, this.time0);
      this.status.update(hd, this.sim, this.time0);
      this.meters.update(hd, this.sim);
    }
    this.bubble.update(dt);
    const a = this.sim.agent;
    const splashUp = !!this.splash && !this.splash.gone;
    this.prompt.update(dt, splashUp || this.sim.paused ? null : this.sim.player.prompt, { x: a.x, y: a.y - GAME_CONFIG.worldScrollY });
    this.toast.update(dt);
    this.hint.update(dt, this.keysUsed);
    this.debug.update(dt);
    const over = !!hud;
    if (over !== this.cursorPointer) {
      this.cursorPointer = over;
      this.input.setDefaultCursor(over ? 'pointer' : 'default');
    }

    if (this.splash) this.updateSplash(dt);
    if (this.sim.paused && !this.settingsPanel.isOpen) this.drawPausedBadge();
    else this.pausedText?.setVisible(false);
  }

  private pausedText?: Phaser.GameObjects.Text;
  private drawPausedBadge(): void {
    if (!this.pausedText) {
      this.pausedText = this.add.text(640, 108, 'Paused', { fontFamily: UI_FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff', stroke: '#4a3560', strokeThickness: 7 }).setOrigin(0.5).setDepth(130);
    }
    this.pausedText.setVisible(true);
  }

  private updateSplash(dt: number): void {
    const s = this.splash!;
    const g = s.g;
    g.clear();
    if (s.gone) s.alpha = Math.max(0, s.alpha - dt * 3);
    if (s.alpha <= 0.01) {
      g.destroy();
      for (const t of s.texts) t.destroy();
      this.splash = null;
      return;
    }
    g.fillStyle(0xfaeae6, 0.72 * s.alpha);
    g.fillRect(0, 0, 1280, 720);
    g.fillStyle(0xffffff, 0.8 * s.alpha);
    g.lineStyle(5, 0x6b5584, s.alpha);
    g.fillRoundedRect(250, 190, 780, 360, 36);
    g.strokeRoundedRect(250, 190, 780, 360, 36);
    const bob = Math.sin(this.time0 * 3) * 6;
    heart(g, 640, 226 + bob, 22, 0xe99f8a, 0x4a3560);
    for (const t of s.texts) t.setAlpha(s.alpha);
    s.texts[2].setAlpha(s.alpha * (0.6 + 0.4 * Math.sin(this.time0 * 4)));
    void SaveSystem;
  }
}
