import {
  AlignmentType, Document, Footer, Header, HeadingLevel, Packer,
  PageNumber, Paragraph, TextRun,
} from 'docx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Metadata } from './types.ts';
import type { RenderOptions } from './render.ts';
import { registerDocxBuilder } from './render-registry.ts';
import { buildHeaderTitle } from './doc-type.ts';

const FONT = 'SimSun';

interface DesignSpecInput {
  metadata: Metadata;
  root: string;
  outDir: string;
}

function heading(text: string, level: keyof typeof HeadingLevel): Paragraph {
  return new Paragraph({ heading: HeadingLevel[level], spacing: { before: 240, after: 120 }, children: [new TextRun({ text, bold: true, size: level === 'HEADING_1' ? 32 : 26, font: FONT })] });
}

function para(text: string, size = 21): Paragraph {
  return new Paragraph({ spacing: { after: 120, line: 300 }, children: [new TextRun({ text, size, font: FONT })] });
}

function bullet(text: string): Paragraph {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 300 }, children: [new TextRun({ text, size: 21, font: FONT })] });
}

/** 顶层目录/文件作为模块清单来源 */
function listModules(root: string): string[] {
  const modules: string[] = [];
  try {
    for (const name of fs.readdirSync(root)) {
      if (name.startsWith('.') || ['node_modules', 'dist', 'build', 'out', 'target'].includes(name)) continue;
      modules.push(name);
    }
  } catch {
    /* 目录不可读时忽略 */
  }
  return modules;
}

async function buildDesignSpec(input: DesignSpecInput, opts: RenderOptions): Promise<string> {
  const headerTitle = buildHeaderTitle(input.metadata) || opts.title;
  const font = { name: FONT, eastAsia: FONT } as const;
  const modules = listModules(input.root);
  const languages = (input.metadata.languages ?? '').trim() || '—';
  const environment = (input.metadata.environment ?? '').trim() || '—';

  const cover = [
    new Paragraph({ spacing: { before: 3600 }, children: [new TextRun({ text: '', size: 42, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: headerTitle, bold: true, size: 44, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: '软件设计说明书', bold: true, size: 32, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'Software Design Specification', size: 24, font: FONT })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: `著作权人：${input.metadata.owner ?? '—'}`, size: 22, font: FONT })] }),
  ];

  const content: Paragraph[] = [];
  content.push(heading('1 引言', 'HEADING_1'));
  content.push(heading('1.1 编写目的', 'HEADING_2'));
  content.push(para(`本说明书描述《${headerTitle}》的总体设计、模块划分与数据流，供软件著作权登记及后期维护参考。`));
  content.push(heading('1.2 项目背景', 'HEADING_2'));
  content.push(para(input.metadata.description ?? '本项目为离线生成软件著作权登记申报文档的工具。'));

  content.push(heading('2 总体设计', 'HEADING_1'));
  content.push(heading('2.1 开发环境', 'HEADING_2'));
  content.push(bullet(`开发语言：${languages}`));
  content.push(bullet(`运行环境：${environment}`));
  content.push(heading('2.2 系统模块划分', 'HEADING_2'));
  if (modules.length > 0) {
    modules.forEach((m) => content.push(bullet(m)));
  } else {
    content.push(para('未检测到项目目录结构，请补充模块清单。'));
  }

  content.push(heading('3 模块详细设计', 'HEADING_1'));
  if (modules.length > 0) {
    modules.forEach((m) => {
      content.push(heading(m, 'HEADING_2'));
      content.push(para(`${m} 模块负责系统内对应功能域的实现，与其余模块通过项目内定义的接口协作。`));
    });
  }

  content.push(heading('4 数据流设计', 'HEADING_1'));
  content.push(para('数据在模块间按「输入 → 处理 → 输出」流转。各模块读取项目目录中的源文件或配置，经内部处理后将结果写入输出目录，供下一步骤消费。'));

  content.push(heading('5 用户界面', 'HEADING_1'));
  content.push(para('系统提供向导式操作界面，用户按步骤完成导入、配置、预览与导出。'));

  const doc = new Document({
    styles: { default: { document: { run: { font, size: 21 } } } },
    numbering: { config: [{ reference: 'bullets', levels: [{ level: 0, format: 'bullet', text: '•' }] }] },
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
  const file = path.join(input.outDir, `${opts.baseName ?? '设计说明书_' + (headerTitle || '未命名')}.docx`);
  fs.writeFileSync(file, buf);
  return file;
}

registerDocxBuilder('design-spec', async (_pages, opts) => {
  const root = opts.root ?? process.cwd();
  return buildDesignSpec({ metadata: opts.metadata ?? {}, root, outDir: opts.outDir }, opts);
});

export { buildDesignSpec };
export type { DesignSpecInput };