import type { IPCChannel } from './ipc-contracts';

export const ipc = {
  invoke<T = unknown>(channel: IPCChannel, req?: unknown): Promise<T> {
    return window.electron.invoke(channel, req);
  },
  on(channel: string, cb: (data: any) => void): void {
    window.electron.on(channel, cb);
  },
  off(channel: string): void {
    window.electron.off(channel);
  },
};
