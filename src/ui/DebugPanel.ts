import { ACTIVITY_LABEL } from '../config/activityConfig';
import { ACTIONS } from '../systems/AnimationController';
import type { ActionId, EmotionType, Posture, PropId, WeatherType } from '../core/types';
import type { Simulation } from '../sim/Simulation';

const EMOTIONS: EmotionType[] = ['neutral', 'happy', 'delighted', 'sad', 'irritated', 'angry', 'hurt', 'tired', 'curious', 'relaxed', 'surprised'];

const SPEEDS = [0.125, 0.25, 0.5, 1, 2, 4, 8, 16];

type NeedKey = 'happiness' | 'energy' | 'boredom' | 'social' | 'comfort' | 'nature' | 'tummy' | 'irritation' | 'pain';

/** Needs the panel can set directly; `invert` shows boredom as "fun". */
const NEED_SLIDERS: { key: NeedKey; label: string; invert?: boolean }[] = [
  { key: 'happiness', label: 'happiness' },
  { key: 'energy', label: 'rest' },
  { key: 'boredom', label: 'fun', invert: true },
  { key: 'social', label: 'social' },
  { key: 'comfort', label: 'relax' },
  { key: 'nature', label: 'garden' },
  { key: 'tummy', label: 'tummy' },
  { key: 'irritation', label: 'irritation' },
  { key: 'pain', label: 'pain' }
];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

/**
 * Hidden-by-default (F3 / `) developer panel: time control, editable needs, god powers (weather, critters, plants)
 * and an animation previewer.
 */
export class DebugPanel {
  private root: HTMLElement;
  private readouts: HTMLElement;
  private visible = false;
  private timer = 0;
  private hourSlider!: HTMLInputElement;
  private speedBtns: HTMLButtonElement[] = [];
  private needSliders: { slider: HTMLInputElement; value: HTMLElement; def: (typeof NEED_SLIDERS)[number] }[] = [];

