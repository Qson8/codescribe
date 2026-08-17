import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DocumentType } from '@codescribe/core';

/**
 * 激活码引擎（最小防御）。
 *
 * 激活码格式：CS-<payload>-<sig>
 *  - payload：base64url(JSON { lic, exp, feat })
 *  - sig：base64url(HMAC-SHA256(payload, 密钥))
 *
 * 目标：阻止「随便改字符串就能解锁」。不承诺防专业逆向，
 * 正式上线后可替换为公钥签名或在线校验。
 */

// 密钥：与主仓库分离维护；泄露后可通过版本更新轮换。
const LICENCE_SECRET = Buffer.from('codescribe-pro-2026-activation-secret', 'utf8');

export const LICENSE_FILE = 'license.json';

export interface LicensePayload {
  /** 被许可人标识 */
  lic: string;
  /** 到期日 YYYY-MM-DD；空串表示永久 */
  exp: string;
  /** 授权功能位 */
  feat: string[];
}

export interface LicenseRecord {
  code: string;
  activatedAt: string;
  payload: LicensePayload;
}

export type LicenseStatus =
  | { state: 'none' }
  | { state: 'active'; licensee: string; expiresAt: string | null; features: string[] }
  | { state: 'expired'; message: string };

const PRO_FEATURE = 'pro';

// 许可证文件路径；测试可通过 setLicenseFile 注入
let customLicensePath: string | null = null;

export function setLicenseFile(filePath: string): void {
  customLicensePath = filePath;
}

function licenseFile(): string {
  if (customLicensePath) return customLicensePath;
  // electron 仅在运行时可用；测试环境走 setLicenseFile 注入
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { app } = require('electron') as typeof import('electron');
  return path.join(app.getPath('userData'), LICENSE_FILE);
}

function b64urlEncode(value: Buffer): string {
  return value.toString('base64url');
}

function b64urlDecode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function sign(payload: string): string {
  return b64urlEncode(crypto.createHmac('sha256', LICENCE_SECRET).update(payload).digest());
}

function verifySignature(payload: string, sig: string): boolean {
  try {
    const expected = sign(payload);
    const actual = b64urlDecode(sig).toString('base64url');
    return expected === actual;
  } catch {
    return false;
  }
}

/** 从激活码解析出 payload（不含签名校验）；格式 CS.<payload>.<sig>，用 . 分隔避免与 base64url 的 - 冲突 */
function parseCode(code: string): { payload: string; sig: string } | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith('CS.')) return null;
  const parts = trimmed.slice(3).split('.');
  if (parts.length !== 2) return null;
  return { payload: parts[0], sig: parts[1] };
}

export function decodePayload(payloadB64: string): LicensePayload | null {
  try {
    const parsed: unknown = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const record = parsed as Partial<LicensePayload>;
    if (typeof record.lic !== 'string' || typeof record.exp !== 'string') return null;
    if (!Array.isArray(record.feat) || !record.feat.every((f) => typeof f === 'string')) return null;
    return { lic: record.lic, exp: record.exp, feat: record.feat };
  } catch {
    return null;
  }
}

/** 校验激活码并解析出 payload；无效返回 null */
export function validateCode(code: string): LicensePayload | null {
  const parsed = parseCode(code);
  if (!parsed) return null;
  if (!verifySignature(parsed.payload, parsed.sig)) return null;
  return decodePayload(parsed.payload);
}

function isExpired(payload: LicensePayload, now = new Date()): boolean {
  if (!payload.exp) return false;
  const expiry = new Date(`${payload.exp}T00:00:00`);
  return Number.isNaN(expiry.getTime()) ? false : expiry.getTime() < now.getTime();
}

export function statusOf(record: LicenseRecord | null, now = new Date()): LicenseStatus {
  if (!record) return { state: 'none' };
  if (isExpired(record.payload, now)) {
    return { state: 'expired', message: `许可证已于 ${record.payload.exp} 到期` };
  }
  return {
    state: 'active',
    licensee: record.payload.lic,
    expiresAt: record.payload.exp || null,
    features: record.payload.feat,
  };
}

export function loadLicense(): LicenseRecord | null {
  try {
    const raw = JSON.parse(fs.readFileSync(licenseFile(), 'utf8')) as Partial<LicenseRecord>;
    if (typeof raw.code !== 'string') return null;
    const payload = validateCode(raw.code);
    if (!payload) return null;
    return { code: raw.code, activatedAt: typeof raw.activatedAt === 'string' ? raw.activatedAt : new Date().toISOString(), payload };
  } catch {
    return null;
  }
}

export function getLicenseStatus(): LicenseStatus {
  return statusOf(loadLicense());
}

export function activate(code: string): { ok: true; status: LicenseStatus } | { ok: false; error: string } {
  const payload = validateCode(code);
  if (!payload) return { ok: false, error: '激活码无效或签名不匹配' };
  const record: LicenseRecord = {
    code: code.trim(),
    activatedAt: new Date().toISOString(),
    payload,
  };
  try {
    fs.mkdirSync(path.dirname(licenseFile()), { recursive: true });
    fs.writeFileSync(licenseFile(), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  } catch (error) {
    return { ok: false, error: `写入许可证失败：${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: true, status: statusOf(record) };
}

export function deactivate(): void {
  try {
    fs.rmSync(licenseFile(), { force: true });
  } catch {
    /* 删除失败不阻断 */
  }
}

/** Pro 门控：是否为某文档类型解锁。免费版仅 source-program。 */
export function isProDocType(docType: DocumentType, status: LicenseStatus): boolean {
  if (docType === 'source-program') return true;
  return status.state === 'active' && status.features.includes(PRO_FEATURE);
}

/** 给管理员生成激活码（内部工具） */
export function issueCode(licensee: string, expiresAt: string, features = [PRO_FEATURE]): string {
  const payload: LicensePayload = { lic: licensee, exp: expiresAt, feat: features };
  const payloadB64 = b64urlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  return `CS.${payloadB64}.${sign(payloadB64)}`;
}