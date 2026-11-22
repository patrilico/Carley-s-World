import Phaser from 'phaser';
import { STAIRS, stairsYAt } from '../config/worldLayout';
import { approach, clamp, lerp, smoothstep } from '../core/math';
import type { Vec2 } from '../core/types';
import type { DogAction } from '../entities/Dog';
import type { Simulation } from '../sim/Simulation';
import { COL, quad, smoothClosed, star4, type P2 } from './draw';
import { Pen, clipPoly, ellPts } from './dogPen';
import { BLEND_RATE, basePose, groupOf, mixLayers, type Ctx, type Layer, type Pose } from './dogPose';

const TAU = Math.PI * 2;

// ---- palette (the same plum outline as the rest of the art)
const OUT = COL.outline;
const WHITE = 0xfffaf5;
const CREAM = 0xf1e6dd;
const FAR = 0xf0e5dc;
const SPOT = 0x3a3340;
const EAR_IN = 0x66557a;
const EYE = 0x3f9a5c;
const BLUSH = 0xf3b8b0;
const COLLAR = 0xe6947d;
const COLLAR_HI = 0xf4b9a6;
const GOLD = 0xf1c46c;
const PAD = 0xf1a4a2;
const MOUTH_IN = 0x7d3a52;

/** slope of the stairs (rise over run), used to pitch the body while climbing */
const STAIR_SLOPE = (stairsYAt(STAIRS.footX) - stairsYAt(STAIRS.topX)) / (STAIRS.footX - STAIRS.topX);

interface Spring {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ready: boolean;
}
const newSpring = (): Spring => ({ x: 0, y: 0, vx: 0, vy: 0, ready: false });

/** Spot pattern on the body: along the spine from the hip centre (a), height above the spine (b), size. */
const BODY_SPOTS: [number, number, number, number][] = [
  [-16, 8.6, 4.3, 1], [-4.5, 11.2, 3.3, 2], [6.5, 10.4, 3.6, 3], [15, 7.6, 2.3, 4],
  [-7.5, 1.2, 5.2, 5], [3.2, 2.2, 3.4, 6], [11.5, -1.8, 2.3, 7], [-18.5, -1.5, 2.7, 8],
  [-1.5, -8.8, 2.6, 9], [9.5, -9.4, 2.0, 10]
];

/** a hand-made irregular round blob */
function blob(cx: number, cy: number, r: number, seed: number, stretch = 1.0): P2[] {
  const pts: P2[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + seed * 0.7;
    const k = 1 + 0.2 * Math.sin(seed * 3.1 + i * 2.3) + 0.12 * Math.cos(seed * 1.7 + i * 1.3);
    pts.push({ x: cx + Math.cos(a) * r * k * stretch, y: cy + Math.sin(a) * r * k });
  }
  return smoothClosed(pts, 3);
}

/** two-bone leg IK, returns the middle joint (bend = +1 knee forward, -1 elbow backward) */
function ik(a: P2, f: P2, l1: number, l2: number, bend: number): { k: P2; e: P2 } {
  let dx = f.x - a.x;
  let dy = f.y - a.y;
  let d = Math.hypot(dx, dy) || 0.001;
  const maxD = l1 + l2 - 0.05;
  let e = f;
  if (d > maxD) {
    dx = (dx / d) * maxD;
    dy = (dy / d) * maxD;
    d = maxD;
    e = { x: a.x + dx, y: a.y + dy };
  }
  const aa = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
  const mx = a.x + (dx * aa) / d;
  const my = a.y + (dy * aa) / d;
  return { k: { x: mx + bend * (dy / d) * h, y: my - bend * (dx / d) * h }, e };
}

const wrapPi = (a: number): number => {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
};

interface Face {
  open: number;
  smile: number;
  lid: number;
  tilt: number;
  brow: number;
  lookX: number;
  lookY: number;
  sparkle: number;
}

/**
 * Draws the dalmatian puppy from `sim.dog` (position, facing, action, speed, lift, carrying, excitement).
 * The brain decides WHAT he does (`dog.action`), this class decides how it LOOKS: a pose-parameter system (see dogPose.ts)
 * cross-fades per-action procedural poses; ears, tail and the collar tag are simple springs on top.
 */
export class DogView {
  /** Head and mouth in world space (for effects and thought bubbles). */
  readonly world: { head: Vec2; mouth: Vec2 } = { head: { x: 0, y: 0 }, mouth: { x: 0, y: 0 } };
  private g: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Graphics;
  private zs: Phaser.GameObjects.Text[] = [];
  private pen = new Pen();
  private layers: Layer[] = [];
  private serial = -1;
  private lastAction: DogAction = 'stand';
  private pose: Pose = basePose();
  private time = 0;
  private gait = 0;
  private prevX = NaN;
  private facingScale = 1;
  private pitch = 0;
  private wag = 0;
  private wCarry = 0;
  private blinkAt = 2;
  private blinkT = 9;
  private glanceAt = 3;
  private glance = 0;
  private glanceTarget = 0;
  private flickAt = 5;
  private carleyDir = 0;
  private carleyNear = 0;
  private prevLift = 0;
  private lastLiftV = 0;
  private sq = 0;
  private sqV = 0;
  private earN = newSpring();
  private earF = newSpring();
  private tag = newSpring();

