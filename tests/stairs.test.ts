import { describe, expect, it } from 'vitest';
import { makeSim, runUntil } from './helpers';
import { FLOOR_Y, SOLIDS, STAIRS, UPPER_MAX_X, UPPER_Y, navStep, planeRange, stairsYAt, standableX, surfaceYAt } from '../src/config/worldLayout';
import { SaveSystem } from '../src/systems/SaveSystem';
import type { Plane } from '../src/core/types';

const mem = () => {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
};

/** Watches every frame: records plane changes and checks that she only ever moves smoothly. */
function watchMovement(sim: ReturnType<typeof makeSim>) {
  const rec = { planes: [] as Plane[], maxDy: 0, maxDx: 0, badTransitions: 0, offFloorOutsideStairs: 0, ranOutOfRange: 0 };
  let last = { x: sim.agent.x, y: sim.agent.y, plane: sim.agent.plane };
  return {
    rec,
    step(dt = 1 / 30): void {
      sim.update(dt);
      const a = sim.agent;
      if (a.plane !== last.plane) {
        rec.planes.push(a.plane);
        // floors only ever connect to the stairs, never directly to each other
        if ((a.plane === 'upper' && last.plane === 'ground') || (a.plane === 'ground' && last.plane === 'upper')) rec.badTransitions++;
      }
      if (!rec.planes.length) rec.planes.push(a.plane);
      // (hopping onto the bed is instantaneous for the headless body, so upper->upper frames are not counted)
      if (!(a.plane === 'upper' && last.plane === 'upper')) rec.maxDy = Math.max(rec.maxDy, Math.abs(a.y - last.y));
      rec.maxDx = Math.max(rec.maxDx, Math.abs(a.x - last.x));
      if (a.plane !== 'stairs') {
        const floor = a.plane === 'upper' ? UPPER_Y : FLOOR_Y;
        const onBed = a.plane === 'upper' && SOLIDS.some((s) => s.platform && s.level === 'upper' && Math.abs(a.y - s.y) < 1);
        if (Math.abs(a.y - floor) > 1 && !onBed) rec.offFloorOutsideStairs++;
      }
      const [lo, hi] = planeRange(a.plane);
      if (a.x < lo - 0.5 || a.x > hi + 0.5) rec.ranOutOfRange++;
      last = { x: a.x, y: a.y, plane: a.plane };
    }
  };
}

describe('stairs: layout geometry', () => {
  it('the staircase joins the two floors exactly', () => {
    expect(stairsYAt(STAIRS.topX)).toBeCloseTo(UPPER_Y, 5);
    expect(stairsYAt(STAIRS.footX)).toBeCloseTo(FLOOR_Y, 5);
    // monotonic descent from top to foot
    let prev = stairsYAt(STAIRS.topX);
    for (let x = STAIRS.topX; x <= STAIRS.footX; x += 5) {
      const y = stairsYAt(x);
      expect(y).toBeGreaterThanOrEqual(prev);
      prev = y;
    }
    expect(UPPER_MAX_X).toBeGreaterThanOrEqual(STAIRS.topX);
  });

  it('floors have the right surface heights and the bed sits on the upper one', () => {
    expect(surfaceYAt(300, 'ground')).toBe(FLOOR_Y);
    expect(surfaceYAt(300, 'upper')).toBe(UPPER_Y);
    expect(surfaceYAt(100, 'upper')).toBeLessThan(UPPER_Y); // bed top
    expect(surfaceYAt(100, 'ground')).toBe(FLOOR_Y); // nothing on the ground floor beneath the bed
    for (const x of [40, 100, 190, 250]) expect(surfaceYAt(standableX(x, 'upper'), 'upper')).toBe(UPPER_Y);
  });

  it('routes always go through the stairs when changing floors', () => {
    expect(navStep('ground', 200, 'ground')).toEqual({ toX: 200 });
    expect(navStep('ground', 200, 'upper')).toEqual({ toX: STAIRS.footX, then: 'stairs' });
    expect(navStep('stairs', 200, 'upper')).toEqual({ toX: STAIRS.topX, then: 'upper' });
    expect(navStep('stairs', 200, 'ground')).toEqual({ toX: STAIRS.footX, then: 'ground' });
    expect(navStep('upper', 100, 'ground')).toEqual({ toX: STAIRS.topX, then: 'stairs' });
    expect(navStep('upper', 100, 'upper')).toEqual({ toX: 100 });
  });
});

