import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { CATEGORY_RULES } from '../data/rules';
import type { BindTarget, WasteCategory } from '../types';
import { BindBadge, CategoryChip, StatusBadge, useToast } from '../components/ui';
import { formatTime } from '../lib/analytics';

const PHOTO_OPTIONS: Record<WasteCategory, string[]> = {
  wet: ['🥬🛍️', '🦴🥬', '🥡💧', '📷'],
  recyclable: ['🍱♻️', '📦♻️', '🍶♻️', '📷'],
  hazardous: ['🔋☣️', '💊🗑️', '💡☣️', '📷'],
  bulky: ['🛋️🚫', '🧊🚫', '🚪🚫', '📷'],
  residual: ['🗑️🛍️', '📷', '📷', '📷'],
};

export default function SupervisePage({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const { sites, buildings, residents, events, addEvent } = useStore();
  const toast = useToast();

  const [siteId, setSiteId] = useState(sites[0].id);
  const [binCode, setBinCode] = useState(sites[0].bins[0]);
  const [sessionLabel, setSessionLabel] = useState(sites[0].sessions[0].label);
  const [buildingId, setBuildingId] = useState(buildings[0].id);
  const [bindTarget, setBindTarget] = useState<BindTarget>('resident');
  // 初始住户必须取自默认楼栋（1 号楼），避免楼栋与住户默认值不一致
  const [residentId, setResidentId] = useState<string | null>(
    () => residents.find((r) => r.buildingId === buildings[0].id)?.id ?? null,
  );
  const [category, setCategory] = useState<WasteCategory>('wet');
  const [photo, setPhoto] = useState(PHOTO_OPTIONS.wet[0]);
  const [note, setNote] = useState('');
  const [persuaded, setPersuaded] = useState(true);
  const [cooperated, setCooperated] = useState<boolean | null>(true);
  const [filter, setFilter] = useState<'all' | 'open'>('all');

  const site = sites.find((s) => s.id === siteId)!;
  const rule = CATEGORY_RULES[category];
  const buildingResidents = residents.filter((r) => r.buildingId === buildingId);

  const list = useMemo(() => {
    const sorted = [...events].sort((a, b) => b.time.localeCompare(a.time));
    if (filter === 'open') return sorted.filter((e) => e.status === 'open' || e.status === 'rectifying');
    return sorted;
  }, [events, filter]);

  const changeSite = (id: string) => {
    const s = sites.find((x) => x.id === id)!;
    setSiteId(id);
    setBinCode(s.bins[0]);
    setSessionLabel(s.sessions[0].label);
  };

  const changeCategory = (c: WasteCategory) => {
    setCategory(c);
    setPhoto(PHOTO_OPTIONS[c][0]);
  };

  const changeBuilding = (id: string) => {
    setBuildingId(id);
    // 楼栋切换时：绑定住户模式下同步选中该楼栋第一位住户，杜绝跨楼栋绑定
    if (bindTarget === 'resident') {
      const first = residents.find((r) => r.buildingId === id);
      setResidentId(first?.id ?? null);
    }
  };

  const changeBind = (t: BindTarget) => {
    setBindTarget(t);
    if (t === 'resident') {
      const rs = residents.filter((r) => r.buildingId === buildingId);
      setResidentId(rs[0]?.id ?? null);
    } else setResidentId(null);
  };

  const submit = () => {
    if (bindTarget === 'resident') {
      if (!residentId) {
        toast('该楼栋暂无登记住户，请改为绑定楼栋或匿名事件');
        return;
      }
      // 提交前强校验：住户必须属于所选楼栋，阻止归属/积分/统计写错对象
      const chosen = residents.find((r) => r.id === residentId);
      if (!chosen || chosen.buildingId !== buildingId) {
        const first = residents.find((r) => r.buildingId === buildingId);
        setResidentId(first?.id ?? null);
        toast('楼栋与住户不一致，已按所选楼栋刷新住户，请重新提交');
        return;
      }
    }
    addEvent({
      siteId,
      binCode,
      sessionLabel,
      buildingId,
      residentId: bindTarget === 'resident' ? residentId : null,
      bindTarget,
      category,
      photo: photo === '📷' ? `${rule.emoji}📷` : photo,
      note: note || '督导员现场登记（无补充说明）',
      persuaded,
      cooperated: persuaded ? cooperated : null,
    });
    toast('误投事件已登记，证据已绑定并进入待整改');
    setNote('');
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 4fr)', alignItems: 'start' }}>
      {/* 左：登记表单 */}
      <div className="stack">
        <div className="card">
          <h2>📋 督导误投登记</h2>
          <div className="form-row">
            <div className="field">
              <label>投放点</label>
              <select value={siteId} onChange={(e) => changeSite(e.target.value)}>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.location}）
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>桶位</label>
              <select value={binCode} onChange={(e) => setBinCode(e.target.value)}>
                {site.bins.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="field">
              <label>投放时段</label>
              <select value={sessionLabel} onChange={(e) => setSessionLabel(e.target.value)}>
                {site.sessions.map((s) => (
                  <option key={s.label}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>居民楼栋</label>
              <select value={buildingId} onChange={(e) => changeBuilding(e.target.value)}>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>垃圾类型（决定处置要求与后续流向）</label>
            <div className="pill-radio">
              {(['wet', 'recyclable', 'hazardous', 'bulky', 'residual'] as WasteCategory[]).map((c) => (
                <label key={c} className={category === c ? 'checked' : ''}>
                  <input type="radio" name="cat" checked={category === c} onChange={() => changeCategory(c)} />
                  {CATEGORY_RULES[c].emoji} {CATEGORY_RULES[c].name}
                </label>
              ))}
            </div>
          </div>

          {/* 规则联动面板 */}
          <div style={{ background: rule.bg, border: `1px solid ${rule.color}33`, borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong style={{ color: rule.color }}>
                {rule.emoji} {rule.name} · {rule.binColor}
              </strong>
              <span className="small muted">常见误投：{rule.commonMistakes.join('；')}</span>
            </div>
            <div className="grid grid-2" style={{ marginTop: 8, gap: 10 }}>
              <div>
                <div className="section-tag" style={{ background: '#fff', color: rule.color }}>
                  现场处置要求
                </div>
                <ul className="plain small" style={{ marginTop: 6 }}>
                  {rule.handling.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="section-tag" style={{ background: '#fff', color: rule.color }}>
                  后续流向
                </div>
                <div className="flow-steps" style={{ marginTop: 8 }}>
                  {rule.flow.map((f, i) => (
                    <span key={f}>
                      <span className="flow-step">{f}</span>
                      {i < rule.flow.length - 1 && <span className="flow-arrow">→</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>误投照片（演示用示意图，可点击切换）</label>
            <div className="row">
              <div className="photo-box small" style={{ cursor: 'default' }}>
                {photo === '📷' ? rule.emoji : photo}
              </div>
              <div className="row">
                {PHOTO_OPTIONS[category].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`btn btn-sm ${photo === p ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setPhoto(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div className="hint">演示环境以表情符号代替真实照片上传；生产环境此处对接拍照/相册上传。</div>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>证据绑定方式</label>
            <div className="pill-radio">
              {(
                [
                  ['resident', '绑定住户（扫码可识别）'],
                  ['building', '绑定楼栋（不指明住户）'],
                  ['anonymous', '匿名事件'],
                ] as [BindTarget, string][]
              ).map(([v, label]) => (
                <label key={v} className={bindTarget === v ? 'checked' : ''}>
                  <input type="radio" checked={bindTarget === v} onChange={() => changeBind(v)} />
                  {label}
                </label>
              ))}
            </div>
            {bindTarget === 'resident' && (
              <div className="field" style={{ marginTop: 8 }}>
                <select
                  value={residentId ?? ''}
                  onChange={(e) => setResidentId(e.target.value || null)}
                >
                  {buildingResidents.length === 0 && <option value="">该楼栋暂无登记住户</option>}
                  {buildingResidents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.room} · {r.qrCode}
                    </option>
                  ))}
                </select>
                <div className="hint">
                  绑定住户：误投暂记并冻结积分，复查与教育完成后恢复；绑定楼栋 / 匿名事件不影响个人积分。
                </div>
              </div>
            )}
          </div>

          <div className="form-row">
            <div className="field">
              <label>是否当场劝导</label>
              <div className="pill-radio">
                <label className={persuaded ? 'checked' : ''}>
                  <input type="radio" checked={persuaded} onChange={() => setPersuaded(true)} />
                  已劝导
                </label>
                <label className={!persuaded ? 'checked' : ''}>
                  <input type="radio" checked={!persuaded} onChange={() => setPersuaded(false)} />
                  未能劝导
                </label>
              </div>
            </div>
            <div className="field">
              <label>居民是否配合</label>
              <div className="pill-radio">
                <label className={cooperated === true ? 'checked' : ''} style={{ opacity: persuaded ? 1 : 0.45 }}>
                  <input
                    type="radio"
                    disabled={!persuaded}
                    checked={cooperated === true}
                    onChange={() => setCooperated(true)}
                  />
                  配合
                </label>
                <label className={cooperated === false ? 'checked' : ''} style={{ opacity: persuaded ? 1 : 0.45 }}>
                  <input
                    type="radio"
                    disabled={!persuaded}
                    checked={cooperated === false}
                    onChange={() => setCooperated(false)}
                  />
                  不配合
                </label>
              </div>
            </div>
          </div>

          <div className="field full" style={{ marginBottom: 4 }}>
            <label>现场情况说明</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：整袋未破袋、混入外卖餐盒、居民反馈洗手不便……" />
          </div>

          <div className="btn-row">
            <button className="btn btn-primary" onClick={submit}>
              提交误投记录
            </button>
          </div>
        </div>
      </div>

      {/* 右：事件列表 */}
      <div className="card">
        <h2>
          🗂️ 本社区误投事件
          <span className="hint">点击行查看整改 / 清运 / 复查 / 积分闭环</span>
        </h2>
        <div className="row" style={{ marginBottom: 10 }}>
          {(['all', 'open'] as const).map((f) => (
            <button
              key={f}
              className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? '全部' : '待办'}
            </button>
          ))}
          <span className="muted small" style={{ marginLeft: 'auto' }}>
            共 {list.length} 条
          </span>
        </div>
        <div className="stack">
          {list.map((e) => {
            const s = sites.find((x) => x.id === e.siteId)!;
            const b = buildings.find((x) => x.id === e.buildingId);
            const r = residents.find((x) => x.id === e.residentId);
            return (
              <div
                key={e.id}
                onClick={() => onOpenEvent(e.id)}
                style={{
                  border: '1px solid var(--gray-200)',
                  borderRadius: 10,
                  padding: 12,
                  cursor: 'pointer',
                  background: '#fff',
                }}
              >
                <div className="spread">
                  <span className="mono small muted">{e.code}</span>
                  <StatusBadge status={e.status} />
                </div>
                <div className="row" style={{ margin: '6px 0' }}>
                  <CategoryChip category={e.category} size="sm" />
                  <BindBadge target={e.bindTarget} />
                  {e.hauling && <span className="badge badge-red">清运问题</span>}
                </div>
                <div className="small">
                  {s.name} · {e.binCode} · {e.sessionLabel}
                </div>
                <div className="small muted">
                  {b?.name}
                  {r ? ` · ${r.name} ${r.room}` : ''} · {formatTime(e.time)}
                </div>
                <div className="small" style={{ marginTop: 4 }}>
                  {e.note}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