  constructor(scene: Phaser.Scene, depth = 47) {
    this.shadow = scene.add.graphics().setDepth(depth - 1);
    this.g = scene.add.graphics().setDepth(depth);
    for (let i = 0; i < 3; i++) {
      const t = scene.add
        .text(0, 0, 'Z', { fontFamily: '"Trebuchet MS", Arial, sans-serif', fontSize: `${13 + i * 3}px`, fontStyle: 'bold', color: '#ffffff', stroke: '#8ba1d9', strokeThickness: 4 })
        .setOrigin(0.5)
        .setAlpha(0)
        .setDepth(depth + 2);
      this.zs.push(t);
    }
  }

  update(dtRaw: number, sim: Simulation): void {
    const dt = clamp(dtRaw, 0, 0.1);
    const d = sim.dog;
    this.time += dt;

    this.updateLayers(d.action, d.actionSerial, dt);
    this.updateIdle(dt, sim);

    // distance-based gait phase so paws never slide
    const dx = Number.isNaN(this.prevX) ? 0 : d.x - this.prevX;
    this.prevX = d.x;
    const sp = d.speed;
    const trot = smoothstep(80, 115, sp);
    const run = smoothstep(160, 215, sp);
    this.gait += Math.abs(dx) / lerp(lerp(30, 40, trot), 82, run);
    if (this.gait > 1000) this.gait -= 1000;

    const ctx: Omit<Ctx, 't'> = {
      exc: d.excitement, speed: sp, gait: this.gait, lift: d.lift, liftV: d.liftV,
      glance: this.glance, carleyDir: this.carleyDir, carleyNear: this.carleyNear
    };
    const p = this.pose;
    mixLayers(this.layers, ctx, p);

    // ---- landing / take-off squash spring
    if (this.prevLift > 1 && d.lift <= 0.01) this.sqV += 9 + Math.abs(this.lastLiftV) * 0.012;
    if (this.prevLift <= 0.01 && d.lift > 1) this.sqV -= 6;
    this.prevLift = d.lift;
    this.lastLiftV = d.liftV;
    const steps = Math.max(1, Math.ceil(dt / (1 / 90)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.sqV += (-420 * this.sq - 20 * this.sqV) * h;
      this.sq += this.sqV * h;
    }
    this.sq = clamp(this.sq, -0.22, 0.3);

    // ---- carrying the ball
    this.wCarry = approach(this.wCarry, d.carrying ? 1 : 0, 9, dt);
    const wc = this.wCarry;
    p.mouth = lerp(p.mouth, 0.3, wc);
    p.tongue = lerp(p.tongue, 0, wc);
    p.hdRot = lerp(p.hdRot, -0.1, wc);
    p.smile = lerp(p.smile, 0, wc * 0.6);

    // ---- breathing and blinking
    const br = Math.sin(TAU * p.breathHz * this.time) * p.breath;
    p.hipR *= 1 + br;
    p.shR *= 1 + br;
    p.shY -= br * 5;
    p.hdY -= br * 5;
    const blink = this.blinkT < 0.16 ? Math.sin((this.blinkT / 0.16) * Math.PI) : 0;
    const panting = p.pant > 0.01 ? Math.sin(TAU * 5.5 * this.time) * p.pant : 0;
    p.mouth = clamp(p.mouth + 0.16 * panting * (p.mouth > 0.02 ? 1 : 0.4), 0, 1);

    // ---- wag phase accumulates so frequency changes never jump the tail
    this.wag += TAU * p.tailHz * dt;

    // ---- facing (a quick narrowing instead of a hard flip) and stairs pitch
    this.facingScale = approach(this.facingScale, d.facing, 16, dt);
    const fs = this.facingScale;
    const shown = (fs < 0 ? -1 : 1) * (0.88 + 0.12 * Math.min(1, Math.abs(fs)));
    const stairs = d.plane === 'stairs';
    const pitchTarget = stairs ? d.facing * Math.atan(STAIR_SLOPE) * 0.85 : 0;
    this.pitch = approach(this.pitch, pitchTarget, 7, dt);

    this.drawShadow(d.x, d.y, d.lift - Math.min(0, p.oy), stairs, p, d.facing);
    this.draw(sim, dt, shown * p.xs, br, blink);
    this.updateZs();
  }

  // ------------------------------------------------------------------ state

  private updateLayers(action: DogAction, serial: number, dt: number): void {
    const grp = groupOf(action);
    const newest = this.layers[this.layers.length - 1];
    if (!newest) {
      this.layers.push({ g: grp, t: 0, w: 1 });
      this.serial = serial;
      this.lastAction = action;
    } else if (serial !== this.serial) {
      if (newest.g !== grp || action === this.lastAction) this.layers.push({ g: grp, t: 0, w: 0 });
      this.serial = serial;
      this.lastAction = action;
    }
    const cur = this.layers[this.layers.length - 1];
    const k = 1 - Math.exp(-BLEND_RATE[cur.g] * dt);
    for (const l of this.layers) {
      l.t += dt;
      l.w += ((l === cur ? 1 : 0) - l.w) * k;
    }
    for (let i = this.layers.length - 2; i >= 0; i--) if (this.layers[i].w < 0.003) this.layers.splice(i, 1);
    while (this.layers.length > 5) this.layers.shift();
  }

  private updateIdle(dt: number, sim: Simulation): void {
    const t = this.time;
    if (t > this.blinkAt) {
      this.blinkT = 0;
      this.blinkAt = t + 2.2 + Math.random() * 3.4;
      if (Math.random() < 0.18) this.blinkAt = t + 0.35;
    }
    this.blinkT += dt;
    if (t > this.glanceAt) {
      this.glanceTarget = Math.random() < 0.45 ? 0 : (Math.random() < 0.5 ? -1 : 1);
      this.glanceAt = t + 2.5 + Math.random() * 4.5;
    }
    this.glance = approach(this.glance, this.glanceTarget, 5, dt);
    if (t > this.flickAt) {
      this.flickAt = t + 5 + Math.random() * 7;
      const s = Math.random() < 0.5 ? this.earN : this.earF;
      s.vy -= 160;
      s.vx -= 90;
    }
    // where is Carley? (dogs love looking at their person)
    const a = sim.agent;
    const d = sim.dog;
    const rel = (a.x - d.x) * d.facing;
    const near = Math.abs(a.y - d.y) < 160 ? 1 - smoothstep(220, 480, Math.abs(a.x - d.x)) : 0;
    this.carleyDir = approach(this.carleyDir, clamp(rel / 70, -1, 1), 4, dt);
    this.carleyNear = approach(this.carleyNear, near, 3, dt);
  }

  private updateZs(): void {
    let sleeping = 0;
    for (const l of this.layers) if (l.g === 'sleep') sleeping = l.w;
    const head = this.world.head;
    for (let i = 0; i < this.zs.length; i++) {
      const z = this.zs[i];
      if (sleeping < 0.6) {
        z.setAlpha(approach(z.alpha, 0, 8, 0.016));
        continue;
      }
      const t = (this.time * 0.4 + i / this.zs.length) % 1;
      z.setPosition(head.x + 16 + t * 24 + Math.sin(t * 6 + i) * 4, head.y - 22 - t * 46);
      z.setAlpha(Math.sin(t * Math.PI) * 0.95 * clamp((sleeping - 0.6) / 0.3, 0, 1));
      z.setScale(0.7 + t * 0.7);
    }
  }

  private drawShadow(x: number, y: number, height: number, stairs: boolean, p: Pose, facing: number): void {
    const s = this.shadow;
    s.clear();
    const k = 1 / (1 + Math.max(0, height) / 60);
    const w = p.shadowW * (0.55 + 0.45 * k);
    const pts = ellPts(x + p.shadowX * facing, y + 1, w / 2, 4.6 * (0.7 + 0.3 * k), stairs ? Math.atan(STAIR_SLOPE) * 0.9 : 0, 24);
    s.fillStyle(0x2f363f, 0.18 * k);
    s.fillPoints(pts as Phaser.Types.Math.Vector2Like[], true, true);
  }

  // ------------------------------------------------------------------ drawing

  private draw(sim: Simulation, dt: number, xscale: number, _br: number, blink: number): void {
    const d = sim.dog;
    const p = this.pose;
    const pen = this.pen;
    const g = this.g;
    g.clear();
    pen.begin(g);
    pen.translate(d.x, d.y - d.lift);
    pen.scale(xscale, 1);
    pen.rotate(this.pitch + p.rot);
    pen.scale(p.sx * (1 + this.sq * 0.7), p.sy * (1 - this.sq));
    pen.translate(p.ox, p.oy);

    const H: P2 = { x: p.hipX, y: p.hipY };
    const S: P2 = { x: p.shX, y: p.shY };
    const ax = S.x - H.x;
    const ay = S.y - H.y;
    const len = Math.hypot(ax, ay) || 1;
    const u: P2 = { x: ax / len, y: ay / len };
    const n: P2 = { x: u.y, y: -u.x };
    const at = (c: P2, a: number, b: number): P2 => ({ x: c.x + u.x * a + n.x * b, y: c.y + u.y * a + n.y * b });
    const py = (H.y + S.y) / 2;
    const flip = p.flipY;
    const mapF = (q: P2): P2 => ({ x: q.x, y: py + flip * (q.y - py) });

    // head centre: natural, or glued to the ball while carrying
    const hn = mapF(S);
    let hc: P2 = { x: hn.x + p.hdX, y: hn.y + p.hdY };
    const HOLD = { x: 16.2, y: 16.5 };
    if (this.wCarry > 0.002) {
      const m = d.mouthPos();
      const ball = { x: m.x - d.facing * 2, y: m.y + 2 };
      const bl = pen.inv(ball);
      const cr = Math.cos(p.hdRot);
      const sr = Math.sin(p.hdRot);
      const carry: P2 = { x: bl.x - (HOLD.x * cr - HOLD.y * sr), y: bl.y - (HOLD.x * sr + HOLD.y * cr) };
      hc = { x: lerp(hc.x, carry.x, this.wCarry), y: lerp(hc.y, carry.y, this.wCarry) };
    }

    // ---- tail root & springs need world data before drawing
    const rootT = mapF(at(H, -p.hipR * 0.86, p.hipR * 0.3));

    // ============ far legs
    pen.save();
    pen.translate(0, py);
    pen.scale(1, flip);
    pen.translate(0, -py);
    const Af = at(S, p.shR * 0.15, -p.shR * 0.42);
    const Ah = at(H, p.hipR * 0.05, -p.hipR * 0.3);
    const farF = { x: Af.x + u.x * 3.5, y: Af.y + u.y * 3.5 };
    const farH = { x: Ah.x + u.x * 3, y: Ah.y + u.y * 3 };
    this.leg(pen, farF, { x: p.ffx, y: p.ffy }, p.ffa, false, true, p.pads, false);
    this.leg(pen, farH, { x: p.fhx, y: p.fhy }, p.fha, true, true, p.pads, false);
    pen.restore();

    // ============ tail (behind the body)
    this.tail(pen, rootT, flip, p);

    // ============ body
    pen.save();
    pen.translate(0, py);
    pen.scale(1, flip);
    pen.translate(0, -py);
    this.body(pen, H, S, n, p, at);

    // ============ near legs (and chest)
    this.leg(pen, Ah, { x: p.nhx, y: p.nhy }, p.nha, true, false, p.pads, true);
    if (p.pawsOver < 0.5) this.leg(pen, Af, { x: p.nfx, y: p.nfy }, p.nfa, false, false, p.pads, false);

    // ============ collar
    const dirv = { x: hc.x - S.x, y: hc.y - S.y };
    const dl = Math.hypot(dirv.x, dirv.y) || 1;
    const v: P2 = { x: dirv.x / dl, y: dirv.y / dl };
    const nrm: P2 = { x: v.y, y: -v.x };
    const cc: P2 = { x: S.x + u.x * p.shR * 0.12, y: S.y + u.y * p.shR * 0.12 };
    const rc = p.shR * 0.96;
    const tp: P2 = { x: cc.x + nrm.x * rc, y: cc.y + nrm.y * rc };
    const bp: P2 = { x: cc.x - nrm.x * rc, y: cc.y - nrm.y * rc };
    const ctrl: P2 = { x: cc.x + v.x * p.shR * 0.6, y: cc.y + v.y * p.shR * 0.6 };
    const band = quad(tp, ctrl, bp, 12);
    pen.stroke(band, 6.2, OUT);
    pen.stroke(band, 3.6, COLLAR);
    pen.stroke(band.map((q) => ({ x: q.x + nrm.x * 0.9, y: q.y + nrm.y * 0.9 })).slice(1, 8), 1.1, COLLAR_HI, 0.8);
    const anchor = pen.pt(bp.x, bp.y);
    pen.restore();

    this.tagStep(anchor, dt);
    this.drawTag(anchor);

    // ============ head
    this.head(pen, hc, d.facing, p, blink, dt, sim);

    // front paws curled over the chest (beg) / under the chin (sleep) go in front of the head
    if (p.pawsOver >= 0.5) {
      pen.save();
      pen.translate(0, py);
      pen.scale(1, flip);
      pen.translate(0, -py);
      this.leg(pen, Af, { x: p.nfx, y: p.nfy }, p.nfa, false, false, p.pads, false);
      pen.restore();
    }
  }

  // ---- legs
  private leg(pen: Pen, A: P2, foot: P2, pawA: number, hind: boolean, far: boolean, pads: number, haunch: boolean): void {
    const fill = far ? FAR : WHITE;
    const l1 = hind ? 11 : 10.5;
    const l2 = hind ? 11 : 10.5;
    const cs = Math.cos(pawA);
    const sn = Math.sin(pawA);
    const target: P2 = { x: foot.x + sn * 3.2, y: foot.y - cs * 3.2 };
    const { k, e } = ik(A, target, l1, l2, hind ? 1 : -1);
    const wU = hind ? 7.2 : 8.2;
    const wL = hind ? 6.2 : 7.2;
    pen.tube([A, k, e], [wU, wU, wL], fill, OUT, 1.8);
    // paw
    const shin = Math.atan2(e.y - k.y, e.x - k.x);
    const ang = shin - Math.PI / 2 + pawA;
    pen.save();
    pen.translate(e.x, e.y);
    pen.rotate(ang);
    const padsOn = pads > 0.5;
    const rx = padsOn ? 5.0 : 5.7;
    const ry = padsOn ? 4.6 : 3.4;
    pen.ell(padsOn ? 0.4 : 0.9, 0, rx, ry, 0, fill, OUT, 1.8, 1, 18);
    if (padsOn) {
      pen.ell(-0.2, 1.3, 2.5, 1.9, 0, PAD, null);
      pen.ell(-2.6, -1.6, 1.15, 1.35, 0.4, PAD, null);
      pen.ell(0.2, -2.5, 1.15, 1.35, 0, PAD, null);
      pen.ell(2.9, -1.4, 1.15, 1.35, -0.4, PAD, null);
    } else {
      // little toe lines
      pen.stroke([{ x: 2.7, y: -2.4 }, { x: 3.3, y: -0.3 }], 1.2, 0xc9b9bd, 0.9);
      pen.stroke([{ x: 4.6, y: -1.6 }, { x: 4.9, y: 0.2 }], 1.2, 0xc9b9bd, 0.9);
    }
    pen.restore();
    if (haunch) {
      // round thigh over the top of the hind leg
      const dx = k.x - A.x;
      const dy = k.y - A.y;
      const ll = Math.hypot(dx, dy) || 1;
      const ang2 = Math.atan2(dy, dx);
      const cx = A.x + dx * 0.4;
      const cy = A.y + dy * 0.4;
      const th = pen.ell(cx, cy, ll * 0.5 + 5.2, 7.9, ang2, WHITE, null, 0, 1, 22);
      this.haunchSpot(pen, th, cx, cy, ang2, ll);
      pen.outline(th, OUT, 2);
    }
  }

  private haunchSpot(pen: Pen, clip: P2[], cx: number, cy: number, ang: number, ll: number): void {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const sp = (a: number, b: number, r: number, seed: number): void => {
      pen.clipped(blob(cx + c * a - s * b, cy + s * a + c * b, r, seed), clip, SPOT);
    };
    sp(-ll * 0.15, -2.2, 3.6, 11);
    sp(ll * 0.3 + 2, 3.8, 2.2, 12);
  }

  // ---- body
  private body(pen: Pen, H: P2, S: P2, n: P2, p: Pose, at: (c: P2, a: number, b: number) => P2): void {
    const hr = p.hipR;
    const sr = p.shR;
    const mid: P2 = { x: (H.x + S.x) / 2, y: (H.y + S.y) / 2 };
    const avg = (hr + sr) / 2;
    const pts: P2[] = [
      at(H, -hr, 0), at(H, -hr * 0.72, hr * 0.74), at(H, 0, hr), at(mid, 0, avg + p.arch), at(S, 0, sr),
      at(S, sr * 0.78, sr * 0.66), at(S, sr, 0), at(S, sr * 0.74, -sr * 0.72), at(S, 0, -sr),
      at(mid, 0, -(avg + p.sag)), at(H, 0, -hr), at(H, -hr * 0.74, -hr * 0.7)
    ];
    const sm = smoothClosed(pts, 4);
    const w = pen.poly(sm, WHITE, null);
    // soft cream belly shading
    const shade: P2[] = [];
    const lowEdge: P2[] = [];
    const N = 7;
    for (let i = 0; i <= N; i++) {
      const t = -0.25 + (1.5 * i) / N;
      const c: P2 = { x: H.x + (S.x - H.x) * t, y: H.y + (S.y - H.y) * t };
      const r = lerp(hr, sr, clamp(t, 0, 1));
      const sag = p.sag * Math.sin(Math.PI * clamp(t, 0, 1));
      shade.push({ x: c.x - n.x * (r * 0.5 - sag * 0.3), y: c.y - n.y * (r * 0.5 - sag * 0.3) });
      lowEdge.push({ x: c.x - n.x * (r + 12), y: c.y - n.y * (r + 12) });
    }
    pen.clipped(smoothClosed([...shade, ...lowEdge.reverse()], 3), w, CREAM);
    // spots stay glued to the body
    for (const [a, b, r, seed] of BODY_SPOTS) pen.clipped(blob(...ptXY(at(H, a, b)), r, seed), w, SPOT);
    pen.outline(w, OUT, 2.3);
  }

  // ---- tail
  private tail(pen: Pen, root: P2, flip: number, p: Pose): void {
    const N = 7;
    const seg = 3.3;
    const amp = p.tailAmp;
    const blur = clamp((amp * p.tailHz) / 6, 0, 1);
    const build = (off: number): P2[] => {
      const pts: P2[] = [{ x: root.x, y: root.y }];
      let cur = { x: root.x, y: root.y };
      for (let i = 0; i < N; i++) {
        const s = i / (N - 1);
        const a = p.tailA + p.tailCurl * s * 1.2 + off + amp * Math.sin(this.wag - i * 0.5) * (0.3 + 0.7 * s);
        cur = { x: cur.x + Math.cos(a) * seg, y: cur.y + Math.sin(a) * seg * flip };
        if (p.tailFloor > 0.01) cur.y = Math.min(cur.y, lerp(cur.y, -2, p.tailFloor));
        pts.push(cur);
      }
      return pts;
    };
    if (blur > 0.35) {
      for (const off of [-amp * 0.75, amp * 0.75]) {
        const ghost = build(off);
        pen.stroke(ghost, 5.6, OUT, 0.13 * blur);
        pen.stroke(ghost, 3.2, WHITE, 0.3 * blur);
      }
    }
    const pts = build(0);
    const ws = pts.map((_, i) => lerp(5.6, 2.6, i / (pts.length - 1)));
    pen.tube(pts, ws, WHITE, OUT, 1.8);
    // black tip
    const tip = pts.slice(-3);
    pen.tube(tip, [3.4, 3.0, 2.6], SPOT, SPOT, 0.1);
    pen.dot(pts[2].x, pts[2].y, 1.5, SPOT);
  }

  // ---- collar tag
  private tagStep(anchor: P2, dt: number): void {
    const s = this.tag;
    const rest = { x: anchor.x, y: anchor.y + 4.6 };
    if (!s.ready || Math.hypot(s.x - rest.x, s.y - rest.y) > 40) {
      s.x = rest.x;
      s.y = rest.y;
      s.vx = 0;
      s.vy = 0;
      s.ready = true;
    }
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      s.vx += (300 * (rest.x - s.x) - 11 * s.vx) * h;
      s.vy += (300 * (rest.y - s.y) - 11 * s.vy) * h;
      s.x += s.vx * h;
      s.y += s.vy * h;
    }
    const dx = s.x - anchor.x;
    const dy = s.y - anchor.y;
    const dd = Math.hypot(dx, dy);
    if (dd > 8) {
      s.x = anchor.x + (dx / dd) * 8;
      s.y = anchor.y + (dy / dd) * 8;
    }
  }

