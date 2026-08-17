import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileEntry } from './types.ts';
import { langOf } from './discover.ts';
import { entryScore } from './discover.ts';

/**
 * 全离线静态源码分析：从「已扫描文件」中提取项目结构与符号信息，
 * 供设计说明书 / 用户手册生成真实内容（不依赖外部服务，无 AST 依赖）。
 *
 * 采用轻量正则解析，覆盖主流语言的常见写法；分析不到的细节由模板兜底。
 */

export interface AnalyzedModule {
  /** 模块名（相对根目录的目录名或包名） */
  name: string;
  /** 该模块下的源文件（相对路径） */
  files: string[];
  /** 提取到的符号（类/函数/导出名），按出现顺序去重 */
  symbols: string[];
  /** 该模块依赖的其他模块名（去重） */
  dependencies: string[];
  /** 代码行数合计 */
  codeLines: number;
}

export interface AnalyzedSymbol {
  kind: 'class' | 'function' | 'export' | 'interface' | 'module' | 'def' | 'func';
  name: string;
  file: string;
}

export interface ProjectAnalysis {
  /** 顶层模块清单（含代码量统计） */
  modules: AnalyzedModule[];
  /** 项目技术栈（依赖清单） */
  techStack: string[];
  /** 包管理器 / 描述信息（来自 package.json 等） */
  manifest: {
    description?: string;
    scripts?: string[];
    bin?: string[];
  };
  /** 入口文件（entryScore 命中），空表示未识别 */
  entryFiles: string[];
  /** 全局符号（非分模块时的汇总） */
  symbols: AnalyzedSymbol[];
  /** 依赖关系（模块 → 依赖模块列表） */
  dependencyGraph: Record<string, string[]>;
  /** 语言统计（文件数与行数） */
  languageStats: Array<{ lang: string; files: number; lines: number }>;
  /** 总代码行数 */
  totalCodeLines: number;
  /** 参与分析的文件数 */
  fileCount: number;
}

/** 按目录分组的模块名；根目录文件归入模块名「根目录」 */
export function moduleNameOf(relPath: string): string {
  const parts = relPath.split('/');
  return parts.length > 1 ? parts[0] : '(根目录)';
}

/** 常见 import 语句提取目标模块名（本地相对路径保留为目录名） */
function extractDependencies(text: string): string[] {
  const deps = new Set<string>();
  const patterns = [
    /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,       // TS/JS: import ... from 'x'
    /import\s+['"]([^'"]+)['"]/g,                       // side-effect import
    /require\(['"]([^'"]+)['"]\)/g,                     // CJS require
    /from\s+['"]([^'"]+)['"]/g,                         // Python/Go 常见
    /import\s+['"]([^'"]+)['"]/g,                       // Python import x
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const spec = m[1];
      if (!spec || spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('./') || spec.startsWith('../')) continue;
      const name = spec.split('/')[0];
      if (name && !name.includes('.') && name.length > 1) deps.add(name);
    }
  }
  return [...deps];
}

