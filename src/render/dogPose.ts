import { lerp, smoothstep as sm } from '../core/math';
import type { DogAction } from '../entities/Dog';

/**
 * The dog is described by a flat record of numbers (a Pose). Every action is a small procedural function that fills the
 * pose from the action clock; several of those are evaluated at once and cross-faded by weight, so actions never pop.
 *
 * Body-local frame: x forward, y down, origin on the floor under the middle of the body (paws at y=0).
 */
export interface Pose {
  // whole body (about the floor point)
  ox: number; oy: number; rot: number; sx: number; sy: number; xs: number; flipY: number;
  // spine: hip (rump) and shoulder (chest) circles
  hipX: number; hipY: number; hipR: number; shX: number; shY: number; shR: number; arch: number; sag: number;
  // head, relative to the shoulder centre
  hdX: number; hdY: number; hdRot: number; hdSx: number;
  // face
  mouth: number; tongue: number; tcurl: number; grin: number; eyeOpen: number; smile: number; lid: number; lidTilt: number; brow: number;
  lookX: number; lookY: number; cheek: number; sparkle: number; pant: number;
  // ears: rest swing angle (+ = streams backward), curvature
  earA: number; earB: number; earBendA: number; earBendB: number;
  // feet (floor contact point of the paw) + paw angle offsets: near front, far front, near hind, far hind
  nfx: number; nfy: number; nfa: number; ffx: number; ffy: number; ffa: number;
  nhx: number; nhy: number; nha: number; fhx: number; fhy: number; fha: number;
  pads: number;
  // tail
  tailA: number; tailAmp: number; tailHz: number; tailCurl: number; tailFloor: number;
  // misc
  breath: number; breathHz: number; pawsOver: number; puff: number; shadowW: number; shadowX: number;
}

export type PoseKey = keyof Pose;

export function basePose(): Pose {
  return {
    ox: 0, oy: 0, rot: 0, sx: 1, sy: 1, xs: 1, flipY: 1,
    hipX: -12, hipY: -21, hipR: 12.5, shX: 9, shY: -22.5, shR: 12.8, arch: 1.5, sag: 2.5,
    hdX: 11, hdY: -11.5, hdRot: 0, hdSx: 1,
    mouth: 0, tongue: 0, tcurl: 0, grin: 0.7, eyeOpen: 1, smile: 0, lid: 0, lidTilt: 0, brow: 0,
    lookX: 0, lookY: 0, cheek: 0.5, sparkle: 0.3, pant: 0,
    earA: 0.16, earB: -0.5, earBendA: 0.4, earBendB: 0.3,
    nfx: 11, nfy: 0, nfa: 0, ffx: 15.5, ffy: -1.3, ffa: 0,
    nhx: -13, nhy: 0, nha: 0, fhx: -8.5, fhy: -1.3, fha: 0,
    pads: 0,
    tailA: -2.1, tailAmp: 0.2, tailHz: 1.4, tailCurl: 0.4, tailFloor: 0,
    breath: 0.025, breathHz: 0.55, pawsOver: 0, puff: 0, shadowW: 62, shadowX: 0
  };
}

export const POSE_KEYS = Object.keys(basePose()) as PoseKey[];

/** Everything an action function may look at. */
export interface Ctx {
  /** seconds since this action instance started */
  t: number;
  exc: number;
  speed: number;
  /** gait cycles travelled (distance based, so feet do not slide) */
  gait: number;
  lift: number;
  liftV: number;
  /** -1..1 idle glance, and where Carley is relative to the dog's facing (-1 behind .. 1 ahead) */
  glance: number;
  carleyDir: number;
  carleyNear: number;
}

type Fn = (p: Pose, c: Ctx) => void;

const TAU = Math.PI * 2;
const pulse = (x: number): number => Math.sin(Math.PI * Math.min(1, Math.max(0, x)));
/** soft envelope: 0 before a, 1 after b */
const ramp = (a: number, b: number, x: number): number => sm(a, b, x);

/** Footfall: returns [x in -1..1 (1 = forward), lift 0..1]. */
function legCycle(ph: number, duty: number): [number, number] {
  const c = ph - Math.floor(ph);
  if (c < duty) return [1 - (2 * c) / duty, 0];
  const u = (c - duty) / (1 - duty);
  const e = u * u * (3 - 2 * u);
  return [-1 + 2 * e, Math.sin(Math.PI * u)];
}

