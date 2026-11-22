import Phaser from 'phaser';
import {
  BASKET, BED, CEILING_Y, DOG_BED, DOOR_TOP_Y, FLOOR_Y, GARDEN_POT, KITCHEN, SLAB_END_X, SLAB_H, STAIRS, UPPER_Y,
  WALL_LEFT_X, WALL_OUTER_X, WINDOWS, WORLD_H, ZONE_SPLIT_X, type WindowRect
} from '../config/worldLayout';
import { OUT, OUT_SOFT, canvas, fillOut, lin, refresh, rr, type Ctx } from './art';

/** Where the bedroom wallpaper gives way to the stair hall's. */
const ROOM_SPLIT_X = SLAB_END_X + 2;
/** Origin of the kitchen fixtures texture (world coordinates). */
export const KITCHEN_ORIGIN = { x: 20, y: 436 };

const pitchY = (x: number): number => UPPER_Y + ((x - STAIRS.topX) / (STAIRS.footX - STAIRS.topX)) * (FLOOR_Y - UPPER_Y);

// ---------------------------------------------------------------------------------------------------------
//  Cottage cutaway: two storeys (bedroom over kitchen), staircase, windows, doorway, roof, wall decor
// ---------------------------------------------------------------------------------------------------------
export function paintHouse(scene: Phaser.Scene): void {
  const W = 580;
  const c = canvas(scene, 'house', W, WORLD_H);
  const x0 = WALL_LEFT_X;
  const x1 = ZONE_SPLIT_X - 12;

  paintBackWalls(c, x0, x1);
  // knock the window holes through the wallpaper so the sky and hills behind show through
  c.save();
  c.globalCompositeOperation = 'destination-out';
  for (const w of WINDOWS) c.fillRect(w.x, w.y, w.w, w.h);
  c.restore();
  paintFloors(c, x0);
  paintBeamAndPosts(c);
  paintStairs(c);
  paintDoor(c);
  paintChimney(c);
  paintRoof(c);
  for (const w of WINDOWS) paintWindow(c, w);
  paintWallDecor(c);
  paintFairyLights(c);

  refresh(scene, 'house');
  // silhouette of the cottage (windows and doorway stay empty) used to dim ONLY the house at night
  {
    const src = scene.textures.get('house').getSourceImage() as CanvasImageSource;
    const sc = canvas(scene, 'houseShade', W, WORLD_H);
    sc.drawImage(src, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = '#ffffff';
    sc.fillRect(0, 0, W, WORLD_H);
    refresh(scene, 'houseShade');
  }
}

function paintBackWalls(c: Ctx, x0: number, x1: number): void {
  const slabBottom = UPPER_Y + SLAB_H;

  // ---- bedroom (upstairs, left): pink striped wallpaper with tiny flowers ----
  c.fillStyle = lin(c, 0, CEILING_Y, 0, UPPER_Y, [[0, '#fceee0'], [1, '#fbe1d0']]);
  c.fillRect(x0, CEILING_Y, ROOM_SPLIT_X - x0, UPPER_Y - CEILING_Y);
  c.save();
  c.beginPath();
  c.rect(x0, CEILING_Y, ROOM_SPLIT_X - x0, UPPER_Y - CEILING_Y);
  c.clip();
  c.fillStyle = 'rgba(255,200,180,0.35)';
  for (let x = x0 + 10; x < ROOM_SPLIT_X; x += 34) c.fillRect(x, CEILING_Y, 12, UPPER_Y - CEILING_Y);
  for (let y = CEILING_Y + 24; y < UPPER_Y - 30; y += 46) {
    for (let x = x0 + 28; x < ROOM_SPLIT_X; x += 68) {
      const ox = x + ((y / 46) % 2) * 34;
      c.fillStyle = 'rgba(255,150,170,0.45)';
      c.beginPath();
      c.arc(ox, y, 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,225,150,0.7)';
      c.beginPath();
      c.arc(ox, y, 1.2, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
  // bedroom wainscot + baseboard
  c.fillStyle = '#f3d4cc';
  c.fillRect(x0, UPPER_Y - 40, ROOM_SPLIT_X - x0, 40);
  c.strokeStyle = 'rgba(190,130,120,0.5)';
  c.lineWidth = 1.5;
  for (let x = x0 + 22; x < ROOM_SPLIT_X; x += 22) {
    c.beginPath();
    c.moveTo(x, UPPER_Y - 34);
    c.lineTo(x, UPPER_Y);
    c.stroke();
  }
  c.fillStyle = '#fef4ed';
  c.fillRect(x0, UPPER_Y - 44, ROOM_SPLIT_X - x0, 6);
  c.strokeStyle = OUT_SOFT;
  c.strokeRect(x0, UPPER_Y - 44, ROOM_SPLIT_X - x0, 6);
  c.fillStyle = '#fef4ed';
  c.fillRect(x0, UPPER_Y - 9, ROOM_SPLIT_X - x0, 9);

  // ---- stair hall (right, both storeys): sage-cream wallpaper with little leaves ----
  c.fillStyle = lin(c, 0, CEILING_Y, 0, FLOOR_Y, [[0, '#f4f2df'], [1, '#e6ecd6']]);
  c.fillRect(ROOM_SPLIT_X, CEILING_Y, x1 - ROOM_SPLIT_X, FLOOR_Y - CEILING_Y);
  c.save();
  c.beginPath();
  c.rect(ROOM_SPLIT_X, CEILING_Y, x1 - ROOM_SPLIT_X, FLOOR_Y - CEILING_Y);
  c.clip();
  c.fillStyle = 'rgba(160,200,150,0.28)';
  for (let x = ROOM_SPLIT_X + 8; x < x1; x += 30) c.fillRect(x, CEILING_Y, 8, FLOOR_Y - CEILING_Y);
  for (let y = CEILING_Y + 30; y < FLOOR_Y - 70; y += 52) {
    for (let x = ROOM_SPLIT_X + 22; x < x1; x += 60) {
      const ox = x + ((y / 52) % 2) * 30;
      c.fillStyle = 'rgba(120,175,120,0.4)';
      c.beginPath();
      c.ellipse(ox, y, 5, 2.6, -0.6, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(ox + 5, y - 2, 5, 2.6, 0.6, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
  // hall wainscot, chair rail and skirting
  c.fillStyle = '#e3ebd6';
  c.fillRect(ROOM_SPLIT_X, FLOOR_Y - 84, x1 - ROOM_SPLIT_X, 84);
  c.strokeStyle = 'rgba(120,160,120,0.45)';
  c.lineWidth = 1.5;
  for (let x = ROOM_SPLIT_X + 20; x < x1; x += 40) {
    c.strokeRect(x - 16, FLOOR_Y - 70, 32, 52);
  }
  c.fillStyle = '#fef4ed';
  c.fillRect(ROOM_SPLIT_X, FLOOR_Y - 88, x1 - ROOM_SPLIT_X, 6);
  c.strokeStyle = OUT_SOFT;
  c.strokeRect(ROOM_SPLIT_X, FLOOR_Y - 88, x1 - ROOM_SPLIT_X, 6);
  c.fillStyle = '#fef4ed';
  c.fillRect(ROOM_SPLIT_X, FLOOR_Y - 9, x1 - ROOM_SPLIT_X, 9);

  // ---- kitchen (downstairs, left): mint wall with polka dots, tiled splashback behind the counter ----
  c.fillStyle = lin(c, 0, slabBottom, 0, FLOOR_Y, [[0, '#e9f5ec'], [1, '#d9eee0']]);
  c.fillRect(x0, slabBottom, ROOM_SPLIT_X - x0, FLOOR_Y - slabBottom);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  for (let y = slabBottom + 12; y < FLOOR_Y - 10; y += 26) {
    for (let x = x0 + 14; x < ROOM_SPLIT_X; x += 26) {
      c.beginPath();
      c.arc(x + ((y / 26) % 2) * 13, y, 2.6, 0, Math.PI * 2);
      c.fill();
    }
  }
  // splashback tiles
  const tx0 = KITCHEN.counter.x - 2;
  const tx1 = KITCHEN.stove.x + KITCHEN.stove.w + 2;
  const ty0 = FLOOR_Y - KITCHEN.counter.h - 38;
  c.fillStyle = '#fdfaf4';
  c.fillRect(tx0, ty0, tx1 - tx0, FLOOR_Y - KITCHEN.counter.h - ty0 + 2);
  c.strokeStyle = 'rgba(120,170,160,0.55)';
  c.lineWidth = 1.2;
  for (let x = tx0; x <= tx1; x += 16) {
    c.beginPath();
    c.moveTo(x, ty0);
    c.lineTo(x, FLOOR_Y - KITCHEN.counter.h + 2);
    c.stroke();
  }
  for (let y = ty0; y <= FLOOR_Y - KITCHEN.counter.h + 2; y += 16) {
    c.beginPath();
    c.moveTo(tx0, y);
    c.lineTo(tx1, y);
    c.stroke();
  }
  c.strokeStyle = OUT_SOFT;
  c.strokeRect(tx0, ty0, tx1 - tx0, FLOOR_Y - KITCHEN.counter.h - ty0 + 2);
  c.fillStyle = '#fef4ed';
  c.fillRect(x0, FLOOR_Y - 9, ROOM_SPLIT_X - x0, 9);
}

function paintFloors(c: Ctx, x0: number): void {
  // ---- ground floor boards + foundation ----
  c.fillStyle = lin(c, 0, FLOOR_Y, 0, FLOOR_Y + 50, [[0, '#e6c19a'], [1, '#d0a57b']]);
  c.fillRect(0, FLOOR_Y, WALL_OUTER_X + 14, 52);
  c.strokeStyle = 'rgba(140,90,60,0.35)';
  c.lineWidth = 1.5;
  for (let x = 0; x < WALL_OUTER_X + 14; x += 58) {
    c.beginPath();
    c.moveTo(x, FLOOR_Y);
    c.lineTo(x - 10, FLOOR_Y + 52);
    c.stroke();
  }
  c.beginPath();
  c.moveTo(0, FLOOR_Y + 20);
  c.lineTo(WALL_OUTER_X + 14, FLOOR_Y + 20);
  c.stroke();
  c.fillStyle = '#c19168';
  c.fillRect(0, FLOOR_Y + 50, WALL_OUTER_X + 14, 6);
  c.fillStyle = '#c4b3a7';
  c.fillRect(0, FLOOR_Y + 56, WALL_OUTER_X + 14, WORLD_H - FLOOR_Y - 56);
  c.strokeStyle = 'rgba(120,95,80,0.4)';
  for (let y = FLOOR_Y + 70; y < WORLD_H; y += 22) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(WALL_OUTER_X + 14, y);
    c.stroke();
  }

  // ---- the upstairs floor: a chunky wooden slab ending at the stairwell ----
  c.beginPath();
  c.rect(x0 - 2, UPPER_Y, SLAB_END_X - x0 + 2, SLAB_H);
  fillOut(c, lin(c, 0, UPPER_Y, 0, UPPER_Y + SLAB_H, [[0, '#e8c9a3'], [0.32, '#dcb68c'], [1, '#c49468']]), 2.6);
  c.strokeStyle = 'rgba(120,75,45,0.35)';
  c.lineWidth = 1.5;
  for (let x = x0 + 40; x < SLAB_END_X - 8; x += 58) {
    c.beginPath();
    c.moveTo(x, UPPER_Y + 2);
    c.lineTo(x - 6, UPPER_Y + SLAB_H - 2);
    c.stroke();
  }
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(x0 + 2, UPPER_Y + 2, SLAB_END_X - x0 - 8, 3);
  // little scalloped trim under the slab, so the kitchen ceiling looks finished
  c.fillStyle = '#fef4ed';
  for (let x = x0 + 4; x < SLAB_END_X - 6; x += 20) {
    c.beginPath();
    c.arc(x + 10, UPPER_Y + SLAB_H, 8, 0, Math.PI);
    fillOut(c, '#fdf0e6', 1.6);
  }
}

function paintBeamAndPosts(c: Ctx): void {
  // ---- ceiling beam ----
  c.beginPath();
  c.rect(0, 190, WALL_OUTER_X + 14, 26);
  fillOut(c, lin(c, 0, 190, 0, 216, [[0, '#d1a57c'], [1, '#bc8b64']]), 2.5);
  c.strokeStyle = 'rgba(120,70,40,0.35)';
  c.lineWidth = 1.5;
  for (let x = 40; x < WALL_OUTER_X; x += 90) {
    c.beginPath();
    c.moveTo(x, 194);
    c.lineTo(x + 30, 212);
    c.stroke();
  }
  // ---- left wall post (runs the full height of the cottage) ----
  c.beginPath();
  c.rect(0, 190, WALL_LEFT_X + 2, FLOOR_Y - 190 + 8);
  fillOut(c, lin(c, 0, 0, WALL_LEFT_X, 0, [[0, '#c89a70'], [1, '#ddb790']]), 2.5);
  // ---- right wall, above the doorway ----
  c.beginPath();
  c.rect(ZONE_SPLIT_X - 14, 190, 28, DOOR_TOP_Y - 190);
  fillOut(c, lin(c, ZONE_SPLIT_X - 14, 0, ZONE_SPLIT_X + 14, 0, [[0, '#ddb790'], [1, '#c79a70']]), 2.5);
}

/** The staircase: stepped wooden flight against the back wall, descending right to the front door. */
function paintStairs(c: Ctx): void {
  const { topX, footX, steps } = STAIRS;
  const run = (footX - topX) / steps;
  const rise = (FLOOR_Y - UPPER_Y) / steps;
  const slope = (FLOOR_Y - UPPER_Y) / (footX - topX);
  const THICK = 26;
  const underEndX = topX + (FLOOR_Y - THICK - UPPER_Y) / slope;

  // soft shadow on the wall under the flight
  c.fillStyle = 'rgba(120,85,60,0.16)';
  c.beginPath();
  c.moveTo(topX, UPPER_Y + THICK);
  c.lineTo(underEndX, FLOOR_Y);
  c.lineTo(topX, FLOOR_Y);
  c.closePath();
  c.fill();

  // body: stepped top profile, sloping underside
  const pts: [number, number][] = [[topX, UPPER_Y]];
  for (let k = 1; k < steps; k++) {
    pts.push([topX + run * (k - 1), UPPER_Y + rise * k]);
    pts.push([topX + run * k, UPPER_Y + rise * k]);
  }
  const lastX = topX + run * (steps - 1);
  pts.push([lastX, FLOOR_Y]);
  c.beginPath();
  c.moveTo(pts[0][0], pts[0][1]);
  for (const [px, py] of pts.slice(1)) c.lineTo(px, py);
  c.lineTo(underEndX, FLOOR_Y);
  c.lineTo(topX, UPPER_Y + THICK);
  c.closePath();
  fillOut(c, lin(c, topX, UPPER_Y, topX, FLOOR_Y, [[0, '#e3bf94'], [1, '#d2a679']]), 2.8);
  // tread highlights and riser shadows
  for (let k = 1; k < steps; k++) {
    const sx = topX + run * (k - 1);
    const sy = UPPER_Y + rise * k;
    c.fillStyle = '#f6e2c3';
    c.fillRect(sx + 1.5, sy + 1.4, run - 1.5, 3.2);
    c.fillStyle = 'rgba(150,100,60,0.28)';
    c.fillRect(sx + 1.5, sy + 4.6, run - 1.5, 2);
  }
  // wood grain along the slope
  c.strokeStyle = 'rgba(140,90,55,0.3)';
  c.lineWidth = 1.4;
  for (const off of [12, 20]) {
    c.beginPath();
    c.moveTo(topX + 4, UPPER_Y + off);
    c.lineTo(lastX - 6, pitchY(lastX - 6) + off - 6);
    c.stroke();
  }
  // darker underside band
  c.strokeStyle = 'rgba(120,75,45,0.5)';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(topX + 2, UPPER_Y + THICK - 3);
  c.lineTo(underEndX - 3, FLOOR_Y - 3);
  c.stroke();

  // wall-mounted handrail
  const rx0 = topX + 4;
  const rx1 = footX - 40;
  const hy = (x: number): number => pitchY(x) - 68;
  c.lineCap = 'round';
  c.strokeStyle = OUT;
  c.lineWidth = 7.4;
  c.beginPath();
  c.moveTo(rx0, hy(rx0));
  c.lineTo(rx1, hy(rx1));
  c.stroke();
  c.strokeStyle = '#e0b88a';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(rx0, hy(rx0));
  c.lineTo(rx1, hy(rx1));
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.5)';
  c.lineWidth = 1.4;
  c.beginPath();
  c.moveTo(rx0 + 2, hy(rx0) - 1);
  c.lineTo(rx1 - 2, hy(rx1) - 1);
  c.stroke();
  for (let i = 0; i < 4; i++) {
    const bx = rx0 + 14 + (i * (rx1 - rx0 - 28)) / 3;
    c.beginPath();
    c.arc(bx, hy(bx) + 6, 3.2, 0, Math.PI * 2);
    fillOut(c, '#c79a70', 1.6);
  }
  c.beginPath();
  c.arc(rx0 - 1, hy(rx0) - 1, 5.4, 0, Math.PI * 2);
  fillOut(c, '#f0d3ab', 2);
  c.lineCap = 'butt';
}

function paintDoor(c: Ctx): void {
  const dx = ZONE_SPLIT_X;
  // open door leaf (perspective: hinged on the outer post, swung toward the viewer)
  c.beginPath();
  c.moveTo(dx + 17, DOOR_TOP_Y + 14);
  c.lineTo(dx + 50, DOOR_TOP_Y + 24);
  c.lineTo(dx + 50, FLOOR_Y - 8);
  c.lineTo(dx + 17, FLOOR_Y);
  c.closePath();
  fillOut(c, lin(c, dx + 17, 0, dx + 50, 0, [[0, '#8ac5bc'], [1, '#6baca3']]), 2.6);
  c.strokeStyle = 'rgba(40,110,100,0.55)';
  c.lineWidth = 1.8;
  for (const [y0, y1] of [[DOOR_TOP_Y + 32, DOOR_TOP_Y + 66], [DOOR_TOP_Y + 80, FLOOR_Y - 22]] as [number, number][]) {
    c.beginPath();
    c.moveTo(dx + 23, y0);
    c.lineTo(dx + 44, y0 + 5);
    c.lineTo(dx + 44, y1 - 2);
    c.lineTo(dx + 23, y1 + 2);
    c.closePath();
    c.stroke();
  }
  c.beginPath();
  c.ellipse(dx + 33, DOOR_TOP_Y + 49, 6, 8, 0, 0, Math.PI * 2);
  fillOut(c, '#dcf1f9', 1.8);
  c.beginPath();
  c.arc(dx + 45, DOOR_TOP_Y + 98, 3, 0, Math.PI * 2);
  fillOut(c, '#f1c46c', 1.6);
  c.fillStyle = '#e5b458';
  for (const hy of [DOOR_TOP_Y + 30, FLOOR_Y - 26]) c.fillRect(dx + 15, hy, 5, 9);
  // frame posts and lintel
  c.beginPath();
  c.rect(dx - 17, DOOR_TOP_Y - 4, 36, 18);
  fillOut(c, '#99cfc6', 2.5);
  c.beginPath();
  c.rect(dx - 17, DOOR_TOP_Y + 14, 7, FLOOR_Y - DOOR_TOP_Y - 14);
  fillOut(c, '#99cfc6', 2.2);
  c.beginPath();
  c.rect(dx + 12, DOOR_TOP_Y + 14, 7, FLOOR_Y - DOOR_TOP_Y - 14);
  fillOut(c, '#99cfc6', 2.2);
  // decorative trim above the door with a keystone
  c.beginPath();
  c.moveTo(dx - 24, DOOR_TOP_Y - 4);
  c.quadraticCurveTo(dx, DOOR_TOP_Y - 30, dx + 26, DOOR_TOP_Y - 4);
  c.lineTo(dx + 19, DOOR_TOP_Y - 4);
  c.quadraticCurveTo(dx, DOOR_TOP_Y - 21, dx - 17, DOOR_TOP_Y - 4);
  c.closePath();
  fillOut(c, '#fdf3ea', 2.2);
  c.beginPath();
  c.rect(dx - 4, DOOR_TOP_Y - 22, 8, 11);
  fillOut(c, '#f7dbd3', 1.8);
  // doorstep
  c.beginPath();
  rr(c, dx - 22, FLOOR_Y - 2, 48, 9, 3);
  fillOut(c, '#d7ccc4', 2);
  // lantern on the outer wall, beside the door
  const ly = DOOR_TOP_Y - 84;
  c.strokeStyle = OUT;
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(dx + 14, ly);
  c.lineTo(dx + 36, ly);
  c.lineTo(dx + 36, ly + 8);
  c.stroke();
  c.beginPath();
  rr(c, dx + 29, ly + 8, 14, 20, 4);
  fillOut(c, '#f6dfa9', 2);
  c.fillStyle = '#e5b458';
  c.fillRect(dx + 28, ly + 5, 16, 4);
  c.fillRect(dx + 28, ly + 27, 16, 4);
}

function paintChimney(c: Ctx): void {
  c.beginPath();
  rr(c, 420, 76, 34, 110, 4);
  fillOut(c, '#e3b6a5', 2.5);
  c.beginPath();
  rr(c, 414, 68, 46, 14, 4);
  fillOut(c, '#fdf0e6', 2.5);
}

function paintRoof(c: Ctx): void {
  c.save();
  c.beginPath();
  c.moveTo(-18, 200);
  c.lineTo(WALL_OUTER_X / 2 + 8, 78);
  c.lineTo(WALL_OUTER_X + 30, 200);
  c.closePath();
  c.fillStyle = lin(c, 0, 78, 0, 200, [[0, '#edb4a2'], [1, '#e09687']]);
  c.fill();
  c.clip();
  for (let row = 0; row < 8; row++) {
    const y = 86 + row * 15.5;
    c.strokeStyle = 'rgba(160,80,70,0.4)';
    c.lineWidth = 1.6;
    for (let x = -30 + (row % 2) * 14; x < WALL_OUTER_X + 40; x += 28) {
      c.beginPath();
      c.arc(x + 14, y, 14, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
    }
  }
  c.restore();
  c.beginPath();
  c.moveTo(-18, 200);
  c.lineTo(WALL_OUTER_X / 2 + 8, 78);
  c.lineTo(WALL_OUTER_X + 30, 200);
  c.closePath();
  c.lineWidth = 3;
  c.strokeStyle = OUT;
  c.lineJoin = 'round';
  c.stroke();
  c.beginPath();
  c.moveTo(-22, 200);
  c.lineTo(WALL_OUTER_X + 34, 200);
  c.lineTo(WALL_OUTER_X + 34, 211);
  c.lineTo(-22, 211);
  c.closePath();
  fillOut(c, '#fdf0e6', 2.5);
}

/** A window with frame, mullions, sill and curtains. The glass itself is the transparent hole in the wall. */
function paintWindow(c: Ctx, w: WindowRect): void {
  const { x, y, w: ww, h } = w;
  const up = w.id === 'up';
  // outer frame
  c.lineWidth = 3;
  c.strokeStyle = OUT;
  c.lineJoin = 'round';
  c.strokeRect(x - 7, y - 7, ww + 14, h + 14);
  c.lineWidth = 8;
  c.strokeStyle = '#fef6ef';
  c.strokeRect(x - 3, y - 3, ww + 6, h + 6);
  c.lineWidth = 2.5;
  c.strokeStyle = OUT;
  c.strokeRect(x, y, ww, h);
  // mullions
  c.fillStyle = '#fef6ef';
  c.fillRect(x + ww / 2 - 3, y, 6, h);
  c.fillRect(x, y + h / 2 - 3, ww, 6);
  c.lineWidth = 1.8;
  c.strokeRect(x + ww / 2 - 3, y, 6, h);
  c.strokeRect(x, y + h / 2 - 3, ww, 6);
  // glass sheen
  c.fillStyle = 'rgba(255,255,255,0.22)';
  const sheen = up ? 2 : 1;
  for (let i = 0; i < sheen; i++) {
    const s = up ? 1 : 0.6;
    c.beginPath();
    c.moveTo(x + 8 + i * (ww * 0.5), y + 5);
    c.lineTo(x + 8 + 15 * s + i * (ww * 0.5), y + 5);
    c.lineTo(x + 6 + i * (ww * 0.5), y + 40 * s);
    c.lineTo(x - 2 + i * (ww * 0.5), y + 40 * s);
    c.closePath();
    c.fill();
  }
  // sill
  c.beginPath();
  rr(c, x - 14, y + h + 5, ww + 28, 10, 3);
  fillOut(c, '#ebcfad', 2.5);

  if (up) {
    // flower pot on the sill
    c.beginPath();
    rr(c, x + ww - 34, y + h - 9, 20, 14, 3);
    fillOut(c, '#f7b497', 2);
    c.fillStyle = '#86bb84';
    c.beginPath();
    c.arc(x + ww - 24, y + h - 8, 11, Math.PI, 0);
    c.fill();
    c.strokeStyle = '#679b66';
    c.lineWidth = 2;
    for (const sx of [-6, 1, 7]) {
      c.beginPath();
      c.moveTo(x + ww - 24, y + h - 8);
      c.lineTo(x + ww - 24 + sx, y + h - 20);
      c.stroke();
    }
    for (const [fx, fy, col] of [[-6, -20, '#eba997'], [1, -23, '#f7e6b0'], [7, -19, '#b1c9e8']] as [number, number, string][]) {
      c.fillStyle = col;
      c.beginPath();
      c.arc(x + ww - 24 + fx, y + h + fy, 3.4, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = OUT_SOFT;
      c.lineWidth = 1;
      c.stroke();
    }
    // long curtains with tie-backs + scalloped valance
    for (const side of [-1, 1]) {
      const cx = side < 0 ? x - 6 : x + ww + 6;
      c.beginPath();
      c.moveTo(cx - side * 2, y - 12);
      c.quadraticCurveTo(cx + side * 16, y + h * 0.5, cx + side * 4, y + h + 2);
      c.lineTo(cx - side * 24, y + h + 2);
      c.quadraticCurveTo(cx - side * 10, y + h * 0.5, cx - side * 18, y - 12);
      c.closePath();
      fillOut(c, lin(c, cx - 28, 0, cx + 28, 0, [[0, '#f3cabf'], [1, '#eeb4a4']]), 2.5);
      c.strokeStyle = 'rgba(210,100,130,0.5)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(cx - side * 10, y - 4);
      c.quadraticCurveTo(cx - side * 2, y + h * 0.5, cx - side * 12, y + h);
      c.stroke();
      c.beginPath();
      rr(c, cx - 11, y + h * 0.58, 18, 5, 2);
      fillOut(c, '#f7e6b0', 1.8);
    }
    c.beginPath();
    rr(c, x - 20, y - 20, ww + 40, 14, 6);
    fillOut(c, '#f1c2b4', 2.5);
    for (let i = 0; i < 8; i++) {
      c.beginPath();
      c.arc(x - 14 + i * ((ww + 28) / 7), y - 6, 6, 0, Math.PI);
      fillOut(c, '#f4d0c6', 1.8);
    }
  } else {
    // kitchen window: a couple of herb pots on the sill and short tied-back curtains at the sides
    for (const [hx, col] of [[x + 18, '#86bb84'], [x + ww - 18, '#79b07a']] as [number, string][]) {
      c.beginPath();
      rr(c, hx - 6, y + h - 2, 12, 10, 2);
      fillOut(c, '#f1d3b8', 1.6);
      c.fillStyle = col;
      c.beginPath();
      c.arc(hx, y + h - 4, 7, Math.PI, 0);
      c.fill();
      c.strokeStyle = OUT_SOFT;
      c.lineWidth = 1;
      c.stroke();
    }
    for (const side of [-1, 1]) {
      const cx = side < 0 ? x - 3 : x + ww + 3;
      c.beginPath();
      c.moveTo(cx - side * 1, y - 6);
      c.quadraticCurveTo(cx + side * 9, y + h * 0.45, cx + side * 3, y + h + 1);
      c.lineTo(cx - side * 14, y + h + 1);
      c.quadraticCurveTo(cx - side * 6, y + h * 0.45, cx - side * 11, y - 6);
      c.closePath();
      fillOut(c, lin(c, cx - 16, 0, cx + 16, 0, [[0, '#f6d2c7'], [1, '#efb9aa']]), 2.2);
      c.beginPath();
      rr(c, cx - 11, y + h * 0.52, 14, 4.5, 2);
      fillOut(c, '#f7e6b0', 1.6);
    }
    // curtain rod
    c.strokeStyle = OUT;
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x - 18, y - 10);
    c.lineTo(x + ww + 18, y - 10);
    c.stroke();
    c.lineCap = 'butt';
  }
}

function paintFrame(c: Ctx, x: number, y: number, w: number, h: number, kind: 'sun' | 'heart' | 'flower' | 'pup' | 'house'): void {
  c.beginPath();
  rr(c, x, y, w, h, 5);
  fillOut(c, '#fdf4ea', 3);
  c.beginPath();
  rr(c, x + 4, y + 4, w - 8, h - 8, 3);
  const bg = { sun: '#d1eaf7', heart: '#f8e0d9', flower: '#f4efd2', pup: '#e3eef8', house: '#e2f0dc' }[kind];
  c.fillStyle = bg;
  c.fill();
  c.strokeStyle = OUT_SOFT;
  c.lineWidth = 1.5;
  c.stroke();
  const cx = x + w / 2;
  const cy = y + h / 2;
  switch (kind) {
    case 'sun':
      c.fillStyle = '#f1c46c';
      c.beginPath();
      c.arc(x + w * 0.65, y + h * 0.35, Math.min(7, w * 0.13), 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#b0cda0';
      c.beginPath();
      c.moveTo(x + 5, y + h - 5);
      c.quadraticCurveTo(x + w * 0.4, y + h * 0.5, x + w - 5, y + h - 5);
      c.fill();
      break;
    case 'heart': {
      const r = Math.min(6, w * 0.2);
      c.fillStyle = '#e99f8a';
      c.beginPath();
      c.arc(cx - r * 0.8, cy - r * 0.5, r, 0, Math.PI * 2);
      c.arc(cx + r * 0.8, cy - r * 0.5, r, 0, Math.PI * 2);
      c.moveTo(cx - r * 1.7, cy - r * 0.2);
      c.lineTo(cx, cy + r * 2);
      c.lineTo(cx + r * 1.7, cy - r * 0.2);
      c.fill();
      break;
    }
    case 'flower':
      c.strokeStyle = '#7db07a';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(cx, y + h - 6);
      c.lineTo(cx, cy);
      c.stroke();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        c.fillStyle = '#eeb4a4';
        c.beginPath();
        c.arc(cx + Math.cos(a) * 5, cy - 2 + Math.sin(a) * 5, 3.6, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#f1cf74';
      c.beginPath();
      c.arc(cx, cy - 2, 2.8, 0, Math.PI * 2);
      c.fill();
      break;
    case 'pup': {
      // a tiny portrait of the dalmatian
      c.fillStyle = '#ffffff';
      c.strokeStyle = OUT;
      c.lineWidth = 1.4;
      c.beginPath();
      c.ellipse(cx, cy + 2, 9, 8.5, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#3a3340';
      c.beginPath();
      c.ellipse(cx - 9, cy + 1, 3.4, 7, 0.2, 0, Math.PI * 2);
      c.ellipse(cx + 9, cy + 1, 3.4, 7, -0.2, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(cx - 2.5, cy - 4, 2, 0, Math.PI * 2);
      c.arc(cx + 4, cy + 7, 1.6, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(cx - 3.5, cy, 1.1, 0, Math.PI * 2);
      c.arc(cx + 3.5, cy, 1.1, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.ellipse(cx, cy + 5, 2.4, 1.7, 0, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case 'house':
      c.fillStyle = '#f2c6b8';
      c.fillRect(cx - 7, cy - 1, 14, 9);
      c.fillStyle = '#e99f8a';
      c.beginPath();
      c.moveTo(cx - 9, cy);
      c.lineTo(cx, cy - 8);
      c.lineTo(cx + 9, cy);
      c.fill();
      c.fillStyle = '#b0cda0';
      c.fillRect(x + 5, y + h - 9, w - 10, 4);
      break;
  }
}

function paintWallDecor(c: Ctx): void {
  // ---- upstairs (bedroom): pictures over the bed, a little shelf beside the window ----
  paintFrame(c, 44, 244, 52, 62, 'sun');
  paintFrame(c, 104, 266, 30, 30, 'heart');
  const sx = 264;
  const sy = 300;
  c.beginPath();
  rr(c, sx, sy, 44, 7, 2);
  fillOut(c, '#d1a57c', 2.2);
  const books = ['#eeb5a4', '#9fc7ef', '#f2c878', '#b0cda0'];
  let bx = sx + 3;
  for (let i = 0; i < books.length; i++) {
    const bh = 20 + ((i * 7) % 9);
    c.beginPath();
    c.rect(bx, sy - bh, 7, bh);
    fillOut(c, books[i], 1.6);
    bx += 8.2;
  }
  // tiny succulent at the end of the shelf
  c.beginPath();
  rr(c, sx + 34, sy - 11, 9, 11, 2);
  fillOut(c, '#f7b497', 1.6);
  c.fillStyle = '#86bb84';
  c.beginPath();
  c.arc(sx + 38.5, sy - 12, 6, Math.PI, 0);
  c.fill();

  // ---- stairwell: a gallery of pictures climbing the wall beside the stairs, a clock, a hanging lantern ----
  const gallery: [number, number, number, number, 'flower' | 'pup' | 'house'][] = [
    [338, 0, 34, 42, 'flower'],
    [384, 0, 42, 34, 'pup'],
    [436, 0, 34, 42, 'house']
  ];
  for (const [gx, , gw, gh, kind] of gallery) paintFrame(c, gx, pitchY(gx + gw / 2) - 148 - gh / 2, gw, gh, kind);
  // round wall clock
  c.beginPath();
  c.arc(440, 262, 20, 0, Math.PI * 2);
  fillOut(c, '#fdf4ea', 3);
  c.beginPath();
  c.arc(440, 262, 15, 0, Math.PI * 2);
  c.fillStyle = '#fffaf2';
  c.fill();
  c.strokeStyle = OUT;
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(440, 262);
  c.lineTo(440, 252);
  c.moveTo(440, 262);
  c.lineTo(447, 265);
  c.stroke();
  c.fillStyle = '#e99f8a';
  for (let i = 0; i < 12; i++) {
    c.beginPath();
    c.arc(440 + Math.cos((i / 12) * Math.PI * 2) * 12.4, 262 + Math.sin((i / 12) * Math.PI * 2) * 12.4, 1.1, 0, Math.PI * 2);
    c.fill();
  }
  c.lineCap = 'butt';
}

/** Ceiling lamp on a cord: dome shade + glowing bulb. */
function paintPendant(c: Ctx, x: number, topY: number, cord: number, r: number, shade: string): void {
  c.strokeStyle = OUT;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(x, topY);
  c.lineTo(x, topY + cord);
  c.stroke();
  c.beginPath();
  c.moveTo(x - r, topY + cord + r * 0.9);
  c.quadraticCurveTo(x - r, topY + cord, x, topY + cord);
  c.quadraticCurveTo(x + r, topY + cord, x + r, topY + cord + r * 0.9);
  c.closePath();
  fillOut(c, shade, 2.2);
  c.beginPath();
  c.arc(x, topY + cord + r * 0.95, r * 0.34, 0, Math.PI * 2);
  c.fillStyle = '#f6d98d';
  c.fill();
}

function paintFairyLights(c: Ctx): void {
  // string of lights along the beam (bedroom and stairwell)
  c.strokeStyle = 'rgba(138,90,72,0.8)';
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(30, 218);
  c.bezierCurveTo(100, 250, 190, 250, 262, 218);
  c.bezierCurveTo(330, 248, 410, 248, 494, 218);
  c.stroke();
  const bulbCols = ['#f5d6cd', '#f7e8b0', '#d0ecf7', '#c3d5ee'];
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    const bx2 = 40 + t * 440;
    const by2 = 218 + 24 * Math.sin((t * 2 % 1) * Math.PI) * 0.95;
    c.beginPath();
    c.arc(bx2, by2 + 3, 4, 0, Math.PI * 2);
    c.fillStyle = bulbCols[i % 4];
    c.fill();
    c.strokeStyle = OUT_SOFT;
    c.lineWidth = 1.2;
    c.stroke();
  }
}

// ---------------------------------------------------------------------------------------------------------
//  Furniture (static, behind Carley)
// ---------------------------------------------------------------------------------------------------------
export function paintFurniture(scene: Phaser.Scene): void {
  paintBed(scene);
  paintNightstand(scene);
  paintPhoneTable(scene);
  paintLampTextures(scene);
  paintKitchen(scene);
  paintDogBed(scene);
  paintBasket(scene);
  paintArmchair(scene);
  paintFloorLamp(scene);
  paintEasel(scene);
  paintRug(scene);
  paintQuilt(scene);
  paintGardenProps(scene);
}

/** Slim telephone table. Canvas origin: (PHONE_TABLE.x - 24, PHONE_TABLE.topY - 4). */
function paintPhoneTable(scene: Phaser.Scene): void {
  const c = canvas(scene, 'phoneTable', 48, 64);
  const top = 4;
  // three slender legs
  c.lineCap = 'round';
  for (const [lx, bx] of [[12, 9], [36, 39], [24, 24]] as [number, number][]) {
    c.strokeStyle = OUT;
    c.lineWidth = 7;
    c.beginPath();
    c.moveTo(lx, top + 6);
    c.lineTo(bx, 61);
    c.stroke();
    c.strokeStyle = '#bc8b64';
    c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(lx, top + 6);
    c.lineTo(bx, 61);
    c.stroke();
  }
  c.lineCap = 'butt';
  // round top with a little crocheted doily
  c.beginPath();
  c.ellipse(24, top + 2, 22, 5.2, 0, 0, Math.PI * 2);
  fillOut(c, lin(c, 0, top - 3, 0, top + 7, [[0, '#f2dcbb'], [1, '#dcba90']]), 2.6);
  c.beginPath();
  c.ellipse(24, top, 15, 3, 0, 0, Math.PI * 2);
  c.fillStyle = '#fffaf2';
  c.fill();
  c.strokeStyle = 'rgba(230,150,170,0.7)';
  c.lineWidth = 1.2;
  c.stroke();
  refresh(scene, 'phoneTable');
}

/** Ceiling lights, drawn as their own sprites so the glow sits behind them (the stair lantern and the kitchen light). */
function paintLampTextures(scene: Phaser.Scene): void {
  {
    const c = canvas(scene, 'pendant', 40, 96);
    paintPendant(c, 20, 0, 58, 15, '#faeac7');
    refresh(scene, 'pendant');
  }
  {
    const c = canvas(scene, 'ceilingLight', 44, 24);
    c.beginPath();
    rr(c, 10, 0, 24, 4, 2);
    fillOut(c, '#e9d6bd', 1.8);
    c.beginPath();
    c.moveTo(8, 4);
    c.quadraticCurveTo(8, 18, 22, 18);
    c.quadraticCurveTo(36, 18, 36, 4);
    c.closePath();
    fillOut(c, '#fbe6cf', 2.2);
    c.fillStyle = '#f6d98d';
    c.beginPath();
    c.ellipse(22, 14, 6, 3, 0, 0, Math.PI * 2);
    c.fill();
    refresh(scene, 'ceilingLight');
  }
}

function paintBed(scene: Phaser.Scene): void {
  const w = BED.w + 30;
  const h = 110;
  const c = canvas(scene, 'bed', w, h);
  const x0 = 8;
  const bedH = UPPER_Y - BED.topY;
  const top = h - bedH;
  // headboard
  c.beginPath();
  rr(c, x0 - 4, top - 56, 16, 56 + bedH - 2, 6);
  fillOut(c, lin(c, 0, 0, 16, 0, [[0, '#d1a57c'], [1, '#bc8b64']]), 2.8);
  c.beginPath();
  rr(c, x0 + BED.w - 6, top - 24, 12, 24 + bedH - 2, 5);
  fillOut(c, '#c79a70', 2.8);
  // frame
  c.beginPath();
  rr(c, x0 + 8, top + 8, BED.w - 12, bedH - 8, 4);
  fillOut(c, '#d1a57c', 2.8);
  // mattress
  c.beginPath();
  rr(c, x0 + 6, top - 4, BED.w - 8, 16, 7);
  fillOut(c, '#fef8f3', 2.8);
  // quilt (pastel w/ scallops)
  c.beginPath();
  rr(c, x0 + 40, top - 7, BED.w - 44, 14, 6);
  fillOut(c, lin(c, 0, 0, BED.w, 0, [[0, '#b7cdea'], [1, '#bdd4f4']]), 2.5);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 5; i++) {
    c.beginPath();
    c.arc(x0 + 54 + i * 18, top, 3, 0, Math.PI * 2);
    c.fill();
  }
  // pillow
  c.beginPath();
  rr(c, x0 + 12, top - 14, 34, 16, 8);
  fillOut(c, '#f8e0d9', 2.6);
  c.strokeStyle = 'rgba(220,130,160,0.6)';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(x0 + 20, top - 7);
  c.lineTo(x0 + 38, top - 7);
  c.stroke();
  refresh(scene, 'bed');
}

/** Bedside table with a lamp. Canvas origin: (BEDSIDE_TABLE.x - 32, BEDSIDE_TABLE.topY - 46). */
function paintNightstand(scene: Phaser.Scene): void {
  const c = canvas(scene, 'nightstand', 64, 100);
  const top = 46;
  // legs
  c.strokeStyle = OUT;
  c.lineCap = 'round';
  for (const lx of [12, 52]) {
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(lx, top + 34);
    c.lineTo(lx + (lx < 32 ? -1 : 1), 97);
    c.stroke();
    c.strokeStyle = '#bc8b64';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(lx, top + 34);
    c.lineTo(lx + (lx < 32 ? -1 : 1), 97);
    c.stroke();
    c.strokeStyle = OUT;
  }
  c.lineCap = 'butt';
  // cabinet + drawer
  c.beginPath();
  rr(c, 7, top + 6, 50, 36, 5);
  fillOut(c, lin(c, 0, top, 0, top + 44, [[0, '#ecd2b0'], [1, '#d9b88f']]), 2.6);
  c.beginPath();
  rr(c, 12, top + 11, 40, 13, 3);
  fillOut(c, '#f6e2c8', 1.8);
  c.beginPath();
  c.arc(32, top + 17.5, 2.6, 0, Math.PI * 2);
  fillOut(c, '#f1c46c', 1.4);
  c.beginPath();
  rr(c, 12, top + 28, 40, 9, 3);
  fillOut(c, '#f1d9bd', 1.6);
  // table top
  c.beginPath();
  rr(c, 3, top, 58, 9, 4);
  fillOut(c, lin(c, 0, top, 0, top + 9, [[0, '#f2dcbb'], [1, '#dcba90']]), 2.6);
  // lamp: a little low one so it stays clear of the window above
  c.beginPath();
  c.ellipse(32, top - 2, 9, 3.4, 0, 0, Math.PI * 2);
  fillOut(c, '#e99f8a', 2);
  c.strokeStyle = OUT;
  c.lineWidth = 2.6;
  c.beginPath();
  c.moveTo(32, top - 3);
  c.lineTo(32, top - 13);
  c.stroke();
  c.beginPath();
  c.moveTo(22, top - 13);
  c.lineTo(42, top - 13);
  c.lineTo(38, top - 28);
  c.lineTo(26, top - 28);
  c.closePath();
  fillOut(c, '#faeac7', 2.4);
  c.strokeStyle = 'rgba(200,150,100,0.45)';
  c.lineWidth = 1.2;
  for (const dx of [-5, 0, 5]) {
    c.beginPath();
    c.moveTo(32 + dx * 0.7, top - 28);
    c.lineTo(32 + dx * 1.5, top - 13);
    c.stroke();
  }
  refresh(scene, 'nightstand');
}

/** Kitchen fixtures. Canvas origin = KITCHEN_ORIGIN; (world x - 20, world y - 436). */
function paintKitchen(scene: Phaser.Scene): void {
  const { x: ox, y: oy } = KITCHEN_ORIGIN;
  const c = canvas(scene, 'kitchen', 214, FLOOR_Y - oy);
  const lx = (x: number): number => x - ox;
  const ly = (y: number): number => y - oy;

  // ---- fridge ----
  const f = KITCHEN.fridge;
  const fx = lx(f.x);
  const fy = ly(FLOOR_Y - f.h);
  // plant on top of the fridge
  c.beginPath();
  rr(c, fx + 8, fy - 12, 18, 12, 3);
  fillOut(c, '#f7b497', 1.8);
  c.fillStyle = '#86bb84';
  for (const [dx, dy, r] of [[11, -16, 7], [18, -20, 8], [25, -15, 6]] as [number, number, number][]) {
    c.beginPath();
    c.arc(fx + dx, fy + dy, r, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#679b66';
    c.lineWidth = 1.2;
    c.stroke();
  }
  c.beginPath();
  rr(c, fx, fy, f.w, f.h, 7);
  fillOut(c, lin(c, fx, 0, fx + f.w, 0, [[0, '#cdeadf'], [1, '#a9d6c9']]), 2.8);
  c.strokeStyle = OUT;
  c.lineWidth = 2.4;
  c.beginPath();
  c.moveTo(fx + 2, fy + 46);
  c.lineTo(fx + f.w - 2, fy + 46);
  c.stroke();
  // handles
  for (const [hy0, hy1] of [[fy + 14, fy + 34], [fy + 60, fy + 96]] as [number, number][]) {
    c.beginPath();
    rr(c, fx + f.w - 12, hy0, 5, hy1 - hy0, 2.5);
    fillOut(c, '#f6f3ec', 1.6);
  }
  // sheen
  c.fillStyle = 'rgba(255,255,255,0.35)';
  c.fillRect(fx + 6, fy + 8, 4, 32);
  c.fillRect(fx + 6, fy + 54, 4, 50);
  // fridge magnets and a note
  c.beginPath();
  rr(c, fx + 11, fy + 58, 15, 17, 1.5);
  fillOut(c, '#fdf3b4', 1.4);
  c.strokeStyle = 'rgba(160,130,60,0.6)';
  c.lineWidth = 1;
  for (const dy of [64, 68, 72]) {
    c.beginPath();
    c.moveTo(fx + 14, fy + dy);
    c.lineTo(fx + 23, fy + dy);
    c.stroke();
  }
  c.fillStyle = '#e99f8a';
  c.beginPath();
  c.arc(fx + 14, fy + 56, 3.6, 0, Math.PI * 2);
  c.arc(fx + 20, fy + 56, 3.6, 0, Math.PI * 2);
  c.moveTo(fx + 10.6, fy + 57.6);
  c.lineTo(fx + 17, fy + 64);
  c.lineTo(fx + 23.4, fy + 57.6);
  c.fill();

  // ---- counter with sink ----
  const k = KITCHEN.counter;
  const kx = lx(k.x);
  const ky = ly(FLOOR_Y - k.h);
  c.beginPath();
  rr(c, kx, ky + 6, k.w, k.h - 6, 4);
  fillOut(c, '#fdf1e4', 2.8);
  for (const dx of [4, k.w / 2 + 2]) {
    c.beginPath();
    rr(c, kx + dx, ky + 14, k.w / 2 - 6, k.h - 24, 4);
    fillOut(c, '#f6d3c9', 2);
    c.beginPath();
    c.arc(kx + dx + (dx < 10 ? k.w / 2 - 14 : 8), ky + 30, 2.6, 0, Math.PI * 2);
    fillOut(c, '#f1c46c', 1.4);
  }
  // toe-kick
  c.fillStyle = '#d5b793';
  c.fillRect(kx + 2, ky + k.h - 6, k.w - 4, 6);
  // worktop
  c.beginPath();
  rr(c, kx - 4, ky - 2, k.w + 8, 10, 4);
  fillOut(c, lin(c, 0, ky - 2, 0, ky + 8, [[0, '#f0d6b2'], [1, '#d9b68c']]), 2.6);
  // sink basin edge + faucet
  c.beginPath();
  rr(c, kx + 14, ky - 5, 44, 6, 3);
  fillOut(c, '#dfe9ee', 1.8);
  c.strokeStyle = OUT;
  c.lineWidth = 3.2;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(kx + 36, ky - 3);
  c.lineTo(kx + 36, ky - 18);
  c.quadraticCurveTo(kx + 36, ky - 25, kx + 45, ky - 23);
  c.lineTo(kx + 47, ky - 16);
  c.stroke();
  c.strokeStyle = '#cfdde6';
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(kx + 36, ky - 3);
  c.lineTo(kx + 36, ky - 18);
  c.quadraticCurveTo(kx + 36, ky - 25, kx + 45, ky - 23);
  c.lineTo(kx + 47, ky - 16);
  c.stroke();
  c.lineCap = 'butt';
  c.beginPath();
  c.arc(kx + 30, ky - 6, 2.4, 0, Math.PI * 2);
  c.arc(kx + 42, ky - 6, 2.4, 0, Math.PI * 2);
  fillOut(c, '#e99f8a', 1.2);
  // vase with flowers on the right of the counter
  c.beginPath();
  c.moveTo(kx + 71, ky - 2);
  c.quadraticCurveTo(kx + 63, ky - 15, kx + 72, ky - 22);
  c.lineTo(kx + 84, ky - 22);
  c.quadraticCurveTo(kx + 93, ky - 15, kx + 85, ky - 2);
  c.closePath();
  fillOut(c, '#c8e2f6', 2.2);
  for (const [dx, dy, col, s] of [[72, -36, '#eba997', 5.5], [79, -40, '#f7e6b0', 5.5], [86, -34, '#b1c9e8', 5]] as [number, number, string, number][]) {
    c.strokeStyle = '#76aa75';
    c.lineWidth = 1.8;
    c.beginPath();
    c.moveTo(kx + 78, ky - 22);
    c.lineTo(kx + dx, ky + dy + 4);
    c.stroke();
    c.beginPath();
    c.arc(kx + dx, ky + dy, s, 0, Math.PI * 2);
    fillOut(c, col, 1.5);
    c.fillStyle = '#faf0cd';
    c.beginPath();
    c.arc(kx + dx, ky + dy, 1.8, 0, Math.PI * 2);
    c.fill();
  }
  // dish towel hanging on the cabinet door
  c.beginPath();
  rr(c, kx + 8, ky + 12, 12, 24, 2);
  fillOut(c, '#fdfaf2', 1.4);
  c.fillStyle = 'rgba(233,110,140,0.55)';
  c.fillRect(kx + 9, ky + 18, 10, 3);
  c.fillRect(kx + 9, ky + 26, 10, 3);

  // ---- stove with hood ----
  const s = KITCHEN.stove;
  const sx = lx(s.x);
  const sy = ly(FLOOR_Y - s.h);
  // hood + flue
  c.beginPath();
  c.rect(sx + 16, ly(436), 14, sy - 80 - ly(436) + 12);
  fillOut(c, '#e7ebee', 2);
  c.beginPath();
  c.moveTo(sx + 1, sy - 56);
  c.lineTo(sx + s.w - 1, sy - 56);
  c.lineTo(sx + s.w - 9, sy - 76);
  c.lineTo(sx + 9, sy - 76);
  c.closePath();
  fillOut(c, lin(c, 0, sy - 76, 0, sy - 56, [[0, '#f3f5f6'], [1, '#d6dde2']]), 2.4);
  c.fillStyle = '#f6d98d';
  c.fillRect(sx + 8, sy - 59, s.w - 16, 3);
  // oven body
  c.beginPath();
  rr(c, sx, sy + 6, s.w, s.h - 6, 4);
  fillOut(c, lin(c, sx, 0, sx + s.w, 0, [[0, '#f9dcd5'], [1, '#f0c4bb']]), 2.8);
  c.beginPath();
  rr(c, sx + 5, sy + 24, s.w - 10, s.h - 36, 4);
  fillOut(c, '#f6e9e3', 2);
  c.beginPath();
  rr(c, sx + 9, sy + 30, s.w - 18, s.h - 50, 3);
  fillOut(c, '#7a6a86', 1.8);
  c.fillStyle = 'rgba(255,255,255,0.28)';
  c.fillRect(sx + 11, sy + 32, 6, s.h - 54);
  c.beginPath();
  rr(c, sx + 7, sy + 24, s.w - 14, 3.5, 1.6);
  fillOut(c, '#f1f1f1', 1.2);
  for (let i = 0; i < 4; i++) {
    c.beginPath();
    c.arc(sx + 8 + i * 10.6, sy + 14, 2.8, 0, Math.PI * 2);
    fillOut(c, '#fdf6ee', 1.4);
  }
  // hob + pot
  c.beginPath();
  rr(c, sx - 2, sy - 2, s.w + 4, 9, 3);
  fillOut(c, '#4d4358', 2.4);
  c.strokeStyle = '#9a8eab';
  c.lineWidth = 1.6;
  for (const bxx of [sx + 11, sx + s.w - 11]) {
    c.beginPath();
    c.ellipse(bxx, sy + 2, 7, 1.8, 0, 0, Math.PI * 2);
    c.stroke();
  }
  c.beginPath();
  rr(c, sx + 2, sy - 22, 19, 20, 4);
  fillOut(c, lin(c, 0, sy - 22, 0, sy - 2, [[0, '#a9d6d0'], [1, '#83bdb7']]), 2.2);
  c.beginPath();
  rr(c, sx + 1, sy - 25, 21, 6, 3);
  fillOut(c, '#c9e6e2', 2);
  c.beginPath();
  c.arc(sx + 11.5, sy - 29, 2.6, 0, Math.PI * 2);
  fillOut(c, '#f1c46c', 1.4);
  // kettle on the other burner
  c.beginPath();
  c.ellipse(sx + s.w - 12, sy - 9, 9, 8, 0, 0, Math.PI * 2);
  fillOut(c, '#f4c2b6', 2);
  c.strokeStyle = OUT;
  c.lineWidth = 2;
  c.beginPath();
  c.arc(sx + s.w - 12, sy - 14, 6, Math.PI, 0);
  c.stroke();
  refresh(scene, 'kitchen');
}

function paintDogBed(scene: Phaser.Scene): void {
  const c = canvas(scene, 'dogBed', DOG_BED.w + 14, 30);
  const cx = (DOG_BED.w + 14) / 2;
  // back bolster
  c.beginPath();
  c.ellipse(cx, 13, DOG_BED.w / 2 + 3, 11, 0, 0, Math.PI * 2);
  fillOut(c, lin(c, 0, 4, 0, 24, [[0, '#cfe6d3'], [1, '#b2d4ba']]), 2.4);
  // cushion
  c.beginPath();
  c.ellipse(cx, 19, DOG_BED.w / 2 + 1, 8.5, 0, 0, Math.PI * 2);
  fillOut(c, lin(c, 0, 11, 0, 28, [[0, '#d5ead8'], [1, '#bcdcc2']]), 2.4);
  c.beginPath();
  c.ellipse(cx, 17.5, DOG_BED.w / 2 - 9, 5.8, 0, 0, Math.PI * 2);
  c.fillStyle = '#fbf3e6';
  c.fill();
  c.strokeStyle = 'rgba(160,190,165,0.7)';
  c.lineWidth = 1.4;
  c.stroke();
  // little paw print + heart on the cushion
  c.fillStyle = '#e9c3b4';
  c.beginPath();
  c.ellipse(cx - 5, 18.5, 3.3, 2.4, 0, 0, Math.PI * 2);
  c.fill();
  for (const [dx, dy] of [[-8.6, 15.4], [-5.6, 14], [-2.4, 14.6], [0.4, 16]] as [number, number][]) {
    c.beginPath();
    c.arc(cx + dx, dy, 1.15, 0, Math.PI * 2);
    c.fill();
  }
  c.fillStyle = '#eeb4a4';
  c.beginPath();
  c.arc(cx + 9, 16.4, 2, 0, Math.PI * 2);
  c.arc(cx + 12.4, 16.4, 2, 0, Math.PI * 2);
  c.moveTo(cx + 7.1, 17.2);
  c.lineTo(cx + 10.7, 21);
  c.lineTo(cx + 14.3, 17.2);
  c.fill();
  refresh(scene, 'dogBed');
}

function paintBasket(scene: Phaser.Scene): void {
  const c = canvas(scene, 'basket', 52, 56);
  const bw = BASKET.w + 8;
  const bh = FLOOR_Y - BASKET.topY;
  // toys poking out
  c.beginPath();
  c.arc(18, 12, 7, 0, Math.PI * 2);
  fillOut(c, '#eeb5a4', 2);
  c.beginPath();
  rr(c, 26, 4, 12, 12, 3);
  fillOut(c, '#9fc7ef', 2);
  c.fillStyle = '#fff';
  c.font = 'bold 9px sans-serif';
  c.fillText('A', 29, 14);
  c.beginPath();
  rr(c, 2, 14, bw, bh + 8, 6);
  fillOut(c, lin(c, 0, 14, 0, 14 + bh, [[0, '#e8ca92'], [1, '#d0a765']]), 2.5);
  c.strokeStyle = 'rgba(140,90,50,0.55)';
  c.lineWidth = 1.5;
  for (let i = 1; i < 4; i++) {
    c.beginPath();
    c.moveTo(4, 14 + i * 8);
    c.lineTo(bw, 14 + i * 8);
    c.stroke();
  }
  for (let i = 1; i < 5; i++) {
    c.beginPath();
    c.moveTo(2 + i * (bw / 5), 16);
    c.lineTo(2 + i * (bw / 5), 14 + bh + 6);
    c.stroke();
  }
  refresh(scene, 'basket');
}

function paintArmchair(scene: Phaser.Scene): void {
  const c = canvas(scene, 'armchair', 110, 120);
  c.beginPath();
  rr(c, 14, 8, 68, 78, 22);
  fillOut(c, lin(c, 0, 8, 0, 86, [[0, '#f3cdc2'], [1, '#eeb4a4']]), 3);
  c.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 3; i++) {
    c.beginPath();
    c.arc(32 + i * 16, 36, 3.5, 0, Math.PI * 2);
    c.fill();
  }
  c.beginPath();
  rr(c, 8, 74, 80, 30, 12);
  fillOut(c, lin(c, 0, 74, 0, 104, [[0, '#f5d5cc'], [1, '#efbcad']]), 3);
  for (const ax of [2, 80]) {
    c.beginPath();
    rr(c, ax, 62, 16, 46, 8);
    fillOut(c, '#f0c0b2', 3);
  }
  c.fillStyle = '#bc8b64';
  for (const lx of [14, 78]) {
    c.fillRect(lx, 106, 8, 12);
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    c.strokeRect(lx, 106, 8, 12);
  }
  c.beginPath();
  rr(c, 34, 66, 26, 16, 6);
  fillOut(c, '#f7e6b0', 2.4);
  refresh(scene, 'armchair');
}

/** Standing reading lamp beside the armchair. */
function paintFloorLamp(scene: Phaser.Scene): void {
  const c = canvas(scene, 'floorLamp', 40, 126);
  // base
  c.beginPath();
  c.ellipse(20, 120, 13, 4.5, 0, 0, Math.PI * 2);
  fillOut(c, '#d1a57c', 2.2);
  // pole
  c.strokeStyle = OUT;
  c.lineWidth = 6.4;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(20, 118);
  c.lineTo(20, 40);
  c.stroke();
  c.strokeStyle = '#e1b88d';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(20, 118);
  c.lineTo(20, 40);
  c.stroke();
  c.lineCap = 'butt';
  // shade
  c.beginPath();
  c.moveTo(4, 40);
  c.lineTo(36, 40);
  c.lineTo(29, 8);
  c.lineTo(11, 8);
  c.closePath();
  fillOut(c, lin(c, 0, 8, 0, 40, [[0, '#fbeccb'], [1, '#f6d9b4']]), 2.6);
  c.strokeStyle = 'rgba(200,150,100,0.4)';
  c.lineWidth = 1.2;
  for (const dx of [-8, 0, 8]) {
    c.beginPath();
    c.moveTo(20 + dx * 0.6, 8);
    c.lineTo(20 + dx * 1.4, 40);
    c.stroke();
  }
  refresh(scene, 'floorLamp');
}

function paintEasel(scene: Phaser.Scene): void {
  const c = canvas(scene, 'easel', 80, 160);
  c.strokeStyle = OUT;
  c.lineCap = 'round';
  for (const [x1, y1, x2, y2] of [[20, 154, 34, 20], [60, 154, 46, 20], [40, 154, 40, 24]]) {
    c.lineWidth = 8;
    c.strokeStyle = OUT;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
    c.lineWidth = 4.5;
    c.strokeStyle = '#d1a57c';
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }
  c.beginPath();
  rr(c, 14, 96, 52, 7, 2);
  fillOut(c, '#e1b88d', 2.4);
  for (const [px, col] of [[22, '#eba997'], [34, '#83b6eb'], [46, '#f2dd77'], [58, '#91c591']] as [number, string][]) {
    c.beginPath();
    rr(c, px - 4, 88, 8, 8, 2);
    fillOut(c, col, 1.6);
  }
  refresh(scene, 'easel');
}

function paintRug(scene: Phaser.Scene): void {
  const c = canvas(scene, 'rug', 240, 26);
  c.beginPath();
  c.ellipse(120, 13, 116, 10, 0, 0, Math.PI * 2);
  fillOut(c, lin(c, 0, 0, 240, 0, [[0, '#f6d9d1'], [0.5, '#f9e3be'], [1, '#dce9f9']]), 2.4);
  c.beginPath();
  c.ellipse(120, 13, 92, 6.5, 0, 0, Math.PI * 2);
  c.strokeStyle = 'rgba(255,255,255,0.8)';
  c.lineWidth = 2;
  c.stroke();
  refresh(scene, 'rug');
}

/** Quilt overlay (drawn above her while she sleeps). */
function paintQuilt(scene: Phaser.Scene): void {
  const c = canvas(scene, 'quilt', 120, 40);
  c.beginPath();
  c.moveTo(6, 30);
  c.quadraticCurveTo(0, 8, 22, 6);
  c.lineTo(100, 8);
  c.quadraticCurveTo(116, 12, 114, 30);
  c.closePath();
  fillOut(c, lin(c, 0, 0, 120, 0, [[0, '#b7cdea'], [1, '#b6d1f3']]), 2.6);
  c.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 2; j++) {
      c.beginPath();
      c.arc(24 + i * 15, 14 + j * 10, 2.6, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.strokeStyle = 'rgba(255,255,255,0.9)';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(14, 8);
  c.quadraticCurveTo(60, 2, 102, 9);
  c.stroke();
  refresh(scene, 'quilt');
}

/** Garden props: watering-can stand, picnic blanket, flowerpot. */
function paintGardenProps(scene: Phaser.Scene): void {
  // watering-can stand
  {
    const c = canvas(scene, 'canStand', 70, 50);
    c.beginPath();
    rr(c, 4, 18, 62, 10, 3);
    fillOut(c, '#e1b88d', 2.4);
    c.beginPath();
    rr(c, 8, 28, 8, 22, 2);
    fillOut(c, '#d1a57c', 2.2);
    c.beginPath();
    rr(c, 54, 28, 8, 22, 2);
    fillOut(c, '#d1a57c', 2.2);
    refresh(scene, 'canStand');
  }
  // blanket
  {
    const c = canvas(scene, 'blanket', 190, 30);
    const outline = (): void => {
      c.beginPath();
      c.moveTo(14, 22);
      c.lineTo(34, 4);
      c.lineTo(166, 4);
      c.lineTo(182, 22);
      c.closePath();
    };
    outline();
    fillOut(c, '#f8e2db', 2.6);
    c.save();
    c.clip();
    c.fillStyle = 'rgba(255,150,185,0.55)';
    for (let x = 14; x < 190; x += 20) c.fillRect(x, 0, 10, 30);
    c.fillStyle = 'rgba(255,150,185,0.4)';
    for (let y = 4; y < 24; y += 10) c.fillRect(0, y, 190, 5);
    c.restore();
    outline();
    c.lineWidth = 2.6;
    c.strokeStyle = OUT;
    c.stroke();
    c.strokeStyle = '#eeb4a4';
    c.lineWidth = 2;
    for (let x = 18; x < 182; x += 12) {
      c.beginPath();
      c.moveTo(x, 22);
      c.lineTo(x - 1, 27);
      c.stroke();
    }
    refresh(scene, 'blanket');
  }
  // garden pot
  {
    const c = canvas(scene, 'gardenPot', GARDEN_POT.w + 24, 70);
    const pw = GARDEN_POT.w;
    const ph = FLOOR_Y - GARDEN_POT.topY;
    const ox = 12;
    for (const [fx, fy, col] of [[ox + pw / 2 - 8, 14, '#eba997'], [ox + pw / 2 + 4, 8, '#f7e6b0'], [ox + pw / 2 + 12, 18, '#b1c9e8']] as [number, number, string][]) {
      c.strokeStyle = '#76aa75';
      c.lineWidth = 2.4;
      c.beginPath();
      c.moveTo(ox + pw / 2, 70 - ph);
      c.lineTo(fx, fy + 4);
      c.stroke();
      c.beginPath();
      c.arc(fx, fy, 6, 0, Math.PI * 2);
      fillOut(c, col, 1.8);
      c.fillStyle = '#f8eab7';
      c.beginPath();
      c.arc(fx, fy, 2.2, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = '#86bb84';
    c.beginPath();
    c.ellipse(ox + pw / 2, 70 - ph + 3, pw / 2 + 4, 7, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(ox - 2, 70 - ph);
    c.lineTo(ox + pw + 2, 70 - ph);
    c.lineTo(ox + pw - 5, 70);
    c.lineTo(ox + 5, 70);
    c.closePath();
    fillOut(c, lin(c, 0, 70 - ph, 0, 70, [[0, '#f7b497'], [1, '#e6947a']]), 2.6);
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(ox + 3, 70 - ph + 4, 6, ph - 10);
    refresh(scene, 'gardenPot');
  }
}
