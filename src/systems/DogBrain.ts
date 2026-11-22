import { BED, DOG_BED, FLOOR_Y, KITCHEN, PLANT_XS, STAIRS, WALL_OUTER_X, WORLD_RIGHT_X } from '../config/worldLayout';
import type { Level } from '../core/types';
import { DOG_SPEED, type DogAction } from '../entities/Dog';
import type { Mosquito } from '../entities/Insect';
import type { Simulation } from '../sim/Simulation';

export type DogMode = 'idle' | 'wander' | 'sleep' | 'follow' | 'attention' | 'guard' | 'play' | 'petted' | 'fetch';
type Gait = 'walk' | 'trot' | 'run';
type Arrive = 'sniff' | 'sit' | 'beg' | 'lie' | 'look' | 'stand';

interface Spot {
  x: number;
  level: Level;
  then: Arrive;
  weight: number;
}

/** Idle behaviours: [action, seconds, weight]. */
const MICROS: [DogAction, number, number][] = [
  ['sit', 3.2, 1.2], ['scratch', 2.2, 0.8], ['yawn', 1.7, 0.6], ['tilt', 1.6, 0.8], ['sniff', 2.6, 0.9],
  ['stretch', 1.9, 0.6], ['stand', 2.4, 0.9], ['happy', 1.4, 0.4]
];

/**
 * The dalmatian's mind. He does his own thing (wanders, sniffs, naps, zooms about), asks Carley for attention, follows
 * her around, defends her from mosquitoes, and joins in when she pets him or plays fetch. Everything is expressed
 * through `Dog` (a body + one DogAction at a time) and `sim.bus` sounds/events.
 */
export class DogBrain {
  mode: DogMode = 'idle';
  /** 0..100: how much he wants a fuss. */
  attention = 40;
  /** 0..100 */
  energy = 80;
  /** 0..100: grows with petting and play, makes him follow more and stay closer. */
  bond = 35;

  private t = 0;
  private duration = 4;
  private spot: Spot | null = null;
  private stage = 0;
  private stageT = 0;
  private cool = { attention: 12, play: 25, guardBark: 0, leap: 0, call: 0, bark: 0 };
  private sleepSpotUpper = false;
  private lastCaughtAt = -999;
  private wasOutdoors = false;
  private zoomPoints: number[] = [];
  private leapChecked = false;
  private chaseButterfly = false;
  private micro: DogAction = 'stand';
  private pauseUntil = 0;

  constructor(private sim: Simulation) {}

  get dog() {
    return this.sim.dog;
  }

  /** Called after Carley fussed over him or played with him. */
  rewardAttention(amount: number): void {
    this.attention = Math.max(0, this.attention - amount);
    this.bond = Math.min(100, this.bond + amount * 0.12);
    this.dog.excitement = 1;
  }

  enter(mode: DogMode, duration = 6): void {
    this.mode = mode;
    this.t = 0;
    this.duration = duration;
    this.stage = 0;
    this.stageT = 0;
    this.spot = null;
    this.leapChecked = false;
  }

  // ------------------------------------------------------------------ helpers

  private go(x: number, level: Level, gait: Gait, tol = 10): boolean {
    const d = this.dog;
    const arrived = d.moveToward(x, level, DOG_SPEED[gait], tol);
    if (arrived) return true;
    if (!d.airborne) d.play(gait);
    return false;
  }

  /** Slow to a stop, then strike the pose. */
  private settle(action: DogAction): void {
    const d = this.dog;
    d.stop();
    if (Math.abs(d.vx) < 8) d.play(action);
    else d.play(d.speed > 150 ? 'trot' : 'walk');
  }

  private gaitFor(dx: number): Gait {
    const d = Math.abs(dx);
    if (d > 300 && this.energy > 15) return 'run';
    if (d > 130) return 'trot';
    return this.sim.rng.chance(0.3) ? 'trot' : 'walk';
  }

  private bark(kind: 'bark' | 'yip' | 'yipHappy' = 'bark'): void {
    const d = this.dog;
    d.play('bark', true);
    this.sim.bus.emit('sfx', { id: kind, x: d.x });
  }

  private carleyAsleep(): boolean {
    return this.sim.brain.isSleeping;
  }