/** shared awake face + tail + ears driven by excitement, glances and where Carley is */
function awake(p: Pose, c: Ctx): void {
  const e = c.exc;
  const joy = sm(0.45, 0.85, e);
  p.mouth = joy * 0.42;
  p.tongue = joy * 0.9;
  p.sparkle = 0.25 + 0.75 * sm(0.3, 0.75, e);
  p.tailHz = 1.2 + 7 * e * e;
  p.tailAmp = 0.14 + 0.5 * e;
  p.earA = 0.16 - 0.38 * e;
  p.earB = -0.5 - 0.25 * e;
  p.cheek = 0.5 + 0.35 * e;
  p.lookX = Math.max(-1, Math.min(1, c.carleyDir * c.carleyNear + c.glance * 0.9));
  p.lookY = -0.3 * c.carleyNear;
  p.hdRot += 0.07 * c.glance;
}

// ---------------------------------------------------------------- locomotion

function loco(p: Pose, c: Ctx): void {
  awake(p, c);
  const sp = c.speed;
  const mv = sm(5, 38, sp);
  if (mv < 0.002) return;
  const trot = sm(80, 115, sp);
  const run = sm(160, 215, sp);
  const ph = c.gait;
  const duty = lerp(lerp(0.66, 0.52, trot), 0.4, run);
  const cyc = lerp(lerp(30, 40, trot), 82, run);
  const S = (cyc * duty * 0.5) * mv;
  const H = lerp(lerp(3.4, 4.6, trot), 7.5, run) * mv;
  const walkLag = 0.12 * (1 - trot);
  const oNF = 0;
  const oFF = lerp(0.5, 0.1, run);
  const oNH = lerp(0.5 + walkLag, 0.5, run);
  const oFH = lerp(walkLag, 0.6, run);
  const nf = legCycle(ph + oNF, duty);
  const ff = legCycle(ph + oFF, duty);
  const nh = legCycle(ph + oNH, duty);
  const fh = legCycle(ph + oFH, duty);
  const fwd = 3.5 * run;
  p.nfx += nf[0] * S + fwd; p.nfy -= nf[1] * H; p.nfa = -0.55 * nf[1];
  p.ffx += ff[0] * S + fwd; p.ffy -= ff[1] * H; p.ffa = -0.55 * ff[1];
  p.nhx += nh[0] * S - 1.5 * run; p.nhy -= nh[1] * H; p.nha = -0.5 * nh[1];
  p.fhx += fh[0] * S - 1.5 * run; p.fhy -= fh[1] * H; p.fha = -0.5 * fh[1];

  // body bob (twice per cycle when walking/trotting, once when bounding)
  const bobTrot = -lerp(1.1, 2.0, trot) * Math.cos(TAU * 2 * (ph - duty / 2));
  const bobRun = -4.2 * Math.cos(TAU * (ph - 0.2));
  const bob = lerp(bobTrot, bobRun, run) * mv;
  const stretch = Math.sin(TAU * (ph + 0.05)) * 3.2 * run * mv;
  p.hipY += bob + 0.9 * run * mv * Math.sin(TAU * ph);
  p.shY += bob - 0.9 * run * mv * Math.sin(TAU * ph);
  p.hipX += -3 * run * mv - stretch * 0.5;
  p.shX += 3 * run * mv + stretch * 0.5;
  p.hdX += 2 * run * mv;
  p.hdY += 2.2 * run * mv - bob * 0.35;
  p.hdRot += 0.05 * Math.sin(TAU * 2 * ph) * (1 - run) * mv - 0.08 * run * mv;
  // ears stream, tail flies
  p.earA += (0.25 * trot + 0.55 * run) * mv;
  p.earB += (0.35 * trot + 0.85 * run) * mv;
  p.tailA = lerp(p.tailA, -2.45 - 0.5 * run, mv * 0.8);
  p.tailAmp = lerp(p.tailAmp, 0.3 + 0.35 * run, mv * 0.5);
  p.tailHz = lerp(p.tailHz, 4 + 3 * run, mv * 0.4);
  // panting
  p.mouth = Math.max(p.mouth, (0.12 + 0.4 * run + 0.15 * trot) * mv);
  p.tongue = Math.max(p.tongue, (0.2 * trot + 0.95 * run) * mv);
  p.pant = Math.max(p.pant, 0.4 * run * mv);
  p.sparkle = Math.max(p.sparkle, 0.5 * run);
  p.shadowW += 6 * run * mv;
}

