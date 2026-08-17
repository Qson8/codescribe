import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));

const tsxBin = path.join(import.meta.dirname, '..', '..', '..', 'node_modules', '.bin', 'tsx');
const cliEntry = path.join(import.meta.dirname, '..', 'src', 'cli.ts');

function runCli(args: string[], input?: string): { stdout: string; stderr: string } {
  const stdout = execFileSync(tsxBin, [cliEntry, ...args], { input: input ?? '', encoding: 'utf8' });
  return { stdout, stderr: '' };
}

// 1. 文件模式：脱敏 + 删注释 + 删空行
const sample = path.join(workspace, 'app.ts');
fs.writeFileSync(sample, [
  '// 敏感配置',
  "const key = 'sk-abcdef1234567890';",
  '',
  'export function ping(secret = "") {',
  '  return `token=${secret}`;',
  '}',
  '',
].join('\n'), 'utf8');

const out1 = runCli(['scrub', sample]);
assert.ok(!out1.stdout.includes('sk-abcdef'), '平台密钥应被脱敏');
assert.ok(!out1.stdout.includes('// 敏感配置'), '注释应被删除');
assert.ok(out1.stdout.includes('export function ping'), '代码应保留');
assert.ok(out1.stdout.includes('****'), '应包含脱敏掩码');

// 2. 字符串内 // 不被误删
const sample2 = path.join(workspace, 'url.ts');
fs.writeFileSync(sample2, [
  "const url = 'https://example.com/api';",
  'const path2 = "/api/v1"; // 真实注释',
  'console.log(url);',
].join('\n'), 'utf8');
const out2 = runCli(['scrub', sample2]);
assert.ok(out2.stdout.includes('https://'), '字符串内 // 不应被删除');
assert.ok(out2.stdout.includes('"/api/v1"'), '字符串内斜杠不应被删除');
assert.ok(!out2.stdout.includes('真实注释'), '行尾真实注释应删除');

// 3. --keep-comments 保留注释
const out3 = runCli(['scrub', sample, '--keep-comments']);
assert.ok(out3.stdout.includes('// 敏感配置'), '保留注释选项应生效');

// 4. 文件外扩名自动推断
const sample4 = path.join(workspace, 'app.py');
fs.writeFileSync(sample4, [
  "# 注释",
  "password = 'abc12345'",
  '',
].join('\n'), 'utf8');
const out4 = runCli(['scrub', sample4]);
assert.ok(!out4.stdout.includes('# 注释'), 'Python 注释应删除');

// 5. stdin 管道
const out5 = runCli(['scrub'], "const t = 'ghp_abcdefgh12345678'; // 注释\n");
assert.ok(!out5.stdout.includes('ghp_abcdefgh'), 'stdin 输入应脱敏');
assert.ok(!out5.stdout.includes('注释'), 'stdin 输入应删注释');

console.log('✅ cli scrub 全部通过');