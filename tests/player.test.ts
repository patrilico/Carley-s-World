import { describe, expect, it } from 'vitest';
import { makeSim, runUntil } from './helpers';
import { STAIRS, UPPER_Y, FLOOR_Y, UPPER_MAX_X } from '../src/config/worldLayout';

type Sim = ReturnType<typeof makeSim>;

/** Hold keys for `seconds` of sim time, then release them. */
function hold(sim: Sim, keys: ('left' | 'right' | 'up' | 'down' | 'run')[], seconds: number, step = 1 / 30): void {
  for (const k of keys) sim.player.setKey(k, true);
  sim.run(seconds, step);
  for (const k of keys) sim.player.setKey(k, false);
}

/** Hold keys until a condition is met (or give up). */
function holdUntil(sim: Sim, keys: ('left' | 'right' | 'up' | 'down' | 'run')[], cond: () => boolean, max = 30): boolean {
  for (const k of keys) sim.player.setKey(k, true);
  const ok = runUntil(sim, cond, max);
  for (const k of keys) sim.player.setKey(k, false);
  return ok;
}

const stand = (sim: Sim, x: number, plane: 'ground' | 'upper' = 'ground'): void => {
  sim.agent.body.teleport(x, plane);
  sim.agent.stairsGoal = plane;
  sim.dog.teleport(900, 'ground'); // keep the dog out of the way
  sim.dogFrozen = true;
};

describe('player control: arrow keys', () => {
  it('arrow keys walk Carley, and she stays put when the keys are released (no wandering)', () => {
    const sim = makeSim({ startHour: 12 });
    stand(sim, 300);
    hold(sim, ['right'], 1);
    expect(sim.agent.x).toBeGreaterThan(300 + 80);
    expect(sim.agent.facing).toBe(1);
    hold(sim, ['left'], 0.5);
    sim.run(0.2); // let her come to a stop
    const x = sim.agent.x;
    sim.run(40); // nobody touches the keys: she does idle gestures but never walks off
    expect(Math.abs(sim.agent.x - x)).toBeLessThan(3);
  });

  it('shift makes her run', () => {
    const a = makeSim({ startHour: 12 });
    stand(a, 300);
    hold(a, ['right'], 1);
    const b = makeSim({ startHour: 12 });
    stand(b, 300);
    hold(b, ['right', 'run'], 1);
    expect(b.agent.x - 300).toBeGreaterThan((a.agent.x - 300) * 1.6);
  });

  it('she cannot walk through the garden fence or the left wall', () => {
    const sim = makeSim({ startHour: 12 });
    stand(sim, 300);
    hold(sim, ['left'], 8);
    expect(sim.agent.x).toBeGreaterThan(20);
    expect(sim.agent.x).toBeLessThan(60);
    hold(sim, ['right', 'run'], 12);
    expect(sim.agent.x).toBeGreaterThan(1200);
  });

  it('keys are ignored in autopilot (she chooses for herself)', () => {
    const sim = makeSim({ startHour: 12 });
    stand(sim, 300);
    sim.autopilot = true;
    for (const k of ['left', 'right'] as const) sim.player.setKey(k, true);
    sim.player.setKey('left', false);
    expect(sim.player.update(0.016)).toBe(false);
    expect(sim.player.prompt?.text).toMatch(/Autopilot/);
  });
});

