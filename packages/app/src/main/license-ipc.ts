import { ipcMain } from 'electron';
import {
  activate as activateLicense, deactivate as deactivateLicense, getLicenseStatus,
} from './license';

export function registerLicenseIpc(): void {
  ipcMain.handle('license:status', () => getLicenseStatus());
  ipcMain.handle('license:activate', (_event, code: unknown) => {
    if (typeof code !== 'string') return { ok: false as const, error: '激活码格式无效' };
    return activateLicense(code);
  });
  ipcMain.handle('license:deactivate', () => {
    deactivateLicense();
    return getLicenseStatus();
  });
}