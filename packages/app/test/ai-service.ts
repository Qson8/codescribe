import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  AI_CONFIG_CHANNELS, effectiveAiConfig, loadAiConfig, maskApiKey, normalizeAiConfig,
  registerAiConfigIpc, resetAiConfig, saveAiConfig,
} from '../src/main/ai-config.ts';
import { generateAiDraft, testAiConnection } from '../src/main/ai-service.ts';
import type { AiConfig } from '../src/shared/ai-types';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codescribe-ai-config-'));
const configFile = path.join(root, 'nested', 'ai-config.json');

// 1. 默认配置
const defaults = loadAiConfig(configFile);
assert.equal(defaults.usingDefaults, true);
assert.equal(defaults.config.provider, 'openai');
assert.equal(defaults.config.apiKey, '');
assert.equal(defaults.warning, null);

// 2. 保存与恢复（trim、规范化）
const saved = saveAiConfig(configFile, {
  provider: 'ollama',
  baseUrl: '  http://127.0.0.1:11434/v1  ',
  apiKey: ' ',
  model: ' qwen2.5:7b ',
});
assert.equal(saved.config.provider, 'ollama');
assert.equal(saved.config.baseUrl, 'http://127.0.0.1:11434/v1');
assert.equal(saved.config.apiKey, '');
assert.equal(saved.config.model, 'qwen2.5:7b');
assert.equal(saved.usingDefaults, false);
assert.deepEqual(loadAiConfig(configFile), saved, '保存后应能从应用配置恢复');
if (process.platform !== 'win32') assert.equal(fs.statSync(configFile).mode & 0o777, 0o600);
assert.deepEqual(fs.readdirSync(path.dirname(configFile)), ['ai-config.json'], '原子保存不应遗留临时文件');

// 3. 默认端点补全
assert.deepEqual(effectiveAiConfig({ provider: 'ollama', baseUrl: '', apiKey: '', model: '' }), {
  provider: 'ollama', baseUrl: 'http://127.0.0.1:11434/v1', apiKey: '', model: 'qwen2.5:7b',
});
assert.deepEqual(effectiveAiConfig({ provider: 'openai', baseUrl: '', apiKey: 'k', model: '' }), {
  provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o-mini',
});

// 4. 损坏与未来版本回退
fs.writeFileSync(configFile, '{broken');
const damaged = loadAiConfig(configFile);
assert.equal(damaged.usingDefaults, true);
assert.match(damaged.warning ?? '', /损坏|无法读取/);
fs.writeFileSync(configFile, JSON.stringify({ version: 99, provider: 'openai' }));
assert.match(loadAiConfig(configFile).warning ?? '', /更高版本|不受支持/);

// 5. reset
assert.deepEqual(resetAiConfig(configFile), { config: { provider: 'openai', baseUrl: '', apiKey: '', model: '' }, usingDefaults: true, warning: null });
assert.equal(fs.existsSync(configFile), false);

// 6. maskApiKey
assert.equal(maskApiKey(''), '');
assert.equal(maskApiKey('abc'), '****');
assert.equal(maskApiKey('sk-abcdefgh1234'), 'sk***34');

// 7. normalizeAiConfig
assert.deepEqual(normalizeAiConfig({ provider: 'ollama', baseUrl: ' x ', apiKey: ' y ', model: ' z ' }), {
  provider: 'ollama', baseUrl: 'x', apiKey: 'y', model: 'z',
});
assert.deepEqual(normalizeAiConfig('bad'), { provider: 'openai', baseUrl: '', apiKey: '', model: '' });

// 8. IPC 注册
type Handler = (event: unknown, ...args: unknown[]) => unknown;
const handlers = new Map<string, Handler>();
registerAiConfigIpc({
  handle(channel, listener) {
    assert.equal(handlers.has(channel), false, `IPC channel ${channel} 不应重复注册`);
    handlers.set(channel, listener);
  },
}, () => configFile);
assert.deepEqual([...handlers.keys()], Object.values(AI_CONFIG_CHANNELS));

// 9. 本地 mock 服务：验证 generateAiDraft / testAiConnection 的真实 HTTP 调用
async function main() {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      if (parsed.messages && parsed.messages.some((m: { role: string }) => m.role === 'user')) {
        const hasCode = body.includes('我的真实源码');
        const hasAnalysis = body.includes('模块清单');
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          choices: [{ message: { content: `# 用户手册草稿\n- 模块：解析成功 ${hasCode} ${hasAnalysis}` } }],
        }));
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'mock 服务应监听');
  const baseUrl = `http://127.0.0.1:${address.port}/v1`;

  const localConfig: AiConfig = { provider: 'openai', baseUrl, apiKey: 'test-key', model: 'mock-model' };
  const testResult = await testAiConnection(localConfig);
  assert.equal(testResult.ok, true, '连接测试应通过');
  const draft = await generateAiDraft({
    config: localConfig,
    docType: 'user-manual',
    metadata: { softwareName: '测试系统', version: 'V1.0', owner: '某公司' },
    analysisSummary: '模块清单：src(2 文件/50 行)；技术栈：typescript',
    codeSnippet: '// 我的真实源码\nexport const x = 1;',
  });
  assert.ok(draft.includes('# 用户手册草稿'), '应拿到 AI 返回的草稿');
  assert.ok(draft.includes('模块：解析成功 true true'), '请求应同时包含源码与静态分析摘要');

  // 10. 错误响应
  const failServer = http.createServer((_req, res) => {
    res.statusCode = 500;
    res.end('boom');
  });
  await new Promise<void>((resolve) => failServer.listen(0, '127.0.0.1', resolve));
  const failAddr = failServer.address();
  assert.ok(failAddr && typeof failAddr === 'object');
  const failResult = await testAiConnection({ ...localConfig, baseUrl: `http://127.0.0.1:${failAddr.port}/v1` });
  assert.equal(failResult.ok, false);
  assert.match(failResult.ok ? '' : failResult.error, /500/);

  server.close();
  failServer.close();

  console.log('✅ ai-config / ai-service 全部通过');
}

void main();