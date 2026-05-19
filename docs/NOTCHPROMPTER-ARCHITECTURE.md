# NotchPrompter Architecture Proposal

Practical target: a native macOS app built with SwiftUI for shell/UI and AppKit for window/control primitives, with no existing Xcode project required at repo start.

## Architecture goals

- Menu bar first, no Dock icon by default.
- Lightweight overlay prompt anchored to the notch/screen top area.
- Persistent user settings and prompt history.
- Clear separation between app shell, window management, and feature modules.
- Buildable from source in a plain repo, but easy to open in Xcode later.

## Recommended code organization

Use a layered structure:

- AppShell: launch, lifecycle, menu bar, app delegate bridging.
- Features: user-facing domains like prompt composer, history, settings.
- Services: persistence, window coordination, screen/panel behavior, hotkeys.
- Models: value types and domain data.
- Shared: utilities, theme, constants, extensions.

Keep AppKit-only code isolated so SwiftUI views stay portable and preview-friendly.

## Suggested file tree

```text
NotchPrompter/
├── Package.swift
├── README.md
├── Sources/
│   └── NotchPrompter/
│       ├── App/
│       │   ├── NotchPrompterApp.swift
│       │   ├── AppDelegate.swift
│       │   ├── SceneCoordinator.swift
│       │   └── MenuBar/
│       │       ├── MenuBarView.swift
│       │       ├── StatusItemController.swift
│       │       └── MenuCommands.swift
│       ├── Features/
│       │   ├── Prompt/
│       │   │   ├── PromptView.swift
│       │   │   ├── PromptViewModel.swift
│       │   │   └── PromptComposer.swift
│       │   ├── History/
│       │   │   ├── HistoryListView.swift
│       │   │   └── HistoryViewModel.swift
│       │   └── Settings/
│       │       ├── SettingsView.swift
│       │       └── SettingsViewModel.swift
│       ├── Services/
│       │   ├── Persistence/
│       │   │   ├── AppStorageStore.swift
│       │   │   ├── FileStore.swift
│       │   │   └── MigrationService.swift
│       │   ├── Windowing/
│       │   │   ├── OverlayWindowController.swift
│       │   │   ├── OverlayPanel.swift
│       │   │   ├── WindowPlacementService.swift
│       │   │   └── ScreenObserver.swift
│       │   ├── Lifecycle/
│       │   │   ├── LaunchCoordinator.swift
│       │   │   └── AccessibilityPermissionService.swift
│       │   └── Hotkeys/
│       │       ├── HotkeyManager.swift
│       │       └── HotkeyDefinitions.swift
│       ├── Models/
│       │   ├── PromptItem.swift
│       │   ├── PromptHistoryEntry.swift
│       │   ├── AppSettings.swift
│       │   └── WindowState.swift
│       └── Shared/
│           ├── Constants.swift
│           ├── Theme.swift
│           ├── Extensions/
│           │   ├── NSColor+Hex.swift
│           │   ├── View+Padding.swift
│           │   └── URL+AppSupport.swift
│           └── Logging/
│               └── Logger.swift
├── Resources/
│   ├── Assets.xcassets
│   ├── LaunchScreen.storyboard   (optional)
│   └── Info.plist
├── Tests/
│   └── NotchPrompterTests/
│       ├── PersistenceTests.swift
│       ├── WindowPlacementTests.swift
│       ├── HotkeyTests.swift
│       └── ViewModelTests.swift
├── AppSupport/
│   ├── NotchPrompter.xcodeproj/   (generated or checked in later)
│   └── NotchPrompter.xcworkspace/ (only if dependencies require it)
└── Scripts/
    ├── bootstrap.sh
    ├── generate-xcodeproj.sh
    └── build-release.sh
```

## Module responsibilities

### App shell

- `NotchPrompterApp.swift`: SwiftUI entry point, menu bar scene, main environment objects.
- `AppDelegate.swift`: hook app-wide startup, accessibility checks, launch-on-login, status item setup.
- `SceneCoordinator.swift`: decides when to show/hide the overlay, settings, and history windows.

