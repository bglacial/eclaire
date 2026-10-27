import type { Criterion } from './types';

export type Theme = 'light' | 'dark' | 'auto';
export function readSettings(storage: Pick<Storage, 'getItem'>): { theme: Theme; criterion: Criterion } {
  try {
    const theme = storage.getItem('eclaire.theme');
    const criterion = storage.getItem('eclaire.criterion');
    return { theme: theme === 'light' || theme === 'dark' ? theme : 'auto', criterion: criterion === 'distance' ? 'distance' : 'time' };
  } catch { return { theme: 'auto', criterion: 'time' }; }
}
