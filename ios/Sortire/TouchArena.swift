import SwiftUI
import UIKit

struct TouchArena: UIViewRepresentable {
    var mode: Mode

    func makeUIView(context: Context) -> ArenaView { ArenaView() }
    func updateUIView(_ view: ArenaView, context: Context) { view.mode = mode }
}

/// Full-screen multi-touch surface. Draws everything with Core Graphics,
/// driven by a CADisplayLink that only runs while something is animating.
final class ArenaView: UIView {
    private struct Finger {
        var point: CGPoint
        let color: UIColor
        var down = true
    }
    private enum Phase { case waiting, counting, result }

    // Tuning
    private let baseRadius: CGFloat = 52
    private let countdown: CFTimeInterval = 2.0     // seconds of stable touches before choosing
    private let revealGap: CFTimeInterval = 0.45    // seconds between numbers in order mode

    var mode: Mode = .first {
        didSet { if oldValue != mode { reset() } }
    }

    private var fingers: [ObjectIdentifier: Finger] = [:]
    private var arrival: [ObjectIdentifier] = []
    private var palette = Palette()
    private var nextColorIndex = 0
    private var phase: Phase = .waiting
    private var countdownStart: CFTimeInterval = 0
    private var resultStart: CFTimeInterval = 0
    private var animationEnd: CFTimeInterval = 0
    private var winner: ObjectIdentifier?
    private var ranking: [ObjectIdentifier] = []
    private var revealed = 0
    private var link: CADisplayLink?

    override init(frame: CGRect) {
        super.init(frame: frame)
        isMultipleTouchEnabled = true
        isOpaque = true
        contentMode = .redraw
        backgroundColor = palette.background
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) not used") }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        link?.invalidate()
        link = nil
        guard window != nil else { return }
        Haptics.prepare()
        let l = CADisplayLink(target: self, selector: #selector(tick))
        l.isPaused = true
        l.add(to: .main, forMode: .common)
        link = l
    }

