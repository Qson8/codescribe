import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renderDocx, registerDocxBuilder, buildUserManual } from '../src/index.ts';
import type { Page } from '../src/types.ts';

const pages: Page[] = [{ no: 1, lines: ['function hello() {', '  return 1;', '}'], startFile: 'a.ts', endFile: 'a.ts' }];
const opts = { title: '注册表测试V1.0', fontName: 'SimSun', fontSizePt: 10.5, outDir: fs.mkdtempSync(path.join(os.tmpdir(), 'registry-')) };

// 1. 默认 source-program 分发：走内置 builder，生成有效 docx
const defaultPath = await renderDocx(pages, opts);
assert.equal(defaultPath, path.join(opts.outDir, '源程序_注册表测试V1.0.docx'));
const defaultBytes = fs.readFileSync(defaultPath);
assert.equal(defaultBytes.subarray(0, 2).toString('ascii'), 'PK');

// 2. 显式传 source-program：与默认输出一致（同一 builder）
const explicitPath = await renderDocx(pages, opts, 'source-program');
assert.equal(explicitPath, defaultPath);

// 3. 真实注册的 user-manual builder：按类型分发，不走源程序
const manualDir = path.join(opts.outDir, 'manual');
const manualPath = await renderDocx(pages, { ...opts, outDir: manualDir, docType: 'user-manual', metadata: { softwareName: '注册表测试', version: 'V1.0' } });
assert.ok(manualPath.endsWith('.docx'));
assert.notEqual(manualPath, defaultPath);
assert.ok(fs.statSync(manualPath).size > 5_000);

// 4. 未注册类型（application-form）回退源程序
const fallbackPath = await renderDocx(pages, opts, 'application-form');
assert.equal(fallbackPath, defaultPath);

// 5. 注册自定义 builder 后按类型分发
const marker = path.join(opts.outDir, 'marker.txt');
registerDocxBuilder('design-spec', async (_p, o) => {
  fs.writeFileSync(marker, 'custom');
  return path.join(o.outDir, 'custom.docx');
});
const customPath = await renderDocx(pages, opts, 'design-spec');
assert.equal(customPath, path.join(opts.outDir, 'custom.docx'));
assert.equal(fs.readFileSync(marker, 'utf8'), 'custom');

// 6. 覆盖注册
registerDocxBuilder('design-spec', async (_p, o) => path.join(o.outDir, 'overwritten.docx'));
assert.equal(await renderDocx(pages, opts, 'design-spec'), path.join(opts.outDir, 'overwritten.docx'));

console.log('✅ render-registry 全部通过');