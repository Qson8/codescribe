import type { DocumentType, Metadata } from './types.ts';

/** 文档类型展示名称（中文） */
export const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  'source-program': '源程序鉴别材料',
  'user-manual': '用户手册',
  'design-spec': '设计说明书',
  'application-form': '软件著作权登记申请表',
};

/** 文档类型所需的核心元数据字段（缺失时应提示补充） */
export const DOC_TYPE_REQUIRED_METADATA: Record<DocumentType, ReadonlyArray<keyof Metadata>> = {
  'source-program': ['softwareName', 'version'],
  'user-manual': ['softwareName', 'version', 'description'],
  'design-spec': ['softwareName', 'version', 'description'],
  'application-form': ['softwareName', 'version', 'owner'],
};

export const DEFAULT_DOC_TYPE: DocumentType = 'source-program';

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && value in DOC_TYPE_LABELS;
}

/** 汇总缺失的必填元数据字段，返回缺失字段名列表 */
export function missingMetadata(docType: DocumentType, metadata: Partial<Metadata>): Array<keyof Metadata> {
  const required = DOC_TYPE_REQUIRED_METADATA[docType];
  return required.filter((field) => {
    const value = metadata[field];
    return value === undefined || (typeof value === 'string' && value.trim() === '');
  });
}

/** 从 ProjectConfig 的 title（软件全称+版本号）推导 softwareName 与 version；拆不出时回退。 */
export function splitTitle(title: string): { softwareName: string; version: string } {
  const match = /^(.+?)[\s_]+(?:[vV]?)(\d+(?:\.\d+){1,3}(?:[-.][0-9A-Za-z]+)*)$/.exec(title.trim());
  if (match) return { softwareName: match[1].trim(), version: match[2] };
  return { softwareName: title.trim(), version: '' };
}

/** 构造页眉标题（软件全称 + 版本号），缺失版本号时仅用软件全称 */
export function buildHeaderTitle(metadata: Metadata): string {
  const name = (metadata.softwareName ?? '').trim();
  if (!name) return '';
  const version = (metadata.version ?? '').trim();
  return version ? `${name} ${version}` : name;
}

/** 校验某文档类型的必填元数据是否齐备；返回空数组表示通过。 */
export function validateMetadataFor(docType: DocumentType, metadata: Partial<Metadata>): Array<keyof Metadata> {
  return missingMetadata(docType, metadata);
}