  constructor(private sim: Simulation, private onToggle?: (v: boolean) => void) {
    this.root = document.getElementById('debug')!;
    this.root.innerHTML = '';
    this.root.appendChild(el('h2', {}, "Carley's World debug panel"));
    this.root.appendChild(this.buildControls());
    this.readouts = el('div');
    this.root.appendChild(this.readouts);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3' || e.key === '`') {
        e.preventDefault();
        this.toggle();
      }
    });
  }

  toggle(force?: boolean): void {
    this.visible = force ?? !this.visible;
    this.root.style.display = this.visible ? 'block' : 'none';
    this.onToggle?.(this.visible);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  private btn(label: string, fn: () => void, cls = ''): HTMLButtonElement {
    const b = el('button', cls ? { class: cls } : {}, label);
    b.addEventListener('click', fn);
    return b;
  }

  private select(options: string[], value = ''): HTMLSelectElement {
    const s = el('select');
    for (const o of options) s.appendChild(el('option', { value: o }, o));
    if (value) s.value = value;
    return s;
  }

  private buildControls(): HTMLElement {
    const sim = this.sim;
    const box = el('div');

    box.appendChild(el('h3', {}, 'Time'));
    const speeds = el('div');
    for (const sp of SPEEDS) {
      const b = this.btn(`${sp}x`, () => {
        sim.timeScale = sp;
      });
      this.speedBtns.push(b);
      speeds.appendChild(b);
    }
    speeds.appendChild(this.btn('Pause', () => (sim.paused = !sim.paused)));
    box.appendChild(speeds);
    const hourRow = el('div');
    hourRow.appendChild(el('span', {}, 'Hour '));
    this.hourSlider = el('input', { type: 'range', min: '0', max: '24', step: '0.25', value: String(sim.clock.hour) });
    this.hourSlider.addEventListener('input', () => sim.clock.setHour(parseFloat(this.hourSlider.value)));
    hourRow.appendChild(this.hourSlider);
    box.appendChild(hourRow);

    box.appendChild(el('h3', {}, 'Needs'));
    for (const def of NEED_SLIDERS) {
      const row = el('div', { class: 'need' });
      row.appendChild(el('span', { class: 'label' }, def.label));
      const slider = el('input', { type: 'range', min: '0', max: '100', step: '1' });
      const value = el('span', { class: 'dim' });
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        sim.character.needs[def.key] = def.invert ? 100 - v : v;
      });
      row.append(slider, value);
      box.appendChild(row);
      this.needSliders.push({ slider, value, def });
    }

    box.appendChild(el('h3', {}, 'Weather'));
    const wb = el('div');
    for (const w of ['sunny', 'cloudy', 'rainy', 'windy'] as WeatherType[]) wb.appendChild(this.btn(w, () => sim.weather.setWeather(w, 150)));
    wb.appendChild(this.btn('gust', () => sim.weather.triggerGust(1)));
    box.appendChild(wb);

    box.appendChild(el('h3', {}, 'God powers'));
    const gb = el('div');
    const nearCarley = (): { x: number; y: number } => ({ x: sim.agent.x + (Math.random() - 0.5) * 240, y: sim.agent.y - 60 - Math.random() * 80 });
    gb.appendChild(this.btn('Summon butterflies', () => {
      for (let i = 0; i < 3; i++) {
        const p = nearCarley();
        sim.spawnButterfly(p.x, p.y, true);
      }
    }));
    gb.appendChild(this.btn('Summon bugs', () => {
      for (let i = 0; i < 3; i++) {
        const p = nearCarley();
        sim.spawnMosquito(p.x, p.y);
      }
    }));
    gb.appendChild(this.btn('Clear critters', () => {
      for (const m of sim.liveMosquitoes()) sim.killMosquito(m);
      for (const b of sim.butterflies) b.removed = true;
    }));
    gb.appendChild(this.btn('Water plants', () => sim.plants.forEach((p) => p.water(60))));
    gb.appendChild(this.btn('Heal Carley', () => {
      sim.character.needs.pain = 0;
      sim.character.needs.irritation = 0;
    }));
    gb.appendChild(this.btn('Fill needs', () => {
      Object.assign(sim.character.needs, { happiness: 100, energy: 100, boredom: 0, social: 100, comfort: 100, nature: 100, tummy: 100, irritation: 0, pain: 0 });
    }));
    box.appendChild(gb);

    box.appendChild(el('h3', {}, 'Animation preview'));
    const ab = el('div');
    const actions = this.select(Object.keys(ACTIONS).sort());
    const posture = this.select(['standing', 'sitting', 'lying', 'kneeling']);
    const prop = this.select(['none', 'wateringCan', 'phone', 'book', 'brush']);
    const emo = this.select(['(auto)', ...EMOTIONS]);
    const play = (): void => {
      sim.aiFrozen = true;
      sim.agent.posture = posture.value as Posture;
      sim.agent.prop = prop.value === 'none' ? null : (prop.value as PropId);
      sim.agent.face = emo.value === '(auto)' ? {} : { emotion: emo.value as EmotionType };
      sim.agent.stop();
      sim.agent.play(actions.value as ActionId, true);
    };
    ab.appendChild(actions);
    ab.appendChild(posture);
    ab.appendChild(prop);
    ab.appendChild(emo);
    ab.appendChild(this.btn('Play', play));
    ab.appendChild(this.btn('Walk right', () => { sim.aiFrozen = true; sim.agent.moveToward(sim.agent.x + 300, false, 0); sim.agent.play('walk'); }));
    ab.appendChild(this.btn('Resume AI', () => (sim.aiFrozen = false)));
    box.appendChild(ab);
    return box;
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    const sim = this.sim;
    this.speedBtns.forEach((b, i) => b.classList.toggle('on', SPEEDS[i] === sim.timeScale));
    if (document.activeElement !== this.hourSlider) this.hourSlider.value = String(sim.clock.hour);

    const needs = sim.character.needs;
    for (const { slider, value, def } of this.needSliders) {
      const v = def.invert ? 100 - needs[def.key] : needs[def.key];
      if (document.activeElement !== slider) slider.value = String(v);
      value.textContent = v.toFixed(0);
    }

    const b = sim.brain.describe();
    this.readouts.innerHTML = [
      '<h3>Mind</h3>',
      `mood: <b>${sim.emotion.mood.value.toFixed(1)}</b> (${sim.emotion.mood.label})<br>`,
      `emotion: <b>${sim.emotion.current}</b> / shown: ${sim.emotion.effective} (${sim.emotion.intensity.toFixed(2)})<br>`,
      `brain: <b>${b.state}</b><br>activity: <b>${ACTIVITY_LABEL[b.activity]}</b> [${b.phase}]<br>step: ${b.step}<br>reaction: ${b.reaction}<br>`,
      `action: ${sim.agent.action} · posture: ${sim.agent.posture} · prop: ${sim.agent.prop ?? '-'}<br>`,
      `zone: <b>${sim.character.currentZone}</b> x=${sim.agent.x.toFixed(0)} y=${sim.agent.y.toFixed(0)} · time ${sim.clockLabel} (${sim.timeScale}x)`
    ].join('');
  }
}
