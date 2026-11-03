import Foundation

enum Mode: String, CaseIterable, Identifiable {
    case first
    case order

    var id: String { rawValue }

    var title: String {
        switch self {
        case .first: return "Pick one"
        case .order: return "Order all"
        }
    }

    var hint: String {
        switch self {
        case .first: return "Everyone put a finger on the screen.\nOne gets picked."
        case .order: return "Everyone put a finger on the screen.\nEveryone gets a number."
        }
    }
}