  private get night(): boolean {
    const h = this.sim.clock.hour;
    return h >= 21 || h < 6.5;
  }

  // ------------------------------------------------------------------ main update

  update(dt: number): void {
    const sim = this.sim;
    const d = this.dog;
    const c = sim.agent;
    this.t += dt;
    this.stageT += dt;
    for (const k of Object.keys(this.cool) as (keyof typeof this.cool)[]) this.cool[k] = Math.max(0, this.cool[k] - dt);

    // needs: he gets lonely, tires out when racing about and recovers when resting
    const resting = this.mode === 'sleep' || d.action === 'lie' || d.action === 'sit';
    this.attention = Math.min(100, this.attention + dt * (this.carleyAsleep() ? 0.15 : 0.7));
    if (d.speed > 180) this.energy = Math.max(0, this.energy - dt * 3.2);
    else if (d.speed > 70) this.energy = Math.max(0, this.energy - dt * 0.9);
    else this.energy = Math.min(100, this.energy + dt * (this.mode === 'sleep' ? 2.6 : resting ? 0.9 : 0.25));
    d.excitement += ((this.mode === 'sleep' ? 0.05 : d.speed > 100 ? 0.8 : 0.3) - d.excitement) * Math.min(1, dt * 0.8);

    // ---- interruptions, in order of importance ----
    if (sim.dogPet.active && this.mode !== 'petted') this.enter('petted', 999);
    else if (sim.fetch.active && this.mode !== 'fetch') this.enter('fetch', 999);
    else if (!sim.dogPet.active && this.mode === 'petted') this.enter('follow', 20 + this.bond * 0.3);
    else if (!sim.fetch.active && this.mode === 'fetch') {
      this.dog.carrying = false;
      this.enter('follow', 25 + this.bond * 0.3);
    }
    if (this.mode !== 'petted' && this.mode !== 'fetch' && this.mode !== 'guard' && this.threat()) this.enter('guard', 999);

    // caught in the rain: dash inside and shake off
    const outdoors = d.x >= WALL_OUTER_X - 10;
    if (this.wasOutdoors && !outdoors && sim.weather.raining) {
      d.play('shake', true);
      sim.bus.emit('sfx', { id: 'dogShake', x: d.x });
    }
    this.wasOutdoors = outdoors;

    switch (this.mode) {
      case 'idle': this.doIdle(); break;
      case 'wander': this.doWander(); break;
      case 'sleep': this.doSleep(); break;
      case 'follow': this.doFollow(); break;
      case 'attention': this.doAttention(); break;
      case 'guard': this.doGuard(); break;
      case 'play': this.doPlay(); break;
      case 'petted': this.doPetted(); break;
      case 'fetch': this.doFetch(); break;
    }
    void c;
  }

  // ------------------------------------------------------------------ idle & choosing what to do next

  private doIdle(): void {
    const d = this.dog;
    // never loiter halfway up the staircase
    if (d.plane === 'stairs') {
      this.go(d.x, d.stairsGoal, 'walk');
      return;
    }
    if (this.stage === 0) {
      this.stage = 1;
      this.stageT = 0;
      const m = this.sim.rng.weighted(MICROS, (x) => x[2]);
      this.duration = m[1];
      this.micro = m[0];
      this.settle(m[0]);
    }
    const micro = this.micro;
    if (this.stageT < 0.4) this.settle(micro);
    if (micro === 'sniff' && this.stageT > 0.4 && this.stageT < 0.5) this.sim.bus.emit('sfx', { id: 'sniff', x: d.x, volume: 0.6 });
    if (micro === 'yawn' && this.stageT > 0.5 && this.stageT < 0.6) this.sim.bus.emit('sfx', { id: 'dogSigh', x: d.x, volume: 0.7 });
    if (micro === 'scratch' && this.stageT > 0.4 && this.stageT < 0.5) this.sim.bus.emit('sfx', { id: 'tailThump', x: d.x, volume: 0.5 });
    if (this.t >= this.duration) this.decide();
  }

