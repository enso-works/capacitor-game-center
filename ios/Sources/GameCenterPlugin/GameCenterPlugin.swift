import Capacitor
import GameKit
import UIKit

/// Game Center for a Capacitor game: signing the local player in, their scores on leaderboards, the achievements they
/// reach, and Apple's Game Center screens. Found by the Capacitor CLI on `npx cap sync`; jsName "GameCenter".
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise)
    ]

    /// The sign-in calls waiting for Game Center's answer (it answers once, and again when the player changes).
    private var waiting: [CAPPluginCall] = []
    private var asked = false
    /// Game Center has answered at least once: later calls get the answer at once instead of waiting.
    private var answered = false
    /// Why the last sign-in failed (Game Center off on the device, or its sheet dismissed), for the app to say.
    private var lastError: String?

    private func state() -> [String: Any] {
        var data: [String: Any] = ["signedIn": GKLocalPlayer.local.isAuthenticated]
        if let lastError, !GKLocalPlayer.local.isAuthenticated { data["error"] = lastError }
        return data
    }

    /// Signs the local player in, showing Game Center's sheet if it has one. Resolves { signedIn, error? }; the
    /// "signedIn" event follows each later change (signing in from the Settings app while the app is in the background).
    @objc func signIn(_ call: CAPPluginCall) {
        let player = GKLocalPlayer.local
        if player.isAuthenticated || answered {
            call.resolve(state())
            return
        }
        waiting.append(call)
        if asked { return }
        asked = true
        player.authenticateHandler = { [weak self] controller, error in
            guard let self else { return }
            if let controller {
                DispatchQueue.main.async { self.bridge?.viewController?.present(controller, animated: true) }
                return
            }
            self.answered = true
            self.lastError = error?.localizedDescription
            let data = self.state()
            let calls = self.waiting
            self.waiting = []
            for waitingCall in calls { waitingCall.resolve(data) }
            self.notifyListeners("signedIn", data: data)
        }
    }

    /// { leaderboard, value }: the score on that leaderboard (Game Center keeps the best).
    @objc func submitScore(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboard"), let value = call.getInt("value") else {
            call.reject("leaderboard and value are required")
            return
        }
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("not signed in")
            return
        }
        GKLeaderboard.submitScore(value, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            if let error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    /// { ids }: achievements reached, each reported complete with Game Center's banner.
    @objc func reportAchievements(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("not signed in")
            return
        }
        if ids.isEmpty {
            call.resolve()
            return
        }
        let achievements = ids.map { id -> GKAchievement in
            let achievement = GKAchievement(identifier: id)
            achievement.percentComplete = 100
            achievement.showsCompletionBanner = true
            return achievement
        }
        GKAchievement.report(achievements) { error in
            if let error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    /// { view?, leaderboard? }: Game Center's screen, on the leaderboards, the achievements or its dashboard (the
    /// default). With a leaderboard id it opens on that leaderboard, all players and all time.
    @objc func show(_ call: CAPPluginCall) {
        let leaderboard = call.getString("leaderboard")
        let state: GKGameCenterViewControllerState
        switch call.getString("view") {
        case "leaderboards": state = .leaderboards
        case "achievements": state = .achievements
        default: state = .dashboard
        }
        DispatchQueue.main.async {
            let controller: GKGameCenterViewController
            if let leaderboard, !leaderboard.isEmpty {
                controller = GKGameCenterViewController(leaderboardID: leaderboard, playerScope: .global, timeScope: .allTime)
            } else {
                controller = GKGameCenterViewController(state: state)
            }
            controller.gameCenterDelegate = self
            self.bridge?.viewController?.present(controller, animated: true)
            call.resolve()
        }
    }

    public func gameCenterViewControllerDidFinish(_ controller: GKGameCenterViewController) {
        controller.dismiss(animated: true)
    }
}
