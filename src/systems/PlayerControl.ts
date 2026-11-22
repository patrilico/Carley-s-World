import { METER_BY_KEY } from '../config/meterConfig';
import { ACTIVITY_LABEL } from '../config/activityConfig';
import { INTERACTABLES, STAIR_ZONES, type Interactable } from '../config/interactables';
import { STAIRS } from '../config/worldLayout';
import type { Simulation } from '../sim/Simulation';
import { COMMANDS, type CommandResult } from './CommandSystem';
import { STAND_FROM, StepRunner, movementAction } from './StepRunner';

export interface PlayerKeys {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  run: boolean;
}

/** What the little box beside Carley says right now. */
export interface Prompt {
  kind: 'action' | 'stop' | 'stairs' | 'info';
  /** e.g. "Press Space to Garden" */
  text: string;
  /** small second line: what it feeds, or why it can't be done right now */
  sub?: string;
  blocked: boolean;
}

/**
 * The player walks Carley around with the arrow keys and acts with Space.
 *  - ← → walk (Shift runs). ↑ at the foot of the stairs climbs them, ↓ at the top (or walking on to the right) goes down.
 *  - Near something she can do, a prompt appears; Space starts it. Space (or a movement key) stops it again.
 * While the player is steering, the autonomous brain is paused; when the keys are released it takes over again,
 * so she still fidgets, looks around and stretches (but never wanders off on her own).
 */
export class PlayerControl {
  keys: PlayerKeys = { left: false, right: false, up: false, down: false, run: false };
  prompt: Prompt | null = null;
  /** True while the player is steering her (the brain is paused). */
  driving = false;
  private standRunner = new StepRunner();
  private idleTime = 0;
  private pushing = 0;

  constructor(private sim: Simulation) {}

  setKey(key: keyof PlayerKeys, down: boolean): void {
    this.keys[key] = down;
  }

  releaseAll(): void {
    this.keys = { left: false, right: false, up: false, down: false, run: false };
  }

  private get intent(): boolean {
    const k = this.keys;
    return k.left !== k.right || k.up || k.down;
  }

  // ------------------------------------------------------------------ per-frame

  /** Returns true when the player is steering Carley this frame (so the brain must not move her). */
  update(dt: number): boolean {
    const sim = this.sim;
    const brain = sim.brain;
    const a = sim.agent;
    this.prompt = null;
    if (sim.autopilot) {
      this.driving = false;
      this.prompt = { kind: 'info', text: 'Autopilot is on', sub: 'Press A to take over', blocked: false };
      return false;
    }

    // --- she is busy with something of her own ---
    if (brain.state === 'REACTING') {
      this.driving = false;
      const def = brain.reaction?.def;
      if (def?.stoppable) {
        if (this.intent) brain.requestStop();
        this.prompt = { kind: 'stop', text: 'Press Space to stop playing', blocked: false };
      }
      return false;
    }
    const act = brain.run && brain.run.activity.id !== 'idle' ? brain.run : null;
    if (act) {
      this.driving = false;
      if (this.intent && brain.state !== 'COMPLETE_ACTIVITY') brain.stopActivity();
      const label = act.activity.id === 'sleeping' ? 'wake up' : `stop ${ACTIVITY_LABEL[act.activity.id].toLowerCase()}`;
      this.prompt = { kind: 'stop', text: `Press Space to ${label}`, blocked: false };
      return false;
    }

    // --- free: she is idle (or just standing about) ---
    if (!this.driving && this.intent) {
      this.driving = true;
      this.idleTime = 0;
      this.standRunner.clear();
      brain.yieldToPlayer();
    }
    if (!this.driving) {
      this.prompt = this.computePrompt();
      return false;
    }

    brain.updateMovementSpeed();
    a.clearStuck();
    const env = { sim, agent: a };
    // get up first if she was sitting, lying or kneeling
    if (a.posture !== 'standing' || !this.standRunner.idle) {
      if (this.standRunner.idle) {
        const from = STAND_FROM[a.posture];
        this.standRunner.start([{ action: from.action, posture: from.posture, label: 'stand up' }]);
      }
      this.standRunner.update(dt, env);
      return true;
    }
    if (!this.intent) {
      a.stop();
      a.play('idle');
      this.pushing = 0;
      this.prompt = this.computePrompt();
      this.idleTime += dt;
      // a short grace so tapping keys doesn't flicker between the player and the brain
      if (this.idleTime > 0.15) {
        this.driving = false;
        brain.handBack();
      }
      return true;
    }
    this.idleTime = 0;
    this.drive(dt);
    this.prompt = this.computePrompt();
    return true;
  }