  /** Pick what he does next, weighted by how he feels and what Carley is up to. */
  private decide(): void {
    const sim = this.sim;
    const d = this.dog;
    const c = sim.agent;
    const asleep = this.carleyAsleep();
    const options: [() => void, number][] = [];
    const tired = this.energy < 25 ? 3 : this.night && this.energy < 85 ? 2.4 : this.energy < 55 ? 0.5 : 0.08;
    options.push([() => this.startSleep(), tired]);
    options.push([() => this.startWander(), 1.5]);
    options.push([() => this.enter('idle', 3), 1.1]);
    const sees = Math.abs(c.x - d.x) < 520 || d.x >= WALL_OUTER_X === c.x >= WALL_OUTER_X;
    if (!asleep) {
      options.push([() => this.enter('follow', 12 + this.bond * 0.25 + sim.rng.range(0, 10)), sees ? 0.35 + this.bond / 120 : 0.1]);
      if (this.attention > 55 && this.cool.attention <= 0) options.push([() => this.enter('attention', 18), (this.attention - 40) / 10]);
      if (this.energy > 55 && this.cool.play <= 0) options.push([() => this.startPlay(), 1 + this.energy / 80]);
    }
    const pick = sim.rng.weighted(options, (o) => o[1]);
    pick[0]();
  }

  // ------------------------------------------------------------------ wandering to places of interest

  private spots(): Spot[] {
    const sim = this.sim;
    const out: Spot[] = [
      { x: DOG_BED.x + DOG_BED.w / 2, level: 'ground', then: 'lie', weight: 1 },
      { x: KITCHEN.fridge.x + 70, level: 'ground', then: 'beg', weight: 0.9 },
      { x: 468, level: 'ground', then: 'look', weight: 0.8 },
      { x: 372, level: 'ground', then: 'sit', weight: 0.5 },
      { x: 232, level: 'ground', then: 'sniff', weight: 0.6 },
      { x: 250, level: 'upper', then: 'lie', weight: this.sim.brain.isSleeping ? 2 : 0.5 },
      { x: 200, level: 'upper', then: 'sniff', weight: 0.4 }
    ];
    const outside = !sim.weather.raining && sim.clock.daylight > 0.25;
    if (outside) {
      out.push(
        { x: PLANT_XS[sim.rng.int(0, PLANT_XS.length - 1)], level: 'ground', then: 'sniff', weight: 1.6 },
        { x: 1130, level: 'ground', then: 'sit', weight: 0.8 },
        { x: 1030, level: 'ground', then: 'lie', weight: sim.directSun > 0.5 ? 1.4 : 0.3 },
        { x: sim.rng.range(580, 1200), level: 'ground', then: 'sniff', weight: 1.2 },
        { x: 930, level: 'ground', then: 'sniff', weight: 0.5 }
      );
    }
    return out;
  }

  private startWander(): void {
    const sim = this.sim;
    const d = this.dog;
    const spots = this.spots();
    // stays where he is more often than not (indoors/outdoors), and rarely climbs the stairs
    const here = d.x >= WALL_OUTER_X ? 'out' : 'in';
    const pick = sim.rng.weighted(spots, (s) => {
      const where = s.x >= WALL_OUTER_X ? 'out' : 'in';
      return s.weight * (where === here ? 1 : 0.35) * (s.level === 'upper' && d.level !== 'upper' ? 0.45 : 1);
    });
    this.enter('wander', 40);
    this.spot = pick;
  }

  private doWander(): void {
    const d = this.dog;
    const s = this.spot;
    if (!s) return this.enter('idle', 2);
    if (this.stage === 0) {
      const dx = s.x - d.x;
      if (this.go(s.x, s.level, this.gaitFor(dx), 14) && d.level === s.level) {
        this.stage = 1;
        this.stageT = 0;
        this.duration = this.sim.rng.range(2.5, 5);
      }
      if (this.t > 40) this.enter('idle', 2);
      return;
    }
    const act: DogAction = s.then === 'look' ? 'stand' : s.then === 'beg' ? 'beg' : s.then === 'lie' ? 'lie' : s.then === 'sniff' ? 'sniff' : 'sit';
    this.settle(act);
    if (s.then === 'look') d.facing = d.x < 500 ? 1 : d.facing;
    if (s.then === 'sniff' && this.stageT > 0.3 && this.stageT < 0.4) this.sim.bus.emit('sfx', { id: 'sniff', x: d.x, volume: 0.6 });
    if (this.stageT >= this.duration) this.enter('idle', 2);
  }

