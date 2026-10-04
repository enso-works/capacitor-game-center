import { describe, expect, it, vi } from 'vitest';

import { createGameCenterClient } from './client.js';
import type {
  GameCenterPlugin,
  ReportAchievementsOptions,
  ShowOptions,
  SignInResult,
  SubmitScoreOptions,
} from './definitions.js';

function mockPlugin(signIn: SignInResult = { signedIn: true }) {
  let listener: ((state: SignInResult) => void) | undefined;
  const plugin = {
    signIn: vi.fn(async () => signIn),
    submitScore: vi.fn(async (_options: SubmitScoreOptions) => undefined),
    reportAchievements: vi.fn(async (_options: ReportAchievementsOptions) => undefined),
    show: vi.fn(async (_options?: ShowOptions) => undefined),
    addListener: vi.fn(async (_event: 'signedIn', l: (state: SignInResult) => void) => {
      listener = l;
      return { remove: async () => undefined };
    }),
    removeAllListeners: vi.fn(async () => undefined),
  } satisfies GameCenterPlugin;
  return { plugin, emit: (state: SignInResult) => listener?.(state) };
}

async function signedInClient(now = () => new Date('2026-10-04T12:00:00Z')) {
  const mock = mockPlugin();
  const client = createGameCenterClient({ plugin: mock.plugin, available: true, now });
  await client.signIn();
  return { ...mock, client };
}

describe('signIn', () => {
  it('does nothing off iOS', async () => {
    const { plugin } = mockPlugin();
    const client = createGameCenterClient({ plugin, available: false });
    expect(client.isAvailable).toBe(false);
    expect(await client.signIn()).toEqual({ signedIn: false });
    expect(plugin.signIn).not.toHaveBeenCalled();
    expect(plugin.addListener).not.toHaveBeenCalled();
    expect(client.isSignedIn()).toBe(false);
  });

  it('resolves the native answer and remembers it', async () => {
    const { client } = await signedInClient();
    expect(client.isSignedIn()).toBe(true);
  });

  it('passes on why the player is not signed in', async () => {
    const { plugin } = mockPlugin({ signedIn: false, error: 'Game Center is off' });
    const client = createGameCenterClient({ plugin, available: true });
    expect(await client.signIn()).toEqual({ signedIn: false, error: 'Game Center is off' });
    expect(client.isSignedIn()).toBe(false);
  });

  it('never throws when the plugin rejects', async () => {
    const { plugin } = mockPlugin();
    plugin.signIn.mockRejectedValueOnce(new Error('boom'));
    const client = createGameCenterClient({ plugin, available: true });
    expect(await client.signIn()).toEqual({ signedIn: false, error: 'boom' });
  });

  it('tells onChange of each later change, once per change', async () => {
    const { plugin, emit } = mockPlugin({ signedIn: false });
    const client = createGameCenterClient({ plugin, available: true });
    const onChange = vi.fn();
    await client.signIn(onChange);
    emit({ signedIn: false });
    emit({ signedIn: true });
    emit({ signedIn: true });
    expect(onChange.mock.calls).toEqual([[true]]);
    expect(client.isSignedIn()).toBe(true);
    await client.signIn(onChange);
    expect(plugin.addListener).toHaveBeenCalledTimes(1);
  });
});

describe('when not signed in', () => {
  it('sends nothing', async () => {
    const { plugin } = mockPlugin({ signedIn: false });
    const client = createGameCenterClient({ plugin, available: true });
    await client.signIn();
    await client.submitScore('board', 10);
    await client.reportAchievements(['a']);
    await client.show();
    expect(plugin.submitScore).not.toHaveBeenCalled();
    expect(plugin.reportAchievements).not.toHaveBeenCalled();
    expect(plugin.show).not.toHaveBeenCalled();
  });

  it('sends nothing before signIn', async () => {
    const { plugin } = mockPlugin();
    const client = createGameCenterClient({ plugin, available: true });
    await client.submitScore('board', 10);
    await client.reportAchievements(['a']);
    expect(plugin.submitScore).not.toHaveBeenCalled();
    expect(plugin.reportAchievements).not.toHaveBeenCalled();
  });
});

