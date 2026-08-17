import { effectiveAiConfig, type AiConfig } from './ai-config';
import type { AiGenerateRequest } from '../shared/ai-types';

const REQUEST_TIMEOUT_MS = 120_000;

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** 生成对应文档类型的系统提示词 */
function systemPromptFor(docType: AiGenerateRequest['docType']): string {
  if (docType === 'user-manual') {
    return [
      '你是一名软件著作权登记申报文档撰写专家。请根据提供的软件信息与源码片段，撰写一份【用户手册】，要求：',
      '1. 使用 Markdown 子集：# 一级标题、## 二级标题、- 列表项、普通段落；',
      '2. 结构建议：# 产品简介 / # 功能特性 / # 安装说明 / # 使用说明 / # 免责声明；',
      '3. 内容必须贴合提供的源码与描述，不得编造不存在的功能；',
      '4. 用简体中文，语气客观、正式。',
    ].join('\n');
  }
  return [
    '你是一名软件著作权登记申报文档撰写专家。请根据提供的软件信息、静态分析摘要与源码片段，撰写一份【软件设计说明书】，要求：',
    '1. 使用 Markdown 子集：# 一级标题、## 二级标题、- 列表项、普通段落；',
    '2. 结构建议：# 引言 / # 总体设计（开发环境、模块划分、技术栈）/ # 模块详细设计 / # 数据流设计 / # 用户界面；',
    '3. 模块清单、依赖关系、符号必须依据静态分析摘要，不得虚构；',
    '4. 用简体中文，语气客观、正式。',
  ].join('\n');
}

function userPromptFor(request: AiGenerateRequest): string {
  const { metadata, analysisSummary, codeSnippet, docType } = request;
  const title = metadata.softwareName || '未命名软件';
  const version = metadata.version || 'V1.0';
  const owner = metadata.owner || '（未填写）';
  const description = metadata.description || '（未填写）';
  const languages = metadata.languages || '（未填写）';

  const lines = [
    `软件全称：${title}`,
    `版本：${version}`,
    `著作权人：${owner}`,
    `开发语言：${languages}`,
    `功能简介：${description}`,
    '',
    `文档类型：${docType === 'user-manual' ? '用户手册' : '软件设计说明书'}`,
    '',
    '=== 静态分析摘要 ===',
    analysisSummary || '（未提供）',
    '',
    '=== 已清洗源码片段 ===',
    codeSnippet || '（未提供代码，请基于上述描述撰写）',
  ];
  return lines.join('\n');
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
}

/** 调用 OpenAI 兼容的 chat completions 端点（Ollama 同样兼容）。 */
export async function generateAiDraft(request: AiGenerateRequest): Promise<string> {
  const config = effectiveAiConfig(request.config);
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const body: ChatMessage[] = [
    { role: 'system', content: systemPromptFor(request.docType) },
    { role: 'user', content: userPromptFor(request) },
  ];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: body,
        temperature: 0.4,
        max_tokens: 4096,
        stream: false,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`AI 服务返回 ${response.status}${detail ? `：${detail.slice(0, 300)}` : ''}`);
    }
    const data = (await response.json()) as ChatCompletionResponse;
    if (data.error?.message) throw new Error(`AI 服务错误：${data.error.message}`);
    const content = data.choices?.[0]?.message?.content;
    if (!content || !content.trim()) throw new Error('AI 未返回任何内容，请检查模型配置后重试');
    return content.trim();
  } finally {
    clearTimeout(timer);
  }
}

/** 连接测试：发送一次最小请求验证端点/密钥/模型可用。 */
export async function testAiConnection(config: AiConfig): Promise<{ ok: true; detail: string } | { ok: false; error: string }> {
  const effective = effectiveAiConfig(config);
  const endpoint = `${effective.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (effective.apiKey) headers.Authorization = `Bearer ${effective.apiKey}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: effective.model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        stream: false,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return { ok: false, error: `连接失败（${response.status}）：${detail.slice(0, 200) || '请检查端点地址'}` };
    }
    return { ok: true, detail: `已连通 ${effective.model}（${effective.baseUrl}）` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, error: '连接超时，请检查网络或服务地址' };
    }
    return { ok: false, error: `连接失败：${message}` };
  } finally {
    clearTimeout(timer);
  }
}