  /** Turn the held keys into movement. */
  private drive(dt: number): void {
    const a = this.sim.agent;
    const k = this.keys;
    const run = k.run;
    const dir: -1 | 0 | 1 = k.left === k.right ? 0 : k.right ? 1 : -1;
    let moving = true;

    if (a.plane === 'stairs') {
      // on the stairs: left/up climbs, right/down goes back down
      const up = k.left || k.up;
      const down = k.right || k.down;
      if (up === down) moving = false;
      else a.moveToward(up ? STAIRS.topX : STAIRS.footX, run, 6, up ? 'upper' : 'ground');
    } else if (a.plane === 'ground') {
      if (k.up && a.x >= STAIR_ZONES.footFrom) a.moveToward(STAIRS.topX, run, 6, 'upper'); // walk to the foot and climb
      else if (dir !== 0) a.walkDir(dir, run);
      else moving = false;
    } else {
      // walking on to the right when she reaches the top step also takes her down (no dithering at the edge)
      const atEdge = a.x >= STAIR_ZONES.topFrom;
      if ((k.down && atEdge) || (dir === 1 && a.x >= STAIRS.topX - 2)) a.moveToward(STAIRS.footX, run, 6, 'ground'); // down she goes
      else if (dir !== 0) a.walkDir(dir, run);
      else moving = false;
    }

    if (!moving) {
      a.stop();
      a.play('idle');
      return;
    }
    // pressing against a wall: stand still instead of walking on the spot
    if (a.plane !== 'stairs' && Math.abs(a.body.vx) < 6) this.pushing += dt;
    else this.pushing = 0;
    if (this.pushing > 0.25) a.play('idle');
    else a.play(movementAction(this.sim, run));
  }

  // ------------------------------------------------------------------ what can she do here?

  /** The thing she is standing next to (dog first, then the fixed spots). */
  target(): { command: string; verb: string; id: string } | null {
    const sim = this.sim;
    const a = sim.agent;
    if (a.plane === 'stairs') return null;
    const level = a.level;
    const d = sim.dog;
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const it of INTERACTABLES) {
      if (it.level !== level) continue;
      const dist = Math.abs(a.x - it.x);
      if (dist <= it.radius && dist < bestD) {
        best = it;
        bestD = dist;
      }
    }
    if (best) return { command: best.command, verb: best.verb, id: best.id };
    // the dog only counts when nothing else is in reach (he trots along beside her, so he must never block other things)
    if (d.plane !== 'stairs' && d.level === level && Math.abs(d.x - a.x) < 110) {
      return { command: 'dog', verb: sim.isOutdoors ? `Play fetch with ${d.name}` : `Pet ${d.name}`, id: 'dog' };
    }
    return null;
  }

  private computePrompt(): Prompt | null {
    const sim = this.sim;
    const a = sim.agent;
    const t = this.target();
    if (t) {
      const def = sim.commands.get(t.command)!;
      const block = sim.commands.blockReason(t.command);
      return {
        kind: 'action',
        text: `Press Space to ${t.verb}`,
        sub: block ?? `Feeds ${METER_BY_KEY[def.meter].label}`,
        blocked: !!block
      };
    }
    if (a.plane === 'ground' && a.x >= STAIR_ZONES.footFrom) return { kind: 'stairs', text: 'Press ↑ to go upstairs', blocked: false };
    if (a.plane === 'upper' && a.x >= STAIR_ZONES.topFrom) return { kind: 'stairs', text: 'Press ↓ to go downstairs', blocked: false };
    return null;
  }

  // ------------------------------------------------------------------ Space

  /** Space: start what she is next to, or stop what she is doing. Returns a message to flash on screen. */
  action(): CommandResult | null {
    const sim = this.sim;
    const brain = sim.brain;
    if (sim.autopilot) return { ok: false, message: 'Autopilot is on: press A to take over' };
    if (brain.state === 'REACTING') {
      if (brain.reaction?.def.stoppable) {
        brain.requestStop();
        return { ok: true, message: 'Okay, that was fun!' };
      }
      return null;
    }
    const run = brain.run;
    if (run && run.activity.id !== 'idle') {
      const cmd = COMMANDS.find((c) => c.activity === run.activity.id);
      if (cmd) return sim.commands.issue(cmd.id);
      brain.stopActivity();
      return { ok: true, message: 'Okay!' };
    }
    const t = this.target();
    if (!t) return null;
    if (this.driving) {
      this.driving = false;
      this.standRunner.clear();
      brain.handBack();
    }
    this.sim.agent.stop();
    // she looks out of the window the player is standing at (not a random one)
    if (t.id === 'windowUp') sim.windowHint = 'up';
    else if (t.id === 'windowDown') sim.windowHint = 'down';
    const res = sim.commands.issue(t.command);
    if (!res.ok) sim.windowHint = null;
    return res;
  }
}
