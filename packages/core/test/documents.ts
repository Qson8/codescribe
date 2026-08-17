import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renderDocx } from '../src/index.ts';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'documents-test-'));

// 1. 设计说明书
const specProject = path.join(workspace, 'app');
fs.mkdirSync(path.join(specProject, 'src'), { recursive: true });
fs.mkdirSync(path.join(specProject, 'config'), { recursive: true });
fs.writeFileSync(path.join(specProject, 'src', 'main.ts'), '// main');
fs.writeFileSync(path.join(specProject, 'config', 'app.json'), '{}');

const specOut = path.join(workspace, 'spec-out');
const specFile = await renderDocx([], {
  title: '后台管理系统 V1.0',
  fontName: 'SimSun', fontSizePt: 10.5, outDir: specOut, docType: 'design-spec',
  metadata: { softwareName: '后台管理系统', version: 'V1.0', owner: 'XX公司', languages: 'TypeScript', environment: 'Linux', description: '后台管理平台' },
  root: specProject,
});
assert.equal(specFile, path.join(specOut, '设计说明书_后台管理系统 V1.0.docx'));
const specBytes = fs.readFileSync(specFile);
assert.equal(specBytes.subarray(0, 2).toString('ascii'), 'PK', '设计说明书应为有效 DOCX');
assert.ok(specBytes.length > 5_000, '设计说明书不应过小');

// 2. 申请表（字段齐备）
const formOut = path.join(workspace, 'form-out');
const formFile = await renderDocx([], {
  title: '后台管理系统 V1.0',
  fontName: 'SimSun', fontSizePt: 10.5, outDir: formOut, docType: 'application-form',
  metadata: {
    softwareName: '后台管理系统', version: 'V1.0', owner: 'XX公司',
    completedDate: '2026-01-01', publishedDate: '2026-02-01', foundedDate: '2020-01-01',
    languages: 'TypeScript', environment: 'Linux', description: '后台管理平台',
  },
});
assert.equal(formFile, path.join(formOut, '软著申请表_后台管理系统 V1.0.docx'));
const formBytes = fs.readFileSync(formFile);
assert.equal(formBytes.subarray(0, 2).toString('ascii'), 'PK', '申请表应为有效 DOCX');
assert.ok(formBytes.length > 5_000, '申请表不应过小');

// 3. 申请表缺必填项仍可生成，但应可打开
const formOut2 = path.join(workspace, 'form-out2');
const formFile2 = await renderDocx([], {
  title: '未命名系统',
  fontName: 'SimSun', fontSizePt: 10.5, outDir: formOut2, docType: 'application-form',
  metadata: {},
});
assert.equal(fs.readFileSync(formFile2).subarray(0, 2).toString('ascii'), 'PK');

console.log('✅ design-spec / application-form 全部通过');