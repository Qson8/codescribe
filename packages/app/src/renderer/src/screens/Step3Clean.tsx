import { useEffect, useState } from 'react';
import { isPro, runProcess, useStore, type CleanToggles } from '../store';
import { unlockStep } from '../wizard-progress';
import type { DocumentType, Metadata } from '@codescribe/core';

const TOGGLES: Array<{ key: keyof CleanToggles; label: string; sub?: string }> = [
  { key: 'removeComments', label: '删除注释' },
  { key: 'removeBlankLines', label: '删除空行' },
  { key: 'maskSensitive', label: '敏感信息脱敏', sub: 'API 密钥 / 密码 / 内网 IP / 手机号' },
  { key: 'wrapLongLines', label: '超长行自动折行' },
];

const DOC_TYPES: Array<{ value: DocumentType; label: string; sub: string; pro?: boolean }> = [
  { value: 'source-program', label: '源程序', sub: '鉴别材料（每页 50 行）' },
  { value: 'user-manual', label: '用户手册', sub: '含封面 / 目录 / 页眉页码', pro: true },
  { value: 'design-spec', label: '设计说明书', sub: '模块清单 / 数据流 / 技术栈', pro: true },
  { value: 'application-form', label: '登记申请表', sub: '标准栏目表格 + 必填校验', pro: true },
];

const METADATA_FIELDS: Array<{ key: keyof Metadata; label: string; placeholder?: string; hint?: string; date?: boolean }> = [
  { key: 'softwareName', label: '软件全称', placeholder: '与申请表完全一致' },
  { key: 'version', label: '版本号', placeholder: '如 1.0' },
  { key: 'shortName', label: '软件简称', placeholder: '选填' },
  { key: 'owner', label: '著作权人', placeholder: '选填，可复用上方著作权人' },
  { key: 'foundedDate', label: '著作权人成立日期', date: true },
  { key: 'completedDate', label: '开发完成日期', date: true },
  { key: 'publishedDate', label: '首次发表日期', date: true },
  { key: 'languages', label: '开发语言', placeholder: '如 TypeScript、Java，逗号分隔' },
  { key: 'environment', label: '开发环境 / 运行平台', placeholder: '如 Windows 11 / Linux 服务器' },
  { key: 'description', label: '软件功能简介', placeholder: '概述功能用途' },
];

