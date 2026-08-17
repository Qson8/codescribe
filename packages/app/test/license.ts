import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  activate, deactivate, getLicenseStatus, isProDocType, issueCode, loadLicense,
  setLicenseFile, validateCode, statusOf, type LicenseRecord, type LicenseStatus,
} from '../src/main/license';

// 注入独立文件路径，避免触碰真实 userData
const licensePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'license-')), 'license.json');
setLicenseFile(licensePath);

// 1. 无许可证状态
assert.deepEqual(getLicenseStatus(), { state: 'none' });

// 2. 签发 + 校验往返
const code = issueCode('测试用户', '2030-12-31');
assert.ok(code.startsWith('CS.'), '激活码应带 CS. 前缀');
const decoded = validateCode(code);
assert.ok(decoded, '有效码应通过校验');
assert.equal(decoded!.lic, '测试用户');
assert.equal(decoded!.exp, '2030-12-31');
assert.deepEqual(decoded!.feat, ['pro']);

// 3. 篡改 payload 后签名校验失败
const [_, payload, sig] = code.split('.');
const tamperedPayload = Buffer.from(JSON.stringify({ lic: '攻击者', exp: '2030-12-31', feat: ['pro'] })).toString('base64url');
assert.equal(validateCode(`CS.${tamperedPayload}.${sig}`), null, '篡改后应校验失败');

// 4. 随机字符串 / 畸形码
assert.equal(validateCode('hello'), null);
assert.equal(validateCode('CS.abc'), null);
assert.equal(validateCode('CS.aa.bb.cc'), null);

// 5. 激活持久化
const act = activate(code);
assert.equal(act.ok, true);
const loaded = loadLicense();
assert.ok(loaded, '激活后应可读回');
assert.equal(loaded!.payload.lic, '测试用户');

// 6. 到期码状态
const expiredCode = issueCode('过期用户', '2020-01-01');
const expiredRecord: LicenseRecord = { code: expiredCode, activatedAt: '', payload: validateCode(expiredCode)! };
const expiredStatus = statusOf(expiredRecord, new Date('2026-01-01'));
assert.equal(expiredStatus.state, 'expired');

// 7. 永久码不过期
const foreverCode = issueCode('永久用户', '');
const foreverRecord: LicenseRecord = { code: foreverCode, activatedAt: '', payload: validateCode(foreverCode)! };
assert.equal(statusOf(foreverRecord, new Date('2100-01-01')).state, 'active');

// 8. 门控规则
const activeStatus: LicenseStatus = { state: 'active', licensee: '测试用户', expiresAt: '2030-12-31', features: ['pro'] };
const noneStatus: LicenseStatus = { state: 'none' };
assert.equal(isProDocType('source-program', noneStatus), true, '免费版应可导出源程序');
assert.equal(isProDocType('user-manual', noneStatus), false, '免费版应锁定用户手册');
assert.equal(isProDocType('design-spec', noneStatus), false);
assert.equal(isProDocType('application-form', noneStatus), false);
assert.equal(isProDocType('user-manual', activeStatus), true, 'Pro 应解锁全家桶');

// 9. 失效（清除文件）
deactivate();
assert.equal(getLicenseStatus().state, 'none');

console.log('✅ license 全部通过');