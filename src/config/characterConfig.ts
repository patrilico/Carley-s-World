import type { CharacterNeeds, MoodLabel, PersonalityProfile } from '../core/types';

/** Carley: cheerful, affectionate, curious, fond of simple pleasures, easily (dramatically) annoyed. */
export const DEFAULT_PERSONALITY: PersonalityProfile = {
  gardeningAffinity: 0.82,
  sunbathingAffinity: 0.78,
  readingAffinity: 0.66,
  paintingAffinity: 0.72,
  socialAffinity: 0.7,
  insectTolerance: 0.25,
  rainTolerance: 0.3,
  curiosity: 0.8,
  playfulness: 0.72
};

export const INITIAL_NEEDS: CharacterNeeds = {
  happiness: 62,
  energy: 82,
  comfort: 70,
  social: 55,
  irritation: 4,
  pain: 0,
  boredom: 30,
  nature: 70,
  tummy: 72
};

/** Mosquito harassment (per real second, scaled by proximity and tolerance). */
export const MOSQUITO = {
  annoyRadius: 130,
  closeRadius: 70,
  irritationPerSec: 5.5,
  comfortPerSec: 1.6,
  notifyRadius: 140
};

/** Lower bound (inclusive) of each label. */
export const MOOD_THRESHOLDS: [MoodLabel, number][] = [
  ['Miserable', 0],
  ['Sad', 22],
  ['Okay', 40],
  ['Content', 56],
  ['Happy', 70],
  ['Delighted', 85]
];

export const MOOD_HYSTERESIS = 2.5;
export const MOOD_SMOOTHING_PER_SEC = 0.55;
