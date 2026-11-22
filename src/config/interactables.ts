import { ARMCHAIR_X, BED, EASEL_X, KITCHEN, PHONE_TABLE, STAIRS, UPPER_MAX_X, WINDOWS } from './worldLayout';
import type { Level } from '../core/types';

/**
 * A spot in the cottage or garden where pressing Space does something. The player walks Carley up to it and a little
 * prompt appears ("Press Space to Garden"). `command` is a CommandSystem id.
 */
export interface Interactable {
  id: string;
  command: string;
  level: Level;
  /** centre of the zone (world x) and its half-width */
  x: number;
  radius: number;
  /** "Press Space to <verb>" */
  verb: string;
}

const win = (id: 'up' | 'down'): number => {
  const w = WINDOWS.find((x) => x.id === id)!;
  return w.x + w.w / 2;
};

export const INTERACTABLES: Interactable[] = [
  // upstairs: the bed (including the bedside), the bedroom window and the telephone table
  { id: 'bed', command: 'sleep', level: 'upper', x: BED.x + BED.w / 2 + 2, radius: 82, verb: 'Sleep' },
  { id: 'windowUp', command: 'window', level: 'upper', x: win('up'), radius: 30, verb: 'Look out of the window' },
  { id: 'phone', command: 'call', level: 'upper', x: PHONE_TABLE.x, radius: 26, verb: 'Call Sister' },
  // downstairs: kitchen (fridge + window), easel, reading chair
  { id: 'fridge', command: 'milk', level: 'ground', x: KITCHEN.fridge.x + KITCHEN.fridge.w / 2 + 6, radius: 38, verb: 'Drink Milk' },
  { id: 'windowDown', command: 'window', level: 'ground', x: win('down'), radius: 32, verb: 'Look out of the window' },
  { id: 'easel', command: 'paint', level: 'ground', x: EASEL_X - 6, radius: 40, verb: 'Paint' },
  { id: 'armchair', command: 'read', level: 'ground', x: ARMCHAIR_X, radius: 36, verb: 'Read' },
  // garden
  { id: 'flowerbed', command: 'garden', level: 'ground', x: 730, radius: 190, verb: 'Garden' },
  { id: 'blanket', command: 'sunbathe', level: 'ground', x: 1030, radius: 100, verb: 'Sunbathe' }
];

/** Where the stairs start and end for the "Press ↑ / ↓" hints and for the Up/Down keys. */
export const STAIR_ZONES = {
  /** ground floor: this far from the foot and nearer, ↑ starts climbing */
  footFrom: STAIRS.footX - 28,
  /** upstairs: from here to the edge, ↓ (or walking on to the right) starts the descent */
  topFrom: UPPER_MAX_X - 26
};