// ---------------------------------------------------------------- resting poses

const sit: Fn = (p, c) => {
  awake(p, c);
  p.hipX = -12; p.hipY = -12; p.shX = 2; p.shY = -27; p.shR = 12; p.arch = 0; p.sag = 0.5;
  p.hdX = 10; p.hdY = -12.5; p.hdRot = 0.04 + 0.07 * c.glance;
  p.nfx = 10.5; p.nfy = 0; p.ffx = 15; p.ffy = -1.3;
  p.nhx = 3.5; p.nhy = 0; p.fhx = 9; p.fhy = -1.3;
  p.nha = 0.1; p.fha = 0.1;
  p.tailA = 3.0; p.tailFloor = 1; p.tailAmp = 0.22 + 0.4 * c.exc; p.tailHz = 1.4 + 3.5 * c.exc;
  p.shadowW = 54; p.shadowX = -2;
};

const beg: Fn = (p, c) => {
  awake(p, c);
  const w = Math.sin(TAU * 0.7 * c.t);
  p.hipX = -10; p.hipY = -12; p.shX = -3 + 0.4 * w; p.shY = -32; p.shR = 11.8; p.arch = 0; p.sag = 0.5;
  p.hdX = 7.5; p.hdY = -13.5; p.hdRot = 0.3 + 0.05 * w;
  p.nfx = 13.5; p.nfy = -29.5; p.nfa = 1.25; p.ffx = 17.5; p.ffy = -25.5; p.ffa = 1.1;
  p.nhx = 5; p.nhy = 0; p.fhx = 10; p.fhy = -1.3; p.nha = 0.1; p.fha = 0.1;
  p.mouth = 0.22 + 0.06 * Math.sin(TAU * 2.2 * c.t); p.tongue = 0.55;
  p.sparkle = 1; p.lookY = -0.5; p.lookX = 0.2; p.cheek = 0.85;
  p.earA = 0.05; p.earB = -0.7;
  p.tailA = 3.0; p.tailFloor = 1; p.tailAmp = 0.3; p.tailHz = 2.6;
  p.pawsOver = 1;
  p.shadowW = 46; p.shadowX = -4;
};

const lie: Fn = (p, c) => {
  awake(p, c);
  const burst = pulse(((c.t % 3.4) - 0.3) / 1.2);
  p.hipX = -11; p.hipY = -11.5; p.hipR = 12; p.shX = 9; p.shY = -13; p.shR = 12.3; p.arch = 1.5; p.sag = 0;
  p.hdX = 11; p.hdY = -11.5; p.hdRot = 0.03 + 0.06 * c.glance;
  p.nfx = 28; p.nfy = 0; p.ffx = 32; p.ffy = -1.3;
  p.nhx = -1; p.nhy = 0; p.fhx = 4; p.fhy = -1.3; p.nha = 0.15; p.fha = 0.15;
  p.tailA = 3.05; p.tailFloor = 1; p.tailAmp = 0.1 + 0.5 * burst; p.tailHz = 1.4 + 4 * burst;
  p.shadowW = 84; p.shadowX = 4;
  p.breath = 0.035;
};

const sleep: Fn = (p, c) => {
  const b = Math.sin(TAU * 0.33 * c.t);
  p.hipX = -11; p.hipY = -10.5; p.hipR = 12.6; p.shX = 7; p.shY = -11.5; p.shR = 12.8; p.arch = 3.2; p.sag = 0;
  p.hdX = 9.5; p.hdY = -2.5; p.hdRot = 0.2;
  p.nfx = 26; p.nfy = 0; p.ffx = 29.5; p.ffy = -1.3;
  p.nhx = -2; p.nhy = 0; p.fhx = 3; p.fhy = -1.3; p.nha = 0.15; p.fha = 0.15;
  p.eyeOpen = 0; p.smile = 0; p.mouth = 0; p.cheek = 0.7; p.sparkle = 0; p.grin = 0.8;
  p.earA = 0.5; p.earB = 0.1; p.earBendA = 0.2;
  p.tailA = 3.1; p.tailFloor = 1; p.tailAmp = 0.04; p.tailHz = 0.4; p.tailCurl = 0.1;
  p.breath = 0.06; p.breathHz = 0.33; p.pawsOver = 1;
  p.hipY += 0.4 * b; p.shY += 0.4 * b;
  p.shadowW = 80; p.shadowX = 5;
};

