import {
  AlignmentType, Document, Footer, Header, HeadingLevel, LevelFormat, PageNumber,
  Packer, Paragraph, TextRun,
} from 'docx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Metadata } from './types.ts';
import type { RenderOptions } from './render.ts';
import { buildHeaderTitle } from './doc-type.ts';

const FONT = 'SimSun';

/**
 * 将 AI 生成的草稿文本渲染为 .docx。
 * 草稿为简单的 Markdown 子集：`#`/`##` 标题、`-` 列表、空行分段，其余为段落。
 * 返回文件路径。
 */
export async function renderAiDraftDocx(
  draft: string,
  metadata: Metadata,
  opts: RenderOptions,
): Promise<string> {
  const headerTitle = buildHeaderTitle(metadata) || opts.title;
  const font = { name: FONT, eastAsia: FONT } as const;
  const bodySize = 21;

  const children: Paragraph[] = [];
  for (const raw of draft.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const h1 = /^#\s+(.+)$/.exec(line);
    const h2 = /^##\s+(.+)$/.exec(line);
    if (h1) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: h1[1].trim(), bold: true, size: 32, font: FONT })] }));
    } else if (h2) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text: h2[1].trim(), bold: true, size: 26, font: FONT })] }));
    } else if (/^[-*•]\s+/.test(line)) {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 300 }, children: [new TextRun({ text: line.replace(/^[-*•]\s+/, ''), size: bodySize, font: FONT })] }));
    } else if (/^\d+[.、)]\s+/.test(line)) {
      children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 300 }, children: [new TextRun({ text: line.replace(/^\d+[.、)]\s+/, ''), size: bodySize, font: FONT })] }));
    } else {
      children.push(new Paragraph({ spacing: { after: 120, line: 300 }, children: [new TextRun({ text: line, size: bodySize, font: FONT })] }));
    }
  }
  if (children.length === 0) {
    children.push(new Paragraph({ spacing: { after: 120, line: 300 }, children: [new TextRun({ text: '(AI 未返回内容，请检查服务配置或重试)', size: bodySize, font: FONT })] }));
  }

  const cover = [
    new Paragraph({ spacing: { before: 3600 }, children: [new TextRun({ text: '', size: bodySize * 2, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: headerTitle, bold: true, size: 44, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: '软件著作权登记申报文档（AI 生成草稿）', bold: true, size: 28, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: `著作权人：${metadata.owner ?? '—'}`, size: 22, font: FONT })] }),
  ];

  const doc = new Document({
    styles: { default: { document: { run: { font, size: bodySize * 2 } } } },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT }] }] },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 720, left: 1200, right: 1200 } } },
        children: cover,
      },
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 720, left: 1200, right: 1200, header: 480 } } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: headerTitle, size: 18, font: FONT }), new TextRun({ children: ['  第 ', PageNumber.CURRENT, ' 页'], size: 18, font: FONT })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [] })] }) },
        children,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  fs.mkdirSync(opts.outDir, { recursive: true });
  const file = path.join(opts.outDir, `${opts.baseName ?? 'AI草稿_' + (headerTitle || '未命名')}.docx`);
  fs.writeFileSync(file, buf);
  return file;
}
