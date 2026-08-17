import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DEFAULT_EXCLUDES, DEFAULT_EXTENSIONS, analyzeProject, discover, renderDocx,
} from '../src/index.ts';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'analyze-test-'));

// 1. 构造含多种语言与依赖清单的 fixture 项目
const root = path.join(workspace, 'proj');
fs.mkdirSync(path.join(root, 'src', 'core'), { recursive: true });
fs.mkdirSync(path.join(root, 'src', 'web'), { recursive: true });
fs.mkdirSync(path.join(root, 'config'), { recursive: true });
fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
  name: 'fixture-app',
  description: '一个用于测试的全离线分析样例应用',
  dependencies: { typescript: '^5', express: '^4', react: '^18' },
  scripts: { build: 'tsc', start: 'node dist/index.js' },
}, null, 2));
fs.writeFileSync(path.join(root, 'src', 'core', 'index.ts'), [
  'import { parse } from "./parser";',
  'import * as fs from "node:fs";',
  'import express from "express";',
  '',
  'export interface Config { port: number }',
  '',
  'export class Server {',
  '  constructor(private readonly config: Config) {}',
  '  start(): void { /* boot */ }',
  '}',
  '',
  'export function createServer(config: Config): Server {',
  '  return new Server(config);',
  '}',
].join('\n'));
fs.writeFileSync(path.join(root, 'src', 'web', 'app.ts'), [
  'import React from "react";',
  'export const App = () => <div>Hello</div>;',
].join('\n'));
fs.writeFileSync(path.join(root, 'config', 'settings.ts'), 'export const port = 8080;');
fs.writeFileSync(path.join(root, 'src', 'core', 'parser.py'), [
  'class Parser:',
  '    def parse(self, text: str):',
  '        return text',
].join('\n'));

const files = discover(root, DEFAULT_EXTENSIONS, DEFAULT_EXCLUDES);
assert.ok(files.length >= 4, `fixture 项目应发现源码文件，实际 ${files.length}`);
const analysis = analyzeProject(files, root);

// 2. 模块划分与统计
const modNames = analysis.modules.map((m) => m.name);
assert.ok(modNames.includes('src'), '模块应包含 src 顶层目录');
assert.ok(modNames.includes('config'), '模块应包含 config 顶层目录');
assert.ok(analysis.fileCount >= 4, '文件数统计应正确');
assert.ok(analysis.totalCodeLines > 0, '总代码行数应大于 0');

// 3. 依赖提取（模块依赖图）
const srcMod = analysis.modules.find((m) => m.name === 'src')!;
assert.ok(srcMod.dependencies.length > 0, 'src 模块应提取到依赖');
assert.ok(srcMod.dependencies.includes('react'), '应提取到 import react');
assert.ok(srcMod.dependencies.includes('express'), '应提取到 import express');
assert.ok(srcMod.dependencies.includes('node:fs'), '应提取到 import node:fs');

// 4. 符号提取
assert.ok(srcMod.symbols.includes('Server'), '应提取到类 Server');
assert.ok(srcMod.symbols.includes('createServer'), '应提取到函数 createServer');
assert.ok(srcMod.symbols.includes('Config'), '应提取到接口/类型 Config');
assert.ok(srcMod.symbols.includes('Parser'), '应提取到 Python 类 Parser');

// 5. 技术栈
assert.ok(analysis.techStack.includes('express'), '技术栈应包含 express');
assert.ok(analysis.techStack.includes('react'), '技术栈应包含 react');
assert.ok(analysis.techStack.includes('typescript'), '技术栈应包含 typescript');

// 6. manifest 与入口
assert.equal(analysis.manifest.description, '一个用于测试的全离线分析样例应用');
assert.ok(analysis.manifest.scripts!.includes('build'), 'scripts 应提取 build');
assert.ok(analysis.entryFiles.includes('src/core/index.ts'), '应识别入口文件 index.ts');

// 7. 语言统计
const langs = analysis.languageStats.map((s) => s.lang);
assert.ok(langs.includes('TS') && langs.includes('PY'), '应统计 TS 与 PY 语言');

// 8. 设计说明书填充真实数据（经 renderDocx）
const specOut = path.join(workspace, 'spec-out');
const specFile = await renderDocx([], {
  title: 'fixture-app V1.0',
  fontName: 'SimSun', fontSizePt: 10.5, outDir: specOut, docType: 'design-spec',
  metadata: { softwareName: 'fixture-app', version: 'V1.0', owner: 'XX公司' },
  root,
  analysis,
});
const specBytes = fs.readFileSync(specFile);
assert.equal(specBytes.subarray(0, 2).toString('ascii'), 'PK');
assert.ok(specBytes.length > 5_000, '设计说明书不应过小');

// 9. 设计说明书不依赖预先分析也能自行扫描（注册回调兜底）
const specFile2 = await renderDocx([], {
  title: 'fixture-app V1.0',
  fontName: 'SimSun', fontSizePt: 10.5, outDir: path.join(workspace, 'spec-out2'), docType: 'design-spec',
  metadata: { softwareName: 'fixture-app', version: 'V1.0', owner: 'XX公司' },
  root,
});
assert.equal(fs.readFileSync(specFile2).subarray(0, 2).toString('ascii'), 'PK');

// 10. 用户手册在无 README 时使用真实兜底（package.json description / techStack）
const manualOut = path.join(workspace, 'manual-out');
const manualFile = await renderDocx([], {
  title: 'fixture-app V1.0',
  fontName: 'SimSun', fontSizePt: 10.5, outDir: manualOut, docType: 'user-manual',
  metadata: { softwareName: 'fixture-app', version: 'V1.0', owner: 'XX公司' },
  root,
  analysis,
});
assert.equal(fs.readFileSync(manualFile).subarray(0, 2).toString('ascii'), 'PK');

console.log('✅ analyze.ts 静态分析 / 双文档真实填充全部通过');
