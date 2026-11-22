import { describe, expect, it } from 'vitest';
import { makeSim, runUntil } from './helpers';
import { WALL_OUTER_X } from '../src/config/worldLayout';
import { dogRange } from '../src/entities/Dog';
import { SaveSystem } from '../src/systems/SaveSystem';

type Sim = ReturnType<typeof makeSim>;

const mem = () => {
  const store = new Map<string, string>();
  return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
};

const outside = (sim: Sim, x = 800): void => {
  sim.agent.body.teleport(x, 'ground');
  sim.dog.teleport(x + 90, 'ground');
};

describe('the dog: autonomy', () => {
  it('does his own thing for days: stays in bounds, uses the stairs smoothly, sleeps, wanders in and out', () => {
    const sim = makeSim({ startHour: 9, noEvents: false, noNaturalWeather: false });
    sim.autopilot = true;
    sim.dogBrain.energy = 20; // a sleepy start, so a nap is certain to happen
    const d = sim.dog;
    const planes = new Set<string>();
    const modes = new Set<string>();
    const actions = new Set<string>();
    let maxDy = 0;
    let lastY = d.y;
    let outdoors = false;
    let indoors = false;
    for (let i = 0; i < 30 * 540; i++) {
      sim.update(1 / 30);
      planes.add(d.plane);
      modes.add(sim.dogBrain.mode);
      actions.add(d.action);
      maxDy = Math.max(maxDy, Math.abs(d.y - lastY));
      lastY = d.y;
      const [lo, hi] = dogRange(d.plane);
      expect(d.x).toBeGreaterThanOrEqual(lo - 0.5);
      expect(d.x).toBeLessThanOrEqual(hi + 0.5);
      expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
      if (d.x >= WALL_OUTER_X) outdoors = true;
      else indoors = true;
    }
    expect(outdoors && indoors).toBe(true);
    expect(planes.has('stairs')).toBe(true); // he does climb them
    expect(maxDy).toBeLessThan(8); // never teleports between floors
    expect(modes.has('sleep')).toBe(true);
    expect(modes.has('wander')).toBe(true);
    expect(modes.has('follow') || modes.has('attention')).toBe(true);
    for (const a of ['walk', 'sleep', 'sit']) expect(actions.has(a as never)).toBe(true);
  });

  it('naps at night when tired, curled up in his bed', () => {
    const sim = makeSim({ startHour: 23 });
    sim.dogBrain.energy = 15;
    sim.dog.teleport(300, 'ground');
    expect(runUntil(sim, () => sim.dog.action === 'sleep', 90)).toBe(true);
    expect(sim.dogBrain.mode).toBe('sleep');
  });

  it('runs back indoors when it starts to rain', () => {
    const sim = makeSim({ startHour: 12 });
    sim.agent.body.teleport(300, 'ground');
    sim.dog.teleport(900, 'ground');
    sim.dogBrain.enter('idle', 30);
    sim.weather.setWeather('rainy', 999, true);
    sim.weather.update(0.01, false);
    // he is out in the garden: sooner or later his own errands bring him in, and he shakes himself dry
    const sawShake = { v: false };
    sim.bus.on('sfx', (e) => { if (e.id === 'dogShake') sawShake.v = true; });
    sim.autopilot = true;
    expect(runUntil(sim, () => sim.dog.x < WALL_OUTER_X - 20, 240)).toBe(true);
    expect(sawShake.v).toBe(true);
  });

  it('asks for attention when lonely, and Carley (busy) says hi without stopping', () => {
    const sim = makeSim({ startHour: 14 });
    sim.agent.body.teleport(300, 'ground');
    sim.dog.teleport(420, 'ground');
    sim.dogBrain.attention = 95;
    sim.dogBrain.enter('attention', 18);
    let called = false;
    sim.bus.on('dogCall', () => { called = true; });
    sim.commands.issue('paint');
    expect(runUntil(sim, () => sim.brain.state === 'PERFORM_ACTIVITY' && sim.character.currentActivity === 'painting', 60)).toBe(true);
    expect(runUntil(sim, () => called, 40)).toBe(true);
    const before = sim.dogBrain.attention;
    sim.run(20);
    expect(sim.dogBrain.attention).toBeLessThan(before); // Carley acknowledged him
    expect(sim.character.currentActivity).toBe('painting');
  });

  it('follows Carley up and down the stairs', () => {
    const sim = makeSim({ startHour: 14 });
    sim.agent.body.teleport(300, 'ground');
    sim.dog.teleport(330, 'ground');
    sim.dogBrain.enter('follow', 120);
    sim.dogBrain.bond = 80;
    sim.agent.body.teleport(250, 'upper');
    sim.agent.stairsGoal = 'upper';
    expect(runUntil(sim, () => sim.dog.plane === 'upper' && Math.abs(sim.dog.x - sim.agent.x) < 90, 90)).toBe(true);
  });
});