describe('player control: prompts and Space', () => {
  it('shows "Press Space to ..." next to things and nothing in the middle of nowhere', () => {
    const sim = makeSim({ startHour: 14 });
    stand(sim, 262);
    sim.run(0.2);
    expect(sim.player.prompt?.text).toBe('Press Space to Paint');
    stand(sim, 352);
    sim.run(0.2);
    expect(sim.player.prompt?.text).toBe('Press Space to Read');
    stand(sim, 60);
    sim.run(0.2);
    expect(sim.player.prompt?.text).toBe('Press Space to Drink Milk');
    stand(sim, 130);
    sim.run(0.2);
    expect(sim.player.prompt?.text).toBe('Press Space to Look out of the window');
    stand(sim, 730);
    sim.run(0.2);
    expect(sim.player.prompt?.text).toBe('Press Space to Garden');
    stand(sim, 1030);
    sim.run(0.2);
    expect(sim.player.prompt?.text).toBe('Press Space to Sunbathe');
    stand(sim, 200, 'upper');
    sim.run(0.2);
    expect(sim.player.prompt?.text).toMatch(/window/);
    stand(sim, 120, 'upper');
    sim.run(0.2);
    expect(sim.player.prompt?.text).toBe('Press Space to Sleep');
    stand(sim, 262, 'upper');
    sim.run(0.2);
    expect(sim.player.prompt?.text).toBe('Press Space to Call Sister');
    stand(sim, 400);
    sim.run(0.2);
    expect(sim.player.prompt).toBeNull();
  });

  it('a prompt for something she cannot do right now says why', () => {
    const sim = makeSim({ startHour: 23 });
    stand(sim, 730);
    sim.run(0.2);
    expect(sim.player.prompt?.blocked).toBe(true);
    expect(sim.player.prompt?.sub).toMatch(/dark/i);
    expect(sim.player.action()?.ok).toBe(false);
  });

  it('Space near the easel paints; Space again stops it; a movement key stops it and steers her', () => {
    const sim = makeSim({ startHour: 14 });
    stand(sim, 262);
    sim.character.needs.boredom = 80;
    sim.run(0.1);
    expect(sim.player.action()?.ok).toBe(true);
    expect(runUntil(sim, () => sim.character.currentActivity === 'painting' && sim.brain.state === 'PERFORM_ACTIVITY', 60)).toBe(true);
    expect(sim.player.prompt?.text).toMatch(/stop painting/i);
    expect(sim.player.action()?.ok).toBe(true);
    expect(runUntil(sim, () => sim.character.currentActivity !== 'painting', 30)).toBe(true);

    // start again and then just walk away
    sim.run(3);
    sim.player.action();
    expect(runUntil(sim, () => sim.character.currentActivity === 'painting' && sim.brain.state === 'PERFORM_ACTIVITY', 60)).toBe(true);
    const x0 = sim.agent.x;
    expect(holdUntil(sim, ['right'], () => sim.agent.x > x0 + 60, 25)).toBe(true);
    expect(sim.character.currentActivity).not.toBe('painting');
  });

  it('the fridge: Space fetches milk (the door opens and Tummy fills)', () => {
    const sim = makeSim({ startHour: 14 });
    stand(sim, 60);
    sim.character.needs.tummy = 10;
    sim.run(0.1);
    expect(sim.player.action()?.ok).toBe(true);
    let opened = false;
    for (let i = 0; i < 30 * 30; i++) {
      sim.update(1 / 30);
      if (sim.fridgeOpen) opened = true;
    }
    expect(opened).toBe(true);
    expect(sim.character.needs.tummy).toBeGreaterThan(60);
  });

  it('sleeping upstairs by walking to the bed, pressing Space, and waking with an arrow key', () => {
    const sim = makeSim({ startHour: 22 });
    stand(sim, 200, 'upper');
    sim.character.needs.energy = 20;
    stand(sim, 130, 'upper');
    sim.run(0.1);
    expect(sim.player.action()?.ok).toBe(true);
    expect(runUntil(sim, () => sim.brain.isSleeping, 60)).toBe(true);
    expect(sim.player.prompt?.text).toMatch(/wake up/i);
    sim.player.setKey('right', true);
    expect(runUntil(sim, () => !sim.brain.isSleeping && sim.agent.posture === 'standing', 40)).toBe(true);
    sim.run(3);
    sim.player.setKey('right', false);
    expect(sim.agent.x).toBeGreaterThan(110);
  });
});

describe('player control: the stairs', () => {
  it('walking past the foot of the stairs does not climb them; holding Up there does', () => {
    const sim = makeSim({ startHour: 12 });
    stand(sim, 520);
    // walk left across the whole stair zone: she stays on the ground floor
    let sawStairs = false;
    for (const k of ['left'] as const) sim.player.setKey(k, true);
    for (let i = 0; i < 30 * 3; i++) {
      sim.update(1 / 30);
      if (sim.agent.plane === 'stairs') sawStairs = true;
    }
    sim.player.setKey('left', false);
    expect(sawStairs).toBe(false);
    expect(sim.agent.plane).toBe('ground');
    expect(sim.agent.x).toBeLessThan(STAIRS.footX - 60);
    // back to the foot, then hold Up
    stand(sim, STAIRS.footX - 10);
    sim.run(0.2);
    expect(sim.player.prompt?.text).toMatch(/↑/);
    expect(holdUntil(sim, ['up'], () => sim.agent.plane === 'upper', 20)).toBe(true);
    expect(sim.agent.y).toBe(UPPER_Y);
  });

  it('on the way up she is on the stairs (smoothly) and she can turn around halfway', () => {
    const sim = makeSim({ startHour: 12 });
    stand(sim, STAIRS.footX - 10);
    let maxDy = 0;
    sim.player.setKey('up', true);
    expect(runUntil(sim, () => sim.agent.plane === 'stairs' && sim.agent.y < FLOOR_Y - 60, 20)).toBe(true);
    sim.player.setKey('up', false);
    sim.run(0.5);
    expect(sim.agent.plane).toBe('stairs'); // stopped halfway: standing on a step
    let lastY = sim.agent.y;
    sim.player.setKey('right', true); // turn around
    for (let i = 0; i < 30 * 10 && sim.agent.plane !== 'ground'; i++) {
      sim.update(1 / 30);
      maxDy = Math.max(maxDy, Math.abs(sim.agent.y - lastY));
      lastY = sim.agent.y;
    }
    sim.player.setKey('right', false);
    expect(sim.agent.plane).toBe('ground');
    expect(maxDy).toBeLessThan(8);
  });

  it('upstairs: Down at the top (or walking on to the right) goes back down', () => {
    const sim = makeSim({ startHour: 12 });
    stand(sim, UPPER_MAX_X - 4, 'upper');
    sim.run(0.2);
    expect(sim.player.prompt?.text).toMatch(/↓/);
    expect(holdUntil(sim, ['down'], () => sim.agent.plane === 'ground', 20)).toBe(true);
    stand(sim, 230, 'upper');
    expect(holdUntil(sim, ['right'], () => sim.agent.plane === 'ground', 30)).toBe(true);
    expect(sim.agent.x).toBeGreaterThan(STAIRS.footX - 3);
  });
});
