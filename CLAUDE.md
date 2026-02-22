@AGENTS.md

## Frontend Architecture: Local-First Principles

The frontend is a local-first PWA. All UI must work offline with cached data. Follow these principles when modifying frontend code:

### 1. Never block render on network

Startup must show cached IndexedDB data immediately. Network syncs run in the background via the SyncCoordinator — never `await` a network call in the render path or in `initialize()`. The coordinator handles rate-limiting, coalescing, and retry.

### 2. Degrade gracefully when offline

- **Disable actions that require network** (e.g. download button) — show disabled styling, not error dialogs.
- **Prevent destructive offline actions** — don't let users remove downloaded content when offline (they'd lose the ability to read it).
- **Dim unavailable items** — articles without cached content (`hasBody: false`) should appear visually muted when offline, since clicking them can't do anything useful.
- **Keep working actions working** — archive/mark-read use the sync queue and work offline. Don't gate them on network status.

### 3. Single sync path

All data synchronization goes through `SyncCoordinator` → `SyncExecutor.performFullSync()`. Don't add separate network fetch paths (like the old `loadInitialData()`) — they create redundant requests and race conditions. The coordinator's `fetchChanges(since=...)` already handles both first-load and incremental sync.

### 4. Let data trickle in

The RecentPage periodic poll reads from IndexedDB every 10 seconds regardless of sync state. This lets articles appear in the UI as the background sync writes them, rather than waiting for the entire sync to finish. Don't gate IndexedDB reads on sync status.