// ---------------------------------------------------------------- small behaviours

const sniff: Fn = (p, c) => {
  awake(p, c);
  const s = Math.sin(TAU * 4.6 * c.t);
  const s2 = Math.sin(TAU * 4.6 * c.t + 1.3);
  const walk = loco; // can be sniffing while ambling
  walk(p, c);
  p.hipY = -21.5 + 0.0; p.shY = -19.5; p.shX = 10; p.hipX -= 0.5;
  p.hdX = 13.5; p.hdY = 6 + 1.1 * s; p.hdRot = 0.55 + 0.06 * s2;
  p.nfx += 2; p.ffx += 2;
  p.tailA = -1.75; p.tailAmp = 0.15; p.tailHz = 2.2;
  p.mouth = 0; p.tongue = 0; p.earA = 0.35 + 0.05 * s; p.earB = -0.1;
  p.lookY = 0.5; p.lookX = 0.6;
  p.pant = 0.5;
};

const scratch: Fn = (p, c) => {
  awake(p, c);
  const env = ramp(0, 0.25, c.t);
  const s = Math.sin(TAU * 8.5 * c.t);
  const s2 = Math.sin(TAU * 8.5 * c.t + 1.7);
  p.hipX = -12; p.hipY = -12; p.shX = 2.5; p.shY = -26.5; p.shR = 12; p.arch = 0; p.sag = 0.5;
  p.hdX = 8; p.hdY = -10.5; p.hdRot = -0.3 * env + 0.05 * s * env;
  p.nfx = 10.5; p.ffx = 15;
  p.nhx = lerp(3.5, 3 + 2.2 * s, env); p.nhy = lerp(0, -26 + 2.2 * s2, env); p.nha = lerp(0.1, -0.3, env);
  p.fhx = 9; p.fhy = -1.3;
  p.smile = 0.85 * env; p.mouth = 0.25 * env; p.tongue = 0.6 * env;
  p.tailA = 3.0; p.tailFloor = 1; p.tailAmp = 0.3; p.tailHz = 2.8;
  p.oy = 0.5 * s * env;
  p.shY += 0.5 * s2 * env;
  p.earA = 0.25 + 0.2 * s * env; p.earB = -0.4;
  p.shadowW = 54; p.shadowX = -2;
};

const shake: Fn = (p, c) => {
  awake(p, c);
  const env = ramp(0, 0.07, c.t) * Math.exp(-0.3 * c.t);
  const s = Math.sin(TAU * 12 * c.t);
  const s2 = Math.sin(TAU * 12 * c.t - 1.3);
  p.ox = 3.4 * env * s;
  p.rot = 0.045 * env * Math.sin(TAU * 12 * c.t + 0.8);
  p.sx = 1 + 0.045 * env * Math.sin(TAU * 24 * c.t);
  p.hdRot = 0.3 * env * s2; p.hdX += 1.6 * env * s2;
  p.hdSx = 1 + 0.07 * env * Math.sin(TAU * 24 * c.t + 0.5);
  p.hipX -= 1.2 * env * s; p.shX += 1.2 * env * s;
  p.eyeOpen = 1 - env; p.mouth = 0.35 * env; p.tongue = 0.5 * env;
  p.earA += 0.5 * env * s2; p.earB += 0.5 * env * s2;
  p.tailAmp = 0.2 + 0.9 * env; p.tailHz = 1.4 + 10.5 * env;
  p.nfx += 1.2 * env; p.ffx += 1.2 * env; p.nhx -= 1.2 * env; p.fhx -= 1.2 * env;
  p.hipY += 1.2 * env; p.shY += 1.2 * env;
};

const yawn: Fn = (p, c) => {
  awake(p, c);
  const y = ramp(0, 0.6, c.t) * (1 - ramp(1.7, 2.5, c.t));
  p.mouth = y; p.tongue = 0; p.tcurl = y;
  p.eyeOpen = 1 - 0.97 * y; p.cheek = 0.6;
  p.hdRot = -0.4 * y; p.hdY += -2 * y; p.hdX += -0.5 * y;
  p.arch += 1.5 * y;
  p.shX += 1.2 * y; p.hipX -= 1.4 * y;
  p.nfx += 2 * y; p.ffx += 2 * y;
  p.hipY -= 0.8 * y; p.shY -= 0.8 * y;
  p.earA = lerp(0.16, 0.45, y); p.earB = lerp(-0.5, -0.1, y);
  p.tailA = lerp(-2.1, -2.5, y); p.tailAmp = 0.1; p.tailHz = 1;
  p.breath = 0.04;
};

