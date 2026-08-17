import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ManualSection {
  /** 章节标题（如「功能特性」「安装」「使用说明」） */
  title: string;
  /** 章节正文段落 */
  paragraphs: string[];
  /** 列表项 */
  bullets: string[];
}

export interface ExtractedManual {
  /** 产品一句话简介（README 开头的描述，或 metadata.description） */
  summary: string;
  /** 功能清单 */
  features: string[];
  /** 安装章节 */
  install: string[];
  /** 使用说明 */
  usage: string[];
  /** 其他章节（FAQ、配置等）按原文保留 */
  extraSections: ManualSection[];
}

const README_NAMES = ['README.md', 'README.MD', 'readme.md', 'README', '说明.md', 'Readme.md'];

const SECTION_KEYWORDS: Record<string, string[]> = {
  features: ['功能', '特性', 'feature', '亮点', '能力'],
  install: ['安装', 'install', '部署', 'quickstart', '快速开始', '环境'],
  usage: ['使用', 'usage', '用法', '操作', '指南', 'guide'],
  faq: ['常见问题', 'faq', '问题', 'troubleshoot'],
  config: ['配置', 'config', '设置', '参数'],
};

type SectionCategory = 'features' | 'install' | 'usage' | 'faq' | 'config' | 'other';

function sectionCategory(title: string): SectionCategory {
  const lower = title.toLowerCase();
  for (const [cat, keys] of Object.entries(SECTION_KEYWORDS)) {
    if (keys.some((k) => lower.includes(k))) return cat as SectionCategory;
  }
  return 'other';
}

/**
 * 从 README 提取用户手册素材。无 README 时返回空结构（由 builder 回退到元数据 description）。
 */
export function extractFromReadme(root: string): ExtractedManual {
  const readmePath = README_NAMES.map((name) => path.join(root, name)).find((p) => fs.existsSync(p));
  if (!readmePath) return { summary: '', features: [], install: [], usage: [], extraSections: [] };

  let lines: string[] = [];
  try {
    lines = fs.readFileSync(readmePath, 'utf8').split(/\r\n|\r|\n/);
  } catch {
    return { summary: '', features: [], install: [], usage: [], extraSections: [] };
  }

  const summaryLines: string[] = [];
  const sections: ManualSection[] = [];
  let current: ManualSection | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const title = heading[2].replace(/[#*`]/g, '').trim();
      if (current) sections.push(current);
      // 首个一级标题（# 软件名）下紧随的正文视作产品简介，不当作独立章节
      if (level === 1 && sections.length === 0) {
        current = null;
      } else if (title) {
        current = { title, paragraphs: [], bullets: [] };
      } else {
        current = null;
      }
      continue;
    }
    if (current) {
      if (/^[-*+]\s+/.test(line)) {
        current.bullets.push(line.replace(/^[-*+]\s+/, '').replace(/`/g, '').trim());
      } else if (!/^!\[/.test(line)) {
        const text = line.replace(/[`*_]/g, '').trim();
        if (text && !/^https?:\/\//.test(text)) current.paragraphs.push(text);
      }
    } else {
      const text = line.replace(/[`*_]/g, '').trim();
      if (text && !/^#/.test(text) && !/^!\[/.test(text)) summaryLines.push(text);
    }
  }

  if (current) sections.push(current);

  const features: string[] = [];
  const install: string[] = [];
  const usage: string[] = [];
  const extraSections: ManualSection[] = [];
  for (const section of sections) {
    const cat = sectionCategory(section.title);
    const items = [...section.paragraphs, ...section.bullets];
    if (cat === 'features') features.push(...items);
    else if (cat === 'install') install.push(...items);
    else if (cat === 'usage') usage.push(...items);
    else extraSections.push(section);
  }

  return {
    summary: summaryLines.join(' '),
    features,
    install,
    usage,
    extraSections,
  };
}