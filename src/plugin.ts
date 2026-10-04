import { registerPlugin } from '@capacitor/core';

import type { GameCenterPlugin } from './definitions.js';

/** The native plugin, as registered with Capacitor. */
export const GameCenter = registerPlugin<GameCenterPlugin>('GameCenter', {
  web: () => import('./web.js').then((m) => new m.GameCenterWeb()),
});
