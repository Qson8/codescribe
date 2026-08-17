import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { extractFromReadme, renderDocx } from '../src/index.ts';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-test-'));

// 构造一个含 README 的项目
const project = path.join(workspace, 'demo');
fs.mkdirSync(project, { recursive: true });
fs.writeFileSync(
  path.join(project, 'README.md'),
  [
    '# 测试管理系统',
    '',
    '一款用于软件著作权申报的离线文档生成工具，代码不出本机。',
    '',
    '## 功能特性',
    '- 生成源程序鉴别材料',
    '- 生成用户手册',
    '- 敏感信息自动脱敏',
    '',
    '## 安装',
    '下载安装包，双击运行即可。',
    '',
    '## 使用说明',
    '1. 导入项目目录',
    '2. 填写申报元数据',
    '3. 导出文档',
    '',
    '## 常见问题',
    '### 为什么需要著作权人名称？',
    '用于署名冲突扫描。',
  ].join('\n'),
  'utf8',
);

// 1. README 提取
const extracted = extractFromReadme(project);
assert.equal(extracted.summary.includes('软件著作权申报'), true);
assert.equal(extracted.features.length, 3);
assert.equal(extracted.features[0], '生成源程序鉴别材料');
assert.equal(extracted.install.length, 1);
assert.equal(extracted.usage.length, 3);
assert.equal(extracted.extraSections.length, 2);
assert.equal(extracted.extraSections[0].title, '常见问题');
assert.equal(extracted.extraSections[1].title, '为什么需要著作权人名称？');

// 2. 无 README 时返回空结构
const emptyProject = path.join(workspace, 'empty');
fs.mkdirSync(emptyProject, { recursive: true });
const empty = extractFromReadme(emptyProject);
assert.deepEqual(empty, { summary: '', features: [], install: [], usage: [], extraSections: [] });

// 3. 生成用户手册 docx
const outDir = path.join(workspace, 'out');
const file = await renderDocx([], {
  title: '测试管理系统',
  fontName: 'SimSun',
  fontSizePt: 10.5,
  outDir,
  docType: 'user-manual',
  metadata: { softwareName: '测试管理系统', version: 'V1.0', owner: '测试科技有限公司' },
  extracted,
});
assert.equal(file, path.join(outDir, '用户手册_测试管理系统 V1.0.docx'));
const bytes = fs.readFileSync(file);
assert.equal(bytes.subarray(0, 2).toString('ascii'), 'PK', '用户手册应为有效 DOCX');
assert.ok(bytes.length > 5_000, '用户手册不应过小');

// 4. 缺少元数据时仍可生成（回退 title）
const outDir2 = path.join(workspace, 'out2');
const file2 = await renderDocx([], {
  title: '测试管理系统 V1.0',
  fontName: 'SimSun',
  fontSizePt: 10.5,
  outDir: outDir2,
  docType: 'user-manual',
  metadata: {},
});
const bytes2 = fs.readFileSync(file2);
assert.equal(bytes2.subarray(0, 2).toString('ascii'), 'PK');

console.log('✅ user-manual 全部通过');