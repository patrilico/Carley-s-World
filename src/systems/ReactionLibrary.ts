import { GARDEN_POT, getLocation, getWindow } from '../config/worldLayout';
import { goTo } from '../activities/Activity';
import type { Carley } from '../entities/Carley';
import type { Mosquito } from '../entities/Insect';
import type { Vec2 } from '../core/types';
import type { Simulation } from '../sim/Simulation';
import { restingAction } from './AnimationController';
import { StepRunner, type Step, type StepEnv } from './StepRunner';

/** Interrupt hierarchy: higher number wins. Activity-specific animations sit at 30. */
export const Priority = {
  critical: 100,
  injury: 90,
  heal: 85,
  surprise: 70,
  irritation: 50,
  event: 35,
  activity: 30,
  ambient: 20,
  idle: 10
} as const;

export type ReactionId =
  | 'rainSurprise' | 'mosquito' | 'injury' | 'love' | 'milk' | 'windGust' | 'stumble' | 'startled'
  | 'butterfly' | 'bloom' | 'discovery' | 'sunEmerged' | 'noticeRain' | 'relief' | 'dogHero' | 'petDog' | 'playFetch';

export interface ReactionRun {
  def: ReactionDef;
  runner: StepRunner;
  /** If true, the interrupted activity is abandoned when the reaction ends. */
  abandon: boolean;
  startedAt: number;
  data: Record<string, number | boolean>;
}

export interface ReactionDef {
  id: ReactionId;
  priority: number;
  /** Sim seconds before it can trigger again. */
  cooldown: number;
  /** Default for `ReactionRun.abandon`. */
  abandons: boolean;
  start(env: StepEnv, run: ReactionRun): Step[];
  /** The player may cut it short (Space / a movement key): `run.data.stop` is set and `next` should wind it down. */
  stoppable?: boolean;
  /** More steps when the queue empties (return null to finish). */
  next?(env: StepEnv, run: ReactionRun): Step[] | null;
}

const standSteps = (agent: Carley, face?: Step['face']): Step[] => {
  switch (agent.posture) {
    case 'lying': return [{ action: 'getUp', posture: 'standing', face, label: 'get up' }];
    case 'sitting': return [{ action: 'standUp', posture: 'standing', face, label: 'stand up' }];
    case 'kneeling': return [{ action: 'kneelUp', posture: 'standing', face, label: 'get up' }];
    default: return [];
  }
};

const dogGaze = (sim: Simulation) => (): Vec2 => sim.dog.headPos();

const mosquitoGaze = (sim: Simulation) => (): Vec2 | null => {
  const m = sim.nearestMosquito(260);
  return m ? { x: m.x, y: m.y } : null;
};

/** One swat attempt: may kill the targeted mosquito. */
function attemptSwat(env: StepEnv, hard: boolean): void {
  const sim = env.sim;
  const m: Mosquito | null = sim.nearestMosquito(170);
  sim.bus.emit('sfx', { id: 'swat', x: env.agent.x });
  if (!m) return;
  env.agent.faceToward(m.x);
  const d = m.distanceTo(env.agent.x, env.agent.y - 70);
  let p = hard ? 0.42 : 0.24;
  if (d < 85) p *= 1.35;
  if (sim.rng.chance(p)) {
    sim.killMosquito(m);
    sim.bus.emit('effect', { kind: 'puff', x: m.x, y: m.y });
  } else {
    sim.bus.emit('effect', { kind: 'puff', x: m.x + (sim.rng.next() - 0.5) * 20, y: m.y + 10 });
  }
}

