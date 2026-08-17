#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { annotate } from '@codescribe/core/clean';
import type { CleanOptions } from '@codescribe/core/clean';

const HELP = `codescribe — 代码脱敏与清洗命令行工具

用法：
  codescribe scrub <file> [--keep-comments] [--no-mask] [--keep-blank]
  cat <file> | codescribe scrub [<ext>]

从文件或 stdin 读取源码，按源码注释/字符串状态机清洗并脱敏，将结果输出到 stdout。
脱敏与敏感项统计信息输出到 stderr。

选项：
  --keep-comments   保留注释（仅脱敏）
  --no-mask         不脱敏
  --keep-blank      保留空行
  --help, -h        显示帮助
`;

function parseArgs(args: string[]): { file?: string; ext?: string; clean: CleanOptions } {
  const clean: CleanOptions = { removeComments: true, removeBlankLines: true, maskSensitive: true, wrapLongLines: false, maxLineWidth: 78, tabWidth: 4 };
  const positional: string[] = [];
  for (const arg of args) {
    switch (arg) {
      case '--help': case '-h': console.log(HELP); process.exit(0); break;
      case '--keep-comments': clean.removeComments = false; break;
      case '--no-mask': clean.maskSensitive = false; break;
      case '--keep-blank': clean.removeBlankLines = false; break;
      default:
        if (arg.startsWith('-')) { console.error(`未知选项：${arg}`); process.exit(2); }
        positional.push(arg);
    }
  }
  if (positional.length === 0) return { ext: undefined, clean };
  if (positional.length === 1) return { file: positional[0], clean };
  if (positional.length === 2) return { file: positional[0], ext: positional[1], clean };
  console.error('参数过多'); process.exit(2);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'scrub') {
    if (command === '--version' || command === '-v') {
      console.log(requirePackageVersion());
      return;
    }
    console.error('用法：codescribe scrub <file>，或用 --help 查看帮助');
    process.exit(2);
  }

  const { file, ext, clean } = parseArgs(rest);
  let input: string;
  let resolvedExt: string;
  if (file) {
    input = fs.readFileSync(file, 'utf8');
    resolvedExt = ext ?? path.extname(file).slice(1);
  } else {
    input = fs.readFileSync(0, 'utf8');
    resolvedExt = ext ?? '';
  }

  const annotated = annotate(input, resolvedExt, clean);
  const lines: string[] = [];
  let maskedLines = 0;
  for (const item of annotated) {
    if (item.masked) maskedLines++;
    lines.push(...item.out);
  }

  process.stdout.write(lines.join('\n') + (lines.length > 0 ? '\n' : ''));
  process.stderr.write(`✓ 已清洗 ${annotated.length} 行，删除注释/空行后输出 ${lines.length} 行`);
  if (clean.maskSensitive) {
    process.stderr.write(maskedLines > 0 ? `，脱敏 ${maskedLines} 行` : '，未发现敏感信息');
  }
  process.stderr.write('\n');
}

function requirePackageVersion(): string {
  const file = path.join(import.meta.dirname, '..', 'package.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).version ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

await main();