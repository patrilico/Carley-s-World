import { hourBump } from '../core/math';
import { getLocation, getWindow } from '../config/worldLayout';
import type { Level } from '../core/types';
import type { Simulation } from '../sim/Simulation';
import type { Step } from '../systems/StepRunner';
import { Activity, goTo, type ActivityRun } from './Activity';

type WindowId = 'up' | 'down';
const SPOT: Record<WindowId, string> = { up: 'windowUp', down: 'windowDown' };

/** Standing at a window watching the weather (especially rain) or the sunset: the bedroom window or the kitchen one. */
export class WindowWatchingActivity extends Activity {
  readonly id = 'windowWatching' as const;

  isAvailable(sim: Simulation): boolean {
    return sim.character.needs.energy > 12;
  }

  calculateUtility(sim: Simulation): number {
    const p = sim.personality;
    const rain = sim.weather.raining ? 0.55 : 0;
    const sunset = 0.25 * hourBump(sim.clock.hour, 18.8, 1);
    const recentRain = 0.25 * Math.min(1, sim.memory.influence('rainedOn'));
    return 0.1 + rain + sunset + recentRain + p.curiosity * 0.1;
  }

  /** Which window she uses for this run: the one on her own floor most of the time, the sky-view one at dusk. */
  private windowFor(sim: Simulation, run: ActivityRun): WindowId {
    let w = run.data.window as WindowId | undefined;
    if (!w && sim.windowHint) {
      w = sim.windowHint;
      sim.windowHint = null;
      run.data.window = w;
    }
    if (!w) {
      const here: WindowId = sim.agent.level === 'upper' ? 'up' : 'down';
      const dusk = sim.clock.hour > 17 || sim.clock.daylight < 0.4;
      const other: WindowId = here === 'up' ? 'down' : 'up';
      w = sim.rng.chance(dusk && here === 'down' ? 0.5 : 0.22) ? other : here;
      run.data.window = w;
    }
    return w;
  }

  override navigateX(sim: Simulation, run: ActivityRun): number {
    return getLocation(SPOT[this.windowFor(sim, run)]).x;
  }

  override navigateLevel(sim: Simulation, run: ActivityRun): Level {
    return getLocation(SPOT[this.windowFor(sim, run)]).level;
  }

  override buildPrepare(sim: Simulation, run: ActivityRun): Step[] {
    return [goTo(SPOT[this.windowFor(sim, run)], 4, 'to window'), { action: 'turn', duration: 0.3, faceDir: 1 }];
  }

  override buildResume(sim: Simulation, run: ActivityRun): Step[] {
    return this.buildPrepare(sim, run);
  }

  override nextPerformSteps(sim: Simulation, run: ActivityRun): Step[] {
    const win = getWindow(this.windowFor(sim, run));
    const gaze = { x: win.x + win.w / 2, y: win.y + win.h / 2 };
    const raining = sim.weather.raining;
    const emotion = raining ? ('relaxed' as const) : sim.clock.hour > 17 ? ('happy' as const) : ('curious' as const);
    const steps: Step[] = [{ action: 'windowWatch', duration: sim.rng.range(5, 9), face: { emotion, gaze }, label: 'watching outside' }];
    if (run.cycles === 0) steps[0].thought = raining ? 'cozy' : sim.clock.daylight < 0.3 ? 'moon' : 'lovelyDay';
    return steps;
  }

  override buildComplete(): Step[] {
    return [{ action: 'smile', duration: 1, face: { emotion: 'relaxed' } }];
  }
}