function mosquitoCycle(env: StepEnv, hard: boolean, first: boolean): Step[] {
  const sim = env.sim;
  const gaze = mosquitoGaze(sim);
  const steps: Step[] = [
    {
      action: 'frown', duration: first ? 0.85 : 0.5, label: 'frown at mosquito', sfx: first ? undefined : 'irritated',
      face: { emotion: hard ? 'angry' : 'irritated', gaze }, thought: first ? 'shoo' : undefined
    },
    {
      action: hard ? 'swatHard' : 'swat', duration: hard ? 0.7 : 0.8, label: hard ? 'swat angrily' : 'swat', face: { emotion: hard ? 'angry' : 'irritated', gaze },
      onStart: (e) => { delete e.agent.actionData.hit; },
      onTick: (e, t) => {
        if (t >= (hard ? 0.26 : 0.32) && !e.agent.actionData.hit) {
          e.agent.actionData.hit = 1;
          attemptSwat(e, hard);
        }
      }
    }
  ];
  return steps;
}

export const REACTIONS: Record<ReactionId, ReactionDef> = {
  rainSurprise: {
    id: 'rainSurprise', priority: Priority.surprise, cooldown: 20, abandons: true,
    start: (env) => {
      const lying = env.agent.posture === 'lying';
      const shelter = getLocation('shelter').x;
      return [
        {
          action: lying ? 'lieIdle' : 'lookUp', duration: 0.95, prop: null, label: 'notice raindrops', sfx: 'surprise', thought: 'rain',
          face: { emotion: 'surprised', gaze: { x: env.agent.x, y: 30 } }, emotion: ['surprised', 0.9, 1.3]
        },
        { action: lying ? 'lieIdle' : 'sigh', duration: 1.2, label: 'disappointed', face: { emotion: 'sad' }, sfx: 'sad', emotion: ['sad', 0.8, 2] },
        { moveTo: { x: shelter, run: true, tolerance: 12, level: 'ground' }, label: 'run for the house', face: { emotion: 'surprised' } },
        { action: 'shakeOff', duration: 1.15, label: 'shake off drops', face: { emotion: 'irritated' }, sfx: 'surprise' },
        { action: 'relief', duration: 1.7, label: 'safe and dry', face: { emotion: 'relaxed' }, thought: 'cozy' }
      ] as Step[];
    }
  },

  mosquito: {
    id: 'mosquito', priority: Priority.irritation, cooldown: 5, abandons: false,
    start: (env, run) => {
      const sim = env.sim;
      run.data.cycles = 0;
      run.data.waited = 0;
      sim.memory.add('mosquitoAnnoyed', -0.6, 0.6, 'outdoors');
      const gaze = mosquitoGaze(sim);
      const steps: Step[] = [
        {
          action: env.agent.posture === 'lying' ? 'lieIdle' : 'idle', duration: 0.9, label: 'eyes follow mosquito',
          face: { emotion: 'curious', gaze }, sfx: 'surprise', emotion: ['curious', 0.7, 1]
        },
        ...standSteps(env.agent, { emotion: 'irritated', gaze }),
        ...mosquitoCycle(env, false, true)
      ];
      return steps;
    },
    next: (env, run) => {
      const sim = env.sim;
      if (run.data.done) return null;
      const near = sim.nearestMosquito(170);
      if (run.data.retreating) {
        run.data.done = true;
        return null;
      }
      if (!near) {
        if (!run.data.waited) {
          run.data.waited = 1;
          return [{
            action: 'lookAround', duration: 1.6, label: 'is it gone?', face: { emotion: 'irritated', gaze: mosquitoGaze(sim) },
            until: (e) => sim.nearestMosquito(170) !== null
          }];
        }
        run.data.done = true;
        sim.memory.add('mosquitoRelief', 0.5, 0.6, 'outdoors');
        sim.activities.setResumeBonus(sim.brain.interruptedActivityId() ?? 'gardening', 0.35, sim.time + 90);
        return [{ action: 'relief', duration: 1.75, label: 'visible relief', face: { emotion: 'relaxed' }, thought: 'relief', emotion: ['relaxed', 0.9, 3] }];
      }
      run.data.waited = 0;
      const cycles = ((run.data.cycles as number) || 0) + 1;
      run.data.cycles = cycles;
      const irritation = sim.character.needs.irritation;
      if (irritation > 78 && cycles >= 3) {
        run.data.retreating = true;
        run.abandon = true;
        return [
          { action: 'stomp', duration: 1.1, label: 'stomp in frustration', face: { emotion: 'angry' }, sfx: 'irritated', thought: 'shoo' },
          { moveTo: { x: getLocation('shelter').x, run: true, tolerance: 12, level: 'ground' }, label: 'retreat indoors', face: { emotion: 'angry' } },
          { action: 'crossArms', duration: 2, label: 'sulk indoors', face: { emotion: 'irritated' } }
        ];
      }
      return mosquitoCycle(env, irritation > 52, false);
    }
  },

  injury: {
    id: 'injury', priority: Priority.injury, cooldown: 30, abandons: true,
    start: (env) => {
      env.sim.memory.add('gardeningInjury', -0.75, 0.8, 'flowerbed');
      return [
        { action: 'flinch', duration: 0.75, posture: 'standing', prop: null, label: 'flinch', face: { emotion: 'hurt' }, sfx: 'ouch', thought: 'ouch', emotion: ['hurt', 1, 4] },
        { action: 'holdHand', duration: 2.8, label: 'hold injured hand', face: { emotion: 'hurt' }, sfx: 'sad' },
        { action: 'sigh', duration: 1.6, label: 'wince', face: { emotion: 'sad' } }
      ];
    }
  },

  love: {
    id: 'love', priority: Priority.heal, cooldown: 2, abandons: false,
    start: (env) => [
      ...standSteps(env.agent, { emotion: 'surprised' }),
      { action: 'surprised', duration: 0.7, label: 'what a feeling!', face: { emotion: 'surprised', gaze: { x: env.agent.x, y: 40 } }, sfx: 'heal', onStart: (e) => { e.agent.glow = 1; } },
      { action: 'smileToSelf', duration: 2, label: 'hugs herself', face: { emotion: 'delighted', override: { blush: 1 } }, thought: 'loved', sfx: 'giggle', emotion: ['delighted', 1, 4] },
      { action: 'excitedBounce', duration: 1.5, label: 'happy bounce', face: { emotion: 'delighted' } },
      { action: 'wave', duration: 1.7, label: 'waves upward', face: { emotion: 'delighted', gaze: { x: env.agent.x + 20, y: 30 } }, sfx: 'happy' }
    ]
  },

  milk: {
    id: 'milk', priority: Priority.heal, cooldown: 2, abandons: false,
    start: (env) => [
      ...standSteps(env.agent, { emotion: 'happy' }),
      // she fetches it herself from the fridge in the kitchen (taking the stairs if she is upstairs)
      { ...goTo('fridge', 4, 'to the fridge'), face: { emotion: 'happy' }, thought: 'milk' },
      {
        action: 'openFridge', duration: 1.3, faceDir: -1, label: 'open the fridge', face: { emotion: 'curious' }, prop: null, sfx: 'pop',
        onStart: (e) => { e.sim.fridgeOpen = true; },
        onEnd: (e) => { e.sim.bus.emit('effect', { kind: 'sparkles', x: e.agent.x - 24, y: e.agent.y - 62 }); }
      },
      {
        action: 'takeGlass', duration: 1, label: 'takes the glass', face: { emotion: 'delighted' }, prop: 'milk', sfx: 'pop',
        onEnd: (e) => { e.sim.fridgeOpen = false; }
      },
      {
        action: 'drinkMilk', duration: 2.8, label: 'gulp gulp gulp', face: { emotion: 'relaxed', eyesClosed: true }, sfx: 'gulp',
        onEnd: (e) => { e.agent.stache = 1; }
      },
      {
        action: 'relief', duration: 1.8, label: 'ahhh!', face: { emotion: 'delighted' }, prop: null, sfx: 'happy', thought: 'milkDone',
        onStart: (e) => {
          const s = e.sim;
          s.character.needs.tummy = Math.min(100, s.character.needs.tummy + 70);
          s.character.needs.irritation = Math.max(0, s.character.needs.irritation - 10);
          s.memory.add('milk', 0.8, 0.8);
          s.bus.emit('effect', { kind: 'heal', x: e.agent.x, y: e.agent.y - 55 });
          e.agent.glow = 1;
        }
      },
      { action: 'excitedBounce', duration: 1.8, label: 'happy dance', face: { emotion: 'delighted', override: { blush: 1 } }, sfx: 'giggle' }
    ]
  },

  windGust: {
    id: 'windGust', priority: 60, cooldown: 12, abandons: false,
    start: (env) => {
      const sim = env.sim;
      const annoyed = sim.rng.chance(0.4);
      if (env.agent.posture === 'lying') {
        return [{ action: 'sunAdjust', duration: 1.8, label: 'gust ruffles hair', face: { emotion: 'surprised' }, thought: 'windy' }];
      }
      const steps: Step[] = [
        { action: 'surprised', duration: 0.7, label: 'startled by gust', face: { emotion: 'surprised' }, sfx: 'surprise', emotion: ['surprised', 0.7, 1] },
        { action: 'hairAdjust', duration: 1.7, label: 'fix windblown hair', face: { emotion: annoyed ? 'irritated' : 'curious' }, thought: 'windy' }
      ];
      return steps;
    }
  },

  stumble: {
    id: 'stumble', priority: Priority.critical, cooldown: 25, abandons: false,
    start: () => [
      { action: 'stumble', duration: 0.95, label: 'lose balance', face: { emotion: 'surprised' }, sfx: 'surprise', emotion: ['surprised', 1, 1.5] },
      { action: 'recoverBalance', duration: 0.9, label: 'recover balance', face: { emotion: 'surprised' } },
      { action: 'smile', duration: 1.3, label: 'embarrassed giggle', face: { emotion: 'happy', override: { blush: 1 } }, sfx: 'giggle', thought: 'startled' }
    ]
  },

  startled: {
    id: 'startled', priority: Priority.surprise, cooldown: 15, abandons: false,
    start: (env) => {
      const sim = env.sim;
      const potX = GARDEN_POT.x + GARDEN_POT.w / 2;
      const outdoors = sim.isOutdoors;
      const look = outdoors ? { x: potX, y: sim.agent.y - 20 } : null;
      return [
        ...standSteps(env.agent, { emotion: 'surprised' }),
        { action: 'startledJump', duration: 0.85, label: 'startled jump', face: { emotion: 'surprised' }, sfx: 'surprise', thought: 'startled', emotion: ['surprised', 1, 1.5] },
        { action: 'lookAround', duration: 1.8, label: 'what was that?', face: { emotion: 'curious', gaze: look } },
        { action: 'relief', duration: 1.7, label: 'phew', face: { emotion: 'relaxed' } }
      ];
    }
  },

  butterfly: {
    id: 'butterfly', priority: Priority.event, cooldown: 45, abandons: false,
    start: (env) => {
      const sim = env.sim;
      const gaze = (): Vec2 | null => {
        const b = sim.nearestButterfly(300);
        return b ? { x: b.x, y: b.y } : null;
      };
      sim.memory.add('butterflyDelight', 0.7, 0.6, 'outdoors');
      if (env.agent.posture !== 'standing') {
        return [{ action: restingAction(env.agent.posture) === 'lieIdle' ? 'lieIdle' : restingAction(env.agent.posture), duration: 2, label: 'watch butterfly', face: { emotion: 'delighted', gaze }, thought: 'butterfly', sfx: 'giggle' }];
      }
      return [
        { action: 'headTilt', duration: 1.3, label: 'notice butterfly', face: { emotion: 'curious', gaze }, thought: 'butterfly' },
        { action: 'point', duration: 1.2, label: 'point at butterfly', face: { emotion: 'delighted', gaze }, sfx: 'giggle' },
        { action: 'excitedBounce', duration: 1.4, label: 'delighted bounce', face: { emotion: 'delighted', gaze } }
      ];
    }
  },

  bloom: {
    id: 'bloom', priority: Priority.event, cooldown: 25, abandons: false,
    start: (env) => {
      const sim = env.sim;
      sim.memory.add('flowerBloomed', 0.6, 0.6, 'flowerbed');
      const gaze = sim.lastBloomPos ?? undefined;
      if (env.agent.posture !== 'standing') {
        return [{ action: restingAction(env.agent.posture), duration: 1.8, label: 'admire bloom', face: { emotion: 'delighted', gaze }, thought: 'bloom' }];
      }
      return [
        { action: 'headTilt', duration: 1.2, label: 'notice bloom', face: { emotion: 'curious', gaze }, thought: 'bloom' },
        { action: 'excitedBounce', duration: 1.4, label: 'happy bounce', face: { emotion: 'delighted', gaze }, sfx: 'giggle' }
      ];
    }
  },

  discovery: {
    id: 'discovery', priority: Priority.event, cooldown: 30, abandons: false,
    start: (env) => {
      const sim = env.sim;
      sim.memory.add('discovery', 0.7, 0.6);
      return [
        ...standSteps(env.agent, { emotion: 'surprised' }),
        { action: 'surprised', duration: 0.7, label: 'what is that?', face: { emotion: 'surprised' }, sfx: 'surprise' },
        { action: 'examine', duration: 2, label: 'examine discovery', face: { emotion: 'curious' }, thought: sim.lastDiscovery },
        { action: 'celebrateJump', duration: 1.1, label: 'celebrate', face: { emotion: 'delighted' }, sfx: 'giggle' }
      ];
    }
  },

  sunEmerged: {
    id: 'sunEmerged', priority: Priority.ambient + 5, cooldown: 60, abandons: false,
    start: () => [
      { action: 'lookUp', duration: 1.3, label: 'sun comes out', face: { emotion: 'happy', gaze: { x: 900, y: 60 } }, thought: 'sun' },
      { action: 'smile', duration: 1.4, label: 'warm smile', face: { emotion: 'relaxed' } }
    ]
  },

  relief: {
    id: 'relief', priority: Priority.event, cooldown: 10, abandons: false,
    start: (env) => {
      const sim = env.sim;
      sim.memory.add('mosquitoRelief', 0.5, 0.6, 'outdoors');
      const ia = sim.brain.interruptedActivityId();
      if (ia) sim.activities.setResumeBonus(ia, 0.35, sim.time + 90);
      return [
        ...standSteps(env.agent, { emotion: 'relaxed' }),
        { action: 'relief', duration: 1.75, label: 'visible relief', face: { emotion: 'relaxed' }, thought: 'relief', emotion: ['relaxed', 0.9, 3] }
      ];
    }
  },

  // Carley cheers when the dog gets a mosquito that was bothering her
  dogHero: {
    id: 'dogHero', priority: Priority.event, cooldown: 14, abandons: false,
    start: (env) => {
      const sim = env.sim;
      const gaze = dogGaze(sim);
      sim.memory.add('dogHero', 0.8, 0.7, 'outdoors');
      sim.bus.emit('effect', { kind: 'hearts', x: sim.dog.x, y: sim.dog.y - 50 });
      if (env.agent.posture !== 'standing') {
        return [{ action: restingAction(env.agent.posture), duration: 1.8, label: 'cheers for the pup', face: { emotion: 'delighted', gaze }, thought: 'dogHero', sfx: 'giggle' }];
      }
      return [
        { action: 'surprised', duration: 0.6, label: 'saw that!', face: { emotion: 'surprised', gaze }, sfx: 'surprise' },
        { action: 'celebrateJump', duration: 1.1, label: 'good boy!', face: { emotion: 'delighted', gaze }, thought: 'dogHero', sfx: 'happy', emotion: ['delighted', 1, 4] },
        { action: 'wave', duration: 1.3, label: 'blows a kiss', face: { emotion: 'delighted', gaze }, sfx: 'giggle' }
      ];
    }
  },

  // Belly rubs: she calls him over, kneels, strokes his back while he rolls over, then a big cuddle
  petDog: {
    id: 'petDog', priority: Priority.heal, cooldown: 2, abandons: false, stoppable: true,
    start: (env, run) => {
      const sim = env.sim;
      sim.dogPet = { active: true, phase: 'come' };
      sim.bus.emit('dogPlay', { kind: 'pet', started: true });
      run.data.stage = 0;
      run.data.tries = 0;
      return [
        ...standSteps(env.agent, { emotion: 'happy' }),
        { action: 'callDog', duration: 1.1, label: 'calls the pup', face: { emotion: 'delighted', gaze: dogGaze(sim) }, sfx: 'happy', thought: 'dogCall', onStart: (e) => e.agent.faceToward(e.sim.dog.x) }
      ];
    },
    next: (env, run) => {
      const sim = env.sim;
      const a = env.agent;
      const d = sim.dog;
      const gaze = dogGaze(sim);
      if (run.data.stage === 0) {
        if (run.data.stop) return null;
        const close = Math.abs(d.x - a.x) < 60 && d.level === a.level && d.plane !== 'stairs';
        if (!close && (run.data.tries as number) < 8) {
          run.data.tries = (run.data.tries as number) + 1;
          return [{ moveTo: { x: d.x - Math.sign(d.x - a.x || 1) * 42, tolerance: 10, level: d.level }, label: 'goes to the pup', face: { emotion: 'delighted', gaze } }];
        }
        if (!close) return null;
        run.data.stage = 1;
      }
      if (run.data.stage === 1) {
        run.data.stage = 2;
        const hearts = (e: StepEnv): void => e.sim.bus.emit('effect', { kind: 'hearts', x: e.sim.dog.x, y: e.sim.dog.y - 46 });
        return [
          { action: 'kneel', posture: 'kneeling', duration: 0.75, faceDir: d.x >= a.x ? 1 : -1, label: 'kneels down', face: { emotion: 'delighted', gaze }, onStart: (e) => { e.sim.dogPet.phase = 'roll'; } },
          { action: 'petDog', duration: 1.9, label: 'belly rub', face: { emotion: 'delighted', gaze }, sfx: 'giggle', thought: 'dogPet', onStart: hearts },
          { action: 'petDog', duration: 1.9, label: 'more belly rubs', face: { emotion: 'delighted', gaze }, onStart: hearts },
          {
            action: 'cuddleDog', duration: 2.2, label: 'big cuddle', face: { emotion: 'delighted', override: { blush: 1 } }, sfx: 'heal',
            onStart: (e) => {
              const s = e.sim;
              s.dogPet.phase = 'happy';
              const n = s.character.needs;
              n.social = Math.min(100, n.social + 26);
              n.comfort = Math.min(100, n.comfort + 20);
              n.pain = Math.max(0, n.pain - 30);
              n.irritation = Math.max(0, n.irritation - 12);
              s.memory.add('dogLove', 0.9, 0.8);
              s.dogBrain.rewardAttention(70);
              s.bus.emit('effect', { kind: 'heal', x: s.dog.x, y: s.dog.y - 46 });
              e.agent.glow = 0.7;
            }
          },
          { action: 'kneelUp', posture: 'standing', duration: 0.75, label: 'stands up', face: { emotion: 'happy' }, sfx: 'giggle' }
        ];
      }
      return null;
    }
  },

  // Fetch in the garden: she throws the ball, the dog chases it, brings it back, again
  playFetch: {
    id: 'playFetch', priority: Priority.heal, cooldown: 2, abandons: false, stoppable: true,
    start: (env, run) => {
      const sim = env.sim;
      sim.fetch = { active: true, phase: 'wait', throws: 0 };
      sim.ball.state = 'held';
      sim.bus.emit('dogPlay', { kind: 'fetch', started: true });
      run.data.stage = 0;
      run.data.rounds = 0;
      return [
        ...standSteps(env.agent, { emotion: 'happy' }),
        { action: 'callDog', duration: 1.2, label: 'shows the ball', face: { emotion: 'delighted', gaze: dogGaze(sim) }, sfx: 'happy', thought: 'dogFetch', prop: 'ball', onStart: (e) => e.agent.faceToward(e.sim.dog.x) }
      ];
    },
    next: (env, run) => {
      const sim = env.sim;
      const a = env.agent;
      const ballGaze = (): Vec2 => ({ x: sim.ball.x, y: sim.ball.y });
      const rounds = run.data.rounds as number;
      if (run.data.stage === 9) return null;
      if (run.data.stop || rounds >= 6 || !sim.fetch.active) {
        run.data.stage = 9;
        return [
          { action: 'smile', duration: 0.4, label: 'puts the ball away', prop: null, onStart: (e) => { e.sim.ball.state = 'held'; e.sim.fetch.phase = 'idle'; } },
          { action: 'laugh', duration: 1.5, label: 'what a good pup', face: { emotion: 'delighted', gaze: dogGaze(sim) }, sfx: 'giggle', thought: 'dogLove' }
        ];
      }
      const stage = run.data.stage as number;
      if (stage === 0) {
        run.data.stage = 1;
        const dir: 1 | -1 = a.x < 900 ? 1 : -1;
        return [{
          action: 'throwBall', duration: 1.0, faceDir: dir, label: 'throws the ball', face: { emotion: 'delighted' },
          onStart: (e) => { delete e.agent.actionData.thrown; },
          onTick: (e, t) => {
            if (t >= 0.42 && !e.agent.actionData.thrown) {
              e.agent.actionData.thrown = 1;
              e.sim.throwBall(dir);
            }
          }
        }];
      }
      if (stage === 1) {
        run.data.stage = 2;
        return [{
          action: 'point', duration: 16, label: 'watches him fetch', face: { emotion: 'delighted', gaze: ballGaze },
          until: (e) => e.sim.fetch.phase === 'ready' || !e.sim.fetch.active
        }];
      }
      if (stage === 2) {
        if (sim.fetch.phase !== 'ready') {
          // the ball got lost somewhere: end the game gracefully
          run.data.stage = 9;
          sim.fetch.active = false;
          sim.ball.state = 'held';
          return null;
        }
        run.data.stage = 0;
        run.data.rounds = rounds + 1;
        return [
          {
            action: 'pickUp', duration: 1.1, label: 'picks up the ball', face: { emotion: 'happy', gaze: dogGaze(sim) }, sfx: 'giggle',
            onTick: (e, t) => {
              if (t >= 0.7 && e.sim.ball.state === 'rest') {
                e.sim.ball.state = 'held';
                e.agent.prop = 'ball';
                e.sim.fetch.phase = 'wait';
              }
            }
          },
          { action: 'excitedBounce', duration: 0.9, label: 'ready again!', face: { emotion: 'delighted', gaze: dogGaze(sim) }, prop: 'ball', onStart: (e) => { e.sim.fetch.phase = 'wait'; e.sim.ball.state = 'held'; } }
        ];
      }
      return null;
    }
  },

  noticeRain: {
    id: 'noticeRain', priority: Priority.ambient, cooldown: 60, abandons: false,
    start: (env) => {
      const win = getWindow(env.agent.level === 'upper' ? 'up' : 'down');
      return [
        { action: 'lookAround', duration: 1.6, label: 'rain outside', face: { emotion: 'curious', gaze: { x: win.x + win.w / 2, y: win.y + win.h / 2 } }, thought: 'cozy' }
      ];
    }
  }
};