describe('submitScore', () => {
  it('sends a score only when higher than the last sent', async () => {
    const { client, plugin } = await signedInClient();
    await client.submitScore('board', 10);
    await client.submitScore('board', 10);
    await client.submitScore('board', 7);
    await client.submitScore('board', 12.9);
    await client.submitScore('other', 3);
    expect(plugin.submitScore.mock.calls).toEqual([
      [{ leaderboard: 'board', value: 10 }],
      [{ leaderboard: 'board', value: 12 }],
      [{ leaderboard: 'other', value: 3 }],
    ]);
  });

  it('skips zero, negative and non-finite scores', async () => {
    const { client, plugin } = await signedInClient();
    await client.submitScore('board', 0);
    await client.submitScore('board', -5);
    await client.submitScore('board', 0.5);
    await client.submitScore('board', Number.NaN);
    await client.submitScore('board', Number.POSITIVE_INFINITY);
    expect(plugin.submitScore).not.toHaveBeenCalled();
  });

  it('keys a daily leaderboard by the UTC day', async () => {
    let now = new Date('2026-10-04T23:30:00Z');
    const { client, plugin } = await signedInClient(() => now);
    await client.submitScore('daily', 20, { daily: true });
    await client.submitScore('daily', 15, { daily: true });
    now = new Date('2026-10-05T00:10:00Z');
    await client.submitScore('daily', 15, { daily: true });
    await client.submitScore('daily', 14, { daily: true });
    expect(plugin.submitScore.mock.calls).toEqual([
      [{ leaderboard: 'daily', value: 20 }],
      [{ leaderboard: 'daily', value: 15 }],
    ]);
  });

  it('sends again after a failure, and never throws', async () => {
    const { client, plugin } = await signedInClient();
    plugin.submitScore.mockRejectedValueOnce(new Error('offline'));
    await expect(client.submitScore('board', 10)).resolves.toBeUndefined();
    await client.submitScore('board', 10);
    expect(plugin.submitScore).toHaveBeenCalledTimes(2);
  });

  it('falls back to the score sent before a failed one', async () => {
    const { client, plugin } = await signedInClient();
    await client.submitScore('board', 10);
    plugin.submitScore.mockRejectedValueOnce(new Error('offline'));
    await client.submitScore('board', 20);
    await client.submitScore('board', 10);
    await client.submitScore('board', 15);
    expect(plugin.submitScore.mock.calls.map(([o]) => o.value)).toEqual([10, 20, 15]);
  });

  it('keeps a higher score sent while a lower one was failing', async () => {
    const { client, plugin } = await signedInClient();
    let fail: (e: Error) => void = () => undefined;
    plugin.submitScore.mockImplementationOnce(() => new Promise<undefined>((_, reject) => (fail = reject)));
    const first = client.submitScore('board', 10);
    await client.submitScore('board', 20);
    fail(new Error('offline'));
    await first;
    await client.submitScore('board', 20);
    expect(plugin.submitScore.mock.calls.map(([o]) => o.value)).toEqual([10, 20]);
  });
});

describe('reportAchievements', () => {
  it('reports each achievement once', async () => {
    const { client, plugin } = await signedInClient();
    await client.reportAchievements(['a', 'b', 'a']);
    await client.reportAchievements(['a', 'b']);
    await client.reportAchievements(['b', 'c']);
    await client.reportAchievements([]);
    expect(plugin.reportAchievements.mock.calls).toEqual([[{ ids: ['a', 'b'] }], [{ ids: ['c'] }]]);
  });

  it('reports again after a failure, and never throws', async () => {
    const { client, plugin } = await signedInClient();
    plugin.reportAchievements.mockRejectedValueOnce(new Error('offline'));
    await expect(client.reportAchievements(['a', 'b'])).resolves.toBeUndefined();
    await client.reportAchievements(['a', 'b']);
    expect(plugin.reportAchievements.mock.calls).toEqual([[{ ids: ['a', 'b'] }], [{ ids: ['a', 'b'] }]]);
  });

  it('forgets what was sent when the player signs out', async () => {
    const { client, plugin, emit } = await signedInClient();
    await client.reportAchievements(['a']);
    await client.submitScore('board', 10);
    emit({ signedIn: false });
    emit({ signedIn: true });
    await client.reportAchievements(['a']);
    await client.submitScore('board', 10);
    expect(plugin.reportAchievements).toHaveBeenCalledTimes(2);
    expect(plugin.submitScore).toHaveBeenCalledTimes(2);
  });
});

describe('show', () => {
  it('opens the dashboard, a view or one leaderboard', async () => {
    const { client, plugin } = await signedInClient();
    await client.show();
    await client.show('achievements');
    await client.show('dashboard', 'board');
    expect(plugin.show.mock.calls).toEqual([
      [{ view: 'dashboard' }],
      [{ view: 'achievements' }],
      [{ view: 'leaderboards', leaderboard: 'board' }],
    ]);
  });

  it('never throws', async () => {
    const { client, plugin } = await signedInClient();
    plugin.show.mockRejectedValueOnce(new Error('no view controller'));
    await expect(client.show()).resolves.toBeUndefined();
  });
});
