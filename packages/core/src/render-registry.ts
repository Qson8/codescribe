import type { DocumentType, Page } from './types.ts';
import type { RenderOptions } from './render.ts';

/** docx 构建器：将分页结果渲染为 docx 文件并返回路径 */
export type DocxBuilder = (pages: Page[], opts: RenderOptions) => Promise<string>;

const builders = new Map<DocumentType, DocxBuilder>();

/** 注册某文档类型的 docx 构建器；重复注册直接覆盖。 */
export function registerDocxBuilder(type: DocumentType, builder: DocxBuilder): void {
  builders.set(type, builder);
}

/** 取某文档类型的 docx 构建器；未注册返回 undefined。 */
export function getDocxBuilder(type: DocumentType): DocxBuilder | undefined {
  return builders.get(type);
}