const stretch: Fn = (p, c) => {
  awake(p, c);
  const bounce = Math.sin(TAU * 2.6 * c.t);
  const env = ramp(0, 0.18, c.t);
  p.hipX = lerp(-12, -12.5, env); p.hipY = lerp(-21, -25.5, env); p.hipR = 12.4;
  p.shX = lerp(9, 8.5, env); p.shY = lerp(-22.5, -13.5, env) + 0.8 * bounce * env; p.shR = 12;
  p.arch = lerp(1.5, 2.5, env); p.sag = lerp(2.5, 0.5, env);
  p.hdX = lerp(11, 10.5, env); p.hdY = lerp(-11.5, -4.5, env) + 1.0 * bounce * env; p.hdRot = -0.18 * env + 0.05 * bounce * env;
  p.nfx = lerp(11, 24, env); p.ffx = lerp(15.5, 28, env);
  p.nhx = -14; p.fhx = -9.5;
  p.mouth = Math.max(p.mouth, 0.55 * env); p.tongue = Math.max(p.tongue, 0.85 * env);
  p.sparkle = 1; p.cheek = 0.85;
  p.tailA = -1.5; p.tailAmp = 0.5; p.tailHz = 9; p.tailCurl = 0.5;
  p.earA = -0.1; p.earB = -0.9;
  p.hipX += 0.9 * bounce * env;
  p.shadowW = 70; p.shadowX = 2;
};

const tilt: Fn = (p, c) => {
  awake(p, c);
  const env = ramp(0, 0.3, c.t);
  p.hdRot = -0.38 * env; p.hdY += -0.5 * env; p.hdX += 0.5 * env;
  p.shX += 1 * env; p.hipX -= 0.5 * env;
  p.earA = lerp(p.earA, 0.5, env); p.earB = lerp(p.earB, -2.75, env); p.earBendB = lerp(0.3, -0.8, env);
  p.sparkle = 1; p.lookX = 0.3; p.lookY = -0.4;
  p.tailAmp = 0.22; p.tailHz = 2.0;
  p.cheek = 0.7;
};

const whine: Fn = (p, c) => {
  awake(p, c);
  const tr = Math.sin(TAU * 22 * c.t);
  const env = ramp(0, 0.3, c.t);
  p.hdY += 3.5 * env; p.hdX += -2 * env; p.hdRot = 0.2 * env + 0.025 * tr;
  p.hipY += 1 * env; p.shY += 1.8 * env;
  p.lid = 0.38 * env; p.lidTilt = 0.55 * env; p.brow = env;
  p.eyeOpen = 0.95; p.sparkle = 1; p.mouth = 0; p.tongue = 0; p.grin = lerp(0.7, -0.9, env);
  p.earA = lerp(p.earA, 0.62, env); p.earB = lerp(p.earB, 0.15, env); p.earBendA = 0.1; p.earBendB = 0.1;
  p.tailA = lerp(-2.1, 2.35, env); p.tailAmp = 0.05; p.tailHz = 1.2; p.tailCurl = 0.15;
  p.ox = 0.4 * tr * env;
  p.lookX = 0.3; p.lookY = -0.7;
  p.cheek = 0.8;
  p.breath = 0.03;
};

const happy: Fn = (p, c) => {
  awake(p, c);
  const t = c.t;
  const hop = Math.abs(Math.sin(TAU * 1.15 * t));
  const wig = Math.sin(TAU * 4.6 * t);
  const env = ramp(0, 0.12, t);
  p.oy = -5.5 * hop * env;
  p.rot = 0.045 * wig * env;
  p.hipX += 2.6 * wig * env; p.shX -= 1.2 * wig * env;
  p.hdRot = (0.1 - 0.12 * wig) * env;
  p.smile = env; p.mouth = 0.6 * env; p.tongue = env; p.sparkle = 1; p.cheek = 1;
  p.tailAmp = 1.0; p.tailHz = 11;
  p.nfy = -2.8 * hop; p.ffy = -1.3 - 2.8 * hop; p.nhy = -2.8 * hop; p.fhy = -1.3 - 2.8 * hop;
  p.earA = -0.05; p.earB = -0.7;
  p.hipY -= 1 * hop; p.shY -= 1 * hop;
  p.shadowW = 62;
};

