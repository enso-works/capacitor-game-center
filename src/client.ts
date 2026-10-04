import { Capacitor } from '@capacitor/core';

import type { GameCenterPlugin, GameCenterView, SignInResult } from './definitions.js';
import { GameCenter } from './plugin.js';

export interface ScoreOptions {
  /**
   * A leaderboard that starts again each day (UTC): the best score is remembered per day, so the first score of a new
   * day is sent even when it is lower than yesterday's.
   */
  daily?: boolean;
}

/**
 * Game Center for a game, on top of the native plugin. Only on iOS; elsewhere every call does nothing. No call ever
 * throws or rejects: Game Center answers when it can, and a score or achievement it already has is not sent again.
 */
export interface GameCenterClient {
  /** Whether Game Center can be used here (the iOS app). */
  readonly isAvailable: boolean;
  /**
   * Signs the player in (Game Center shows its sheet the first time). Resolves whether they are signed in and, if
   * not, why. `onChange` hears each later change, such as a player who signs in from the Settings app.
   */
  signIn(onChange?: (signedIn: boolean) => void): Promise<SignInResult>;
  /** Whether the player was signed in at Game Center's last answer. */
  isSignedIn(): boolean;
  /**
   * A score on a leaderboard, sent only when it is higher than the last one sent to it in this run (Game Center keeps
   * the best anyway). Values are floored; zero and below are not sent. If sending fails, the next call sends again.
   */
  submitScore(leaderboardId: string, value: number, options?: ScoreOptions): Promise<void>;
  /** Achievements reached, each reported once per run. Those that fail to report are sent again on the next call. */
  reportAchievements(ids: readonly string[]): Promise<void>;
  /** Game Center's screen: the dashboard, the leaderboards or the achievements, or one leaderboard by its id. */
  show(view?: GameCenterView, leaderboardId?: string): Promise<void>;
}

export interface GameCenterClientOptions {
  /** The plugin to call. Defaults to the registered native plugin. */
  plugin?: GameCenterPlugin;
  /** Whether Game Center can be used. Defaults to running on iOS. */
  available?: boolean;
  /** The clock for daily leaderboards. Defaults to `() => new Date()`. */
  now?: () => Date;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** A client with its own state (signed in, what was sent). Most apps use the shared `gameCenter`. */
export function createGameCenterClient(options: GameCenterClientOptions = {}): GameCenterClient {
  const plugin = options.plugin ?? GameCenter;
  const isAvailable = options.available ?? Capacitor.getPlatform() === 'ios';
  const now = options.now ?? (() => new Date());

  let signedIn = false;
  let listening = false;
  const listeners = new Set<(signedIn: boolean) => void>();
  /** The best score sent to each leaderboard (a daily one's per day), and the achievements reported, this run. */
  const sent = new Map<string, number>();
  const reported = new Set<string>();

  function changed(state: SignInResult): void {
    if (state.signedIn === signedIn) return;
    signedIn = state.signedIn;
    if (!signedIn) {
      // Signed out: whoever signs in next has none of this.
      sent.clear();
      reported.clear();
    }
    for (const listener of listeners) {
      try {
        listener(signedIn);
      } catch {
        // A listener's error is its own.
      }
    }
  }

  function listen(): void {
    if (listening) return;
    listening = true;
    try {
      plugin.addListener('signedIn', changed).catch(() => {
        listening = false;
      });
    } catch {
      listening = false;
    }
  }

  return {
    isAvailable,

    async signIn(onChange) {
      if (!isAvailable) return { signedIn: false };
      if (onChange) listeners.add(onChange);
      listen();
      try {
        const state = await plugin.signIn();
        signedIn = state.signedIn;
        return state;
      } catch (e) {
        signedIn = false;
        return { signedIn: false, error: errorText(e) };
      }
    },

    isSignedIn() {
      return signedIn;
    },

    async submitScore(leaderboardId, value, scoreOptions = {}) {
      if (!signedIn || !leaderboardId) return;
      const v = Math.floor(value);
      if (!Number.isFinite(v) || v <= 0) return;
      const key = scoreOptions.daily ? `${leaderboardId}/${now().toISOString().slice(0, 10)}` : leaderboardId;
      const before = sent.get(key);
      if (before !== undefined && v <= before) return;
      sent.set(key, v);
      try {
        await plugin.submitScore({ leaderboard: leaderboardId, value: v });
      } catch {
        // Not sent: forget it, unless a higher score has been sent since.
        if (sent.get(key) !== v) return;
        if (before === undefined) sent.delete(key);
        else sent.set(key, before);
      }
    },

    async reportAchievements(ids) {
      if (!signedIn) return;
      const fresh = [...new Set(ids)].filter((id) => id && !reported.has(id));
      if (!fresh.length) return;
      for (const id of fresh) reported.add(id);
      try {
        await plugin.reportAchievements({ ids: fresh });
      } catch {
        for (const id of fresh) reported.delete(id);
      }
    },

    async show(view = 'dashboard', leaderboardId) {
      if (!signedIn) return;
      try {
        await plugin.show(leaderboardId ? { view: 'leaderboards', leaderboard: leaderboardId } : { view });
      } catch {
        // Nothing to show.
      }
    },
  };
}

/** The shared client, on the native plugin. */
export const gameCenter: GameCenterClient = createGameCenterClient();