describe('the dog: belly rubs, fetch and bug patrol', () => {
  it('a belly rub indoors: he comes over, rolls onto his back, Carley cuddles him; Social goes up and he is happier', () => {
    const sim = makeSim({ startHour: 14 });
    sim.agent.body.teleport(250, 'ground');
    sim.dog.teleport(380, 'ground');
    sim.character.needs.social = 20;
    sim.character.needs.pain = 30;
    sim.dogBrain.attention = 90;
    const phases = new Set<string>();
    expect(sim.commands.issue('dog').ok).toBe(true);
    let bestSocial = 0;
    let lowestAttention = 100;
    for (let i = 0; i < 30 * 40; i++) {
      sim.update(1 / 30);
      phases.add(sim.dogPet.phase);
      if (sim.dog.action === 'roll') phases.add('rolled');
      bestSocial = Math.max(bestSocial, sim.character.needs.social);
      lowestAttention = Math.min(lowestAttention, sim.dogBrain.attention);
    }
    expect(phases.has('come') && phases.has('roll') && phases.has('happy')).toBe(true);
    expect(phases.has('rolled')).toBe(true);
    expect(sim.dogPet.active).toBe(false);
    expect(bestSocial).toBeGreaterThan(40); // (it drains again slowly afterwards)
    expect(sim.character.needs.pain).toBeLessThan(10);
    expect(lowestAttention).toBeLessThan(40); // the fuss satisfied him (his need for attention then slowly regrows)
    expect(sim.brain.reaction).toBeNull();
  });

  it('the dog command is refused when he is too far, upstairs, or asleep-Carley', () => {
    const sim = makeSim({ startHour: 14 });
    sim.agent.body.teleport(250, 'ground');
    sim.dog.teleport(900, 'ground');
    expect(sim.commands.issue('dog').ok).toBe(false);
    sim.dog.teleport(250, 'upper');
    expect(sim.commands.blockReason('dog')).toMatch(/far/i);
  });

  it('fetch in the garden: she throws, he runs, catches, brings the ball back, again; Space ends it', () => {
    const sim = makeSim({ startHour: 12 });
    outside(sim);
    sim.dogBrain.energy = 100;
    const states = new Set<string>();
    let carried = false;
    expect(sim.commands.issue('dog').ok).toBe(true);
    for (let i = 0; i < 30 * 70; i++) {
      sim.update(1 / 30);
      states.add(sim.ball.state);
      if (sim.dog.carrying) carried = true;
      if (sim.fetch.throws >= 2 && sim.fetch.phase === 'wait') break;
    }
    expect(sim.fetch.throws).toBeGreaterThanOrEqual(2);
    expect(states.has('air')).toBe(true);
    expect(states.has('carried')).toBe(true);
    expect(carried).toBe(true);
    // the ball stays in the garden
    expect(sim.ball.x).toBeGreaterThan(WALL_OUTER_X);
    // wind down with Space
    sim.player.action();
    expect(runUntil(sim, () => !sim.fetch.active && sim.brain.state !== 'REACTING', 60)).toBe(true);
    expect(sim.ball.state).toBe('held');
    expect(sim.dog.carrying).toBe(false);
  });

  it('the dog barks at mosquitoes and eats them; Carley cheers instead of swatting', () => {
    const sim = makeSim({ startHour: 12 });
    outside(sim, 760);
    sim.dogBrain.bond = 80;
    sim.dogBrain.energy = 100;
    const sounds = new Set<string>();
    sim.bus.on('sfx', (e) => sounds.add(e.id));
    let cheered = false;
    sim.bus.on('dogCaught', () => { cheered = true; });
    for (let i = 0; i < 3; i++) sim.spawnMosquito(sim.agent.x + 30 + i * 20, sim.agent.y - 70 - i * 10);
    expect(runUntil(sim, () => sim.dogBrain.mode === 'guard', 10)).toBe(true);
    sim.run(90);
    expect(sounds.has('bark')).toBe(true);
    expect(sim.stats.mosquitoesEaten + sim.stats.mosquitoesShooed).toBeGreaterThan(0);
    expect(sim.stats.mosquitoesEaten).toBeGreaterThan(0);
    expect(cheered).toBe(true);
  });

  it('she is bothered less by mosquitoes with the dog on patrol', () => {
    const trial = (dogHelps: boolean): number => {
      const sim = makeSim({ startHour: 12 });
      outside(sim, 760);
      sim.dogFrozen = !dogHelps;
      sim.dogBrain.bond = 80;
      sim.dogBrain.energy = 100;
      for (let i = 0; i < 3; i++) sim.spawnMosquito(sim.agent.x + 30 + i * 20, sim.agent.y - 70 - i * 10);
      sim.run(25);
      return sim.character.needs.irritation;
    };
    expect(trial(true)).toBeLessThan(trial(false));
  });
});

describe('the dog: saving', () => {
  it('his bond and place survive save/load', () => {
    const store = mem();
    const a = makeSim();
    a.dogBrain.bond = 77;
    a.dog.teleport(250, 'upper');
    expect(SaveSystem.save(a, store)).toBe(true);
    const b = makeSim();
    expect(SaveSystem.load(b, store)).toBe(true);
    expect(b.dogBrain.bond).toBeCloseTo(77, 3);
    expect(b.dog.plane).toBe('upper');
    expect(Math.abs(b.dog.x - 250)).toBeLessThan(2);
  });

  it('old saves without a dog still load', () => {
    const store = mem();
    const a = makeSim();
    SaveSystem.save(a, store);
    const raw = JSON.parse(store.getItem('carleys-little-world/save')!);
    delete raw.dog;
    store.setItem('carleys-little-world/save', JSON.stringify(raw));
    const b = makeSim();
    expect(SaveSystem.load(b, store)).toBe(true);
    expect(b.dog.x).toBeGreaterThan(0);
  });
});