const spin: Fn = (p, c) => {
  awake(p, c);
  const T = 0.46;
  const th = (c.t / T) * TAU;
  const cs = Math.cos(th);
  const env = ramp(0, 0.15, c.t);
  const mag = Math.max(0.36, Math.abs(cs));
  p.xs = lerp(1, (cs < 0 ? -1 : 1) * mag, env);
  p.rot = 0.1 * Math.sin(th * 2) * env;
  p.oy = -2.2 * Math.abs(Math.sin(th)) * env;
  p.hipX = lerp(-12, -9, env); p.shX = lerp(9, 5, env); p.shY = -22; p.hipY = lerp(-21, -19.5, env);
  p.arch = lerp(1.5, 4.5, env);
  p.hdX = lerp(11, 9, env); p.hdY = lerp(-11.5, -8, env);
  p.hdRot = lerp(0, 0.55, env) + 0.25 * Math.sin(th) * env;
  p.tailA = lerp(-2.1, -1.1, env); p.tailAmp = 0.5; p.tailHz = 5; p.tailCurl = 0.7;
  const ph = c.t * 6.2;
  const a = legCycle(ph, 0.5);
  const b = legCycle(ph + 0.5, 0.5);
  p.nfx += a[0] * 6 * env; p.nfy -= a[1] * 5 * env;
  p.ffx += b[0] * 6 * env; p.ffy -= b[1] * 5 * env;
  p.nhx += b[0] * 6 * env; p.nhy -= b[1] * 5 * env;
  p.fhx += a[0] * 6 * env; p.fhy -= a[1] * 5 * env;
  p.mouth = 0.55 * env; p.tongue = 0.8 * env; p.sparkle = 1;
  p.earA = 0.5 * env; p.earB = 0.2 * env;
  p.shadowW = 52;
};

const bark: Fn = (p, c) => {
  awake(p, c);
  const tau = (c.t * 2.5) % 1;
  const e = tau < 0.12 ? tau / 0.12 : Math.exp(-(tau - 0.12) * 6.5);
  const env = ramp(0, 0.05, c.t);
  p.mouth = Math.min(1, e * 1.25) * env;
  p.tongue = 0.3 * e;
  p.hdX += 3.6 * e; p.hdY += -3.6 * e; p.hdRot = -0.26 * e + 0.05;
  p.shX += -1.2 * e; p.hipX += -1.8 * e; p.hipY += 0.8 * e;
  p.nfx += 3 * env; p.ffx += 3 * env; p.nhx += -1.5 * env; p.fhx += -1.5 * env;
  p.shY += 1.2 * e; p.hipY += 0.3 * env;
  p.earA = 0.35 * e; p.earB = -0.3 + 0.5 * e;
  p.eyeOpen = 1 - 0.3 * e; p.sparkle = 0.8;
  p.tailA = -1.75; p.tailAmp = 0.12; p.tailHz = 3;
  p.puff = e * env;
  p.oy = -0.7 * e;
};

const leap: Fn = (p, c) => {
  awake(p, c);
  const v = Math.max(-1, Math.min(1, c.liftV / 520));
  const wr = Math.max(0, v);
  const wf = Math.max(0, -v);
  const wa = 1 - Math.abs(v);
  const mix = (r: number, a: number, f: number): number => r * wr + a * wa + f * wf;
  p.hipX = mix(-14, -13, -9); p.hipY = mix(-22, -22, -20); p.hipR = 12.2;
  p.shX = mix(10, 10, 8); p.shY = mix(-31, -26, -23); p.shR = 12.4;
  p.arch = mix(3, 2.5, 3.5); p.sag = mix(0, 1, 3);
  p.hdX = mix(11, 12, 10); p.hdY = mix(-10.5, -11, -10.5); p.hdRot = mix(-0.35, -0.2, 0.15);
  p.nfx = mix(26, 27, 18); p.nfy = mix(-45, -28, -3); p.nfa = mix(-0.5, -0.3, 0);
  p.ffx = mix(30, 31, 22); p.ffy = mix(-41, -25, -4); p.ffa = mix(-0.5, -0.3, 0);
  p.nhx = mix(-23, -22, -6); p.nhy = mix(-6, -9, -4); p.nha = mix(0.4, 0.3, 0);
  p.fhx = mix(-18, -17, -1); p.fhy = mix(-9, -11, -5); p.fha = mix(0.4, 0.3, 0);
  p.mouth = mix(0.85, 0.7, 0.15); p.tongue = mix(0.5, 0.3, 0);
  p.sparkle = 1;
  p.earA = mix(0.7, 0.2, -0.5); p.earB = mix(0.5, -0.2, -1.0);
  p.tailA = mix(2.7, 2.9, -2.5); p.tailAmp = 0.15; p.tailHz = 4;
  p.eyeOpen = 1;
  p.shadowW = 56;
};

