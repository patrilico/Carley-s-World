import type Phaser from 'phaser';
import type { P2 } from './draw';

type G = Phaser.GameObjects.Graphics;
type V2L = Phaser.Types.Math.Vector2Like;

/** Points of an ellipse (centre, radii, rotation) as a closed polygon. */
export function ellPts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 22): P2[] {
  const out: P2[] = [];
  const cs = Math.cos(rot);
  const sn = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    out.push({ x: cx + x * cs - y * sn, y: cy + x * sn + y * cs });
  }
  return out;
}

/** Sutherland-Hodgman clip of `subject` against a (near-)convex `clip` polygon. */
export function clipPoly(subject: P2[], clip: P2[]): P2[] {
  let area = 0;
  for (let i = 0; i < clip.length; i++) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    area += a.x * b.y - b.x * a.y;
  }
  const sgn = area >= 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < clip.length; i++) {
    const A = clip[i];
    const B = clip[(i + 1) % clip.length];
    const side = (p: P2): number => sgn * ((B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x));
    const input = out;
    out = [];
    if (!input.length) break;
    let S = input[input.length - 1];
    let sS = side(S);
    for (const E of input) {
      const sE = side(E);
      if (sE >= 0) {
        if (sS < 0) out.push(cut(S, E, sS, sE));
        out.push(E);
      } else if (sS >= 0) out.push(cut(S, E, sS, sE));
      S = E;
      sS = sE;
    }
  }
  return out;
}

function cut(s: P2, e: P2, ss: number, se: number): P2 {
  const t = ss / (ss - se);
  return { x: s.x + (e.x - s.x) * t, y: s.y + (e.y - s.y) * t };
}

/**
 * A tiny immediate-mode "pen" over a Phaser Graphics: keeps its own affine matrix so every shape can be transformed on
 * the CPU (we need the world position of joints anyway) and so that shapes can be clipped (spots stay on the body).
 * Local coordinates: x forward, y down. Matrix: x' = a x + c y + e, y' = b x + d y + f.
 */
export class Pen {
  g!: G;
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  private stack: number[][] = [];

  begin(g: G): void {
    this.g = g;
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;
    this.stack.length = 0;
  }

  save(): void {
    this.stack.push([this.a, this.b, this.c, this.d, this.e, this.f]);
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) [this.a, this.b, this.c, this.d, this.e, this.f] = s as [number, number, number, number, number, number];
  }

  translate(x: number, y: number): void {
    this.e += this.a * x + this.c * y;
    this.f += this.b * x + this.d * y;
  }

  rotate(r: number): void {
    const cs = Math.cos(r);
    const sn = Math.sin(r);
    const a = this.a * cs + this.c * sn;
    const b = this.b * cs + this.d * sn;
    const c = -this.a * sn + this.c * cs;
    const d = -this.b * sn + this.d * cs;
    this.a = a;
    this.b = b;
    this.c = c;
    this.d = d;
  }

  scale(sx: number, sy: number): void {
    this.a *= sx;
    this.b *= sx;
    this.c *= sy;
    this.d *= sy;
  }

  pt(x: number, y: number): P2 {
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f };
  }

  /** world -> local */
  inv(p: P2): P2 {
    const det = this.a * this.d - this.b * this.c || 1e-6;
    const x = p.x - this.e;
    const y = p.y - this.f;
    return { x: (this.d * x - this.c * y) / det, y: (-this.b * x + this.a * y) / det };
  }

  /** transform a direction (no translation) */
  dir(x: number, y: number): P2 {
    return { x: this.a * x + this.c * y, y: this.b * x + this.d * y };
  }

  world(pts: P2[]): P2[] {
    const out: P2[] = new Array(pts.length);
    for (let i = 0; i < pts.length; i++) out[i] = this.pt(pts[i].x, pts[i].y);
    return out;
  }

  /** Filled (and optionally outlined) polygon. Returns the world polygon (for clipping spots against it). */
  poly(pts: P2[], fill: number | null, line: number | null, lw = 2, alpha = 1): P2[] {
    const w = this.world(pts);
    if (fill !== null) {
      this.g.fillStyle(fill, alpha);
      this.g.fillPoints(w as V2L[], true, true);
    }
    if (line !== null) this.outline(w, line, lw, alpha);
    return w;
  }

  outline(w: P2[], line: number, lw = 2, alpha = 1): void {
    this.g.lineStyle(lw, line, alpha);
    this.g.strokePoints(w as V2L[], true, true);
  }

  ell(cx: number, cy: number, rx: number, ry: number, rot: number, fill: number | null, line: number | null, lw = 2, alpha = 1, n = 22): P2[] {
    return this.poly(ellPts(cx, cy, rx, ry, rot, n), fill, line, lw, alpha);
  }

  /** Several overlapping shapes drawn as ONE outlined silhouette (no outline lines inside). */
  merged(shapes: P2[][], fill: number, line: number, lw: number): P2[][] {
    const ws = shapes.map((s) => this.world(s));
    this.g.lineStyle(lw * 2, line, 1);
    this.g.fillStyle(line, 1);
    for (const w of ws) {
      this.g.fillPoints(w as V2L[], true, true);
      this.g.strokePoints(w as V2L[], true, true);
    }
    this.g.fillStyle(fill, 1);
    for (const w of ws) this.g.fillPoints(w as V2L[], true, true);
    return ws;
  }

  /** A flat-coloured shape clipped to a world polygon (dalmatian spots, belly shading). */
  clipped(pts: P2[], clip: P2[], color: number, alpha = 1): void {
    const w = clipPoly(this.world(pts), clip);
    if (w.length < 3) return;
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(w as V2L[], true, true);
  }

  stroke(pts: P2[], w: number, color: number, alpha = 1): void {
    this.g.lineStyle(w, color, alpha);
    this.g.strokePoints(this.world(pts) as V2L[], false, false);
  }

  dot(x: number, y: number, r: number, color: number, alpha = 1): void {
    const p = this.pt(x, y);
    this.g.fillStyle(color, alpha);
    this.g.fillCircle(p.x, p.y, r);
  }

  /** Round-capped tube through the points with an outline that has no inner seams. */
  tube(pts: P2[], ws: number[], fill: number, line: number, ow: number): void {
    const w = this.world(pts);
    const g = this.g;
    for (let pass = 0; pass < 2; pass++) {
      const col = pass === 0 ? line : fill;
      const extra = pass === 0 ? ow * 2 : 0;
      g.fillStyle(col, 1);
      g.lineStyle(0, col, 1);
      for (let i = 0; i < w.length; i++) {
        g.fillCircle(w[i].x, w[i].y, ws[i] / 2 + extra / 2);
        if (i > 0) {
          const wd = (ws[i] + ws[i - 1]) / 2 + extra;
          g.lineStyle(wd, col, 1);
          g.beginPath();
          g.moveTo(w[i - 1].x, w[i - 1].y);
          g.lineTo(w[i].x, w[i].y);
          g.strokePath();
        }
      }
    }
  }
}
