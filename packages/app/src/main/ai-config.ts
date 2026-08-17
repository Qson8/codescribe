import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  DEFAULT_AI_CONFIG, DEFAULT_OLLAMA_BASE_URL, DEFAULT_OLLAMA_MODEL,
  type AiConfig, type AiConfigState, type AiProvider,
} from '../shared/ai-types';

export type { AiConfig, AiConfigState, AiProvider } from '../shared/ai-types';

export const AI_CONFIG_VERSION = 1 as const;
export const AI_CONFIG_NAME = 'ai-config.json';
export const AI_CONFIG_CHANNELS = {
  get: 'settings:ai:get',
  save: 'settings:ai:save',
  reset: 'settings:ai:reset',
} as const;

interface PersistedAiConfig {
  version: typeof AI_CONFIG_VERSION;
  provider: AiProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defaultState(warning: string | null = null): AiConfigState {
  return { config: { ...DEFAULT_AI_CONFIG }, usingDefaults: true, warning };
}

/** 隐藏密钥，仅用于日志/UI 脱敏展示 */
export function maskApiKey(apiKey: string): string {
  if (!apiKey) return '';
  return apiKey.length <= 4 ? '****' : `${apiKey.slice(0, 2)}***${apiKey.slice(-2)}`;
}

export function normalizeAiConfig(input: unknown): AiConfig {
  const value = isRecord(input) ? input : {};
  const provider: AiProvider = value.provider === 'ollama' ? 'ollama' : 'openai';
  const baseUrl = typeof value.baseUrl === 'string' ? value.baseUrl.trim() : '';
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : '';
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  return { provider, baseUrl, apiKey, model };
}

function parsePersistedConfig(value: unknown): AiConfig {
  if (!isRecord(value) || value.version !== AI_CONFIG_VERSION) {
    throw new Error('配置结构或版本无效');
  }
  return normalizeAiConfig(value);
}

/** 生效端点：未填时按服务商给默认值 */
export function effectiveAiConfig(config: AiConfig): AiConfig {
  if (config.provider === 'ollama') {
    return {
      ...config,
      baseUrl: config.baseUrl || DEFAULT_OLLAMA_BASE_URL,
      model: config.model || DEFAULT_OLLAMA_MODEL,
    };
  }
  return {
    ...config,
    baseUrl: config.baseUrl || 'https://api.openai.com/v1',
    model: config.model || 'gpt-4o-mini',
  };
}

export function loadAiConfig(configFile: string): AiConfigState {
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const config = parsePersistedConfig(parsed);
    return { config, usingDefaults: false, warning: null };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return defaultState();
    if (error instanceof Error && error.message === '配置结构或版本无效') {
      return defaultState('AI 配置来自更高版本或结构不受支持，当前已恢复默认');
    }
    return defaultState('AI 配置已损坏或无法读取，当前已恢复默认');
  }
}

export function saveAiConfig(configFile: string, input: unknown): AiConfigState {
  const config = normalizeAiConfig(input);
  const persisted: PersistedAiConfig = { version: AI_CONFIG_VERSION, ...config };
  const directory = path.dirname(configFile);
  fs.mkdirSync(directory, { recursive: true });
  const tempFile = path.join(
    directory,
    `.${path.basename(configFile)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  try {
    fs.writeFileSync(tempFile, `${JSON.stringify(persisted, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempFile, configFile);
  } catch (error) {
    try { fs.unlinkSync(tempFile); } catch { /* 临时文件可能尚未创建或已被 rename。 */ }
    throw error;
  }
  return { config, usingDefaults: false, warning: null };
}

export function resetAiConfig(configFile: string): AiConfigState {
  try {
    fs.unlinkSync(configFile);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return defaultState();
}

interface IpcHandleRegistrar {
  handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => unknown;
}

export function registerAiConfigIpc(ipc: IpcHandleRegistrar, configFile: () => string): void {
  ipc.handle(AI_CONFIG_CHANNELS.get, () => loadAiConfig(configFile()));
  ipc.handle(AI_CONFIG_CHANNELS.save, (_event, input: unknown) => saveAiConfig(configFile(), input));
  ipc.handle(AI_CONFIG_CHANNELS.reset, () => resetAiConfig(configFile()));
}