    // MARK: - Touches

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        if phase == .result {
            // Only start a new round once every finger from the last one is up.
            guard fingers.values.allSatisfy({ !$0.down }) else { return }
            reset()
        }
        for t in touches {
            let id = ObjectIdentifier(t)
            fingers[id] = Finger(point: t.location(in: self),
                                 color: palette.color(at: nextColorIndex))
            nextColorIndex += 1
            arrival.append(id)
            Haptics.tap()
        }
        restartCountdown()
        wake()
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches {
            let id = ObjectIdentifier(t)
            if fingers[id]?.down == true { fingers[id]?.point = t.location(in: self) }
        }
        setNeedsDisplay()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) { lift(touches) }
    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) { lift(touches) }

    private func lift(_ touches: Set<UITouch>) {
        for t in touches {
            let id = ObjectIdentifier(t)
            guard fingers[id]?.down == true else { continue }
            if phase == .result {
                fingers[id]?.down = false          // keep it on screen as part of the result
            } else {
                fingers[id] = nil
                arrival.removeAll { $0 == id }
            }
        }
        if phase != .result { restartCountdown() }
        wake()
    }

    // MARK: - State

    private func restartCountdown() {
        phase = fingers.count >= 2 ? .counting : .waiting
        countdownStart = CACurrentMediaTime()
    }

    private func reset() {
        fingers.removeAll()
        arrival.removeAll()
        ranking.removeAll()
        winner = nil
        revealed = 0
        nextColorIndex = 0
        phase = .waiting
        palette = Palette()
        backgroundColor = palette.background
        link?.isPaused = true
        setNeedsDisplay()
    }

    private func resolve(_ now: CFTimeInterval) {
        phase = .result
        resultStart = now
        switch mode {
        case .first:
            winner = arrival.randomElement()
            animationEnd = now + 0.8
            Haptics.success()
        case .order:
            ranking = arrival.shuffled()
            revealed = 0
            animationEnd = now + Double(max(0, ranking.count - 1)) * revealGap + 0.4
            advanceReveal(now)
        }
    }

    private func advanceReveal(_ now: CFTimeInterval) {
        let target = min(ranking.count, Int((now - resultStart) / revealGap) + 1)
        while revealed < target {
            revealed += 1
            if revealed == ranking.count { Haptics.success() } else { Haptics.tick() }
        }
    }

    // MARK: - Frame loop

    private func wake() {
        link?.isPaused = false
        setNeedsDisplay()
    }

    private func needsFrames(_ now: CFTimeInterval) -> Bool {
        switch phase {
        case .waiting, .counting: return !fingers.isEmpty
        case .result: return now < animationEnd
        }
    }

    @objc private func tick() {
        let now = CACurrentMediaTime()
        if phase == .counting, now - countdownStart >= countdown { resolve(now) }
        if phase == .result, mode == .order { advanceReveal(now) }
        setNeedsDisplay()
        link?.isPaused = !needsFrames(now)
    }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let now = CACurrentMediaTime()
        ctx.setFillColor(palette.background.cgColor)
        ctx.fill(bounds)

        if fingers.isEmpty { drawHint(); return }

        switch phase {
        case .waiting, .counting:
            drawLive(ctx, now)
        case .result:
            if mode == .first { drawWinner(ctx, now) } else { drawRanking(ctx, now) }
        }
    }

    private func fillCircle(_ ctx: CGContext, _ c: CGPoint, _ r: CGFloat, _ color: UIColor) {
        ctx.setFillColor(color.cgColor)
        ctx.fillEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
    }

    private func drawLive(_ ctx: CGContext, _ now: CFTimeInterval) {
        let progress = CGFloat(min(1, (now - countdownStart) / countdown))
        for (i, id) in arrival.enumerated() {
            guard let f = fingers[id] else { continue }
            let r = baseRadius * (1 + 0.06 * CGFloat(sin(now * 7 + Double(i))))
            fillCircle(ctx, f.point, r, f.color)
            if phase == .counting {
                let path = UIBezierPath(arcCenter: f.point, radius: r + 14,
                                        startAngle: -.pi / 2,
                                        endAngle: -.pi / 2 + 2 * .pi * progress,
                                        clockwise: true)
                path.lineWidth = 6
                path.lineCapStyle = .round
                UIColor.white.withAlphaComponent(0.9).setStroke()
                path.stroke()
            }
        }
    }

    private func drawWinner(_ ctx: CGContext, _ now: CFTimeInterval) {
        let e = now - resultStart
        let fade = CGFloat(max(0, 1 - e / 0.3))
        if fade > 0 {
            for id in arrival where id != winner {
                guard let f = fingers[id] else { continue }
                fillCircle(ctx, f.point, baseRadius, f.color.withAlphaComponent(fade))
            }
        }
        guard let w = winner, let f = fingers[w] else { return }
        let t = CGFloat(min(1, e / 0.6))
        let grow = 1 - pow(1 - t, 3)
        let maxR = hypot(bounds.width, bounds.height)
        fillCircle(ctx, f.point, baseRadius + (maxR - baseRadius) * grow, f.color)

        // White marker so you can see exactly who was picked.
        let ringR = baseRadius * 1.15
        ctx.setStrokeColor(UIColor.white.cgColor)
        ctx.setLineWidth(8)
        ctx.strokeEllipse(in: CGRect(x: f.point.x - ringR, y: f.point.y - ringR,
                                     width: ringR * 2, height: ringR * 2))
        fillCircle(ctx, f.point, baseRadius * 0.45 * grow, .white)
    }

    private func drawRanking(_ ctx: CGContext, _ now: CFTimeInterval) {
        for id in arrival {
            guard let f = fingers[id], let k = ranking.firstIndex(of: id) else { continue }
            if k < revealed {
                let age = now - (resultStart + Double(k) * revealGap)
                let pop = CGFloat(max(0, 1 - age / 0.25))
                let r = baseRadius * (1.1 + 0.3 * pop)
                fillCircle(ctx, f.point, r, f.color)
                drawText("\(k + 1)", at: f.point, size: r * 0.95)
            } else {
                fillCircle(ctx, f.point, baseRadius * 0.8, f.color.withAlphaComponent(0.35))
            }
        }
    }

    private func drawText(_ s: String, at c: CGPoint, size: CGFloat) {
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: size, weight: .heavy),
            .foregroundColor: UIColor.white
        ]
        let str = s as NSString
        let sz = str.size(withAttributes: attrs)
        str.draw(at: CGPoint(x: c.x - sz.width / 2, y: c.y - sz.height / 2), withAttributes: attrs)
    }

    private func drawHint() {
        let style = NSMutableParagraphStyle()
        style.alignment = .center
        let attrs: [NSAttributedString.Key: Any] = [
            .font: UIFont.systemFont(ofSize: 22, weight: .medium),
            .foregroundColor: UIColor.white.withAlphaComponent(0.7),
            .paragraphStyle: style
        ]
        let text = mode.hint as NSString
        let box = bounds.insetBy(dx: 32, dy: 0)
        let h = text.boundingRect(with: CGSize(width: box.width, height: .greatestFiniteMagnitude),
                                  options: .usesLineFragmentOrigin,
                                  attributes: attrs, context: nil).height
        text.draw(in: CGRect(x: box.minX, y: bounds.midY - h / 2, width: box.width, height: h),
                  withAttributes: attrs)
    }
}
