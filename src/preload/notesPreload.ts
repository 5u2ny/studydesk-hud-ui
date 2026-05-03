import { contextBridge, ipcRenderer } from 'electron';

const INVOKE_CHANNELS = new Set([
  'notes:list',
  'notes:get',
  'notes:create',
  'notes:update',
  'notes:delete',
  'course:list',
  'course:create',
  'assignment:list',
  'assignment:create',
  'assignment:update',
  'assignment:parse',
  'assignment:markSubmitted',
  'deadline:list',
  'deadline:create',
  'deadline:update',
  'deadline:complete',
  'syllabus:parse',
  'syllabus:confirmImport',
  'class:start',
  'class:update',
  'class:end',
  'class:list',
  'study:list',
  'study:create',
  'study:update',
  'study:review',
  'study:delete',
  // Flashcard sync (StudyMD-style note → cards)
  'study:syncNote',
  'study:syncAllNotes',
  'study:cardsFromNote',
  'study:syncCapture',
  'confusion:list',
  'confusion:create',
  'confusion:update',
  'confusion:resolve',
  'attentionAlerts:list',
  'attentionAlerts:dismiss',
  'attentionAlerts:snooze',
  'attentionAlerts:resolve',
  'capture:list',
  // Course materials folder watcher
  'course:pickMaterialsFolder',
  'course:clearMaterialsFolder',
  'folder:readFile',
  'folder:recordImport',
  'folder:rescan',
]);

const SUBSCRIBE_CHANNELS = new Set([
  'notes:openNote',
  'capture:new',
  'folder:fileDetected',
]);

function invokeAllowed(channel: string, req?: unknown) {
  if (!INVOKE_CHANNELS.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`);
  return ipcRenderer.invoke(channel, req);
}

function onAllowed(channel: string, cb: (data: unknown) => void) {
  if (!SUBSCRIBE_CHANNELS.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`);
  ipcRenderer.on(channel, (_e, data) => cb(data));
}

function offAllowed(channel: string) {
  if (!SUBSCRIBE_CHANNELS.has(channel)) throw new Error(`IPC channel not allowed: ${channel}`);
  ipcRenderer.removeAllListeners(channel);
}

contextBridge.exposeInMainWorld('electron', {
  invoke: invokeAllowed,
  on: onAllowed,
  off: offAllowed,
});
