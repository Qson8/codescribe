export interface CleanOptions {
  removeComments: boolean;
  removeBlankLines: boolean;
  maskSensitive: boolean;
  wrapLongLines: boolean;
  /** 超过该半角宽度的行会被硬折断，保证每行占且仅占一个物理行位 */
  maxLineWidth: number;
  tabWidth: number;
}

/** 文档类型：源程序 / 用户手册 / 设计说明书 / 申请表 */
export type DocumentType = 'source-program' | 'user-manual' | 'design-spec' | 'application-form';

/** 软著申报所需的共享元数据，各文档类型按需取用；所有字段均可选，由 doc-type 的必填校验按类型约束 */
export interface Metadata {
  /** 软件全称 */
  softwareName?: string;
  /** 软件版本号（不含前缀 v） */
  version?: string;
  /** 软件简称 */
  shortName?: string;
  /** 著作权人名称 */
  owner?: string;
  /** 著作权人成立日期 YYYY-MM-DD */
  foundedDate?: string;
  /** 开发完成日期 YYYY-MM-DD */
  completedDate?: string;
  /** 首次发表日期 YYYY-MM-DD */
  publishedDate?: string;
  /** 开发语言，逗号分隔 */
  languages?: string;
  /** 开发环境/平台说明 */
  environment?: string;
  /** 软件功能简介 */
  description?: string;
}

export interface ProjectConfig {
  root: string;
  /** 软件全称+版本号，用作页眉，必须与申请表一致 */
  title: string;
  /** 著作权人名称，用于署名冲突扫描 */
  owner?: string;
  /** 著作权人成立日期 YYYY-MM-DD，早于该日期的文件 mtime 会被警告 */
  foundedDate?: string;
  /** 要生成的文档类型，默认 source-program */
  docType?: DocumentType;
  /** 软著申报共享元数据 */
  metadata?: Metadata;
  extensions: string[];
  excludes: string[];
  sortMode: 'entry' | 'mtime' | 'manual';
  clean: CleanOptions;
  linesPerPage: number;
  maxPages: number;
}

export interface FileEntry {
  path: string;
  relPath: string;
  name: string;
  ext: string;
  lang: string;
  sizeBytes: number;
  rawLines: number;
  mtimeMs: number;
  encoding: string;
  included: boolean;
  entryScore: number;
}

export type LineKind = 'code' | 'comment' | 'blank';

export interface AnnotatedLine {
  text: string;
  kind: LineKind;
  masked: boolean;
  /** 清洗后的文本（kind === 'code' 时有效，可能因折行拆成多行） */
  out: string[];
}

export interface CleanedFile {
  entry: FileEntry;
  lines: string[];
  /** 注释删除前从原始源码提取出的署名审计证据 */
  attributions: AttributionEvidence[];
  removedComments: number;
  removedBlanks: number;
  maskedCount: number;
}

export type AttributionKind = 'author' | 'copyright';

export interface AttributionEvidence {
  kind: AttributionKind;
  /** 识别出的署名主体，不包含年份和注释符号 */
  subject: string;
  /** 相对于项目根目录的文件路径 */
  file: string;
  /** 原始源码中的 1-based 行号 */
  line: number;
  /** 未经清洗的原始行文本 */
  text: string;
}

export interface Page {
  no: number;
  lines: string[];
  /** 本页覆盖的文件（起止） */
  startFile: string;
  endFile: string;
}

export interface Selection {
  pages: Page[];
  totalLines: number;
  pickedLines: number;
  truncated: boolean;
  /** 实际为最终分页贡献代码行的文件，按首次出现顺序排列 */
  selectedRelPaths: string[];
  /** 前段最后一页页码（截断时为 30） */
  splitAfterPage: number | null;
  frontEndFile: string | null;
  backStartFile: string | null;
}

export type AuditStatus = 'pass' | 'warn' | 'fail';

export interface AuditLocation {
  /** 相对于项目根目录的文件路径，仅可由主进程结合项目根目录定位 */
  file: string;
  /** 原始源码中的 1-based 行号 */
  line?: number;
}

export interface AuditEvidence {
  location: AuditLocation;
  /** 与该文件位置关联的证据文本或错误信息 */
  detail: string;
}

export interface AuditItem {
  status: AuditStatus;
  name: string;
  detail: string;
  /** 摘要所指向的首个问题文件 */
  location?: AuditLocation;
  /** 可独立定位的结构化证据，数量可由生成方限制 */
  evidence?: AuditEvidence[];
}

export interface ProjectStats {
  totalFiles: number;
  includedFiles: number;
  cleanedLines: number;
  estimatedPages: number;
  langCounts: Record<string, number>;
}

export type PipelineStage = 'discovering' | 'scanning' | 'cleaning' | 'selecting' | 'auditing' | 'rendering';

export interface PipelineProgress {
  stage: PipelineStage;
  completed: number;
  total: number;
  /** 已处理的源码字节数；不适用的阶段省略 */
  bytes?: number;
  message?: string;
}

export interface FileTaskError {
  stage: 'scanning' | 'cleaning' | 'rendering';
  file: string;
  message: string;
}

export const DEFAULT_EXCLUDES = [
  'node_modules', 'dist', 'build', 'out', 'vendor', 'target',
  '.git', '.gradle', '.idea', '.vscode', '.next', '.nuxt',
  '__pycache__', 'venv', '.venv', 'coverage', 'Pods',
  '*.min.js', '*.min.css', '*.lock',
];

export const DEFAULT_EXTENSIONS = [
  'java', 'kt', 'kts', 'py', 'js', 'jsx', 'ts', 'tsx', 'go', 'rs',
  'c', 'h', 'cpp', 'hpp', 'cc', 'cs', 'swift', 'm', 'mm', 'php',
  'rb', 'vue', 'dart', 'lua', 'scala', 'sql', 'sh',
  'html', 'htm', 'css', 'scss', 'less', 'xml',
];

export function defaultCleanOptions(): CleanOptions {
  return {
    removeComments: true,
    removeBlankLines: true,
    maskSensitive: true,
    wrapLongLines: true,
    maxLineWidth: 78,
    tabWidth: 4,
  };
}
