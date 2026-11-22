import Phaser from 'phaser';
import { FLOOR_Y, WALL_OUTER_X, WORLD_H, WORLD_W, ZONE_SPLIT_X } from '../config/worldLayout';

export const OUT = '#6b5584';
export const OUT_SOFT = 'rgba(138,90,72,0.7)';

export type Ctx = CanvasRenderingContext2D;

export function canvas(scene: Phaser.Scene, key: string, w: number, h: number): Ctx {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  return tex!.getContext();
}

export function refresh(scene: Phaser.Scene, key: string): void {
  (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

export function rr(c: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function fillOut(c: Ctx, fill: string | CanvasGradient, lw = 2.5, stroke = OUT): void {
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = lw;
  c.strokeStyle = stroke;
  c.lineJoin = 'round';
  c.stroke();
}

export function lin(c: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

// ---------------------------------------------------------------------------------------------------------
//  Landscape: distant hills + trees (sits behind everything outdoors, and shows through the window)
// ---------------------------------------------------------------------------------------------------------
export function paintHills(scene: Phaser.Scene): void {
  const c = canvas(scene, 'hills', WORLD_W, 330);
  // mid green hills
  const mid = lin(c, 0, 150, 0, 330, [[0, '#bad4aa'], [1, '#99bf94']]);
  c.beginPath();
  // (lower behind the cottage so the kitchen window looks out on a bit of sky as well as the hill)
  c.moveTo(0, 238);
  c.bezierCurveTo(160, 208, 330, 214, 500, 215);
  c.bezierCurveTo(640, 255, 800, 150, 980, 180);
  c.bezierCurveTo(1100, 200, 1200, 170, 1280, 190);
  c.lineTo(1280, 330);
  c.lineTo(0, 330);
  c.closePath();
  c.fillStyle = mid;
  c.fill();
  // lollipop trees on the hills
  const trees: [number, number, number][] = [[640, 200, 1], [700, 196, 0.8], [880, 168, 1.1], [1010, 178, 0.9], [1190, 176, 1.2], [96, 214, 0.9], [560, 214, 0.7]];
  for (const [x, y, s] of trees) {
    c.fillStyle = '#b3957d';
    c.fillRect(x - 2 * s, y, 4 * s, 22 * s);
    c.beginPath();
    c.arc(x, y - 4 * s, 15 * s, 0, Math.PI * 2);
    c.fillStyle = '#84b383';
    c.fill();
    c.beginPath();
    c.arc(x - 4 * s, y - 8 * s, 7 * s, 0, Math.PI * 2);
    c.fillStyle = '#a1c99d';
    c.fill();
  }
  // front rolling meadow band
  const front = lin(c, 0, 250, 0, 330, [[0, '#b0cda0'], [1, '#9cc091']]);
  c.beginPath();
  c.moveTo(0, 262);
  c.bezierCurveTo(200, 236, 420, 270, 640, 250);
  c.bezierCurveTo(860, 232, 1060, 268, 1280, 244);
  c.lineTo(1280, 330);
  c.lineTo(0, 330);
  c.closePath();
  c.fillStyle = front;
  c.fill();
  refresh(scene, 'hills');
}

// ---------------------------------------------------------------------------------------------------------
//  Ground, fence, stepping stones
// ---------------------------------------------------------------------------------------------------------
export function paintGround(scene: Phaser.Scene): void {
  const gh = WORLD_H - FLOOR_Y + 40;
  const c = canvas(scene, 'ground', WORLD_W, gh);
  const gx0 = WALL_OUTER_X - 8;
  // grass strip
  c.fillStyle = lin(c, 0, 36, 0, gh, [[0, '#b2d19b'], [0.35, '#9dc18b'], [1, '#78a474']]);
  c.fillRect(gx0, 36, WORLD_W - gx0, gh - 36);
  // grass edge (scallops)
  c.fillStyle = '#c0d9a0';
  c.beginPath();
  c.moveTo(gx0, 40);
  for (let x = gx0; x < WORLD_W + 20; x += 16) c.quadraticCurveTo(x + 8, 28 + ((x / 16) % 2) * 3, x + 16, 40);
  c.lineTo(WORLD_W, 48);
  c.lineTo(gx0, 48);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(80,140,80,0.5)';
  c.lineWidth = 1.5;
  for (let i = 0; i < 90; i++) {
    const x = gx0 + ((i * 97) % (WORLD_W - gx0));
    const y = 54 + ((i * 53) % (gh - 70));
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - 2, y - 5);
    c.moveTo(x, y);
    c.lineTo(x + 2, y - 5);
    c.stroke();
  }
  // flowerbed soil mound
  c.beginPath();
  c.ellipse(765, 44, 190, 12, 0, 0, Math.PI * 2);
  fillOut(c, lin(c, 0, 32, 0, 56, [[0, '#a17356'], [1, '#845a44']]), 2.4);
  c.fillStyle = 'rgba(70,40,25,0.25)';
  for (let i = 0; i < 24; i++) {
    c.beginPath();
    c.arc(595 + i * 15.5, 43 + ((i * 7) % 5) - 2, 1.8, 0, Math.PI * 2);
    c.fill();
  }
  // stepping stones from the door
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.ellipse(548 + i * 17, 47 + (i % 2) * 5, 11, 4.2, 0, 0, Math.PI * 2);
    fillOut(c, '#e6dcd2', 1.8);
  }
  // blanket shadow patch
  c.fillStyle = 'rgba(70,120,70,0.18)';
  c.beginPath();
  c.ellipse(1030, 46, 98, 7, 0, 0, Math.PI * 2);
  c.fill();
  refresh(scene, 'ground');

  // fence
  const f = canvas(scene, 'fence', WORLD_W - WALL_OUTER_X, 70);
  f.fillStyle = '#fef6ef';
  f.strokeStyle = OUT;
  f.lineWidth = 2.4;
  f.lineJoin = 'round';
  for (let x = 8; x < WORLD_W - WALL_OUTER_X; x += 26) {
    f.beginPath();
    f.moveTo(x, 70);
    f.lineTo(x, 18);
    f.lineTo(x + 9, 8);
    f.lineTo(x + 18, 18);
    f.lineTo(x + 18, 70);
    f.closePath();
    f.fill();
    f.stroke();
  }
  f.fillStyle = '#f3e4d6';
  for (const y of [28, 52]) {
    f.fillRect(0, y, WORLD_W - WALL_OUTER_X, 7);
    f.strokeRect(0, y, WORLD_W - WALL_OUTER_X, 7);
  }
  refresh(scene, 'fence');
}

// ---------------------------------------------------------------------------------------------------------
//  Soft light textures
// ---------------------------------------------------------------------------------------------------------
export function paintLights(scene: Phaser.Scene): void {
  // radial glow
  {
    const c = canvas(scene, 'glow', 256, 256);
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
    refresh(scene, 'glow');
  }
  // outdoor shade overlay with a soft left edge
  {
    const c = canvas(scene, 'shade', WORLD_W - ZONE_SPLIT_X + 40, WORLD_H);
    const g = c.createLinearGradient(0, 0, 60, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    c.globalCompositeOperation = 'destination-in';
    const mask = c.createLinearGradient(0, 0, 64, 0);
    mask.addColorStop(0, 'rgba(0,0,0,0)');
    mask.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = mask;
    c.fillRect(0, 0, WORLD_W, WORLD_H);
    void g;
    refresh(scene, 'shade');
  }
  // warm door-light on the grass at night
  {
    const c = canvas(scene, 'doorLight', 220, 120);
    const g = c.createLinearGradient(0, 0, 220, 0);
    g.addColorStop(0, 'rgba(255,214,140,0.9)');
    g.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 18);
    c.lineTo(220, 60);
    c.lineTo(220, 120);
    c.lineTo(0, 120);
    c.closePath();
    c.fill();
    refresh(scene, 'doorLight');
  }
  // moon (crescent with glow)
  {
    const c = canvas(scene, 'moon', 120, 120);
    const g = c.createRadialGradient(60, 60, 8, 60, 60, 58);
    g.addColorStop(0, 'rgba(255,250,220,0.55)');
    g.addColorStop(1, 'rgba(255,250,220,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 120, 120);
    c.save();
    c.beginPath();
    c.arc(60, 60, 24, 0, Math.PI * 2);
    c.fillStyle = '#fbf4dc';
    c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath();
    c.arc(72, 52, 21, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.strokeStyle = 'rgba(200,190,150,0.7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.arc(60, 60, 24, 0.6, 2.9);
    c.stroke();
    refresh(scene, 'moon');
  }
  // clouds
  for (let k = 0; k < 3; k++) {
    const c = canvas(scene, `cloud${k}`, 260, 110);
    const blobs: [number, number, number][] =
      k === 0
        ? [[60, 70, 36], [110, 52, 44], [160, 60, 40], [205, 74, 30], [130, 82, 40]]
        : k === 1
        ? [[50, 72, 30], [95, 56, 38], [145, 64, 34], [190, 78, 24], [110, 84, 34]]
        : [[70, 74, 32], [120, 50, 42], [170, 66, 36], [215, 80, 26], [150, 86, 36]];
    c.fillStyle = 'rgba(120,140,170,0.25)';
    for (const [x, y, r] of blobs) {
      c.beginPath();
      c.arc(x, y + 6, r, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#ffffff';
    for (const [x, y, r] of blobs) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
    const g = c.createLinearGradient(0, 40, 0, 110);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(170,190,215,0.35)');
    c.fillStyle = g;
    c.globalCompositeOperation = 'source-atop';
    c.fillRect(0, 0, 260, 110);
    c.globalCompositeOperation = 'source-over';
    refresh(scene, `cloud${k}`);
  }
}

/** Subtle paper grain and warm vignette laid over the whole scene. */
export function paintFinish(scene: Phaser.Scene): void {
  const g = canvas(scene, 'grain', 256, 256);
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 90 + Math.random() * 120;
    img.data[i] = v;
    img.data[i + 1] = v * 0.94;
    img.data[i + 2] = v * 0.86;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  refresh(scene, 'grain');
  const v = canvas(scene, 'vignette', WORLD_W, WORLD_H);
  const grad = v.createRadialGradient(WORLD_W / 2, WORLD_H / 2, WORLD_H * 0.45, WORLD_W / 2, WORLD_H / 2, WORLD_W * 0.62);
  grad.addColorStop(0, 'rgba(60,35,20,0)');
  grad.addColorStop(1, 'rgba(60,35,20,0.5)');
  v.fillStyle = grad;
  v.fillRect(0, 0, WORLD_W, WORLD_H);
  refresh(scene, 'vignette');
}

export const ART_DEPTH = {
  sky: 0, celestial: 1, hills: 2, clouds: 3, fenceBack: 8, house: 10, furniture: 12, glow: 11.5, ground: 20, gardenBack: 24, tree: 26, fenceFront: 28,
  carley: 50, quilt: 55, foreground: 60, shade: 70, nightGlow: 72, weather: 74, thought: 80
};
