# CLAUDE.md — granola-sync

Developer reference for AI agents and contributors working on this repo.

## What This Is

A CLI + macOS LaunchAgent that reads Granola meeting transcripts from the local Granola cache, fetches full content via the Granola API, and writes formatted Markdown files to a configured output folder (Google Drive, iCloud, Dropbox, or any local path).

## Build & Dev

```bash
npm install        # install deps
npm run build      # compile TypeScript → dist/
npm link           # make `granola-sync` available globally from local build
```

Source is TypeScript in `src/`. Compiled output goes to `dist/`. The `bin` entry in `package.json` points to `dist/index.js`.

**After editing source, always rebuild before testing:**
```bash
npm run build && granola-sync <command>
```

## Project Structure

```
src/index.ts       — CLI entry + version constant (bump this on release)
src/cli.ts         — All command implementations (setup, sync, status, config, daemon, doctor)
src/sync.ts        — Core sync engine, Google Drive folder detection, file writing
src/auth.ts        — Granola auth loading + token refresh
src/api.ts         — Granola API client (fetches transcripts)
src/cache.ts       — Reads local Granola cache (cache-v3.json)
src/markdown.ts    — Markdown file generation
src/config.ts      — Config + sync state load/save
src/status.ts      — Daemon status checks, log parsing, display helpers
src/paths.ts       — All filesystem path constants
src/types.ts       — TypeScript interfaces
src/version-check.ts — Background update checker

install_launchagent.sh — Installs the macOS LaunchAgent for auto-sync
.github/workflows/ci.yml      — Runs on every push/PR: build + test matrix (Node 18, 20)
.github/workflows/publish.yml — Publishes to npm on GitHub release
```

## How Releases Work

**Do not run `npm publish` manually.** Publishing is fully automated via GitHub Actions.

### Release Process

1. **Bump the version** in two places:
   - `package.json` → `"version": "X.Y.Z"`
   - `src/index.ts` → `const VERSION = 'X.Y.Z'`

2. **Build and commit:**
   ```bash
   npm run build
   git add -A
   git commit -m "chore: bump to vX.Y.Z"
   git push origin main
   ```

3. **Create a GitHub Release** (this is the trigger):
   ```bash
   # Via GitHub API (what Hedwig does)
   curl -X POST https://api.github.com/repos/armsteadj1/granola-sync/releases \
     -H "Authorization: Bearer <token>" \
     -d '{"tag_name":"vX.Y.Z","name":"vX.Y.Z","body":"What changed","draft":false}'
   
   # Or via GitHub web UI: Releases → Draft a new release → tag vX.Y.Z → Publish
   ```

4. **GitHub Actions takes over** (`.github/workflows/publish.yml`):
   - Triggers on `release: published`
   - Checks out code, installs Node 20, builds
   - Runs `npm publish --provenance --access public`
   - Uses `NPM_TOKEN` secret (stored in repo settings — automation token, bypasses OTP)

5. **Done.** Package is live at https://www.npmjs.com/package/@armsteadj1/granola-sync

### Why Not Publish Directly?

npm requires OTP (2FA) for manual `npm publish` unless you use an **automation token**. The `NPM_TOKEN` secret in GitHub Actions is an automation token — it bypasses OTP entirely. This is the correct pattern for CI/CD.

### Checking Pipeline Status

```bash
# Via GitHub UI
https://github.com/armsteadj1/granola-sync/actions

# Via API
curl https://api.github.com/repos/armsteadj1/granola-sync/actions/runs?per_page=5 \
  -H "Authorization: Bearer <token>"
```

## Common Tasks

### Adding a new CLI command

1. Add `registerMyCommand(program)` in `src/cli.ts`
2. Import and call it in `src/index.ts`
3. Follow the existing pattern: `program.command('name').description('...').action(async (opts) => { ... })`

### Changing the sync interval

The default is 1800s (30 min), set in `install_launchagent.sh` via the `StartInterval` plist key. Users can override with `granola-sync daemon --interval <seconds>`.

### Daemon troubleshooting

```bash
launchctl list | grep granola       # PID + exit code (127 = node not found, 0 = clean exit)
tail -f ~/Library/Logs/granola-sync.log
```

The LaunchAgent uses a wrapper script at `~/Library/Application Support/granola-sync/launcher.sh` that loads nvm/fnm/volta before invoking granola-sync. This makes the daemon resilient to node version upgrades. Re-run `install_launchagent.sh` after upgrading granola-sync to regenerate the wrapper.

### Force a full re-sync

```bash
rm ~/.config/granola-sync/sync_state.json
granola-sync sync
```

## Key Paths (Runtime)

| What | Path |
|---|---|
| Granola auth | `~/Library/Application Support/Granola/supabase.json` |
| Granola cache | `~/Library/Application Support/Granola/cache-v3.json` |
| Config | `~/.config/granola-sync/config.yaml` |
| Sync state | `~/.config/granola-sync/sync_state.json` |
| Log | `~/Library/Logs/granola-sync.log` |
| LaunchAgent plist | `~/Library/LaunchAgents/com.user.granola-sync.plist` |
| Launcher wrapper | `~/Library/Application Support/granola-sync/launcher.sh` |
