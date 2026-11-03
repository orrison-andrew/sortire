import UIKit

/// A fresh random palette per round. Hues are spaced by the golden angle so any
/// number of fingers get clearly distinct colors.
struct Palette {
    private let baseHue = CGFloat.random(in: 0..<1)
    private static let goldenAngle: CGFloat = 137.508 / 360

    var background: UIColor {
        UIColor(hue: baseHue, saturation: 0.45, brightness: 0.14, alpha: 1)
    }

    func color(at index: Int) -> UIColor {
        let hue = (baseHue + CGFloat(index) * Palette.goldenAngle)
            .truncatingRemainder(dividingBy: 1)
        let brightness: CGFloat = index % 2 == 0 ? 0.95 : 0.85
        return UIColor(hue: hue, saturation: 0.78, brightness: brightness, alpha: 1)
    }
}