/** 提取类/函数/导出符号 */
function extractSymbols(text: string, ext: string): AnalyzedSymbol[] {
  const symbols: AnalyzedSymbol[] = [];
  const seen = new Set<string>();
  const push = (kind: AnalyzedSymbol['kind'], name: string) => {
    if (!name || seen.has(`${kind}:${name}`)) return;
    seen.add(`${kind}:${name}`);
    symbols.push({ kind, name, file: '' });
  };

  const lang = langOf(ext);
  const patterns: Array<RegExp> = [];
  if (['TS', 'TSX', 'JS', 'JSX', 'JAVA', 'KT', 'SWIFT', 'CS', 'SCALA', 'PHP', 'GO'].includes(lang)) {
    patterns.push(/^(?:export\s+)?(?:abstract\s+|sealed\s+|final\s+|public\s+|private\s+|protected\s+)*class\s+([A-Za-z_$][\w$]*)/gm);
    patterns.push(/^(?:export\s+)?(?:abstract\s+|sealed\s+|interface)\s+([A-Za-z_$][\w$]*)/gm);
    patterns.push(/^(?:export\s+)?(?:public\s+|private\s+|protected\s+)*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm);
    patterns.push(/^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=:]/gm);
    patterns.push(/^(?:export\s+)?(?:type|enum)\s+([A-Za-z_$][\w$]*)/gm);
  } else if (lang === 'PY') {
    patterns.push(/^class\s+([A-Za-z_]\w*)/gm);
    patterns.push(/^def\s+([A-Za-z_]\w*)/gm);
    patterns.push(/^async\s+def\s+([A-Za-z_]\w*)/gm);
  } else if (lang === 'GO') {
    patterns.push(/^func\s+\([^)]*\)\s*([A-Za-z_]\w*)/gm);
    patterns.push(/^func\s+([A-Za-z_]\w*)/gm);
    patterns.push(/^type\s+([A-Za-z_]\w*)/gm);
  } else if (lang === 'RS') {
    patterns.push(/^(?:pub\s+)?(?:struct|enum|trait|type|fn)\s+([A-Za-z_]\w*)/gm);
  } else if (lang === 'SQL') {
    patterns.push(/^CREATE\s+(?:TABLE|VIEW|PROCEDURE|FUNCTION|INDEX)\s+([A-Za-z_]\w*)/gim);
  } else if (lang === 'SH') {
    patterns.push(/^[A-Za-z_]\w*\s*\(\)\s*\{/gm);
    patterns.push(/^function\s+([A-Za-z_]\w*)/gm);
  }

  for (const re of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const name = m[1];
      const kind: AnalyzedSymbol['kind'] =
        /class/.test(m[0]) ? 'class'
          : /^(?:export\s+)?(?:const|let|var)\s/.test(m[0]) ? 'export'
            : /interface|type|enum/.test(m[0]) ? 'interface'
              : lang === 'PY' ? 'def'
                : lang === 'GO' && /^func/.test(m[0]) ? 'func'
                  : /^(?:pub\s+)?(?:struct|enum|trait)\s/.test(m[0]) ? 'class'
                    : 'function';
      push(kind, name);
    }
  }
  return symbols;
}

/** 技术栈清单：读常见依赖清单文件 */
function extractTechStack(root: string): string[] {
  const stack = new Set<string>();
  const readJsonDeps = (rel: string, fields: string[]) => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
      for (const field of fields) {
        const deps = raw?.[field];
        if (deps && typeof deps === 'object') {
          for (const key of Object.keys(deps)) stack.add(key);
        }
      }
    } catch {
      /* 文件缺失或解析失败时忽略 */
    }
  };
  readJsonDeps('package.json', ['dependencies', 'devDependencies', 'peerDependencies']);

  for (const rel of ['requirements.txt', 'go.mod', 'Cargo.toml', 'composer.json', 'Gemfile', 'pom.xml', 'build.gradle']) {
    try {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      if (rel === 'requirements.txt') {
        for (const line of text.split(/\r?\n/)) {
          const name = line.split(/[=<>!~]/)[0].trim().toLowerCase();
          if (name && !name.startsWith('#') && !name.includes(' ')) stack.add(name);
        }
      } else if (rel === 'go.mod') {
        for (const line of text.split(/\r?\n/)) {
          const m = /^\s*([a-zA-Z0-9_.\-/]+)\s+v\d/.exec(line);
          if (m) stack.add(m[1].split('/')[0]);
        }
      } else if (rel === 'Cargo.toml') {
        for (const line of text.split(/\r?\n/)) {
          const m = /^\s*([a-zA-Z0-9_-]+)\s*=\s*"/.exec(line);
          if (m && m[1] !== 'name' && m[1] !== 'version' && m[1] !== 'edition') stack.add(m[1]);
        }
      } else if (rel === 'composer.json') {
        const parsed = JSON.parse(text);
        for (const key of Object.keys(parsed?.require ?? {})) stack.add(key);
      } else if (rel === 'Gemfile') {
        for (const line of text.split(/\r?\n/)) {
          const m = /^\s*gem\s+['"]([^'"]+)['"]/.exec(line);
          if (m) stack.add(m[1]);
        }
      }
    } catch {
      /* 缺失即跳过 */
    }
  }
  return [...stack].sort((a, b) => a.localeCompare(b));
}