  // ------------------------------------------------------------------ sleep

  private startSleep(): void {
    const sim = this.sim;
    // with Carley asleep upstairs (or if she's his favourite person) he naps beside her bed
    this.sleepSpotUpper = (sim.brain.isSleeping || sim.agent.level === 'upper') && this.bond > 25;
    this.enter('sleep', sim.rng.range(30, 60));
  }

  private doSleep(): void {
    const d = this.dog;
    const sim = this.sim;
    const upper = this.sleepSpotUpper;
    const x = upper ? 252 : DOG_BED.x + DOG_BED.w / 2;
    if (this.stage === 0) {
      if (this.go(x, upper ? 'upper' : 'ground', 'walk', 10) && d.level === (upper ? 'upper' : 'ground')) {
        this.stage = 1;
        this.stageT = 0;
        d.faceToward(x + (upper ? -40 : -20));
      }
      if (this.t > 30) this.stage = 1;
      return;
    }
    this.settle(this.stageT > 1.8 ? 'sleep' : 'lie');
    if (this.stageT > 2.5 && Math.floor(this.stageT / 3.4) !== Math.floor((this.stageT - 0.05) / 3.4)) {
      sim.bus.emit('sfx', { id: 'snore', x: d.x, volume: 0.35 });
    }
    // wakes up when rested (and, at night, only with the sun), or when Carley is nearby wanting company
    const rested = this.energy >= 90 || (this.t > this.duration && this.energy > 60 && !this.night);
    const morning = !this.night;
    const company = this.attention > 75 && !this.carleyAsleep() && Math.abs(sim.agent.x - d.x) < 120 && sim.agent.level === d.level;
    if ((rested && (morning || this.energy >= 98)) || company || this.t > 150) {
      d.play('stretch', true);
      sim.bus.emit('sfx', { id: 'dogSigh', x: d.x });
      this.enter('idle', 3);
    }
  }

  // ------------------------------------------------------------------ following Carley

  private doFollow(): void {
    const sim = this.sim;
    const d = this.dog;
    const c = sim.agent;
    if (c.plane === 'stairs' && d.plane === 'stairs' && d.stairsGoal === c.level) {
      this.go(c.x, c.level, 'walk', 4);
      return;
    }
    if (this.carleyAsleep()) {
      this.startSleep();
      this.sleepSpotUpper = true;
      return;
    }
    const level = c.level;
    // trail a little behind her, on the side she came from
    const behind = c.x - c.facing * (62 + (this.bond < 40 ? 24 : 0));
    const dx = c.x - d.x;
    const far = Math.abs(dx) > 78 || d.level !== level || d.plane === 'stairs'; // never stops halfway up the stairs
    if (far) {
      this.stage = 0;
      this.go(behind, level, d.level !== level ? 'trot' : this.gaitFor(dx), 8);
      return;
    }
    // close by: sit when she stands still, lie when she settles into an activity
    d.faceToward(c.x);
    const busy = sim.brain.run && sim.brain.run.activity.id !== 'idle' && sim.brain.state === 'PERFORM_ACTIVITY';
    if (c.moving !== 'none') {
      this.settle('stand');
      this.stageT = 0;
    } else if (busy && this.stageT > 5) this.settle('lie');
    else if (this.stageT > 1.2) this.settle('sit');
    else this.settle('stand');
    if (this.t >= this.duration) {
      // wanders off to do his own thing again
      if (this.attention > 70 && this.cool.attention <= 0) this.enter('attention', 16);
      else this.enter('idle', 2);
    }
  }

  // ------------------------------------------------------------------ asking for a fuss