const roll: Fn = (p, c) => {
  awake(p, c);
  const t = c.t;
  const env = ramp(0, 0.35, t);
  const k1 = Math.sin(TAU * 3.1 * t);
  const k2 = Math.sin(TAU * 3.1 * t + 1.9);
  const k3 = Math.sin(TAU * 3.1 * t + 3.8);
  const k4 = Math.sin(TAU * 3.1 * t + 5.4);
  const rock = Math.sin(TAU * 1.5 * t);
  p.flipY = lerp(1, -1, env);
  p.hipX = -10; p.hipY = -12; p.hipR = 12.2; p.shX = 8; p.shY = -12; p.shR = 12.6; p.arch = 0; p.sag = 0;
  p.rot = 0.13 * rock * env;
  p.ox = 2.2 * Math.sin(TAU * 1.5 * t + 1.1) * env;
  // legs hang "down" in body space, which is up in the world once flipped
  const L = env;
  p.nfx = 14 + 3 * k1 * L; p.nfy = lerp(0, 5.5 + 3 * k2, L); p.nfa = 0.5 * k1 * L;
  p.ffx = 20 + 3 * k2 * L; p.ffy = lerp(-1.3, 5.5 + 3 * k3, L); p.ffa = 0.5 * k2 * L;
  p.nhx = -11 + 3 * k3 * L; p.nhy = lerp(0, 5.5 + 3 * k4, L); p.nha = 0.5 * k3 * L;
  p.fhx = -4 + 3 * k4 * L; p.fhy = lerp(-1.3, 5.5 + 3 * k1, L); p.fha = 0.5 * k4 * L;
  p.pads = env;
  p.hdX = lerp(11, 17, env); p.hdY = lerp(-11.5, -1.5, env); p.hdRot = lerp(0, -0.4, env) + 0.08 * rock * env;
  p.smile = env; p.mouth = 0.7 * env; p.tongue = env; p.sparkle = 1; p.cheek = 1;
  p.earA = lerp(p.earA, 0.35, env); p.earB = lerp(p.earB, -0.3, env);
  p.tailA = -2.4; p.tailAmp = 0.5; p.tailHz = 5; p.tailFloor = 1;
  p.shadowW = 76; p.shadowX = 3;
  p.breath = 0.03;
};

// ---------------------------------------------------------------- registry

export type Group = 'loco' | 'sit' | 'beg' | 'lie' | 'sleep' | 'sniff' | 'scratch' | 'shake' | 'yawn' | 'stretch' | 'tilt' | 'whine' | 'happy' | 'spin' | 'bark' | 'leap' | 'roll';

export const groupOf = (a: DogAction): Group => (a === 'stand' || a === 'walk' || a === 'trot' || a === 'run' ? 'loco' : a);

export const ACTION_FN: Record<Group, Fn> = {
  loco,
  sit, beg, lie, sleep, sniff, scratch, shake, yawn, stretch, tilt, whine, happy, spin, bark, leap, roll
};

/** How quickly the cross-fade into this action runs (1/s). */
export const BLEND_RATE: Record<Group, number> = {
  loco: 9, sit: 7, beg: 7, lie: 5, sleep: 3.5, sniff: 9, scratch: 8, shake: 18, yawn: 6, stretch: 9, tilt: 8, whine: 6,
  happy: 10, spin: 12, bark: 22, leap: 16, roll: 7
};

export interface Layer { g: Group; t: number; w: number }

/** Weighted blend of the layers' poses into `out`. */
export function mixLayers(layers: Layer[], c: Omit<Ctx, 't'>, out: Pose): void {
  let total = 0;
  for (const l of layers) total += l.w;
  for (const k of POSE_KEYS) out[k] = 0;
  for (const l of layers) {
    if (l.w < 1e-4) continue;
    const p = basePose();
    ACTION_FN[l.g](p, { ...c, t: l.t });
    const w = l.w / total;
    for (const k of POSE_KEYS) out[k] += p[k] * w;
  }
}
