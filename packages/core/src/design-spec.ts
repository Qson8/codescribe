import {
  AlignmentType, Document, Footer, Header, HeadingLevel, Packer,
  PageNumber, Paragraph, TextRun,
} from 'docx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Metadata } from './types.ts';
import { DEFAULT_EXTENSIONS, DEFAULT_EXCLUDES } from './types.ts';
import type { RenderOptions } from './render.ts';
import { renderAiDraftDocx } from './ai-draft.ts';
import { registerDocxBuilder } from './render-registry.ts';
import { buildHeaderTitle } from './doc-type.ts';
import { analyzeProject, type ProjectAnalysis } from './analyze.ts';
import { discover } from './discover.ts';

const FONT = 'SimSun';

interface DesignSpecInput {
  metadata: Metadata;
  root: string;
  outDir: string;
  /** 可选：直接传入预计算的静态分析结果，避免重复读取 */
  analysis?: ProjectAnalysis;
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

/** 汇总依赖关系为一句可读的数据流描述 */
function summarizeDataFlow(analysis: ProjectAnalysis): string {
  const flows: string[] = [];
  for (const mod of analysis.modules) {
    if (mod.dependencies.length > 0) {
      flows.push(`${mod.name} → ${mod.dependencies.slice(0, 6).join('、')}`);
    }
  }
  if (flows.length === 0) return '未检测到明确的模块间依赖关系，数据按各模块独立处理后汇入输出。';
  return flows.slice(0, 12).join('；');
}

async function buildDesignSpec(input: DesignSpecInput, opts: RenderOptions): Promise<string> {
  if (opts.aiDraft) return renderAiDraftDocx(opts.aiDraft, input.metadata, opts);
  const headerTitle = buildHeaderTitle(input.metadata) || opts.title;
  const font = { name: FONT, eastAsia: FONT } as const;
  const analysis = input.analysis ?? analyzeProject(discover(input.root, DEFAULT_EXTENSIONS, DEFAULT_EXCLUDES), input.root);
  const languages = (input.metadata.languages ?? '').trim() || (analysis.languageStats.length > 0
    ? analysis.languageStats.slice(0, 6).map((s) => s.lang).join('、')
    : '—');
  const environment = (input.metadata.environment ?? '').trim() || '—';
  const techStack = analysis.techStack;

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
  content.push(para(input.metadata.description ?? analysis.manifest.description ?? '本项目为离线生成软件著作权登记申报文档的工具。'));

  content.push(heading('2 总体设计', 'HEADING_1'));
  content.push(heading('2.1 开发环境', 'HEADING_2'));
  content.push(bullet(`开发语言：${languages}`));
  content.push(bullet(`运行环境：${environment}`));
  content.push(heading('2.2 系统规模', 'HEADING_2'));
  content.push(bullet(`参与申报的源文件共 ${analysis.fileCount} 个，代码约 ${analysis.totalCodeLines.toLocaleString('zh-CN')} 行`));
  if (techStack.length > 0) content.push(bullet(`依赖技术/框架：${techStack.slice(0, 12).join('、')}`));
  if (analysis.entryFiles.length > 0) content.push(bullet(`入口文件：${analysis.entryFiles.slice(0, 5).join('、')}`));
  content.push(heading('2.3 系统模块划分', 'HEADING_2'));
  if (analysis.modules.length > 0) {
    for (const mod of analysis.modules.slice(0, 20)) {
      content.push(bullet(`${mod.name}（${mod.files.length} 个文件，约 ${mod.codeLines.toLocaleString('zh-CN')} 行）`));
    }
  } else {
    content.push(para('未检测到项目目录结构，请补充模块清单。'));
  }

  content.push(heading('3 模块详细设计', 'HEADING_1'));
  if (analysis.modules.length > 0) {
    for (const mod of analysis.modules.slice(0, 20)) {
      content.push(heading(mod.name, 'HEADING_2'));
      if (mod.symbols.length > 0) {
        const classNames = mod.symbols.slice(0, 8);
        const funcs = mod.symbols.slice(8, 24);
        content.push(para(`该模块共 ${mod.files.length} 个文件、约 ${mod.codeLines.toLocaleString('zh-CN')} 行代码，实现${classNames.length > 0 ? '类/结构：' + classNames.join('、') : ''}${funcs.length > 0 ? (classNames.length > 0 ? '，主要函数/导出：' : '主要函数/导出：') + funcs.join('、') : ''}。`));
        if (mod.dependencies.length > 0) {
          content.push(para(`该模块依赖：${mod.dependencies.slice(0, 8).join('、')}。`));
        }
      } else {
        content.push(para(`该模块共 ${mod.files.length} 个文件、约 ${mod.codeLines.toLocaleString('zh-CN')} 行代码，未提取到类或函数声明，请结合源码补充职责描述。`));
      }
      content.push(para(`${mod.name} 模块负责系统内对应功能域的实现，与其余模块通过项目内定义的接口协作。`));
    }
  } else {
    content.push(para('未检测到项目模块，请补充模块清单。'));
  }

  content.push(heading('4 数据流设计', 'HEADING_1'));
  content.push(para('数据在模块间按「输入 → 处理 → 输出」流转。'));
  content.push(para(summarizeDataFlow(analysis)));

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
  return buildDesignSpec({ metadata: opts.metadata ?? {}, root, outDir: opts.outDir, analysis: opts.analysis }, opts);
});

export { buildDesignSpec };
export type { DesignSpecInput };