/** 解析 package.json 的 description / scripts / bin */
function readManifest(root: string): ProjectAnalysis['manifest'] {
  const empty: ProjectAnalysis['manifest'] = {};
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    return {
      description: typeof raw.description === 'string' ? raw.description : undefined,
      scripts: Array.isArray(raw.scripts) ? raw.scripts : typeof raw.scripts === 'object' && raw.scripts
        ? Object.keys(raw.scripts).slice(0, 12)
        : undefined,
      bin: Array.isArray(raw.bin) ? raw.bin : typeof raw.bin === 'object' && raw.bin
        ? Object.keys(raw.bin)
        : typeof raw.bin === 'string' ? [raw.bin] : undefined,
    };
  } catch {
    return empty;
  }
}

/**
 * 对已扫描文件执行静态分析。文件内容在需要时按需读取（受 MAX_FILE_BYTES 保护）。
 * 只在文件规模合理时读取内容；超限文件仅参与统计。
 */
export function analyzeProject(files: FileEntry[], root: string): ProjectAnalysis {
  const modules = new Map<string, AnalyzedModule>();
  const languageStats = new Map<string, { files: number; lines: number }>();
  const globalSymbols: AnalyzedSymbol[] = [];
  const entryFiles: string[] = [];
  let totalCodeLines = 0;

  for (const file of files) {
    const modName = moduleNameOf(file.relPath);
    const mod = modules.get(modName) ?? { name: modName, files: [], symbols: [], dependencies: [], codeLines: 0 };
    mod.files.push(file.relPath);
    mod.codeLines += file.rawLines;
    totalCodeLines += file.rawLines;

    const lang = file.lang || 'OTHER';
    const ls = languageStats.get(lang) ?? { files: 0, lines: 0 };
    ls.files++;
    ls.lines += file.rawLines;
    languageStats.set(lang, ls);

    if (file.entryScore > 0) entryFiles.push(file.relPath);

    // 内容分析（大文件跳过符号/依赖提取以保性能）
    if (file.sizeBytes <= 512 * 1024) {
      try {
        const text = fs.readFileSync(file.path, 'utf8');
        const symbols = extractSymbols(text, file.ext).map((sym) => ({ ...sym, file: file.relPath }));
        for (const sym of symbols) {
          mod.symbols.push(sym.name);
          globalSymbols.push(sym);
        }
        const deps = extractDependencies(text);
        for (const dep of deps) mod.dependencies.push(dep);
      } catch {
        /* 不可读文件跳过 */
      }
    }
    modules.set(modName, mod);
  }

  const moduleList: AnalyzedModule[] = [...modules.values()].map((mod) => ({
    ...mod,
    symbols: [...new Set(mod.symbols)],
    dependencies: [...new Set(mod.dependencies)],
  }));

  const dependencyGraph: Record<string, string[]> = {};
  for (const mod of moduleList) dependencyGraph[mod.name] = mod.dependencies;

  return {
    modules: moduleList.sort((a, b) => b.codeLines - a.codeLines),
    techStack: extractTechStack(root),
    manifest: readManifest(root),
    entryFiles,
    symbols: globalSymbols.slice(0, 300),
    dependencyGraph,
    languageStats: [...languageStats.entries()]
      .map(([lang, v]) => ({ lang, files: v.files, lines: v.lines }))
      .sort((a, b) => b.lines - a.lines),
    totalCodeLines,
    fileCount: files.length,
  };
}

/** 提取代码文件头注释中的一句话简介（供模块职责兜底） */
export function extractModuleSummary(text: string): string | null {
  const m = /^(?:\/\*\*|\/\*|#|\/\/|--)\s*\n?\s*([^\n*]+)/m.exec(text);
  if (!m) return null;
  const first = m[1].trim();
  if (!first || first.length < 4 || first.length > 80) return null;
  return first.replace(/[*/#"]/g, '').trim();
}
