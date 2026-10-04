# @bavrk/capacitor-game-center

Game Center for Capacitor games on iOS: sign the player in, submit leaderboard scores, report achievements, and open
Apple's Game Center screens.

- A typed native plugin (`GameCenter`) for iOS 15+, through Swift Package Manager or CocoaPods.
- A small client (`gameCenter`) that never throws, does nothing off iOS or when the player is not signed in, and does
  not send Game Center a score or achievement it already has.
- On the web, the plugin is never signed in and every call resolves without doing anything.

## Used in Rallo

<p align="center">
  <a href="https://rallo.bavrk.com"><img src="https://raw.githubusercontent.com/enso-works/capacitor-game-center/main/docs/images/rallo-rally.jpg" alt="Rallo: 3D Tennis Game, a rally on centre court" width="820"></a>
</p>

This plugin runs Game Center in [**Rallo: 3D Tennis Game**](https://rallo.bavrk.com) for iPhone and iPad, where it
started. In Rallo:

- **Five leaderboards**: experience, matches won, tournament titles, the best practice run, and a **daily challenge**
  board that starts over every day (`submitScore(id, value, { daily: true })`).
- **Twenty achievements**, from a first win to The Crown, each reported once as the player reaches it.
- **Sign-in at launch**: Game Center shows its sheet the first time, and a player who turns it on later in the
  Settings app comes back signed in, through `signIn(onChange)`.
- **A Game Center button** on the home screen that opens Apple's dashboard with `show()`.

<table>
  <tr>
    <td width="50%"><a href="https://rallo.bavrk.com"><img src="https://raw.githubusercontent.com/enso-works/capacitor-game-center/main/docs/images/rallo-home.jpg" alt="Rallo's home screen, with the Game Center button at the top right"></a></td>
    <td width="50%"><a href="https://rallo.bavrk.com"><img src="https://raw.githubusercontent.com/enso-works/capacitor-game-center/main/docs/images/rallo-progress.jpg" alt="Rallo's progress screen: 20 achievements and 5 Game Center leaderboards"></a></td>
  </tr>
  <tr>
    <td align="center">The home screen, with the Game Center button (top right)</td>
    <td align="center">Achievements, also reported to Game Center</td>
  </tr>
</table>

<p align="center"><a href="https://rallo.bavrk.com"><b>rallo.bavrk.com</b></a></p>

## Install

```sh
npm install @bavrk/capacitor-game-center
npx cap sync ios
```

Requires Capacitor 7 or 8 and an iOS deployment target of 15.0 or later. `npx cap sync ios` adds the Swift package (or
the pod) to the app and registers the plugin; there is no native code to write.

## Setup

Game Center has to be switched on for the app in three places.

1. **Xcode**: in the App target, open *Signing & Capabilities*, click *+ Capability* and add **Game Center**. This
   adds the `com.apple.developer.game-center` entitlement to `App.entitlements`.
2. **Apple Developer**: the app's App ID needs the Game Center capability. Xcode's automatic signing enables it; with
   manual signing, enable it under *Certificates, Identifiers & Profiles > Identifiers* and regenerate the profile.
3. **App Store Connect**: under the app's *Services > Game Center* (in older layouts, *Features > Game Center*), create
   the leaderboards and achievements. Their **ids** are what you pass to this plugin, and they cannot change once the
   app is live. Then, on the app version, enable *Game Center* and add the leaderboards and achievements before you
   submit the build.

To test, run the app on a device or simulator that is signed in to Game Center (Settings > Game Center). Builds from
Xcode and TestFlight use Game Center's sandbox, so scores there do not reach the live leaderboards.

Apple asks games to sign the player in at launch, so call `signIn()` as the game starts.

## Example

```ts
import { gameCenter } from '@bavrk/capacitor-game-center';

const LEADERBOARD = 'com.example.game.highscore';
const DAILY = 'com.example.game.daily';

// At launch: Game Center shows its sheet the first time, then answers at once.
const { signedIn, error } = await gameCenter.signIn((on) => {
  // A later change: the player signed in from Settings while the game was in the background.
  updateGameCenterButton(on);
  if (on) syncProgress();
});
updateGameCenterButton(signedIn);
if (!signedIn) console.log('Game Center:', error);

function syncProgress() {
  // Safe to call as often as you like: only higher scores and new achievements are sent.
  void gameCenter.submitScore(LEADERBOARD, bestScore);
  void gameCenter.submitScore(DAILY, todaysBest, { daily: true });
  void gameCenter.reportAchievements(unlockedAchievementIds);
}

// From a button:
void gameCenter.show('leaderboards');
void gameCenter.show('leaderboards', LEADERBOARD); // one leaderboard
```

## API

```ts
import {
  GameCenter, // the native plugin
  gameCenter, // the shared client
  createGameCenterClient, // a client with its own state
} from '@bavrk/capacitor-game-center';
```

### The client: `gameCenter`

Every method resolves and never rejects. Off iOS, `signIn` resolves `{ signedIn: false }` and everything else does
nothing; before the player is signed in, the other methods do nothing.

| Member | Description |
| --- | --- |
| `isAvailable: boolean` | Whether Game Center can be used here (the iOS app). |
| `signIn(onChange?: (signedIn: boolean) => void): Promise<SignInResult>` | Signs the player in, showing Game Center's sheet the first time. Resolves whether they are signed in and, if not, why (`error`). `onChange` hears each later change. |
| `isSignedIn(): boolean` | Whether the player was signed in at Game Center's last answer. |
| `submitScore(leaderboardId: string, value: number, options?: { daily?: boolean }): Promise<void>` | Sends a score when it is higher than the last sent to that leaderboard in this run. Values are floored; zero and below are skipped. `daily: true` keeps the best per UTC day, for leaderboards that start again each day. A failed send is retried on the next call. |
| `reportAchievements(ids: readonly string[]): Promise<void>` | Reports achievements as 100% complete, with Game Center's banner, each once per run. Those that fail are retried on the next call. |
| `show(view?: 'dashboard' \| 'leaderboards' \| 'achievements', leaderboardId?: string): Promise<void>` | Presents Game Center's screen (the dashboard by default), or one leaderboard by its id. |

When the player signs out, the client forgets what it sent, so the next player's scores and achievements are sent.

`createGameCenterClient(options?)` makes a client with its own state. `options` are `plugin` (another implementation of
`GameCenterPlugin`, such as a mock in tests), `available` (defaults to running on iOS) and `now` (the clock used for
daily leaderboards).

### The native plugin: `GameCenter`

The plugin the client calls, for apps that want the raw calls. These reject on failure.

| Method | Description |
| --- | --- |
| `signIn(): Promise<{ signedIn: boolean; error?: string }>` | Signs the player in. The first call waits for Game Center's answer; later calls resolve at once. |
| `submitScore({ leaderboard, value }): Promise<void>` | Submits an integer score. Rejects with `not signed in` or Game Center's error. |
| `reportAchievements({ ids }): Promise<void>` | Reports the achievements complete. Rejects with `not signed in` or Game Center's error. |
| `show({ view?, leaderboard? }): Promise<void>` | Presents Game Center's screen from the app's view controller. |
| `addListener('signedIn', (state) => void)` | Each answer from Game Center, the first and every later change, with the same `{ signedIn, error? }`. |

## Licence

MIT, (c) 2026 [bavrk](https://bavrk.com)