  private doAttention(): void {
    const sim = this.sim;
    const d = this.dog;
    const c = sim.agent;
    if (this.carleyAsleep()) return this.enter('idle', 2);
    const level = c.level;
    if (this.stage === 0) {
      const side = d.x >= c.x ? 1 : -1;
      const target = c.x + side * 50;
      const dx = target - d.x;
      if (this.go(target, level, this.gaitFor(dx), 10) && d.level === level) {
        this.stage = 1;
        this.stageT = 0;
        this.cool.call = 0.4;
        sim.bus.emit('dogCall');
      }
      if (this.t > 14) {
        this.cool.attention = 20;
        this.enter('idle', 2);
      }
      return;
    }
    // wait politely by her feet, begging and now and then yipping
    d.faceToward(c.x);
    if (Math.abs(c.x - d.x) > 90 || d.level !== level || d.plane === 'stairs') {
      this.stage = 0;
      return;
    }
    if (this.cool.call <= 0 && d.action !== 'bark') {
      const r = sim.rng.next();
      if (r < 0.55) this.bark('yip');
      else if (r < 0.8) {
        d.play('whine', true);
        sim.bus.emit('sfx', { id: 'whine', x: d.x });
      } else d.play('tilt', true);
      this.cool.call = sim.rng.range(2.6, 4.4);
    } else if (d.action !== 'bark' && d.action !== 'whine' && d.action !== 'tilt') this.settle(this.stageT % 6 < 3.4 ? 'beg' : 'sit');
    // if Carley is busy with something he is not forgotten for long: she says hi without stopping
    const busy = sim.brain.state === 'PERFORM_ACTIVITY' && sim.brain.run && sim.brain.run.activity.id !== 'idle';
    if (busy && this.stageT > 6 && !sim.brain.reaction) {
      sim.say('dogHi', 3);
      this.rewardAttention(35);
      d.play('happy', true);
      this.cool.attention = 25;
      this.enter('follow', 30);
      return;
    }
    if (this.stageT > this.duration) {
      // ignored: a sad little sigh, then he curls up by her feet
      d.play('whine', true);
      sim.bus.emit('sfx', { id: 'dogSigh', x: d.x });
      this.cool.attention = 25;
      this.attention = 55;
      this.enter('idle', 4);
    }
  }

  // ------------------------------------------------------------------ guarding Carley against mosquitoes

  private threat(): Mosquito | null {
    const sim = this.sim;
    const d = this.dog;
    const c = sim.agent;
    if (sim.mosquitoes.length === 0) return null;
    if (this.energy < 8) return null;
    let best: Mosquito | null = null;
    let bd = 1e9;
    for (const m of sim.mosquitoes) {
      if (m.state === 'dying' || m.state === 'flee') continue;
      const toCarley = Math.abs(m.x - c.x);
      const toDog = Math.abs(m.x - d.x);
      // he only cares about bugs that are near Carley (or right under his nose)
      if (!(sim.isOutdoors && toCarley < 420) && toDog > 150) continue;
      // a deeply sleeping dog still wakes for a bug that is really on top of Carley
      if (this.mode === 'sleep' && toCarley > 220 && this.bond < 40) continue;
      const score = Math.min(toCarley, toDog * 1.5);
      if (score < bd) {
        bd = score;
        best = m;
      }
    }
    return best;
  }

