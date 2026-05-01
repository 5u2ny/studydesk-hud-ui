import { ipcMain, screen } from 'electron';
import { IPC } from '../renderer/shared/types';
import type { AppSettings } from '../renderer/shared/types';
import { stateStore } from './stateStore';
import { TimerEngine } from './timerEngine';
import { freezeController } from './freezeController';
import { windowManager } from './windowManager';
import { showPhaseNotification } from './notificationManager';
import { playAlertSound } from './soundManager';
// ── Focus OS services ───────────────────────────────────────────────────────
import { focusStore } from './services/store';
import { secureStore } from './services/keychain/secureStore';
import { checkAccessibilityPermission, openAccessibilitySettings } from './services/capture/permissionCheck';
import { notesService } from './services/notes/notesService';
import { todoService } from './services/todo/todoService';
import { gmailService } from './services/gmail/gmailService';
import { coursesService } from './services/courses/coursesService';
import { assignmentService } from './services/assignments/assignmentService';
import { deadlineService } from './services/deadlines/deadlineService';
import { syllabusParserService } from './services/syllabus/syllabusParserService';
import { classSessionService } from './services/classes/classSessionService';
import { studyService } from './services/study/studyService';
import { confusionService } from './services/study/confusionService';
import { criticalEmailService } from './services/gmail/criticalEmailService';
import { todayService } from './services/today/todayService';
import { attentionAlertService } from './services/attention/attentionAlertService';
import { randomUUID } from 'node:crypto';

let timerEngine: TimerEngine;