describe('stairs: Carley has to use them', () => {
  it('going to bed means climbing the stairs, smoothly, and ending up on the upper floor', () => {
    const sim = makeSim({ startHour: 22 });
    sim.character.needs.energy = 20;
    expect(sim.agent.plane).toBe('ground');
    const w = watchMovement(sim);
    expect(sim.commands.issue('sleep').ok).toBe(true);
    for (let i = 0; i < 30 * 90 && !sim.brain.isSleeping; i++) w.step();
    expect(sim.brain.isSleeping).toBe(true);
    expect(w.rec.planes).toContain('stairs');
    expect(w.rec.planes.indexOf('stairs')).toBeLessThan(w.rec.planes.lastIndexOf('upper'));
    expect(w.rec.badTransitions).toBe(0);
    expect(w.rec.offFloorOutsideStairs).toBe(0);
    expect(w.rec.ranOutOfRange).toBe(0);
    // no teleporting up: a frame of climbing moves her a few pixels at most
    expect(w.rec.maxDy).toBeLessThan(8);
    expect(w.rec.maxDx).toBeLessThan(10);
    expect(sim.agent.plane).toBe('upper');
    expect(sim.agent.y).toBeLessThan(UPPER_Y); // lying on the bed, which is on the upper floor
  });

  it('after waking up she walks back down the stairs to paint in the kitchen/living area', () => {
    const sim = makeSim({ startHour: 15 });
    sim.character.needs.energy = 30;
    sim.commands.issue('sleep');
    expect(runUntil(sim, () => sim.brain.isSleeping, 120)).toBe(true);
    const w = watchMovement(sim);
    sim.character.needs.energy = 99.5;
    expect(runUntil(sim, () => !sim.brain.isSleeping && sim.character.currentActivity !== 'sleeping', 60)).toBe(true);
    sim.character.needs.boredom = 85;
    expect(sim.commands.issue('paint').ok).toBe(true);
    for (let i = 0; i < 30 * 90 && !(sim.brain.state === 'PERFORM_ACTIVITY' && sim.character.currentActivity === 'painting'); i++) w.step();
    expect(sim.brain.state).toBe('PERFORM_ACTIVITY');
    expect(sim.agent.plane).toBe('ground');
    expect(w.rec.planes).toContain('stairs');
    expect(w.rec.badTransitions).toBe(0);
    expect(w.rec.maxDy).toBeLessThan(8);
  });

  it('calling her sister happens upstairs, reading downstairs: she changes floors between them', () => {
    const sim = makeSim({ startHour: 14 });
    sim.character.needs.social = 20;
    sim.commands.issue('call');
    expect(runUntil(sim, () => sim.brain.state === 'PERFORM_ACTIVITY', 90)).toBe(true);
    expect(sim.agent.plane).toBe('upper');
    sim.commands.issue('read');
    expect(runUntil(sim, () => sim.brain.state === 'PERFORM_ACTIVITY' && sim.character.currentActivity === 'reading', 120)).toBe(true);
    expect(sim.agent.plane).toBe('ground');
    expect(sim.agent.posture).toBe('sitting');
  });

  it('milk is fetched from the fridge downstairs, even when she starts upstairs', () => {
    const sim = makeSim({ startHour: 14 });
    sim.agent.body.teleport(230, 'upper');
    sim.agent.stairsGoal = 'upper';
    sim.character.needs.tummy = 10;
    expect(sim.commands.issue('milk').ok).toBe(true);
    let sawFridgeOpen = false;
    for (let i = 0; i < 30 * 40; i++) {
      sim.update(1 / 30);
      if (sim.fridgeOpen) sawFridgeOpen = true;
    }
    expect(sawFridgeOpen).toBe(true);
    expect(sim.fridgeOpen).toBe(false);
    expect(sim.character.needs.tummy).toBeGreaterThan(60);
  });

  it('interrupting her halfway up the stairs makes her finish the climb instead of pottering on the steps', () => {
    const sim = makeSim({ startHour: 14 });
    sim.commands.issue('sleep');
    sim.character.needs.energy = 40;
    expect(runUntil(sim, () => sim.agent.plane === 'stairs', 60)).toBe(true);
    sim.run(0.6);
    sim.brain.react('startled', true);
    expect(runUntil(sim, () => sim.brain.state !== 'REACTING', 20)).toBe(true);
    sim.run(40);
    expect(sim.agent.plane).not.toBe('stairs');
    expect(sim.brain.stuckRecoveries).toBe(0);
  });

  it('autopilot for several days: only the stairs connect the floors, never stuck, both floors get used', () => {
    const sim = makeSim({ startHour: 9, noEvents: false, noNaturalWeather: false });
    sim.autopilot = true;
    const w = watchMovement(sim);
    const planes = new Set<string>();
    for (let i = 0; i < 30 * 720 * 2; i++) {
      w.step();
      planes.add(sim.agent.plane);
    }
    expect(w.rec.badTransitions).toBe(0);
    expect(w.rec.offFloorOutsideStairs).toBe(0);
    expect(w.rec.ranOutOfRange).toBe(0);
    expect(w.rec.maxDy).toBeLessThan(8);
    expect(sim.brain.stuckRecoveries).toBe(0);
    expect(planes.has('upper')).toBe(true);
    expect(planes.has('stairs')).toBe(true);
    expect(planes.has('ground')).toBe(true);
  });

  it('save/load puts her back on the floor she was on', () => {
    const store = mem();
    const a = makeSim();
    a.agent.body.teleport(250, 'upper');
    a.agent.stairsGoal = 'upper';
    expect(SaveSystem.save(a, store)).toBe(true);
    const b = makeSim();
    expect(SaveSystem.load(b, store)).toBe(true);
    expect(b.agent.plane).toBe('upper');
    expect(b.agent.y).toBe(UPPER_Y);
    expect(Math.abs(b.agent.x - 250)).toBeLessThan(1);
  });
});
