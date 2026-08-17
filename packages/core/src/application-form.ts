import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer,
  PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Metadata } from './types.ts';
import type { RenderOptions } from './render.ts';
import { registerDocxBuilder } from './render-registry.ts';
import { buildHeaderTitle, missingMetadata } from './doc-type.ts';

const FONT = 'SimSun';

interface ApplicationFormInput {
  metadata: Metadata;
  outDir: string;
}

function heading(text: string, level: keyof typeof HeadingLevel): Paragraph {
  return new Paragraph({ heading: HeadingLevel[level], spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true, size: level === 'HEADING_1' ? 32 : 26, font: FONT })] });
}

function para(text: string, size = 21): Paragraph {
  return new Paragraph({ spacing: { after: 120, line: 300 }, children: [new TextRun({ text, size, font: FONT })] });
}

function cell(text: string, opts: { header?: boolean; width?: number } = {}): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { fill: 'EEEEEE' } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.header ?? false, size: 20, font: FONT })] })],
  });
}

/** 软著登记申请表字段（标准栏目） */
function formRows(metadata: Metadata): Array<[string, string]> {
  return [
    ['软件全称', metadata.softwareName ?? ''],
    ['软件简称', metadata.shortName ?? ''],
    ['版本号', metadata.version ?? ''],
    ['著作权人', metadata.owner ?? ''],
    ['开发完成日期', metadata.completedDate ?? ''],
    ['首次发表日期', metadata.publishedDate ?? ''],
    ['著作权人成立日期', metadata.foundedDate ?? ''],
    ['开发语言', metadata.languages ?? ''],
    ['开发环境', metadata.environment ?? ''],
    ['软件功能简介', metadata.description ?? ''],
  ];
}

async function buildApplicationForm(input: ApplicationFormInput, opts: RenderOptions): Promise<string> {
  const headerTitle = buildHeaderTitle(input.metadata) || opts.title;
  const font = { name: FONT, eastAsia: FONT } as const;
  const missing = missingMetadata('application-form', input.metadata);

  const cover = [
    new Paragraph({ spacing: { before: 3200 }, children: [new TextRun({ text: '', size: 42, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: '计算机软件著作权登记申请表', bold: true, size: 40, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: headerTitle, size: 28, font: FONT })] }),
  ];

  const rows = formRows(input.metadata);
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [cell('栏目', { header: true, width: 30 }), cell('内容', { header: true, width: 70 })] }),
      ...rows.map(([label, value]) => new TableRow({ children: [cell(label, { width: 30 }), cell(value || '（待填写）', { width: 70 })] })),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    },
  });

  const content: (Paragraph | Table)[] = [];
  content.push(heading('一、申请信息', 'HEADING_1'));
  content.push(table);
  content.push(heading('二、填写说明', 'HEADING_1'));
  content.push(para('1. 申请表各栏目应与源代码鉴别材料页眉完全一致。'));
  content.push(para('2. 带「（待填写）」栏目请补充后重新生成。'));
  if (missing.length > 0) {
    content.push(para(`缺少必填项：${missing.join('、')}。请在软件著作权申报元数据中补充。`, 22));
  }

  const doc = new Document({
    styles: { default: { document: { run: { font, size: 21 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 720, left: 1200, right: 1200 } } },
        children: cover,
      },
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 720, left: 1200, right: 1200, header: 480 } } },
        headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: headerTitle, size: 18, font: FONT }), new TextRun({ children: ['  第 ', PageNumber.CURRENT, ' 页'], size: 18, font: FONT })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [] })] }) },
        children: content,
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  fs.mkdirSync(input.outDir, { recursive: true });
  const file = path.join(input.outDir, `${opts.baseName ?? '软著申请表_' + (headerTitle || '未命名')}.docx`);
  fs.writeFileSync(file, buf);
  return file;
}

registerDocxBuilder('application-form', async (_pages, opts) => {
  return buildApplicationForm({ metadata: opts.metadata ?? {}, outDir: opts.outDir }, opts);
});

export { buildApplicationForm };
export type { ApplicationFormInput };