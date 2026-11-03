import UIKit

enum Haptics {
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let medium = UIImpactFeedbackGenerator(style: .medium)
    private static let notify = UINotificationFeedbackGenerator()

    static func prepare() {
        light.prepare(); medium.prepare(); notify.prepare()
    }
    /// Finger touches down.
    static func tap() { light.impactOccurred(); light.prepare() }
    /// A number is revealed in order mode.
    static func tick() { medium.impactOccurred(); medium.prepare() }
    /// Winner chosen / final number revealed.
    static func success() { notify.notificationOccurred(.success); notify.prepare() }
}