  private doGuard(): void {
    const sim = this.sim;
    const d = this.dog;
    const c = sim.agent;
    const m = this.threat();
    if (!m) {
      // all clear: a proud little prance, then back to Carley for praise
      if (sim.time - this.lastCaughtAt < 6) {
        this.attention = Math.max(this.attention, 70);
        d.play('happy', true);
        this.enter('follow', 20);
      } else this.enter('idle', 2);
      return;
    }
    if (d.plane === 'stairs') {
      this.go(d.x, 'ground', 'run');
      return;
    }
    if (d.level !== 'ground') {
      this.go(c.x, 'ground', 'run');
      return;
    }
    // stay between the bug and Carley, within sight of her
    const lo = Math.max(WALL_OUTER_X + 10, c.x - 170);
    const hi = Math.min(WORLD_RIGHT_X - 10, c.x + 170);
    const tx = sim.isOutdoors ? Math.min(hi, Math.max(lo, m.x)) : m.x;
    const dx = tx - d.x;
    const airborne = d.airborne;
    if (!airborne) {
      if (Math.abs(dx) > 24) this.go(tx, 'ground', Math.abs(dx) > 100 ? 'run' : 'trot', 14);
      else {
        d.stop();
        if (Math.abs(d.vx) < 10 && d.action !== 'bark' && d.action !== 'leap') d.play('stand');
      }
    }
    d.faceToward(m.x);
    d.excitement = 1;
    const reach = FLOOR_Y - m.y; // how high the bug is above the floor
    // bark to scare it off: it may bolt
    if (this.cool.bark <= 0 && !airborne && Math.abs(m.x - d.x) < 190) {
      this.bark('bark');
      this.cool.bark = sim.rng.range(1.0, 1.8);
      if (sim.rng.chance(reach > 170 ? 0.5 : 0.22)) m.shoo();
    }
    // jump for it when it is low enough and close
    if (!airborne && this.cool.leap <= 0 && Math.abs(m.x - d.x) < 90 && reach < 185) {
      d.faceToward(m.x);
      d.leap(560 + sim.rng.range(0, 70));
      d.play('leap', true);
      this.cool.leap = 0.85;
      this.leapChecked = false;
    }
    // at the top of the jump: did he get it?
    if (airborne && !this.leapChecked && d.liftV <= 40) {
      this.leapChecked = true;
      const mouth = d.mouthPos();
      const dist = Math.hypot(mouth.x - m.x, mouth.y - m.y);
      if (dist < 46) {
        sim.eatMosquito(m);
        this.lastCaughtAt = sim.time;
        sim.bus.emit('sfx', { id: 'chomp', x: d.x });
        sim.bus.emit('sfx', { id: 'yipHappy', x: d.x });
        sim.bus.emit('dogCaught', { x: m.x, y: m.y });
        this.energy = Math.max(0, this.energy - 3);
        this.bond = Math.min(100, this.bond + 1.2);
      }
    }
  }

  // ------------------------------------------------------------------ zoomies and butterfly chasing

  private startPlay(): void {
    const sim = this.sim;
    const d = this.dog;
    this.chaseButterfly = d.x >= WALL_OUTER_X && sim.butterflies.length > 0 && sim.rng.chance(0.55);
    const outdoors = d.x >= WALL_OUTER_X - 10 && !sim.weather.raining;
    const [lo, hi] = outdoors ? [580, 1200] : [70, 460];
    this.zoomPoints = [sim.rng.range(lo, hi), sim.rng.range(lo, hi), sim.rng.range(lo, hi), sim.rng.range(lo, hi), sim.rng.range(lo, hi), sim.rng.range(lo, hi)];
    this.cool.play = 28;
    this.enter('play', 24);
    this.pauseUntil = 0;
  }

  private doPlay(): void {
    const sim = this.sim;
    const d = this.dog;
    if (d.plane === 'stairs') {
      this.go(d.x, d.stairsGoal, 'run');
      return;
    }
    if (this.chaseButterfly) {
      const b = sim.nearestButterflyTo(d.x);
      if (!b || this.t > 14 || d.x < WALL_OUTER_X) {
        this.finishPlay();
        return;
      }
      const dx = b.x - d.x;
      if (!d.airborne) this.go(b.x, 'ground', Math.abs(dx) > 40 ? 'run' : 'trot', 10);
      d.faceToward(b.x);
      if (!d.airborne && this.cool.leap <= 0 && Math.abs(dx) < 70 && FLOOR_Y - b.y < 200) {
        d.leap(600);
        d.play('leap', true);
        this.cool.leap = 1.1;
        sim.bus.emit('sfx', { id: 'yipHappy', x: d.x, volume: 0.8 });
      }
      return;
    }
    const i = this.stage;
    if (i >= this.zoomPoints.length || this.t > this.duration) {
      this.finishPlay();
      return;
    }
    // a play bow / spin / yip on the spot between dashes
    if (this.t < this.pauseUntil) return;
    if (this.go(this.zoomPoints[i], 'ground', 'run', 22)) {
      this.stage++;
      this.stageT = 0;
      this.pauseUntil = this.t + 1.3;
      const r = sim.rng.next();
      if (r < 0.4) {
        d.play('stretch', true);
        this.bark('yipHappy');
      } else if (r < 0.7) d.play('spin', true);
      else this.bark('yip');
      d.stop();
    }
  }

  private finishPlay(): void {
    const d = this.dog;
    d.play('happy', true);
    this.energy = Math.max(0, this.energy - 10);
    this.enter('idle', 3);
  }

  // ------------------------------------------------------------------ belly rubs

