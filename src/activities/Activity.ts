import { ACTIVITY_LOCATION, ACTIVITY_TUNING, type ActivityNeedsEffect } from '../config/activityConfig';
import { getLocation } from '../config/worldLayout';
import type { ActivityType, Level, PropId, Vec2 } from '../core/types';
import type { Simulation } from '../sim/Simulation';
import type { Step, StepEnv } from '../systems/StepRunner';

/** A step that walks to a named location, on the floor it belongs to. */
export function goTo(locationId: string, tolerance = 6, label?: string): Step {
  const l = getLocation(locationId);
  return { moveTo: { x: l.x, tolerance, level: l.level }, label: label ?? `go to ${locationId}` };
}

export type ActivityPhase = 'navigate' | 'prepare' | 'perform' | 'complete';

/** Mutable state for one execution of an activity. */
export interface ActivityRun {
  activity: Activity;
  phase: ActivityPhase;
  /** Sim seconds spent performing. */
  performed: number;
  /** Planned sim seconds of performing. */
  target: number;
  prepared: boolean;
  startedAt: number;
  cycles: number;
  data: Record<string, number | string | boolean>;
}

/** Interface from the spec: every activity exposes availability + utility. */
export interface ActivityDefinition {
  id: ActivityType;
  locationId: string;
  minDuration: number;
  maxDuration: number;
  cooldown: number;
  isAvailable(ctx: Simulation): boolean;
  calculateUtility(ctx: Simulation): number;
}

export abstract class Activity implements ActivityDefinition {
  abstract readonly id: ActivityType;

  get locationId(): string {
    return ACTIVITY_LOCATION[this.id];
  }
  get minDuration(): number {
    return ACTIVITY_TUNING[this.id].minDuration;
  }
  get maxDuration(): number {
    return ACTIVITY_TUNING[this.id].maxDuration;
  }
  get cooldown(): number {
    return ACTIVITY_TUNING[this.id].cooldown;
  }
  get switchRatio(): number {
    return ACTIVITY_TUNING[this.id].switchRatio;
  }

  abstract isAvailable(ctx: Simulation): boolean;
  abstract calculateUtility(ctx: Simulation): number;

  /** x position Carley walks to before starting. */
  navigateX(_ctx: Simulation, _run: ActivityRun): number {
    return getLocation(this.locationId).x;
  }

  /** Floor that position is on (she takes the stairs when it differs from hers). */
  navigateLevel(_ctx: Simulation, _run: ActivityRun): Level {
    return getLocation(this.locationId).level;
  }

  /** The walk-to-location step used to start (and to resume) the activity. */
  navigateStep(ctx: Simulation, run: ActivityRun, label?: string): Step {
    return { moveTo: { x: this.navigateX(ctx, run), tolerance: 6, level: this.navigateLevel(ctx, run) }, label: label ?? `go to ${this.locationId}` };
  }

  buildPrepare(_ctx: Simulation, _run: ActivityRun): Step[] {
    return [];
  }

  /** Next chunk of the perform phase (each call returns a few seconds of steps). */
  abstract nextPerformSteps(ctx: Simulation, run: ActivityRun): Step[];

  buildComplete(_ctx: Simulation, _run: ActivityRun): Step[] {
    return [];
  }

  /** Steps to re-establish the activity after a quick interruption (walk back, pick props up, sit again...). */
  buildResume(_ctx: Simulation, _run: ActivityRun): Step[] {
    return [];
  }

  /** Natural end condition checked each frame during perform (after the min commitment). */
  shouldEnd(_ctx: Simulation, _run: ActivityRun): boolean {
    return false;
  }

  /** Needs effects (per hour) currently applying; may scale with conditions. */
  needsEffect(_ctx: Simulation, _run: ActivityRun): ActivityNeedsEffect | null {
    return ACTIVITY_TUNING[this.id].effects;
  }

  /** True when this activity involves Carley sleeping (energy drain disabled). */
  get isSleep(): boolean {
    return false;
  }

  onFinished(_ctx: Simulation, _run: ActivityRun): void {}

  /** Clean up held props etc. when the activity is abandoned. */
  onAbandon(ctx: Simulation, _run: ActivityRun): void {
    ctx.agent.prop = null;
  }
}

/** Attach/detach a prop partway through a step (e.g. when the hand reaches the can). */
export function propAt(prop: PropId, at: number): (env: StepEnv, t: number) => void {
  return (env, t) => {
    if (t >= at && env.agent.prop !== prop) {
      env.agent.prop = prop;
      env.sim.bus.emit('propChanged', { prop });
    }
  };
}

/** Gaze function pointing near Carley's own head offset (reading, looking down at hands, etc.). */
export function gazeNear(sim: Simulation, dx: number, dy: number): () => Vec2 {
  return () => ({ x: sim.agent.x + dx * sim.agent.facing, y: sim.agent.y - 86 + dy });
}
