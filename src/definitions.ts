import type { PluginListenerHandle } from '@capacitor/core';

/** Which Game Center screen `show` opens on. */
export type GameCenterView = 'dashboard' | 'leaderboards' | 'achievements';

/** Whether the local player is signed in to Game Center and, if not, why. */
export interface SignInResult {
  signedIn: boolean;
  /** Why not (Game Center off on the device, or its sheet dismissed), when Game Center says. */
  error?: string;
}

export interface SubmitScoreOptions {
  /** The leaderboard id, as set up in App Store Connect. */
  leaderboard: string;
  /** The score, an integer. Game Center keeps the player's best. */
  value: number;
}

export interface ReportAchievementsOptions {
  /** Achievement ids, as set up in App Store Connect. Each is reported 100% complete, with Game Center's banner. */
  ids: string[];
}

export interface ShowOptions {
  /** The screen to open on. Defaults to the dashboard. */
  view?: GameCenterView;
  /** Opens on this leaderboard (all players, all time) instead of `view`. */
  leaderboard?: string;
}

/**
 * The native plugin (iOS only; on the web every call resolves and does nothing). Most apps want the client
 * (`gameCenter` / `createGameCenterClient`), which never throws and does not resend what Game Center already has.
 */
export interface GameCenterPlugin {
  /**
   * Signs the local player in, showing Game Center's sheet the first time. Resolves once Game Center answers; later
   * calls resolve at once with the current state.
   */
  signIn(): Promise<SignInResult>;
  /** Rejects when not signed in or when Game Center fails. */
  submitScore(options: SubmitScoreOptions): Promise<void>;
  /** Rejects when not signed in or when Game Center fails. */
  reportAchievements(options: ReportAchievementsOptions): Promise<void>;
  /** Presents Game Center's screen over the app. */
  show(options?: ShowOptions): Promise<void>;
  /** Each change of sign-in after the first answer, such as signing in from the Settings app. */
  addListener(eventName: 'signedIn', listener: (state: SignInResult) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