  private doPetted(): void {
    const sim = this.sim;
    const d = this.dog;
    const c = sim.agent;
    const p = sim.dogPet;
    d.faceToward(c.x);
    if (d.plane === 'stairs') {
      this.go(c.x, c.level, 'trot');
      return;
    }
    if (p.phase === 'come') {
      const dx = c.x - d.x;
      const reach = Math.abs(dx) < 46 && d.level === c.level;
      if (!reach) this.go(c.x - Math.sign(dx || 1) * 34, c.level, 'trot', 6);
      else this.settle('sit');
      d.excitement = 1;
    } else if (p.phase === 'roll') {
      this.settle('roll');
    } else if (p.phase === 'happy') {
      this.settle('sit');
      d.excitement = 1;
    } else this.settle('sit');
  }

  // ------------------------------------------------------------------ fetch

  private doFetch(): void {
    const sim = this.sim;
    const d = this.dog;
    const c = sim.agent;
    const f = sim.fetch;
    const ball = sim.ball;
    if (d.plane === 'stairs') {
      this.go(d.x, d.stairsGoal, 'trot');
      return;
    }
    d.excitement = 1;
    switch (f.phase) {
      case 'wait': {
        // watching the ball in Carley's hand, wiggling with impatience
        d.faceToward(c.x);
        const dx = c.x + c.facing * 70 - d.x;
        if (Math.abs(dx) > 22) this.go(c.x + c.facing * 70, 'ground', 'trot', 8);
        else this.settle('beg');
        break;
      }
      case 'air':
      case 'chase': {
        if (ball.state === 'held') break;
        const tx = ball.state === 'air' ? ball.landingX() : ball.x;
        const dxLand = tx - d.x;
        if (!d.airborne) this.go(tx, 'ground', Math.abs(dxLand) > 30 ? 'run' : 'trot', 6);
        d.faceToward(tx);
        const mouth = d.mouthPos();
        const near = Math.hypot(mouth.x - ball.x, mouth.y - ball.y);
        // jump for a ball that is still in the air
        if (ball.state === 'air' && ball.y < FLOOR_Y - 40 && Math.abs(ball.x - d.x) < 70 && !d.airborne && this.cool.leap <= 0) {
          d.leap(540);
          d.play('leap', true);
          this.cool.leap = 0.6;
        }
        if (ball.state !== 'carried' && (near < 30 || (Math.abs(ball.x - d.x) < 26 && ball.y > FLOOR_Y - 30))) {
          ball.state = 'carried';
          d.carrying = true;
          f.phase = 'return';
          sim.bus.emit('sfx', { id: 'yip', x: d.x, volume: 0.7 });
        }
        break;
      }
      case 'return': {
        // trots back with his head held high, drops it at her feet
        const tx = c.x + c.facing * 38;
        const reached = Math.abs(tx - d.x) < 14 || (Math.abs(c.x - d.x) < 52);
        if (!reached) this.go(tx, 'ground', 'trot', 8);
        else {
          d.stop();
          d.carrying = false;
          ball.rest(d.x + d.facing * 20);
          sim.bus.emit('sfx', { id: 'ballBounce', x: d.x, volume: 0.5 });
          d.play('happy', true);
          f.phase = 'ready';
        }
        break;
      }
      default:
        d.faceToward(c.x);
        this.settle(this.stageT % 5 < 3 ? 'beg' : 'sit');
    }
  }

  // ------------------------------------------------------------------ persistence

  serialize(): { x: number; level: Level; bond: number; attention: number; energy: number } {
    const d = this.dog;
    const level: Level = d.level;
    return { x: d.x, level, bond: this.bond, attention: this.attention, energy: this.energy };
  }

  restore(s: { x: number; level: Level; bond: number; attention: number; energy: number }): void {
    const d = this.dog;
    const upper = s.level === 'upper';
    d.teleport(Math.min(upper ? STAIRS.topX : WORLD_RIGHT_X, Math.max(upper ? BED.x + BED.w + 10 : 40, s.x)), upper ? 'upper' : 'ground');
    this.bond = Math.min(100, Math.max(0, s.bond));
    this.attention = Math.min(100, Math.max(0, s.attention));
    this.energy = Math.min(100, Math.max(0, s.energy));
    this.enter('idle', 3);
  }
}
