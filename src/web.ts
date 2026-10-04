import { WebPlugin } from '@capacitor/core';

import type { GameCenterPlugin, SignInResult } from './definitions.js';

/** Game Center does not exist on the web: never signed in, and every call does nothing. */
export class GameCenterWeb extends WebPlugin implements GameCenterPlugin {
  async signIn(): Promise<SignInResult> {
    return { signedIn: false };
  }

  async submitScore(): Promise<void> {}

  async reportAchievements(): Promise<void> {}

  async show(): Promise<void> {}
}
