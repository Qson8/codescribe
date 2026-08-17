import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  canResetScanExcludeRules, getScanExcludeRuleErrors, normalizeScanExcludeRule, normalizeScanExcludeRules,
  sameScanExcludeRules, validateScanExcludeRule,
} from '../scan-exclude-rules';
import { checkForUpdates, isPro, toast, useStore } from '../store';
import LicenseModal from './LicenseModal';

const LINKS = {
  author: 'https://github.com/Qson8',
  repository: 'https://github.com/Qson8/codescribe',
  license: 'https://github.com/Qson8/codescribe/blob/main/LICENSE',
  mochi: 'https://github.com/fanbuz/mochi-issue-flow-skill',
} as const;

export default function Settings() {
  const s = useStore();
  const [rules, setRules] = useState<string[]>([]);
  const [savedRules, setSavedRules] = useState<string[]>([]);
  const [ruleSource, setRuleSource] = useState<'default' | 'user'>('default');
  const [ruleWarning, setRuleWarning] = useState<string | null>(null);
  const [ruleLoading, setRuleLoading] = useState(true);
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleLoadError, setRuleLoadError] = useState<string | null>(null);
  const [newRule, setNewRule] = useState('');
  const [newRuleError, setNewRuleError] = useState<string | null>(null);
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const releaseNotesDialogRef = useRef<HTMLDivElement>(null);
  const ruleErrors = useMemo(() => getScanExcludeRuleErrors(rules), [rules]);
  const rulesInvalid = ruleErrors.some(Boolean);
  const rulesDirty = !sameScanExcludeRules(normalizeScanExcludeRules(rules), savedRules);
  const update = s.updateResult;
  const hasUpdate = update?.status === 'available';
  const updateTitle = s.updateChecking
    ? '正在检查 GitHub Release…'
    : hasUpdate
      ? `发现新版本 v${update.latestVersion}`
      : update?.status === 'up-to-date'
        ? '已是最新版本'
        : update?.status === 'error'
          ? '暂时无法检查更新'
          : '检查新版本';
  const updateDetail = s.updateChecking
    ? '只查询公开版本元数据，不会上传项目或源码'
    : hasUpdate
      ? `当前 v${update.currentVersion}${update.publishedAt ? ` · 发布于 ${new Date(update.publishedAt).toLocaleDateString('zh-CN')}` : ''}`
      : update?.status === 'up-to-date'
        ? `当前 v${update.currentVersion} · GitHub 最新 v${update.latestVersion}`
        : update?.status === 'error'
          ? update.message
          : `当前 v${__APP_VERSION__} · 启动时自动检查正式 Release`;

  const handleUpdateAction = async () => {
    if (hasUpdate) {
      try { await window.cs.openExternal(update.releaseUrl); } catch { toast('无法打开 GitHub Release 页面'); }
      return;
    }
    await checkForUpdates(true);
  };

  const applyRuleResult = (result: { rules: string[]; source: 'default' | 'user'; warning: string | null }) => {
    setRules(result.rules);
    setSavedRules(result.rules);
    setRuleSource(result.source);
    setRuleWarning(result.warning);
    setRuleLoadError(null);
  };

  const loadRules = async () => {
    setRuleLoading(true);
    setRuleLoadError(null);
    try {
      applyRuleResult(await window.cs.getScanExcludes());
    } catch (error) {
      setRuleLoadError(error instanceof Error ? error.message : '无法读取排除规则');
    } finally {
      setRuleLoading(false);
    }
  };

  useEffect(() => { void loadRules(); }, []);

  useEffect(() => {
    if (!releaseNotesOpen || !hasUpdate) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = releaseNotesDialogRef.current;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    const focusDialog = window.requestAnimationFrame(() => {
      dialog?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });
    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setReleaseNotesOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusDialog);
      document.removeEventListener('keydown', handleDialogKeyDown);
      previouslyFocused?.focus();
    };
  }, [hasUpdate, releaseNotesOpen]);

  const handleAddRule = (event: FormEvent) => {
    event.preventDefault();
    const result = validateScanExcludeRule(newRule);
    if (result.error) {
      setNewRuleError(result.error);
      return;
    }
    if (rules.some((rule) => normalizeScanExcludeRule(rule) === result.normalized)) {
      setNewRuleError('规则已存在，无需重复添加');
      return;
    }
    setRules((current) => [...current, result.normalized]);
    setNewRule('');
    setNewRuleError(null);
  };

  const handleSaveRules = async () => {
    if (rulesInvalid || !rulesDirty || ruleSaving) return;
    setRuleSaving(true);
    try {
      applyRuleResult(await window.cs.saveScanExcludes(normalizeScanExcludeRules(rules)));
      toast('排除规则已保存，将从下次扫描开始生效');
    } catch (error) {
      toast(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRuleSaving(false);
    }
  };

  const handleResetRules = async () => {
    if (ruleSaving) return;
    setRuleSaving(true);
    try {
      applyRuleResult(await window.cs.resetScanExcludes());
      setNewRule('');
      setNewRuleError(null);
      toast('已恢复内置默认规则，将从下次扫描开始生效');
    } catch (error) {
      toast(`恢复失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRuleSaving(false);
    }
  };

  // ── AI 生成配置 ──────────────────────────────────────────────
  const [aiConfig, setAiConfig] = useState<AiConfig>({ provider: 'openai', baseUrl: '', apiKey: '', model: '' });
  const [aiLoaded, setAiLoaded] = useState(false);
  const [aiDirty, setAiDirty] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<{ ok: boolean; detail: string } | null>(null);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const aiBaseUrl = aiConfig.provider === 'ollama'
    ? (aiConfig.baseUrl || 'http://127.0.0.1:11434/v1')
    : (aiConfig.baseUrl || 'https://api.openai.com/v1');
  const aiModel = aiConfig.model || (aiConfig.provider === 'ollama' ? 'qwen2.5:7b' : 'gpt-4o-mini');

  const loadAi = async () => {
    setAiError(null);
    try {
      const state = await window.cs.getAiConfig();
      setAiConfig(state.config);
      setAiWarning(state.warning);
      setAiDirty(false);
      setAiTestResult(null);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : '无法读取 AI 配置');
    } finally {
      setAiLoaded(true);
    }
  };

  useEffect(() => { void loadAi(); }, []);

  const saveAi = async () => {
    if (aiSaving) return;
    setAiSaving(true);
    try {
      const state = await window.cs.saveAiConfig(aiConfig);
      setAiConfig(state.config);
      setAiWarning(state.warning);
      setAiDirty(false);
      setAiTestResult(null);
      toast('AI 配置已保存');
    } catch (error) {
      toast(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setAiSaving(false);
    }
  };

  const testAi = async () => {
    if (aiTesting) return;
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const result = await window.cs.testAiConnection();
      setAiTestResult({ ok: result.ok, detail: result.ok ? result.detail : result.error });
    } catch (error) {
      setAiTestResult({ ok: false, detail: error instanceof Error ? error.message : '连接测试失败' });
    } finally {
      setAiTesting(false);
    }
  };

  const updateAiConfig = (patch: Partial<AiConfig>) => {
    setAiConfig((current) => ({ ...current, ...patch }));
    setAiDirty(true);
    setAiTestResult(null);
  };

  return (
    <div className="settings-page">
      <div className="settings-shell">
        <header className="settings-heading">
          <button className="btn-ghost settings-heading__back" onClick={() => s.set({ view: 'wizard' })} aria-label="返回工作区">←</button>
          <div>
            <h1>设置</h1>
            <p>管理版本状态、默认规则与应用信息</p>
          </div>
        </header>

        <div className="settings-content">
          <section className={`update-card${hasUpdate ? ' update-card--available' : ''}`} aria-live="polite">
            <div className="update-card__content">
              <div className="update-card__eyebrow">SOFTWARE UPDATE · 软件更新</div>
              <div className="update-card__title">
                {updateTitle}
                {hasUpdate && <span className="update-card__badge">NEW</span>}
              </div>
              <div className="update-card__detail">{updateDetail}</div>
            </div>
            <div className="update-card__actions">
              {hasUpdate && update.notes.length > 0 && (
                <button type="button" className="btn-ghost update-card__notes-action"
                  aria-haspopup="dialog" onClick={() => setReleaseNotesOpen(true)}>
                  更新说明
                </button>
              )}
              <button className={hasUpdate ? 'btn-primary update-card__action' : 'btn-ghost update-card__action'}
                disabled={s.updateChecking} onClick={handleUpdateAction}>
                {s.updateChecking ? '检查中…' : hasUpdate ? '查看并下载' : update?.status === 'up-to-date' ? '重新检查' : '检查更新'}
              </button>
            </div>
          </section>

          <div className="settings-grid">
          <div className="settings-stack">
            <section className="settings-card">
              <div className="settings-rule-heading">
                <div>
                  <div id="scan-exclude-rules" className="settings-card__title">扫描排除规则</div>
                  <div className="settings-card__description">对所有项目生效的目录名或文件 glob</div>
                </div>
                {!ruleLoading && !ruleLoadError && (
                  <span className={`settings-rule-source settings-rule-source--${ruleSource}`}>
                    {ruleSource === 'default' ? '内置默认' : '用户自定义'}
                  </span>
                )}
              </div>

              <div className="settings-rule-note">
                <strong>规则来源</strong>
                <span>此处为应用级规则；项目中的 <code>.gitignore</code> 会独立叠加。文件页的选中状态仅属于当前项目。</span>
              </div>

              {ruleWarning && <div className="settings-rule-warning" role="status">{ruleWarning}</div>}

              {ruleLoading ? (
                <div className="settings-rule-loading" aria-live="polite">正在读取规则…</div>
              ) : ruleLoadError ? (
                <div className="settings-rule-error" role="alert">
                  <span>{ruleLoadError}</span>
                  <button type="button" onClick={() => void loadRules()}>重试</button>
                </div>
              ) : (
                <>
                  <div className="settings-rule-list" role="list" aria-labelledby="scan-exclude-rules">
                    {rules.length === 0 && (
                      <div className="settings-rule-empty">
                        <strong>暂未设置排除规则</strong>
                        <span>扫描时仍会遵循项目自身的 .gitignore</span>
                      </div>
                    )}
                    {rules.map((rule, index) => (
                      <div className={`settings-rule-row${ruleErrors[index] ? ' has-error' : ''}`} role="listitem" key={index}>
                        <span className="settings-rule-row__index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                        <div className="settings-rule-row__field">
                          <input
                            value={rule}
                            aria-label={`排除规则 ${index + 1}`}
                            aria-invalid={Boolean(ruleErrors[index])}
                            onChange={(event) => setRules((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                            onBlur={() => {
                              if (!ruleErrors[index]) setRules((current) => current.map((item, itemIndex) => itemIndex === index ? normalizeScanExcludeRule(item) : item));
                            }}
                          />
                          {ruleErrors[index] && <span role="alert">{ruleErrors[index]}</span>}
                        </div>
                        <button type="button" className="settings-rule-row__delete"
                          aria-label={`删除规则 ${rule || index + 1}`}
                          onClick={() => setRules((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                          删除
                        </button>
                      </div>
                    ))}
                  </div>

                  <form className={`settings-rule-add${newRuleError ? ' has-error' : ''}`} onSubmit={handleAddRule}>
                    <div className="settings-rule-add__field">
                      <input value={newRule} placeholder="例如 packages/*/dist/ 或 *.min.js" aria-label="新增排除规则"
                        aria-invalid={Boolean(newRuleError)}
                        onChange={(event) => { setNewRule(event.target.value); setNewRuleError(null); }} />
                      {newRuleError && <span role="alert">{newRuleError}</span>}
                    </div>
                    <button type="submit" className="btn-ghost">新增</button>
                  </form>

                  <div className="settings-rule-syntax">
                    使用 <code>/</code> 表示目录层级，支持 <code>*</code>、<code>**</code> 和 <code>?</code>；不能填写绝对路径或 <code>..</code>。
                  </div>

                  <div className="settings-rule-footer">
                    <div className="settings-rule-footer__status" aria-live="polite">
                      {rulesDirty ? '有未保存更改' : '已保存'} · 仅从下次扫描开始生效
                    </div>
                    <div className="settings-rule-footer__actions">
                      <button type="button" className="btn-ghost"
                        disabled={ruleSaving || !canResetScanExcludeRules(ruleSource, rulesDirty, ruleWarning)}
                        onClick={() => void handleResetRules()}>恢复默认</button>
                      <button type="button" className="btn-primary" disabled={ruleSaving || rulesInvalid || !rulesDirty}
                        onClick={() => void handleSaveRules()}>{ruleSaving ? '处理中…' : '保存规则'}</button>
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="settings-card">
              <div className="settings-card__title">AI 生成</div>
              <div className="settings-card__description">
                仅用于「用户手册 / 设计说明书」的 AI 生成模式（Pro 功能）。需将已清洗、已脱敏的代码发送到自备的 LLM 服务。
              </div>

              {aiWarning && <div className="settings-rule-warning" role="status">{aiWarning}</div>}
              {aiError && <div className="settings-rule-error" role="alert">{aiError}</div>}
              {!aiLoaded ? (
                <div className="settings-rule-loading" aria-live="polite">正在读取 AI 配置…</div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    {(['openai', 'ollama'] as const).map((provider) => (
                      <button key={provider} type="button" onClick={() => updateAiConfig({ provider })}
                        style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${aiConfig.provider === provider ? 'var(--accent)' : 'var(--border2)'}`, background: aiConfig.provider === provider ? 'var(--accent-soft, var(--panel2))' : 'var(--panel2)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: aiConfig.provider === provider ? 'var(--accent)' : 'var(--text)' }}>
                        {provider === 'openai' ? 'OpenAI 兼容' : 'Ollama 本地'}
                      </button>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>服务地址（Base URL）</div>
                      <input className="cs-input" value={aiConfig.baseUrl} placeholder={aiBaseUrl}
                        aria-label="AI 服务地址"
                        onChange={(event) => updateAiConfig({ baseUrl: event.target.value })} />
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                        {aiConfig.provider === 'ollama' ? 'Ollama 默认：http://127.0.0.1:11434/v1' : 'OpenAI 默认：https://api.openai.com/v1'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>API Key {aiConfig.provider === 'ollama' && <span style={{ color: 'var(--text3)' }}>（本地可留空）</span>}</div>
                      <input className="cs-input" type="password" value={aiConfig.apiKey} placeholder={aiConfig.provider === 'ollama' ? '留空即可' : 'sk-...'}
                        autoComplete="off" aria-label="AI API Key"
                        onChange={(event) => updateAiConfig({ apiKey: event.target.value })} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>模型</div>
                      <input className="cs-input" value={aiConfig.model} placeholder={aiModel}
                        aria-label="AI 模型名称"
                        onChange={(event) => updateAiConfig({ model: event.target.value })} />
                    </div>
                  </div>

                  <div className="settings-rule-syntax">
                    密钥仅保存在本机（userData/ai-config.json，权限 0600）。AI 生成会向该服务发送「已清洗、已脱敏」的代码片段，代码量上限约 8000 行。
                  </div>

                  {aiTestResult && (
                    <div className={`settings-rule-warning${aiTestResult.ok ? '' : ''}`}
                      style={aiTestResult.ok ? { background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 30%, transparent)', padding: '8px 10px', borderRadius: 7, fontSize: 11.5, lineHeight: 1.5 } : undefined}
                      role="status">
                      {aiTestResult.ok ? `✓ ${aiTestResult.detail}` : `✕ ${aiTestResult.detail}`}
                    </div>
                  )}

                  <div className="settings-rule-footer">
                    <div className="settings-rule-footer__status" aria-live="polite">
                      {aiDirty ? '有未保存更改' : '已保存'}
                    </div>
                    <div className="settings-rule-footer__actions">
                      <button type="button" className="btn-ghost" disabled={aiTesting}
                        onClick={() => void testAi()}>
                        {aiTesting ? '测试中…' : '测试连接'}
                      </button>
                      <button type="button" className="btn-primary" disabled={aiSaving || !aiDirty}
                        onClick={() => void saveAi()}>{aiSaving ? '保存中…' : '保存配置'}</button>
                    </div>
                  </div>
                </>
              )}
            </section>

          </div>

          <aside className="settings-info-stack" aria-label="应用信息">
            <section className="settings-card settings-card--privacy">
              <div className="settings-card__title settings-card__title--with-icon">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="var(--green)" strokeWidth="1.4" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="var(--green)" strokeWidth="1.4" /></svg>
                隐私说明
              </div>
              <div className="settings-card__body">
                CodeScribe 的扫描、清洗、脱敏、排版与导出全部在本机完成，您的源代码<span>永远不会离开这台电脑</span>。应用启动或您手动检查更新时，只向 GitHub 请求公开的 Release 版本元数据，不会发送项目路径、源码或配置。<strong>例外</strong>：仅当您在「清洗与排版」中主动选择「AI 生成」模式时，才会把已清洗、已脱敏的代码片段发送到您自己配置的 LLM 服务。
              </div>
            </section>

            <section className="about-card" aria-labelledby="about-codescribe">
              <div className="about-card__header">
                <div style={{ minWidth: 0 }}>
                  <div className="about-card__eyebrow">ABOUT · 关于</div>
                  <div id="about-codescribe" className="about-card__title">CodeScribe</div>
                </div>
                <span className="about-card__version">v{__APP_VERSION__}</span>
              </div>

              <p className="about-card__summary">
                一款免费、离线的软著代码整理工具。希望把繁琐的申报准备，变成一段安心而清晰的本地流程。
              </p>

              <div className="about-card__meta">
                <span className="about-card__free"><span aria-hidden="true" />{isPro(s.license) ? 'Pro 已激活' : '免费版'}</span>
                <button type="button" className="about-card__text-link"
                  onClick={() => s.set({ licenseOpen: true })} aria-label="管理 Pro 授权">
                  {isPro(s.license) ? '管理 Pro' : '升级 Pro'}
                  <span aria-hidden="true">↗</span>
                </button>
                <button type="button" className="about-card__text-link"
                  onClick={() => window.cs.openExternal(LINKS.license)} aria-label="查看 Apache 2.0 许可证">
                  Apache-2.0 许可
                  <span aria-hidden="true">↗</span>
                </button>
              </div>

              <div className="about-card__craft">
                需求拆解与开发推进基于
                <button type="button" className="about-card__text-link"
                  onClick={() => window.cs.openExternal(LINKS.mochi)} aria-label="查看 Mochi Issue Flow skill">
                  Mochi Issue Flow
                  <span aria-hidden="true">↗</span>
                </button>
              </div>

              <div className="about-card__footer">
                <div className="about-card__byline">
                  构建与维护者
                  <button type="button" className="about-card__author"
                    onClick={() => window.cs.openExternal(LINKS.author)} aria-label="查看 Qson8 的 GitHub 主页">
                    @Qson8
                  </button>
                </div>
                <button type="button" className="about-card__github"
                  onClick={() => window.cs.openExternal(LINKS.repository)} aria-label="在 GitHub 查看 CodeScribe 项目">
                  在 GitHub 查看项目
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3 8h9M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </section>

          </aside>
          </div>
        </div>
      </div>

      {releaseNotesOpen && hasUpdate && (
        <div className="settings-dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setReleaseNotesOpen(false);
        }}>
          <div ref={releaseNotesDialogRef} className="settings-dialog" role="dialog" aria-modal="true"
            aria-labelledby="release-notes-title" tabIndex={-1}>
            <div className="settings-dialog__header">
              <div>
                <div className="settings-dialog__eyebrow">RELEASE NOTES</div>
                <h2 id="release-notes-title">v{update.latestVersion} 更新说明</h2>
              </div>
              <button type="button" className="btn-ghost settings-dialog__close"
                onClick={() => setReleaseNotesOpen(false)} aria-label="关闭更新说明">×</button>
            </div>
            <div className="settings-dialog__body" tabIndex={0} role="region" aria-label="更新说明正文">
              <ul>
                {update.notes.map((note, index) => <li key={`${index}-${note}`}>{note}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}
      <LicenseModal />
    </div>
  );
}
