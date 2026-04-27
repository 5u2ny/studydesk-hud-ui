import { contextBridge, ipcRenderer } from 'electron';

const INVOKE_CHANNELS = new Set([
  'notes:list',
  'notes:get',
  'notes:create',
  'notes:update',
  'notes:delete',
  'course:list',
  'assignment:list',
  'assignment:create',
  'assignment:parse',
  'deadline:list',
  'deadline:create',
  'syllabus:parse',
  'syllabus:confirmImport',
  'class:start',
  'class:end',
  'study:list',
  'study:create',
  'study:review',
  'confusion:list',
  'confusion:create',
  'attentionAlerts:list',
  'attentionAlerts:dismiss',
  'attentionAlerts:snooze',
  'attentionAlerts:resolve',
  'capture:list',
]);

const SUBSCRIBE_CHANNELS = new Set([
  'notes:openNote',
  'capture:new',
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
