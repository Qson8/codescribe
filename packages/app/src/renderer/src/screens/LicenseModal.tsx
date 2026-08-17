import { useState } from 'react';
import { isPro, useStore } from '../store';

/** 激活 / 停用 Pro 的共享弹窗（Step3 与 Settings 共用） */
export default function LicenseModal() {
  const s = useStore();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const proActive = isPro(s.license);

  if (!s.licenseOpen) return null;

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,16,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, backdropFilter: 'blur(2px)' }} onClick={() => { if (!busy) s.set({ licenseOpen: false }); }}>
      <div style={{ width: 520, maxWidth: 'calc(100vw - 48px)', background: 'var(--panel)', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,.35)', padding: 26 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>激活 CodeScribe Pro</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 14 }}>解锁用户手册 / 设计说明书 / 登记申请表导出。激活码请向码著官方索取。</div>

        {!proActive && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div style={{ border: '1px solid var(--border2)', borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>免费版</div>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>¥0<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}> / 永久</span></div>
              <div style={{ fontSize: 11.5, color: 'var(--text3)', lineHeight: 1.7 }}>
                源程序鉴别材料<br />基础清洗与校验<br />无限制导出
              </div>
            </div>
            <div style={{ border: '1px solid var(--accent)', borderRadius: 10, padding: 12, background: 'var(--accent-soft, var(--panel2))' }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--accent)' }}>Pro · 一次性买断 <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: 4, marginLeft: 4 }}>推荐</span></div>
              <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 8 }}>¥99–299<span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}> / 台 · 永久</span></div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.7 }}>
                全部 4 种申报文书<br />用户手册 / 设计说明书 / 申请表<br />按源码行数阶梯定价
              </div>
            </div>
          </div>
        )}

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
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 12, lineHeight: 1.7, padding: '10px 12px', border: '1px dashed var(--border2)', borderRadius: 9 }}>
              如何购买：<br />
              ① 通过微信 / 支付宝向码著官方付款（按代码量阶梯定价 99–299 元）；<br />
              ② 付款备注「码著 Pro + 你的邮箱」；<br />
              ③ 官方人工发码至邮箱，在此粘贴激活。<br />
              服务商 / 批量采购请联系官方洽谈。本机激活仅存于本机，代码始终不出本机。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}