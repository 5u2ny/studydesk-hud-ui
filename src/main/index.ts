import { app, screen, globalShortcut, systemPreferences, nativeImage } from 'electron';
import * as path from 'path';
import { existsSync } from 'fs';
import { windowManager } from './windowManager';
import { setupIPC } from './ipcHandlers';
import { appTracker } from './appTracker';
import { focusStore } from './services/store';
import { captureService } from './services/capture/captureService';
import { promptAccessibilityPermission } from './services/capture/permissionCheck';
import { gmailService } from './services/gmail/gmailService';
import { folderWatcherService } from './services/folders/folderWatcherService';

process.on('uncaughtException',  (err)    => console.error('[main] Uncaught:', err.message));
process.on('unhandledRejection', (reason) => console.error('[main] Unhandled rejection:', reason));

// Mark app as NOT quitting by default (used by notes window hide-on-close guard)
(app as any).isQuitting = false;

/** Resolve the bundled app icon. Works in both dev (assets/icon.png at repo
 *  root) and packaged builds (Resources/icon.png next to the .app). */
function resolveAppIcon(): string | null {
  const candidates = [
    path.join(__dirname, '..', '..', '..', 'assets', 'icon.png'),  // dev: dist/main/main → repo root
    path.join(process.resourcesPath ?? '', 'assets', 'icon.png'),   // packaged
    path.join(__dirname, '..', '..', 'assets', 'icon.png'),         // alt dev layout
  ];
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return null;
}

app.whenReady().then(async () => {
  console.log('[main] App ready, platform:', process.platform);

  // Set the dock icon explicitly so it's our logo even in dev runs.
  // In a packaged .app, electron-builder uses assets/icon.icns from package.json
  // build config — this runtime call is for `npm start` development.
  if (process.platform === 'darwin') {
    const iconPath = resolveAppIcon();
    if (iconPath) {
      try {
        app.dock?.setIcon(nativeImage.createFromPath(iconPath));
      } catch (e: any) {
        console.warn('[main] Failed to set dock icon:', e.message);
      }
    }
    app.dock?.hide();
  }

  // ── Init store (local JSON file is created on first access) ───────────
  let settings: any;
  try {
    settings = focusStore.getSettings();
    console.log('[main] focusStore OK, onboarding:', settings.hasCompletedOnboarding);
  } catch (e: any) {
    console.error('[main] focusStore FAILED:', e.message);
    settings = { captureShortcut: 'CommandOrControl+Shift+C', gmailEnabled: false };
  }

  // ── IPC ───────────────────────────────────────────────────────────────
  setupIPC();
  console.log('[main] IPC handlers registered');

  // ── Windows ────────────────────────────────────────────────────────────
  windowManager.createFloatingWindow();
  windowManager.createFreezeWindows();
  windowManager.createTray();

  // ── Optional experimental tracking / strict mode ──────────────────────
  if (settings.experimentalFeatures?.activityClassifier || settings.experimentalFeatures?.strictMode) {
    appTracker.start();
  }

  // ── Global shortcuts ──────────────────────────────────────────────────
  // Timer toggle
  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    windowManager.sendToFloating('timer:toggle', undefined);
  });

  // Pill toggle
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    const win = windowManager.floatingWindow;
    if (win) win.isVisible() ? win.hide() : win.show();
  });

  // Notes window toggle (open the persistent desktop doc from anywhere)
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    windowManager.toggleNotesWindow();
  });

  // Cold-start: prompt for Accessibility permission so the OS dialog appears
  // on first launch. Without this, the auto-capture poll silently no-ops
  // forever and users have no idea why highlights aren't being saved.
  if (process.platform === 'darwin') {
    const granted = promptAccessibilityPermission();
    console.log(`[main] Accessibility permission granted: ${granted}`);
  }

  // Capture shortcut + auto-poll (registered by captureService)
  captureService.start(settings.captureShortcut, (capture) => {
    windowManager.sendToFloating('capture:new', capture);
    // Also forward to notes window if it's open
    windowManager.notesWindow?.webContents?.send('capture:new', capture);
  });

  // ── Folder watcher: scan course-materials folders and emit detection events ─
  folderWatcherService.start((payload) => {
    // Send to notes window (where the import handler runs). Floating HUD doesn't need it.
    windowManager.notesWindow?.webContents?.send('folder:fileDetected', payload);
  });

  // ── Resume Gmail polling if connected ─────────────────────────────────
  if (settings.gmailEnabled) {
    gmailService.startPolling((items) => {
      windowManager.sendToFloating('gmail:newEmails', items);
    });
    // Kick an immediate fetch so Critical Alerts are populated on app launch
    // instead of waiting for the next interval tick.
    gmailService.fetchNow()
      .then((items) => {
        console.log(`[main] Initial Gmail fetch: ${items.length} emails`);
        windowManager.sendToFloating('gmail:newEmails', items);
      })
      .catch((err) => console.error('[main] Initial Gmail fetch failed:', err.message));
  }

  // ── Multi-display support ─────────────────────────────────────────────
  screen.on('display-added',          () => windowManager.rebuildFreezeWindows());
  screen.on('display-removed',        () => windowManager.rebuildFreezeWindows());
  screen.on('display-metrics-changed',() => windowManager.rebuildFreezeWindows());

  app.on('activate', () => windowManager.floatingWindow?.show());
});

app.on('window-all-closed', () => { /* live in tray */ });

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  captureService.stop();
  gmailService.stopPolling();
  folderWatcherService.stop();
  windowManager.destroyAll();
});