  private drawTag(anchor: P2): void {
    const g = this.g;
    const s = this.tag;
    const ang = Math.atan2(s.y - anchor.y, s.x - anchor.x) - Math.PI / 2;
    g.lineStyle(1.3, OUT, 1);
    g.beginPath();
    g.moveTo(anchor.x, anchor.y);
    g.lineTo(s.x, s.y);
    g.strokePath();
    const heart: P2[] = [];
    for (let i = 0; i < 18; i++) {
      const t = (i / 18) * TAU;
      const hx = 16 * Math.pow(Math.sin(t), 3);
      const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const x = hx * 0.34;
      const y = hy * 0.34 + 1.2;
      heart.push({ x: s.x + x * Math.cos(ang) - y * Math.sin(ang), y: s.y + x * Math.sin(ang) + y * Math.cos(ang) });
    }
    g.fillStyle(GOLD, 1);
    g.fillPoints(heart as Phaser.Types.Math.Vector2Like[], true, true);
    g.lineStyle(1.4, OUT, 1);
    g.strokePoints(heart as Phaser.Types.Math.Vector2Like[], true, true);
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(s.x - 1.2 * Math.cos(ang) + 0.2, s.y - 0.5, 0.8);
  }

  // ---- head
  private head(pen: Pen, hc: P2, facing: number, p: Pose, blink: number, dt: number, sim: Simulation): void {
    pen.save();
    pen.translate(hc.x, hc.y);
    pen.rotate(p.hdRot);
    pen.scale(p.hdSx, 1);

    const rootN: P2 = { x: -6.2, y: -9.6 };
    const rootF: P2 = { x: 7.2, y: -11.6 };
    this.earSprings(pen, rootN, rootF, p, dt);
    const phiN = p.earA + this.earDelta.n;
    const phiF = p.earB + this.earDelta.f;

    // far ear first (behind the skull)
    this.ear(pen, rootF, phiF, p.earBendB, 15, 9.8, true);

    // ---- jaw / mouth interior / tongue (behind the muzzle)
    const m = clamp(p.mouth, 0, 1);
    const jawA = m * 0.72;
    const hinge: P2 = { x: 6.5, y: 8.4 };
    const skull = ellPts(0, 0, 15.4, 14.2, 0, 30);
    const muzzle = ellPts(11.6, 6.6, 8.4, 5.8, 0.08, 22);
    pen.save();
    pen.translate(hinge.x, hinge.y);
    pen.rotate(jawA);
    pen.translate(-hinge.x, -hinge.y);
    const jawW = pen.ell(11.4, 10.0, 6.6, 3.1, 0, WHITE, OUT, 1.9, 1, 16);
    void jawW;
    if (m > 0.04) {
      // dark interior sits on the jaw
      pen.ell(11.8, 8.9, 5.8, 1.8 + m * 1.5, 0, MOUTH_IN, null, 0, 1, 16);
    }
    // tongue
    const tg = p.tongue;
    if (tg > 0.04 && m > 0.04) {
      const tl = 2.4 + tg * 2.8;
      pen.ell(12.5, 10.6 + tl * 0.3, 3.3, tl, 0.0, COL.tongue, 0x9a5568, 1.3, 1, 14);
      pen.stroke([{ x: 12.5, y: 9.6 }, { x: 12.5, y: 10.2 + tl * 0.8 }], 1.0, 0xcf7f84, 0.8);
    }
    if (p.tcurl > 0.05 && m > 0.2) {
      pen.ell(13.5, 9.6, 3.4 * p.tcurl, 2.8 * p.tcurl, -0.5, COL.tongue, 0x9a5568, 1.2, 1, 12);
    }
    pen.restore();

    // ---- skull + muzzle as one outlined silhouette
    const [skW] = pen.merged([skull, muzzle], WHITE, OUT, 2.2);
    // spots on the head
    pen.clipped(blob(-3.6, -11.2, 3.7, 21), skW, SPOT);
    pen.clipped(blob(-10.5, 4.2, 2.3, 22), skW, SPOT);
    pen.clipped(blob(5.6, -12.6, 1.8, 23), skW, SPOT);

    // blush
    pen.ell(-1.6, 7.6, 4.3, 2.8, 0, BLUSH, null, 0, 0.3 + 0.35 * p.cheek);
    pen.ell(15.5, 9.6, 2.4, 1.6, 0, BLUSH, null, 0, 0.0 + 0.2 * p.cheek);

    // eyes (far first)
    const face: Face = {
      open: p.eyeOpen * (1 - blink), smile: p.smile, lid: p.lid, tilt: p.lidTilt, brow: p.brow,
      lookX: p.lookX, lookY: p.lookY, sparkle: p.sparkle
    };
    this.eye(pen, 11.9, -2.5, 3.7, 4.8, face, 1);
    this.eye(pen, 1.9, -1.7, 4.5, 5.7, face, -1);

    // nose
    pen.ell(19.4, 3.8, 3.7, 2.8, 0.22, 0x2e2830, OUT, 1.2, 1, 14);
    pen.ell(18.3, 2.8, 1.35, 0.7, 0.22, 0xffffff, null, 0, 0.85, 10);
    // whisker dots
    pen.dot(14.2, 7.0, 0.65, 0x7b668f, 0.7);
    pen.dot(16.2, 6.0, 0.65, 0x7b668f, 0.7);
    pen.dot(12.4, 5.5, 0.6, 0x7b668f, 0.6);

    // mouth line (fades while the jaw opens)
    const closed = 1 - clamp(m * 5, 0, 1);
    if (closed > 0.02) {
      const gr = p.grin;
      const cy = 9.6 - 1.6 * gr;
      const line: P2[] = [{ x: 19.0, y: 6.4 }, { x: 18.5, y: 8.3 }, ...quad({ x: 18.5, y: 8.3 }, { x: 14.8, y: 10.5 + 1.0 * gr }, { x: 10.8, y: cy }, 8).slice(1)];
      pen.stroke(line, 1.7, 0x5a3a52, closed);
      if (gr > 0.2) pen.stroke([{ x: 10.3, y: cy - 1.4 }, { x: 10.9, y: cy + 0.9 }], 1.4, 0x5a3a52, closed * 0.8);
    }

    // brows (worried)
    if (p.brow > 0.1) {
      pen.stroke(quad({ x: -2.6, y: -9.6 }, { x: 1.2, y: -10.8 }, { x: 5.2, y: -9.0 }, 5), 1.6, 0x6b5584, p.brow * 0.85);
      pen.stroke(quad({ x: 9.4, y: -9.4 }, { x: 12.0, y: -10.8 }, { x: 15.2, y: -9.4 }, 5), 1.6, 0x6b5584, p.brow * 0.85);
    }

    // near ear last (in front of the cheek)
    this.ear(pen, rootN, phiN, p.earBendA, 17.5, 11, false);

    // bark "ruff" lines
    if (p.puff > 0.04) {
      const e = p.puff;
      for (let i = 0; i < 3; i++) {
        const r = 8 + i * 5.5 + (1 - e) * 4;
        const a0 = -0.55 - 0.05 * i;
        const a1 = 0.55 + 0.05 * i;
        const arc: P2[] = [];
        for (let j = 0; j <= 6; j++) {
          const a = lerp(a0, a1, j / 6);
          arc.push({ x: 20 + Math.cos(a) * r, y: 7 + Math.sin(a) * r * 0.9 - 1 });
        }
        pen.stroke(arc, 2.0, 0x8a739f, e * (1 - i * 0.22));
      }
      pen.dot(34 + (1 - e) * 4, 0, 1.5, 0x8a739f, e);
      pen.dot(33 + (1 - e) * 4, 13, 1.2, 0x8a739f, e * 0.8);
    }

    // world positions of head and mouth (hold point while carrying)
    const wh = pen.pt(0, 0);
    const wm = pen.pt(16, 9.5);
    this.world.head.x = wh.x;
    this.world.head.y = wh.y;
    this.world.mouth.x = wm.x;
    this.world.mouth.y = wm.y;
    pen.restore();
    void facing;
    void sim;
  }

