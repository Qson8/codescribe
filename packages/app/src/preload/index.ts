import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { UpdateCheckResult } from '../shared/update-types';
import type { LicenseStatus } from '../main/license';
import type { AiConfigState } from '../shared/ai-types';

interface ProgressEvent {
  jobId: string;
  jobKind: 'scan' | 'process' | 'export' | 'ai';
  workerCount: number;
  stage: 'discovering' | 'scanning' | 'cleaning' | 'selecting' | 'auditing' | 'rendering';
  completed: number;
  total: number;
  bytes?: number;
  message?: string;
}

const api = {
  platform: process.platform,
  win: (action: 'minimize' | 'maximize' | 'close') => ipcRenderer.send(`win:${action}`),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),
  pickOutDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickOutDir'),
  resolveDroppedPath: (file: File): Promise<{ path: string | null; error: string | null }> => {
    const inputPath = webUtils.getPathForFile(file);
    return ipcRenderer.invoke('path:validateDroppedDirectory', inputPath);
  },
  recentList: () => ipcRenderer.invoke('recent:list'),
  setRecentPinned: (root: string, pinned: boolean) => ipcRenderer.invoke('recent:setPinned', root, pinned),
  removeRecent: (root: string) => ipcRenderer.invoke('recent:remove', root),
  removeRecentMany: (roots: string[]) => ipcRenderer.invoke('recent:removeMany', roots),
  checkForUpdates: (force = false): Promise<UpdateCheckResult> => ipcRenderer.invoke('update:check', force),
  getScanExcludes: () => ipcRenderer.invoke('settings:scanExcludes:get'),
  saveScanExcludes: (rules: string[]) => ipcRenderer.invoke('settings:scanExcludes:save', rules),
  resetScanExcludes: () => ipcRenderer.invoke('settings:scanExcludes:reset'),
  getAiConfig: (): Promise<AiConfigState> => ipcRenderer.invoke('settings:ai:get'),
  saveAiConfig: (input: unknown): Promise<AiConfigState> => ipcRenderer.invoke('settings:ai:save', input),
  resetAiConfig: (): Promise<AiConfigState> => ipcRenderer.invoke('settings:ai:reset'),
  testAiConnection: (): Promise<{ ok: true; detail: string } | { ok: false; error: string }> => ipcRenderer.invoke('ai:testConnection'),
  aiGenerate: (payload: unknown, jobId: string): Promise<{ jobId: string; draft: string }> => ipcRenderer.invoke('ai:generate', { payload, jobId }),
  scan: (root: string, jobId: string, scanSessionId: string) => ipcRenderer.invoke('project:scan', { root, jobId, scanSessionId }),
  process: (payload: unknown, jobId: string) => ipcRenderer.invoke('project:process', { payload, jobId }),
  export: (payload: unknown, jobId: string) => ipcRenderer.invoke('project:export', { payload, jobId }),
  cancel: (jobId: string) => ipcRenderer.invoke('project:cancel', jobId),
  onProgress: (callback: (progress: ProgressEvent) => void) => {
    ipcRenderer.on('project:progress', (_event, progress: ProgressEvent) => callback(progress));
  },
  offProgress: () => ipcRenderer.removeAllListeners('project:progress'),
  saveConfig: (root: string, config: unknown) => ipcRenderer.invoke('project:saveConfig', root, config),
  revealProjectFile: (root: string, relPath: string): Promise<void> => ipcRenderer.invoke('project:revealFile', root, relPath),
  revealLatestExport: (): Promise<void> => ipcRenderer.invoke('project:revealLatestExport'),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url),
  licenseStatus: (): Promise<LicenseStatus> => ipcRenderer.invoke('license:status'),
  licenseActivate: (code: string): Promise<{ ok: true; status: LicenseStatus } | { ok: false; error: string }> => ipcRenderer.invoke('license:activate', code),
  licenseDeactivate: (): Promise<LicenseStatus> => ipcRenderer.invoke('license:deactivate'),
};

contextBridge.exposeInMainWorld('cs', api);

export type CsApi = typeof api;