### Overlay window management

Use AppKit for the overlay because it needs precise control.

Recommended pattern:

- `OverlayPanel` as an `NSPanel` subclass or configured non-activating panel.
- `OverlayWindowController` owns the panel and a SwiftUI `NSHostingView`.
- `WindowPlacementService` calculates size/position relative to the active screen and notch-safe top area.
- `ScreenObserver` listens for `NSApplication.didChangeScreenParametersNotification` and screen-space changes.

Behavior:

- show on global hotkey or menu action,
- position above content but below the system menu bar area,
- close on Escape/outside click if desired,
- remember last size, anchor, and visibility state.

### Persistence

Keep persistence simple and split by data type:

- `UserDefaults` / `@AppStorage` for small preferences: launch at login, hotkey enabled, theme, last overlay mode.
- File-based JSON or plist in Application Support for structured data: history entries, templates, saved prompts.
- `MigrationService` upgrades schema versions on launch.
- `AppStorageStore` wraps tiny preferences into typed access.
- `FileStore` handles atomic reads/writes, encoding, and backups.

Store app files under:

- `~/Library/Application Support/NotchPrompter/`

### Menu bar lifecycle

This should be a menu-bar-only app:

- Set `LSUIElement = YES` or configure as an agent app if no Dock icon is desired.
- Use `MenuBarExtra` for the SwiftUI menu if you want modern SwiftUI-first behavior.
- Use `NSStatusItem` if you need finer control over icons, menu updates, and click behavior.
- Keep one `StatusItemController` responsible for status icon, menu, and quick actions.

Lifecycle flow:

1. App launches.
2. `LaunchCoordinator` loads settings and migrations.
3. Status item appears.
4. Hotkeys and observers register.
5. Overlay is created lazily on first use.

## Build strategy without an existing Xcode project

Use Swift Package Manager as the source layout and build backbone first.

Recommended approach:

1. Create `Package.swift` with one macOS executable target and one test target.
2. Put all source in `Sources/NotchPrompter` and tests in `Tests/NotchPrompterTests`.
3. Build and test from CLI with `swift build` and `swift test`.
4. When ready for a polished macOS app, generate or add an Xcode project that references the same source tree.

Why this works:

- the repo is immediately buildable without Xcode project files,
- CLI builds are reproducible in CI,
- Xcode can open the package directly or adopt a generated project later,
- app logic stays independent of the IDE format.

## Xcode-project compatibility plan

Make the package and Xcode project share the same source paths.

Best practice:

- keep actual code in `Sources/` and `Tests/` only,
- avoid IDE-specific logic in source,
- keep asset catalogs and Info.plist in `Resources/`,
- if you need custom signing/capabilities, add them in a thin Xcode wrapper project only,
- optionally generate `.xcodeproj` from a script or use Xcode’s “Open Package” workflow.

If you later create a checked-in Xcode project, keep it minimal:

- one app target,
- one test target,
- references to the package source tree,
- no duplicated business logic.

## Practical implementation notes

- Use ObservableObject or the newer Observation framework for view models, but keep AppKit bridge objects separate.
- Keep prompt composition pure and testable in view models, not inside views.
- Prefer protocol-based services for persistence and window management so unit tests can mock them.
- Keep overlay positioning logic deterministic and unit-testable by feeding screen geometry in as input.
- Don’t let menu bar code know about storage internals; it should call services via a coordinator.

## Minimal initial milestone

1. Menu bar icon + menu.
2. Overlay panel open/close with a SwiftUI prompt editor.
3. Settings persisted to UserDefaults.
4. History saved to Application Support.
5. Global hotkey toggles the overlay.
6. Xcode opens the same source tree cleanly.

## Suggested build commands

```bash
swift build
swift test
swift run NotchPrompter
```

If packaging as an app bundle:

```bash
swift build -c release
# then wrap the built binary in a .app bundle via a small packaging script or Xcode target
```