  private earDelta = { n: 0, f: 0 };

  /** ears are floppy: their tips trail the head with a spring in world space */
  private earSprings(pen: Pen, rootN: P2, rootF: P2, p: Pose, dt: number): void {
    const run = (s: Spring, root: P2, phi: number, L: number): number => {
      const rest = pen.pt(root.x - Math.sin(phi) * L, root.y + Math.cos(phi) * L);
      if (!s.ready || Math.hypot(s.x - rest.x, s.y - rest.y) > 60) {
        s.x = rest.x;
        s.y = rest.y;
        s.vx = 0;
        s.vy = 0;
        s.ready = true;
      }
      const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        s.vx += (420 * (rest.x - s.x) - 17 * s.vx) * h;
        s.vy += (420 * (rest.y - s.y) - 17 * s.vy) * h;
        s.x += s.vx * h;
        s.y += s.vy * h;
      }
      const loc = pen.inv({ x: s.x, y: s.y });
      const vx = loc.x - root.x;
      const vy = loc.y - root.y;
      return clamp(wrapPi(Math.atan2(-vx, vy) - phi), -1.4, 1.4);
    };
    this.earDelta.n = run(this.earN, rootN, p.earA, 13);
    this.earDelta.f = run(this.earF, rootF, p.earB, 12);
  }

  private ear(pen: Pen, root: P2, phi: number, bend: number, L: number, W: number, far: boolean): void {
    const N = 7;
    const left: P2[] = [];
    const right: P2[] = [];
    const inL: P2[] = [];
    const inR: P2[] = [];
    let cur = { x: root.x, y: root.y };
    let lastN: P2 = { x: 1, y: 0 };
    let lastD: P2 = { x: 0, y: 1 };
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      const a = phi + bend * s;
      const dir: P2 = { x: -Math.sin(a), y: Math.cos(a) };
      const nn: P2 = { x: Math.cos(a), y: Math.sin(a) };
      if (i > 0) cur = { x: cur.x + dir.x * (L / N), y: cur.y + dir.y * (L / N) };
      const hw = (W / 2) * (0.64 + 0.36 * Math.sin(Math.PI * clamp(s * 1.12, 0, 1))) * (1 - 0.3 * s * s * s);
      left.push({ x: cur.x + nn.x * hw, y: cur.y + nn.y * hw });
      right.push({ x: cur.x - nn.x * hw, y: cur.y - nn.y * hw });
      if (s > 0.08 && s < 0.86) {
        inL.push({ x: cur.x + nn.x * hw * 0.52, y: cur.y + nn.y * hw * 0.52 });
        inR.push({ x: cur.x - nn.x * hw * 0.52, y: cur.y - nn.y * hw * 0.52 });
      }
      lastN = nn;
      lastD = dir;
    }
    void lastN;
    const cap: P2 = { x: cur.x + lastD.x * (W * 0.32), y: cur.y + lastD.y * (W * 0.32) };
    const poly = smoothClosed([...left, cap, ...right.reverse()], 3);
    pen.poly(poly, SPOT, OUT, 2);
    if (inL.length > 2) {
      const inner = smoothClosed([...inL, ...inR.reverse()], 3);
      pen.poly(inner, far ? 0x54456a : EAR_IN, null, 0, 0.9);
    }
    // gloss
    const hi = left.slice(1, 5).map((q, i) => ({ x: q.x - (left[i + 1].x - right[i + 1].x) * 0.12, y: q.y - (left[i + 1].y - right[i + 1].y) * 0.12 }));
    pen.stroke(hi, 1.3, 0x9484a6, 0.55);
  }

  // ---- eye
  private eye(pen: Pen, cx: number, cy: number, rx: number, ry: number, f: Face, side: number): void {
    const LASH = 0x2d1f2c;
    if (f.smile > 0.55 || f.open < 0.17) {
      const happy = f.smile > 0.55;
      if (happy) {
        pen.stroke(quad({ x: cx - rx * 1.05, y: cy + 1.8 }, { x: cx, y: cy - 5.4 }, { x: cx + rx * 1.05, y: cy + 1.8 }, 8), 2.5, LASH);
      } else {
        pen.stroke(quad({ x: cx - rx * 1.05, y: cy - 0.4 }, { x: cx, y: cy + 4.2 }, { x: cx + rx * 1.05, y: cy - 0.4 }, 8), 2.4, LASH);
        pen.stroke([{ x: cx + side * -rx * 1.0, y: cy - 0.2 }, { x: cx + side * -rx * 1.5, y: cy - 1.6 }], 1.5, LASH);
      }
      return;
    }
    const ryy = ry * clamp(f.open, 0.17, 1);
    const eyeShape = ellPts(cx, cy, rx, ryy, 0, 20);
    // white of the eye, a thin green iris and a big round black pupil that follows his gaze
    const w = pen.poly(eyeShape, 0xffffff, null);
    const lx = f.lookX;
    const ly = f.lookY;
    const px = cx + lx * rx * 0.28;
    const py = cy + ly * ryy * 0.25 + ryy * 0.08;
    const pr = Math.min(rx, ryy) * 0.86;
    pen.clipped(ellPts(px, py, pr, pr, 0, 16), w, EYE, 1);
    pen.clipped(ellPts(px, py, pr * 0.68, pr * 0.68, 0, 14), w, 0x15101a, 1);
    // highlights
    pen.dot(px - pr * 0.3, py - pr * 0.34, pr * 0.34, 0xffffff, 1);
    pen.dot(px + pr * 0.32, py + pr * 0.3, pr * 0.15, 0xffffff, 0.9);
    if (f.sparkle > 0.6) {
      const q = pen.pt(px + pr * 0.5, py - pr * 0.5);
      star4(this.g, q.x, q.y, 1.7 + 0.5 * Math.sin(this.time * 5 + side), 0xffffff, clamp((f.sparkle - 0.6) * 2.5, 0, 1));
    }
    // lid (sleepy / sad)
    if (f.lid > 0.02) {
      const y0 = cy - ryy - 3;
      const yb = cy - ryy + 2 * ryy * f.lid;
      const sd = side;
      const drop = f.tilt * rx;
      const lidPoly: P2[] = [
        { x: cx - rx - 3, y: y0 }, { x: cx + rx + 3, y: y0 },
        { x: cx + rx + 3, y: yb + (sd > 0 ? drop : -drop) }, { x: cx - rx - 3, y: yb + (sd > 0 ? -drop : drop) }
      ];
      const clipW = clipPoly(pen.world(lidPoly), w);
      if (clipW.length > 2) {
        pen.g.fillStyle(WHITE, 1);
        pen.g.fillPoints(clipW as Phaser.Types.Math.Vector2Like[], true, true);
      }
    }
    // upper lash line
    const top: P2[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI + (i / 10) * Math.PI;
      top.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ryy });
    }
    pen.stroke(top, 1.9, LASH);
  }

  destroy(): void {
    this.g.destroy();
    this.shadow.destroy();
    for (const z of this.zs) z.destroy();
  }
}

const ptXY = (p: P2): [number, number] => [p.x, p.y];

