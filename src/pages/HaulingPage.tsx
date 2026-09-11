import { useState } from 'react';
import { useStore, scoreFromIssues } from '../store/useStore';
import { HAULING_ISSUE_LABELS, QualityBadge, CategoryChip, useToast } from '../components/ui';
import { formatTime } from '../lib/analytics';
import type { HaulingIssues } from '../types';

const ISSUE_KEYS: (keyof HaulingIssues)[] = [
  'heavyPollution',
  'wetBagIntact',
  'recyclableInKitchen',
  'hazardousNotSealed',
];

const ISSUE_RULE_HINT: Record<keyof HaulingIssues, string> = {
  heavyPollution: '桶内污染严重 → 自动生成冲洗分拣整改任务并计入物业保洁核查',
  wetBagIntact: '湿垃圾破袋不到位 → 关联督导记录，安排桶边值守与上门指导',
  recyclableInKitchen: '可回收物混入厨余 → 污染可回收物，加强楼栋宣导',
  hazardousNotSealed: '有害垃圾未单独封存 → 红色封存点与夜间标识排查，立即转存登记',
};

export default function HaulingPage({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const { sites, events, hauling, addHaulingFeedback } = useStore();
  const toast = useToast();

  const [siteId, setSiteId] = useState(sites[0].id);
  const [vehicle, setVehicle] = useState('沪环·清 0312');
  const [worker, setWorker] = useState('刘清运');
  const [issues, setIssues] = useState<HaulingIssues>({
    heavyPollution: false,
    wetBagIntact: false,
    recyclableInKitchen: false,
    hazardousNotSealed: false,
  });
  const [note, setNote] = useState('');
  const [linked, setLinked] = useState<string[]>([]);

  const site = sites.find((s) => s.id === siteId)!;
  const candidateEvents = events.filter(
    (e) => e.siteId === siteId && e.status !== 'closed',
  );
  const score = scoreFromIssues(issues);
  const anyIssue = ISSUE_KEYS.some((k) => issues[k]);

  const toggleIssue = (k: keyof HaulingIssues) => setIssues((prev) => ({ ...prev, [k]: !prev[k] }));
  const toggleLinked = (id: string) =>
    setLinked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = () => {
    addHaulingFeedback(siteId, {
      vehicle,
      worker,
      issues,
      note: note || '清运例行反馈',
      qualityScore: score,
      linkedEventIds: linked,
    });
    toast(
      anyIssue
        ? `清运反馈已提交（${score} 分），命中问题已联动整改任务`
        : `清运反馈已提交（${score} 分），本点位清运质量良好`,
    );
    setIssues({ heavyPollution: false, wetBagIntact: false, recyclableInKitchen: false, hazardousNotSealed: false });
    setNote('');
    setLinked([]);
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 5fr)', alignItems: 'start' }}>
      <div className="stack">
        <div className="card">
          <h2>🚚 清运到场反馈登记</h2>
          <div className="form-row">
            <div className="field">
              <label>投放点</label>
              <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setLinked([]); }}>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>清运车辆</label>
              <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>清运人员</label>
              <input value={worker} onChange={(e) => setWorker(e.target.value)} />
            </div>
            <div className="field">
              <label>本次质量分（依据问题自动评定）</label>
              <div style={{ paddingTop: 6 }}>
                <QualityBadge score={score} />
                <span className="small muted" style={{ marginLeft: 8 }}>
                  基础 90 分，命中问题逐项扣分
                </span>
              </div>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>桶内检查（题目规定的四种重点情形）</label>
            <div className="stack" style={{ marginTop: 4 }}>
              {ISSUE_KEYS.map((k) => (
                <label key={k} className="checkbox" style={{ borderColor: issues[k] ? '#fca5a5' : undefined, background: issues[k] ? '#fef2f2' : undefined }}>
                  <input type="checkbox" checked={issues[k]} onChange={() => toggleIssue(k)} />
                  <span>
                    <strong>{HAULING_ISSUE_LABELS[k]}</strong>
                    <span className="muted small"> — {ISSUE_RULE_HINT[k]}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label>关联该点位待闭环督导事件（反馈将挂到事件与点位档案）</label>
          <div className="stack">
              {candidateEvents.length === 0 && <p className="muted small">该点位暂无待闭环事件，反馈将仅计入点位档案。</p>}
              {candidateEvents.map((e) => (
                <label key={e.id} className="checkbox">
                  <input type="checkbox" checked={linked.includes(e.id)} onChange={() => toggleLinked(e.id)} />
                  <CategoryChip category={e.category} size="sm" />
                  <span className="small">
                    <span className="mono">{e.code}</span> · {e.binCode} · {e.note}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="field" style={{ marginBottom: 4 }}>
            <label>清运备注</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：桶底积液、污染纸板重量、已转存红箱……" />
          </div>

          {anyIssue && (
            <div style={{ background: 'var(--red-light)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, color: 'var(--red)' }}>
              ⚠️ 提交后：关联的待整改事件将自动生成/升级整改任务，问题计入该投放点档案并影响长期高发判定。
            </div>
          )}
          <div className="btn-row">
            <button className="btn btn-primary" onClick={submit}>提交清运反馈</button>
          </div>
        </div>
      </div>

      {/* 右：清运记录 */}
      <div className="card">
        <h2>📒 清运反馈记录</h2>
        <div className="stack">
          {hauling.length === 0 && <p className="muted small">暂无清运反馈</p>}
          {[...hauling].sort((a, b) => b.at.localeCompare(a.at)).map((h) => {
            const s = sites.find((x) => x.id === h.siteId)!;
            const hit = ISSUE_KEYS.filter((k) => h.issues[k]);
            return (
              <div key={h.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12 }}>
                <div className="spread">
                  <strong className="small">{s.name}</strong>
                  <QualityBadge score={h.qualityScore} />
                </div>
                <div className="small muted" style={{ margin: '4px 0' }}>
                  {formatTime(h.at)} · {h.vehicle} · {h.worker}
                </div>
                {hit.length > 0 ? (
                  <div className="row">
                    {hit.map((k) => (
                      <span key={k} className="badge badge-red">{HAULING_ISSUE_LABELS[k]}</span>
                    ))}
                  </div>
                ) : (
                  <span className="badge badge-green">未发现问题</span>
                )}
                <div className="small" style={{ marginTop: 6 }}>{h.note}</div>
                {h.linkedEventIds.length > 0 && (
                  <div className="row" style={{ marginTop: 6 }}>
                    {h.linkedEventIds.map((id) => {
                      const e = events.find((x) => x.id === id);
                      return e ? (
                        <button key={id} className="btn btn-outline btn-sm" onClick={() => onOpenEvent(id)}>
                          {e.code}
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
