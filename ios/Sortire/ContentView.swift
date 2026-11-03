import SwiftUI

struct ContentView: View {
    @AppStorage("mode") private var mode: Mode = .first

    var body: some View {
        ZStack(alignment: .bottom) {
            TouchArena(mode: mode)
                .ignoresSafeArea()
            ModeToggle(mode: $mode)
                .padding(.bottom, 28)
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
    }
}

struct ModeToggle: View {
    @Binding var mode: Mode

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Mode.allCases) { m in
                Button {
                    mode = m
                } label: {
                    Text(m.title)
                        .font(.subheadline.weight(.bold))
                        .padding(.horizontal, 20)
                        .padding(.vertical, 10)
                        .foregroundColor(mode == m ? .black : .white)
                        .background(mode == m ? Color.white.opacity(0.92) : Color.clear)
                        .clipShape(Capsule())
                }
            }
        }
        .padding(4)
        .background(Color.black.opacity(0.35), in: Capsule())
    }
}
