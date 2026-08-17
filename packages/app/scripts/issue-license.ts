import { issueCode, validateCode } from '../src/main/license';

/**
 * 签发激活码（卖方侧内部工具）。
 *
 * 用法：
 *   npm run issue-code -w @codescribe/app -- "张三" 2027-12-31
 *   npm run issue-code -w @codescribe/app -- "李四"        # 永久（不传日期）
 *
 * 输出：激活码 + 自校验结果。仅管理员/运营持有密钥时使用。
 */

const [, , licensee, expiry] = process.argv;

if (!licensee) {
  console.error('用法：npm run issue-code -w @codescribe/app -- "<被许可人>" [到期日 YYYY-MM-DD]');
  console.error('示例：npm run issue-code -w @codescribe/app -- "张三" 2027-12-31  （永久则省略日期）');
  process.exit(1);
}

if (expiry !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
  console.error('到期日格式错误，应为 YYYY-MM-DD（如 2027-12-31），或省略表示永久');
  process.exit(1);
}

const code = issueCode(licensee, expiry ?? '');
const decoded = validateCode(code);

if (!decoded) {
  console.error('签发后自校验失败，请检查 license.ts 密钥或实现');
  process.exit(1);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('激活码：');
console.log(code);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`被许可人：${decoded.lic}`);
console.log(`到期日：  ${decoded.exp || '永久'}`);
console.log(`功能位：  ${decoded.feat.join(', ')}`);
console.log('自校验：  通过 ✓');