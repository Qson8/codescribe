export type AiProvider = 'openai' | 'ollama';

export interface AiConfig {
  provider: AiProvider;
  /** OpenAI 兼容服务端点；Ollama 默认 http://127.0.0.1:11434/v1 */
  baseUrl: string;
  /** API Key；Ollama 可留空 */
  apiKey: string;
  model: string;
}

export interface AiConfigState {
  config: AiConfig;
  /** 上次保存/加载是否使用了默认值（未配置） */
  usingDefaults: boolean;
  warning: string | null;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'openai',
  baseUrl: '',
  apiKey: '',
  model: '',
};

export const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434/v1';
export const DEFAULT_OLLAMA_MODEL = 'qwen2.5:7b';

/** 服务端提示词所需的上下文（不含原始代码，代码由 ai:generate 单独发送） */
export interface AiGenerateRequest {
  config: AiConfig;
  docType: 'user-manual' | 'design-spec';
  /** 软件申报元数据（softwareName/version/owner/description/languages 等） */
  metadata: Record<string, string | undefined>;
  /** 静态分析摘要：模块清单、符号、依赖、技术栈 */
  analysisSummary: string;
  /** 已清洗、已脱敏的代码片段（限行数，由调用方截断） */
  codeSnippet: string;
}