export function setupIPC() {
  timerEngine = new TimerEngine(stateStore.getSnapshot().settings);

  // ── Timer engine events → renderer ────────────────────────────────────
  timerEngine.on('tick', (data) => {
    stateStore.updateSilent({
      remainingSeconds: data.remainingSeconds,
      phase: data.phase,
      isRunning: data.isRunning,
    });
    windowManager.sendToFloating(IPC.TIMER_TICK, data);
    try {
      windowManager.updateTrayProgress(data.remainingSeconds, timerEngine.totalSeconds, data.phase);
    } catch { /* ignore */ }
  });

  timerEngine.on('stateChanged', () => {
    stateStore.update({
      remainingSeconds: timerEngine.remainingSeconds,
      totalSeconds:     timerEngine.totalSeconds,
      phase:            timerEngine.phase,
      isRunning:        timerEngine.isRunning,
      cycleCount:       timerEngine.cycleCount,
    });
  });

  timerEngine.on('phaseComplete', ({ newPhase }) => {
    const settings = stateStore.getSnapshot().settings;
    try { showPhaseNotification(newPhase, settings); } catch { /* ignore */ }
    try { playAlertSound(settings); }               catch { /* ignore */ }

    if (newPhase === 'break' || newPhase === 'longBreak') {
      if (settings.freezeDuration > 0) {
        const dur = Math.floor(newPhase === 'break' ? settings.breakDuration : settings.longBreakDuration);
        timerEngine.start();
        freezeController.enter(newPhase, dur, () => {
          timerEngine.resetToPhase('focus');
          if (settings.autoStartFocus) timerEngine.start();
        });
      } else if (settings.autoStartBreaks) {
        timerEngine.start();
      }
    } else if (newPhase === 'focus' && settings.autoStartFocus) {
      timerEngine.start();
    }
  });

  stateStore.on('changed', (state) => {
    windowManager.sendToAll(IPC.STATE_UPDATED, state);
  });

  // ── Core timer IPC ────────────────────────────────────────────────────
  ipcMain.handle(IPC.TIMER_START,      () => timerEngine.start());
  ipcMain.handle(IPC.TIMER_PAUSE,      () => timerEngine.pause());
  ipcMain.handle(IPC.TIMER_RESET,      () => {
    timerEngine.reset();
    stateStore.update({ remainingSeconds: timerEngine.remainingSeconds, isRunning: false });
  });
  ipcMain.handle(IPC.TIMER_SKIP_PHASE, () => timerEngine.skipPhase());
  ipcMain.handle(IPC.TASK_SET, (_e, task: string) => stateStore.update({ currentTask: task }));
  ipcMain.handle(IPC.SETTINGS_GET, () => stateStore.getSnapshot().settings);
  ipcMain.handle(IPC.SETTINGS_SET, (_e, s: AppSettings) => {
    stateStore.saveSettings(s);
    stateStore.update({ settings: s });
    timerEngine.updateSettings(s);
  });
  ipcMain.handle(IPC.STATE_GET,    () => stateStore.getSnapshot());
  ipcMain.handle(IPC.WINDOW_RESIZE, (_e, h: number, w?: number, isIsland?: boolean) => {
    windowManager.resizeFloating(Math.round(h), w ? Math.round(w) : undefined, isIsland);
  });

  // Returns the menu-bar / hardware-notch inset for the primary display,
  // using the same floor (24) as windowManager so every layer agrees.
  ipcMain.handle('window:getNotchHeight', () => {
    const display = screen.getPrimaryDisplay();
    return Math.max(display.workArea.y - display.bounds.y, 24);
  });

  // Timer toggle push event from renderer shortcut
  ipcMain.handle('timer:toggle', () => {
    if (timerEngine.isRunning) timerEngine.pause(); else timerEngine.start();
  });

  // ── Focus OS: Captures ────────────────────────────────────────────────
  ipcMain.handle('capture:list', (_e, req: { limit?: number; category?: string }) => {
    let items = focusStore.get('captures');
    if (req?.category) items = items.filter(c => c.category === req.category);
    if (req?.limit)    items = items.slice(0, req.limit);
    return items;
  });

  ipcMain.handle('capture:save', (_e, req: { text: string; source: 'highlight' | 'manual' }) => {
    const capture = {
      id: randomUUID(), text: req.text, source: req.source,
      createdAt: Date.now(), pinned: false,
    };
    focusStore.addCapture(capture);
    return capture;
  });

  ipcMain.handle('capture:delete', (_e, req: { id: string }) => {
    focusStore.set('captures', focusStore.get('captures').filter(c => c.id !== req.id));
  });

  ipcMain.handle('capture:pin', (_e, req: { id: string; pinned: boolean }) => {
    focusStore.updateCapture(req.id, { pinned: req.pinned });
    return focusStore.get('captures').find(c => c.id === req.id)!;
  });

  ipcMain.handle('capture:update', (_e, req) => {
    focusStore.updateCapture(req.id, req.patch);
    return focusStore.get('captures').find(c => c.id === req.id)!;
  });

  // ── Focus OS: Notes ───────────────────────────────────────────────────
  ipcMain.handle('notes:list',   ()              => notesService.list());
  ipcMain.handle('notes:get',    (_e, r)         => notesService.get(r.id));
  ipcMain.handle('notes:create', (_e, r)         => notesService.create(r));
  ipcMain.handle('notes:update', (_e, r)         => notesService.update(r.id, r.patch));
  ipcMain.handle('notes:delete', (_e, r)         => notesService.delete(r.id));

  // ── Focus OS: Todos ───────────────────────────────────────────────────
  ipcMain.handle('todo:list',      ()     => todoService.list());
  ipcMain.handle('todo:create',    (_e, r) => todoService.create(r));
  ipcMain.handle('todo:update',    (_e, r) => todoService.update(r.id, r.patch));
  ipcMain.handle('todo:setActive', (_e, r) => todoService.setActive(r.id));
  ipcMain.handle('todo:delete',    (_e, r) => todoService.delete(r.id));

  // ── Focus OS Student: Courses ─────────────────────────────────────────
  ipcMain.handle('course:list', (_e, r) => coursesService.list(r));
  ipcMain.handle('course:create', (_e, r) => coursesService.create(r));
  ipcMain.handle('course:update', (_e, r) => coursesService.update(r.id, r.patch));
  ipcMain.handle('course:archive', (_e, r) => coursesService.archive(r.id));
  ipcMain.handle('course:get', (_e, r) => coursesService.get(r.id));

  // ── Focus OS Student: Assignments ─────────────────────────────────────
  ipcMain.handle('assignment:list', (_e, r) => assignmentService.list(r));
  ipcMain.handle('assignment:create', (_e, r) => assignmentService.create(r));
  ipcMain.handle('assignment:update', (_e, r) => assignmentService.update(r.id, r.patch));
  ipcMain.handle('assignment:delete', (_e, r) => assignmentService.delete(r.id));
  ipcMain.handle('assignment:parse', (_e, r) => assignmentService.parse(r));
  ipcMain.handle('assignment:markSubmitted', (_e, r) => assignmentService.markSubmitted(r.id));

  // ── Focus OS Student: Deadlines ───────────────────────────────────────
  ipcMain.handle('deadline:list', (_e, r) => deadlineService.list(r));
  ipcMain.handle('deadline:create', (_e, r) => deadlineService.create(r));
  ipcMain.handle('deadline:update', (_e, r) => deadlineService.update(r.id, r.patch));
  ipcMain.handle('deadline:delete', (_e, r) => deadlineService.delete(r.id));
  ipcMain.handle('deadline:complete', (_e, r) => deadlineService.complete(r.id));

  // ── Focus OS Student: Syllabus ────────────────────────────────────────
  ipcMain.handle('syllabus:parse', (_e, r) => syllabusParserService.parse(r));
  ipcMain.handle('syllabus:confirmImport', (_e, r) => {
    let courseId = r.courseId;
    if (!courseId && r.course?.name) {
      courseId = coursesService.create(r.course).id;
    }
    const deadlines = (r.deadlines ?? [])
      .filter((d: any) => d.confirmed !== false)
      .map((d: any) => deadlineService.create({ ...d, courseId: d.courseId ?? courseId, sourceType: 'syllabus' }));
    return { courseId, deadlines };
  });

  // ── Focus OS Student: Class Mode ──────────────────────────────────────
  ipcMain.handle('class:start', (_e, r) => classSessionService.start(r));
  ipcMain.handle('class:update', (_e, r) => classSessionService.update(r.id, r.patch));
  ipcMain.handle('class:end', (_e, r) => classSessionService.end(r.id, r.patch));
  ipcMain.handle('class:list', (_e, r) => classSessionService.list(r));
  ipcMain.handle('class:get', (_e, r) => classSessionService.get(r.id));

  // ── Focus OS Student: Study ───────────────────────────────────────────
  ipcMain.handle('study:list', (_e, r) => studyService.list(r));
  ipcMain.handle('study:create', (_e, r) => studyService.create(r));
  ipcMain.handle('study:update', (_e, r) => studyService.update(r.id, r.patch));
  ipcMain.handle('study:review', (_e, r) => studyService.review(r.id, r.difficulty));
  ipcMain.handle('study:delete', (_e, r) => studyService.delete(r.id));

  // ── Focus OS Student: Confusions ──────────────────────────────────────
  ipcMain.handle('confusion:list', (_e, r) => confusionService.list(r));
  ipcMain.handle('confusion:create', (_e, r) => confusionService.create(r));
  ipcMain.handle('confusion:update', (_e, r) => confusionService.update(r.id, r.patch));
  ipcMain.handle('confusion:resolve', (_e, r) => confusionService.resolve(r.id));

  // ── Focus OS Student: Critical Alerts ─────────────────────────────────
  ipcMain.handle('criticalAlerts:list', (_e, r) => criticalEmailService.list(r));
  ipcMain.handle('criticalAlerts:snooze', (_e, r) => criticalEmailService.snooze(r.id, r.snoozedUntil));
  ipcMain.handle('criticalAlerts:dismiss', (_e, r) => criticalEmailService.dismiss(r.id));
  ipcMain.handle('criticalAlerts:resolve', (_e, r) => criticalEmailService.resolve(r.id));
  ipcMain.handle('criticalAlerts:convertToTask', (_e, r) => criticalEmailService.convertToTask(r.id));

  // ── StudyDesk: Local Attention Alerts ─────────────────────────────────
  ipcMain.handle('attentionAlerts:list', (_e, r) => {
    attentionAlertService.refreshGenerated();
    return attentionAlertService.list(r);
  });
  ipcMain.handle('attentionAlerts:snooze', (_e, r) => attentionAlertService.snooze(r.id, r.snoozedUntil));
  ipcMain.handle('attentionAlerts:dismiss', (_e, r) => attentionAlertService.dismiss(r.id));
  ipcMain.handle('attentionAlerts:resolve', (_e, r) => attentionAlertService.resolve(r.id));

  // ── Focus OS Student: Today ───────────────────────────────────────────
  ipcMain.handle('today:get', () => todayService.get());

  // ── Focus OS: Gmail ───────────────────────────────────────────────────
  ipcMain.handle('gmail:connect', async (_e, r: { email: string; appPassword: string }) => {
    const result = await gmailService.connect(r.email, r.appPassword);
    if (result.ok) {
      gmailService.startPolling((items) => windowManager.sendToFloating('gmail:newEmails', items));
      gmailService.fetchNow()
        .then((items) => windowManager.sendToFloating('gmail:newEmails', items))
        .catch((err) => console.error('[gmailService] Initial fetch failed:', err));
    }
    return result;
  });
  // OAuth2 path — works for Workspace accounts where App Passwords are blocked
  ipcMain.handle('gmail:oauthConnect', async (_e, r: { clientId: string; clientSecret: string }) => {
    const result = await gmailService.oauthConnect(r.clientId, r.clientSecret);
    if (result.ok) {
      gmailService.startPolling((items) => windowManager.sendToFloating('gmail:newEmails', items));
      // Kick an immediate fetch so the user sees their inbox right away
      // instead of waiting for the next 15-min poll tick.
      gmailService.fetchNow()
        .then((items) => windowManager.sendToFloating('gmail:newEmails', items))
        .catch((err) => console.error('[gmailService] Initial fetch failed:', err));
    }
    return result;
  });
  ipcMain.handle('gmail:disconnect', () => {
    gmailService.disconnect();
    return { ok: true };
  });
  ipcMain.handle('gmail:hasShippedOAuth', () => gmailService.hasShippedOAuth());
  // Wipe stored Client ID + Secret so a fresh paste isn't fighting stale values
  ipcMain.handle('gmail:resetOAuthCredentials', () => {
    focusStore.updateSettings({
      gmailEnabled: false,
      gmailEmail: undefined,
      gmailOauthClientId: undefined,
      gmailOauthClientSecretEncrypted: undefined,
      gmailOauthRefreshTokenEncrypted: undefined,
      gmailOauthAccessTokenEncrypted: undefined,
      gmailOauthAccessTokenExpiresAt: undefined,
    });
    return { ok: true };
  });
  ipcMain.handle('gmail:fetchNow', async () => {
    const items = await gmailService.fetchNow();
    windowManager.sendToFloating('gmail:newEmails', items);
    return items;
  });
  ipcMain.handle('gmail:list',    ()      => gmailService.list());
  ipcMain.handle('gmail:archive', (_e, r) => gmailService.archive(r.id));

  // ── Focus OS: Settings ────────────────────────────────────────────────
  ipcMain.handle('focus:settings:get',    () => focusStore.getSettings());
  ipcMain.handle('focus:settings:update', (_e, r) => focusStore.updateSettings(r));
  ipcMain.handle('focus:settings:setLLMKey', (_e, r: { provider: 'anthropic' | 'openai'; key: string; model: string }) => {
    const encrypted = secureStore.encrypt(r.key);
    focusStore.updateSettings({
      llmProvider:          r.provider,
      llmApiKeyEncrypted:   encrypted,
      llmModel:             r.model,
    });
  });

  // ── Focus OS: Categories ──────────────────────────────────────────────
  ipcMain.handle('category:list',   ()      => focusStore.get('categories'));
  ipcMain.handle('category:create', (_e, r) => {
    const cat = { id: randomUUID(), name: r.name, description: r.description, color: r.color, createdAt: Date.now() };
    focusStore.set('categories', [...focusStore.get('categories'), cat]);
    return cat;
  });
  ipcMain.handle('category:delete', (_e, r) => {
    focusStore.set('categories', focusStore.get('categories').filter(c => c.id !== r.id));
  });

  // ── Focus OS: Permissions ─────────────────────────────────────────────
  ipcMain.handle('permission:checkAccessibility',    () => checkAccessibilityPermission());
  ipcMain.handle('permission:openAccessibilitySettings', () => openAccessibilitySettings());
  ipcMain.handle('system:safeStorageAvailable',       () => secureStore.isAvailable());

  // ── Focus OS: Window control ──────────────────────────────────────────
  ipcMain.handle('window:openNotes', (_e, r: { noteId?: string }) => {
    windowManager.openNotesWindow(r?.noteId);
  });
  ipcMain.handle('window:openWorkspace', (_e, r: { noteId?: string }) => {
    windowManager.openNotesWindow(r?.noteId);
  });
  ipcMain.handle('window:toggleSidebar', () => {
    return windowManager.toggleSidebar();
  });
  ipcMain.handle('window:openSettings', () => {
    windowManager.sendToFloating('ui:openSettings', undefined);
  });

}

export function toggleTimer() {
  if (timerEngine.isRunning) timerEngine.pause(); else timerEngine.start();
}
export function isTimerRunning() { return timerEngine?.isRunning || false; }
export function pauseTimer()  { if (timerEngine?.isRunning)  timerEngine.pause(); }
export function resumeTimer() { if (!timerEngine?.isRunning) timerEngine.start(); }