export default function Step3Clean() {
  const s = useStore();
  const p = s.processData;
  const progress = s.jobProgress?.jobKind === 'process' ? s.jobProgress : null;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { runProcess(); }, [s.clean]); // eslint-disable-line react-hooks/exhaustive-deps

  const proActive = isPro(s.license);

  const doActivate = async () => {
    if (!code.trim()) { setErr('请输入激活码'); return; }
    setBusy(true); setErr(null);
    const res = await window.cs.licenseActivate(code.trim());
    setBusy(false);
    if (res.ok) {
      s.set({ license: res.status, licenseOpen: false });
    } else {
      setErr(res.error);
    }
  };

  const doDeactivate = async () => {
    setBusy(true);
    const status = await window.cs.licenseDeactivate();
    setBusy(false);
    s.set({ license: status });
  };

  return (
    <div className="step3-clean">
      <div className="step3-controls">
        <div className="step3-controls__scroll" tabIndex={0} aria-label="清洗与排版设置">
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>软件全称 + 版本号 <span style={{ color: 'var(--red)' }}>*</span></div>
            <input className="cs-input" value={s.swName} placeholder="须与申请表完全一致，如：智慧园区巡检管理系统V1.0"
              onChange={(e) => s.set({ swName: e.target.value })} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>将作为每页页眉，与申请表不一致会被退回补正</div>
          </div>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>著作权人名称</div>
            <input className="cs-input" value={s.owner} placeholder="如：某某科技有限公司（用于署名冲突扫描）"
              onChange={(e) => s.set({ owner: e.target.value })} />
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 5 }}>代码中出现与此不一致的 @author / Copyright 会在校验时提示</div>
          </div>

          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 7 }}>文档类型</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {DOC_TYPES.map((t) => {
                const active = s.docType === t.value;
                const proActive = isPro(s.license);
                const locked = t.pro && !proActive;
                const pick = () => {
                  if (locked) { s.set({ licenseOpen: true }); return; }
                  s.set({ docType: t.value, processData: null });
                };
                return (
                  <button key={t.value} type="button" onClick={pick}
                    style={{ textAlign: 'left', padding: '10px 12px', border: `1px solid ${active ? 'var(--accent)' : 'var(--border2)'}`, borderRadius: 9, background: active ? 'var(--accent-soft, var(--panel2))' : 'var(--panel2)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3, opacity: locked && !active ? 0.82 : 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.label}
                      {t.pro && <span style={{ fontSize: 11, fontWeight: 700, color: proActive ? 'var(--green)' : 'var(--accent)', background: proActive ? 'var(--green-soft)' : 'var(--accent-soft)', padding: '1px 6px', borderRadius: 4, letterSpacing: .3 }}>{proActive ? 'PRO' : 'PRO 已锁定'}</span>}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>{t.sub}</span>
                  </button>
                );
              })}
            </div>
            {!isPro(s.license) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, padding: '9px 11px', borderRadius: 8, background: 'var(--accent-soft)', fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.5 }}>
                <span>🔒</span>
                <span>用户手册 / 设计说明书 / 登记申请表属于 Pro 功能。激活后即可导出全套申报文书。</span>
                <button type="button" onClick={() => s.set({ licenseOpen: true })} style={{ flex: 'none', marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>去激活</button>
              </div>
            )}
          </div>

          <div style={{ border: '1px solid var(--border2)', borderRadius: 9, overflow: 'hidden' }}>
            <button type="button" className="step3-layout-toggle" aria-expanded={s.metaOpen} aria-controls="step3-metadata-fields"
              onClick={() => s.set({ metaOpen: !s.metaOpen })}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>软著申报元数据</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>用于用户手册 / 设计说明书 / 申请表</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', transform: `rotate(${s.metaOpen ? 180 : 0}deg)`, transition: 'transform .15s' }}>▼</span>
              </div>
            </button>
            {s.metaOpen && (
              <div id="step3-metadata-fields" style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid var(--border2)' }}>
                {METADATA_FIELDS.map((f) => (
                  <div key={f.key} style={f.date ? { gridColumn: '1 / -1' } : undefined}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{f.label}</div>
                    <input className="cs-input" type={f.date ? 'date' : 'text'}
                      value={s.metadata[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => s.set({ metadata: { ...s.metadata, [f.key]: e.target.value }, processData: null })} />
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
                  这些字段将随项目保存到 .codescribe.json，供各文档模板复用；源程序鉴别材料只需软件全称与版本号
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {TOGGLES.map((t) => {
              const on = s.clean[t.key];
              return (
                <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--border2)', borderRadius: 9, background: 'var(--panel2)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.label}</div>
                    {t.sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{t.sub}</div>}
                  </div>
                  <button type="button" role="switch" aria-checked={on} aria-label={t.label}
                    onClick={() => s.set({ clean: { ...s.clean, [t.key]: !on }, processData: null })}
                    style={{ width: 34, height: 20, padding: 0, border: 0, flex: 'none', borderRadius: 10, background: on ? 'var(--accent)' : 'var(--border)', position: 'relative', cursor: 'pointer', transition: 'background .15s' }}>
                    <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.25)', transition: 'left .15s' }} />
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ border: '1px solid var(--border2)', borderRadius: 9, overflow: 'hidden' }}>
            <button type="button" className="step3-layout-toggle" aria-expanded={s.layoutOpen} aria-controls="step3-layout-options"
              onClick={() => s.set({ layoutOpen: !s.layoutOpen })}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>排版参数</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>宋体 · 10.5pt · 每页 50 行</span>
                <span style={{ fontSize: 11, color: 'var(--text3)', transform: `rotate(${s.layoutOpen ? 180 : 0}deg)`, transition: 'transform .15s' }}>▼</span>
              </div>
            </button>
            {s.layoutOpen && (
              <div id="step3-layout-options" style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, borderTop: '1px solid var(--border2)' }}>
                {[['字体', '宋体'], ['字号', '10.5'], ['行距', '固定值 10.5pt'], ['每页行数', '50']].map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4 }}>{k}</div>
                    <div style={{ height: 30, border: '1px solid var(--border)', borderRadius: 7, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 12, background: 'var(--panel)' }}>{v}</div>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
                  V1 版本按申报通用规范固定；分页由分页符显式控制，不依赖排版凑页
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="step3-controls__footer">
          <button className="btn-primary" disabled={!s.swName.trim() || s.processing}
            onClick={async () => {
              if (!s.processData) await runProcess();
              s.set({ step: 4, maxUnlockedStep: unlockStep(s.maxUnlockedStep, 4), page: 1 });
            }}>
            {s.processing
              ? progress?.stage === 'cleaning' && progress.total > 0
                ? `正在清洗 ${progress.completed}/${progress.total}…`
                : progress?.stage === 'selecting'
                  ? '正在分页…'
                  : progress?.stage === 'auditing'
                    ? '正在校验…'
                    : '正在准备…'
              : '下一步：分页预览'}
          </button>
        </div>
      </div>

      {/* 实时预览 */}
      <div className="step3-preview" tabIndex={0} aria-label="清洗结果实时预览">
        {!p?.preview ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', fontSize: 13 }}>
            {s.processing ? '正在清洗代码…' : '暂无预览'}
          </div>
        ) : (
          <>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 10, fontFamily: 'var(--mono)' }}>预览文件：{p.preview.file}</div>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
              <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', background: 'var(--panel2)', borderBottom: '1px solid var(--border2)' }}>清洗前</div>
              <div style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.75 }}>
                {p.preview.before.map((b) => (
                  <div key={b.n} style={{ display: 'flex', gap: 12, background: b.kind === 'comment' ? 'var(--red-soft)' : 'transparent', borderRadius: 4, padding: '0 6px', margin: '0 -6px' }}>
                    <span style={{ width: 18, textAlign: 'right', color: 'var(--text3)', flex: 'none', userSelect: 'none' }}>{b.n}</span>
                    <span style={{ color: b.kind === 'comment' ? 'var(--red)' : b.masked ? 'var(--orange)' : 'var(--text)', textDecoration: b.kind === 'comment' ? 'line-through' : 'none', whiteSpace: 'pre' }}>{b.text || ' '}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0', color: 'var(--text3)', fontSize: 14 }}>↓ 清洗后</div>
            <div style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden', boxShadow: 'var(--shadow)' }}>
              <div style={{ padding: '8px 14px', fontSize: 11, fontWeight: 600, color: 'var(--green)', background: 'var(--green-soft)', borderBottom: '1px solid var(--border2)', display: 'flex', justifyContent: 'space-between' }}>
                <span>清洗后</span>
                <span style={{ fontWeight: 400 }}>已删 {p.preview.removedComments} 行注释 · {p.preview.removedBlanks} 空行 · 脱敏 {p.preview.masked} 处</span>
              </div>
              <div style={{ padding: '12px 14px', fontFamily: 'var(--mono)', fontSize: 11.5, lineHeight: 1.75 }}>
                {p.preview.after.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12 }}>
                    <span style={{ width: 18, textAlign: 'right', color: 'var(--text3)', flex: 'none', userSelect: 'none' }}>{i + 1}</span>
                    <span style={{ whiteSpace: 'pre', background: a.masked ? 'var(--orange-soft)' : 'transparent', color: a.masked ? 'var(--orange)' : 'var(--text)', borderRadius: 3 }}>{a.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Pro 激活弹窗 */}
      {s.licenseOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,16,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' }} onClick={() => { if (!busy) s.set({ licenseOpen: false }); }}>
          <div style={{ width: 420, maxWidth: 'calc(100vw - 48px)', background: 'var(--panel)', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.35)', padding: 26 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>激活 CodeScribe Pro</div>
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 16 }}>解锁用户手册 / 设计说明书 / 登记申请表导出，一次性买断 99–299 元。激活码请向码著官方索取。</div>
            {proActive ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 9, background: 'var(--green-soft)', fontSize: 12.5, color: 'var(--green)', marginBottom: 14 }}>
                  <span>✓</span>
                  <span>已激活，授权给 <b>{s.license.state === 'active' ? s.license.licensee : ''}</b>{s.license.state === 'active' && s.license.expiresAt ? `（至 ${s.license.expiresAt}）` : '（永久）'}</span>
                </div>
                <button className="btn-primary" type="button" onClick={doDeactivate} disabled={busy} style={{ width: '100%', height: 40, borderRadius: 9, fontSize: 13 }}>{busy ? '处理中…' : '停用本机授权'}</button>
              </div>
            ) : (
              <div>
                <input className="cs-input" value={code} placeholder="粘贴激活码，如 CS.xxxx.yyyy" autoFocus
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void doActivate(); }}
                  style={{ height: 40 }} />
                {err && <div style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 7 }}>{err}</div>}
                <button className="btn-primary" type="button" onClick={doActivate} disabled={busy} style={{ width: '100%', height: 40, borderRadius: 9, fontSize: 13, marginTop: 12 }}>{busy ? '校验中…' : '激活'}</button>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10, lineHeight: 1.6 }}>未持有激活码？可在正式发布页面购买。本机激活仅存储在本机文件中，代码始终不出本机。</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
