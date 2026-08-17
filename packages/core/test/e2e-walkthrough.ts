import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_EXCLUDES, DEFAULT_EXTENSIONS, analyzeProject, defaultCleanOptions, discover, extractFromReadme,
  processFiles, renderDocx, sortFiles,
} from '../src/index.ts';
import type { DocumentType, Metadata } from '../src/types.ts';

/**
 * 端到端走查：把本仓库当作真实项目，扫描 → 清洗 → 按 4 种文档类型各导出
 * 一份 .docx，校验文件是合法 ZIP 且包含各类型应有的结构标记。
 *
 * 覆盖「导入 → 填元数据 → 选类型 → 导出全部文档」的实质流程（核心层）。
 */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codescribe-e2e-'));

const metadata: Metadata = {
  softwareName: '码著CodeScribe软著文书生成系统V1.0',
  version: '1.0',
  shortName: '码著',
  owner: '深圳市码著科技有限公司',
  foundedDate: '2020-01-01',
  completedDate: '2026-08-17',
  publishedDate: '2026-08-20',
  languages: 'TypeScript、Node.js',
  environment: 'Windows 11 / macOS / Linux 桌面',
  description: '一款离线生成软件著作权登记申报文书的桌面工具',
};

const files = sortFiles(discover(repoRoot, DEFAULT_EXTENSIONS, DEFAULT_EXCLUDES), 'entry');
assert.ok(files.length > 0, '应在仓库中扫描到源码文件');
assert.ok(files.some((f) => f.lang === 'TS' || f.lang === 'TSX'), '应扫描到 TypeScript 源码');
assert.ok(files.some((f) => f.lang === 'JS'), '应扫描到 JavaScript 源码');

const config = {
  root: repoRoot,
  title: metadata.softwareName!,
  owner: metadata.owner,
  extensions: DEFAULT_EXTENSIONS,
  excludes: DEFAULT_EXCLUDES,
  sortMode: 'entry' as const,
  clean: defaultCleanOptions(),
  linesPerPage: 50,
  maxPages: 60,
};
const result = processFiles(files, config);
assert.ok(result.selection.pages.length > 0, '应生成分页');
assert.ok(result.selection.pickedLines > 0, '应选择到代码行');

const extracted = extractFromReadme(repoRoot);
const analysis = analyzeProject(files, repoRoot);
assert.ok(analysis.modules.length > 0, '静态分析应识别到模块');
assert.ok(analysis.techStack.length > 0, '静态分析应识别到技术栈');
assert.ok(analysis.totalCodeLines > 0, '静态分析应统计到代码行数');
const summary = `本系统自动扫描并识别项目源代码，执行注释清理与敏感信息脱敏后，按软件著作权登记规范自动排版生成源程序鉴别材料，并支持一键生成用户手册、设计说明书与登记申请表等配套文书，全部处理均在本地完成。`;

const cases: Array<{ docType: DocumentType; baseName: string; expect: RegExp }> = [
  { docType: 'source-program', baseName: '源程序鉴别材料', expect: /码著CodeScribe软著文书生成系统V1\.0/ },
  { docType: 'user-manual', baseName: '用户手册', expect: /目录|使用方法|安装|功能说明|摘要/ },
  { docType: 'design-spec', baseName: '设计说明书', expect: /设计说明书|模块|架构|技术|环境/ },
  { docType: 'application-form', baseName: '登记申请表', expect: /申请表|软件名称|版本号|著作权人|开发完成日期/ },
];

const firstModule = analysis.modules[0].name;
const techStackHead = analysis.techStack.slice(0, 6).join('、');

for (const { docType, baseName, expect } of cases) {
  const opts = {
    title: metadata.softwareName!,
    fontName: 'SimSun',
    fontSizePt: 10.5,
    outDir,
    baseName,
    docType,
    metadata,
    extracted: docType === 'user-manual' ? extracted : undefined,
    root: docType === 'design-spec' ? repoRoot : undefined,
    analysis: (docType === 'design-spec' || docType === 'user-manual') ? analysis : undefined,
  };
  const file = await renderDocx(result.selection.pages, opts);
  assert.ok(fs.existsSync(file), `${docType} 应生成文件：${file}`);
  assert.ok(file.endsWith('.docx'), `${docType} 应为 .docx`);
  assert.ok(fs.statSync(file).size > 1_000, `${docType} 文件应大于 1KB`);
  const text = extractDocxText(file);
  assert.ok(text.length > 50, `${docType} 应包含正文文本`);
  assert.match(text, expect, `${docType} 应包含「${expect.source}」相关内容`);
  if (docType === 'design-spec') {
    assert.ok(text.includes(firstModule), `设计说明书应包含真实模块名「${firstModule}」`);
    assert.ok(text.includes(techStackHead.split('、')[0]), `设计说明书应包含真实技术栈「${techStackHead.split('、')[0]}」`);
  }
  console.log(`✅ ${docType.padEnd(17)} ${file} (${(fs.statSync(file).size / 1024).toFixed(1)}KB)`);
}

console.log(`✅ 端到端走查通过：4 种文档全部真实导出（样本=${repoRoot}）`);
console.log(`   输出目录：${outDir}`);

/** 解压 docx（zip）并抽取 word/document.xml + header*.xml 的纯文本 */
function extractDocxText(docxPath: string): string {
  const parts: string[] = [];
  for (const entry of ['word/document.xml', 'word/header1.xml', 'word/header2.xml', 'word/header3.xml']) {
    try {
      const out = execFileSync('unzip', ['-p', docxPath, entry], { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
      const xml = out.toString('utf8');
      const withoutTags = xml.replace(/<w:p[^>]*>/g, '\n').replace(/<[^>]+>/g, '');
      parts.push(withoutTags
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/\n{3,}/g, '\n'));
    } catch {
      /* 该 part 不存在则跳过 */
    }
  }
  return parts.join('\n');
}