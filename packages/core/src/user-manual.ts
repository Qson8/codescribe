import {
  AlignmentType, Document, Footer, Header, HeadingLevel, LevelFormat, PageBreak,
  PageNumber, Packer, Paragraph, TableOfContents, TextRun,
} from 'docx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Metadata } from './types.ts';
import type { ExtractedManual } from './features.ts';
import type { RenderOptions } from './render.ts';
import { registerDocxBuilder } from './render-registry.ts';
import { buildHeaderTitle } from './doc-type.ts';

const FONT = 'SimSun';

interface UserManualInput {
  metadata: Metadata;
  extracted: ExtractedManual;
  outDir: string;
}

function para(text: string, opts: { size?: number; bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    spacing: { after: 120, line: 300 },
    children: [new TextRun({ text, bold: opts.bold ?? false, size: (opts.size ?? 21) * 2, font: FONT })],
  });
}

function heading(text: string, level: keyof typeof HeadingLevel): Paragraph {
  return new Paragraph({ heading: HeadingLevel[level], spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true, size: level === 'HEADING_1' ? 32 : 26, font: FONT })] });
}

function bullet(text: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 300 }, children: [new TextRun({ text, size: 21, font: FONT })] });
}

function sectionPage(children: (Paragraph | TableOfContents)[]): (Paragraph | TableOfContents)[] {
  const out: (Paragraph | TableOfContents)[] = [];
  for (let i = 0; i < children.length; i++) {
    if (i > 0) out.push(new Paragraph({ children: [new PageBreak()] }));
    out.push(children[i]);
  }
  return out;
}

async function buildUserManual(input: UserManualInput, opts: RenderOptions): Promise<string> {
  const headerTitle = buildHeaderTitle(input.metadata) || opts.title;
  const font = { name: FONT, eastAsia: FONT } as const;
  const bodySize = 21; // 10.5pt

  const cover = [
    new Paragraph({ spacing: { before: 3600 }, children: [new TextRun({ text: '', size: bodySize * 2, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: headerTitle, bold: true, size: 44, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: '用户手册', bold: true, size: 32, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'User Manual', size: 24, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: `著作权人：${input.metadata.owner ?? '—'}`, size: 22, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 }, children: [new TextRun({ text: `版本：${input.metadata.version ?? '—'}`, size: 22, font: FONT })] }),
  ];

  const toc = [
    heading('目录', 'HEADING_1'),
    new TableOfContents('目录', {
      hyperlink: true,
      headingStyleRange: '1-2',
    }),
  ];

  const content: Paragraph[] = [];

  content.push(heading('1 产品简介', 'HEADING_1'));
  const summary = input.extracted.summary || input.metadata.description || '本软件用于生成软件著作权登记所需的各类申报文档。';
  content.push(para(summary));

  content.push(heading('2 功能特性', 'HEADING_1'));
  const features = input.extracted.features.length > 0
    ? input.extracted.features
    : [input.metadata.description ?? '离线生成软著申报文档', '代码不出本机，隐私安全'];
  features.forEach((f) => content.push(bullet(f)));

  if (input.extracted.install.length > 0) {
    content.push(heading('3 安装说明', 'HEADING_1'));
    input.extracted.install.forEach((line) => content.push(para(line)));
  }

  if (input.extracted.usage.length > 0) {
    content.push(heading('4 使用说明', 'HEADING_1'));
    input.extracted.usage.forEach((line) => content.push(para(line)));
  } else {
    content.push(heading('4 使用说明', 'HEADING_1'));
    content.push(para('打开 CodeScribe，导入项目目录，按向导完成源码清洗、分页预览与文档导出。'));
  }

  for (const extra of input.extracted.extraSections) {
    content.push(heading(extra.title, 'HEADING_2'));
    extra.paragraphs.forEach((p) => content.push(para(p)));
    extra.bullets.forEach((b) => content.push(bullet(b)));
  }

  content.push(heading('5 免责声明', 'HEADING_1'));
  content.push(para('本用户手册由 CodeScribe 依据项目说明自动生成，仅供参考。生成内容不代表软件著作权登记审查结论，最终以主管机构要求为准。'));

  const doc = new Document({
    styles: { default: { document: { run: { font, size: bodySize * 2 } } } },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT }] }] },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 720, left: 1200, right: 1200 } } },
        children: cover,
      },
      {
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 720, left: 1200, right: 1200, header: 480 }, pageNumbers: { start: 1 } },
        },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: headerTitle, size: 18, font: FONT }), new TextRun({ children: ['  第 ', PageNumber.CURRENT, ' 页'], size: 18, font: FONT })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [] })] }) },
        children: sectionPage([toc[0], ...toc.slice(1)]),
      },
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 720, left: 1200, right: 1200, header: 480 } } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: headerTitle, size: 18, font: FONT }), new TextRun({ children: ['  第 ', PageNumber.CURRENT, ' 页'], size: 18, font: FONT })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [] })] }) },
        children: sectionPage(content),
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  fs.mkdirSync(input.outDir, { recursive: true });
  const file = path.join(input.outDir, `${opts.baseName ?? '用户手册_' + (headerTitle || '未命名')}.docx`);
  fs.writeFileSync(file, buf);
  return file;
}

registerDocxBuilder('user-manual', async (_pages, opts) => {
  const metadata = opts.metadata ?? {};
  const extracted = opts.extracted ?? { summary: '', features: [], install: [], usage: [], extraSections: [] };
  return buildUserManual({ metadata, extracted, outDir: opts.outDir }, opts);
});

export { buildUserManual };
export type { UserManualInput };