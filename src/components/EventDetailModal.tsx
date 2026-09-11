import { useState } from 'react';
import { useStore } from '../store/useStore';
import { CATEGORY_RULES, EDUCATION_LABELS } from '../data/rules';
import { BindBadge, CategoryChip, HAULING_ISSUE_LABELS, Modal, QualityBadge, StatusBadge, useToast } from './ui';
import { formatTime } from '../lib/analytics';
import type { MisDumpEvent } from '../types';

export default function EventDetailModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const {
    sites,
    buildings,
    residents,
    events,
    bulkyAppointments,
    startRectification,
    completeRectification,
    recheck,
    setResidentFeedback,
    completeEducation,
    restorePoints,
  } = useStore();
  const toast = useToast();
  const event = events.find((e) => e.id === eventId);

  const [measure, setMeasure] = useState('');
  const [assignee, setAssignee] = useState('督导员 周敏');
  const [dueAt, setDueAt] = useState(new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState('');
  const [supervisor, setSupervisor] = useState('周敏');
  const [feedback, setFeedback] = useState('');
  const [eduType, setEduType] = useState<'building-briefing' | 'door-visit' | 'bin-guidance'>('door-visit');

  if (!event) return null;
  const e: MisDumpEvent = event;
  const site = sites.find((s) => s.id === e.siteId)!;
  const building = buildings.find((b) => b.id === e.buildingId);
  const resident = residents.find((r) => r.id === e.residentId);
  const rule = CATEGORY_RULES[e.category];

  const recheckPassed = !!e.recheck?.passed;
  const needsPoints = e.bindTarget === 'resident';
  const closureReady = recheckPassed && !!e.educationDone && (!needsPoints || !!e.pointsRestored);
  const today = new Date().toISOString().slice(0, 10);

  const issueKeys = e.hauling
    ? (Object.keys(e.hauling.issues) as (keyof typeof e.hauling.issues)[]).filter((k) => e.hauling!.issues[k])
    : [];

  return (
    <Modal
      open
      onClose={onClose}
      wide
      title={
        <div className="row">
          <span className="mono">{e.code}</span>
          <StatusBadge status={e.status} />
          <CategoryChip category={e.category} size="sm" />
          <BindBadge target={e.bindTarget} />
        </div>
      }
    >
      {/* 基本信息 */}
      <div className="grid" style={{ gridTemplateColumns: '80px 1fr', gap: 14 }}>
        <div className="photo-box" style={{ width: 80, height: 80, fontSize: 30 }}>{e.photo}</div>
        <div>
          <div className="kv">
            <span className="k">投放点</span>
            <span>{site.name}（{site.location}）</span>
            <span className="k">桶位 / 时段</span>
            <span>{e.binCode} ｜ {e.sessionLabel}</span>
            <span className="k">发生时间</span>
            <span>{formatTime(e.time)}</span>
            <span className="k">楼栋 / 对象</span>
            <span>
              {building?.name}
              {resident ? ` · ${resident.name} ${resident.room}（${resident.qrCode}）` : e.bindTarget === 'building' ? ' · 仅绑定楼栋' : ' · 匿名事件'}
            </span>
            <span className="k">劝导情况</span>
            <span>
              {e.persuaded ? `已当场劝导 · 居民${e.cooperated === null ? '未表态' : e.cooperated ? '配合' : '不配合'}` : '未能当场劝导'}
            </span>
          </div>
        </div>
      </div>
      <div className="small" style={{ marginTop: 10 }}>
        <strong>现场情况：</strong>{e.note}
      </div>

      {/* 规则要求 */}
      <div className="divider" />
      <div style={{ background: rule.bg, borderRadius: 10, padding: '12px 14px' }}>
        <strong style={{ color: rule.color }}>
          {rule.emoji} {rule.name}（{rule.binColor}）处置要求与后续流向
        </strong>
        <div className="grid grid-2" style={{ marginTop: 8, gap: 10 }}>
          <ul className="plain small">
            {rule.handling.map((h) => <li key={h}>{h}</li>)}
          </ul>
          <div className="flow-steps">
            {rule.flow.map((f, i) => (
              <span key={f}>
                <span className="flow-step">{f}</span>
                {i < rule.flow.length - 1 && <span className="flow-arrow">→</span>}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 关联大件预约 */}
      {e.bulkyAppointmentId && (() => {
        const appt = bulkyAppointments.find((a) => a.id === e.bulkyAppointmentId);
        if (!appt) return null;
        return (
          <>
            <div className="divider" />
            <h3 className="small" style={{ marginBottom: 8 }}>🛋️ 关联大件预约</h3>
            <div className="kv small" style={{ background: '#ede9fe', borderRadius: 10, padding: '10px 12px' }}>
              <span className="k">预约编号</span><span className="mono">{appt.code}</span>
              <span className="k">物品</span><span>{appt.itemName}（{appt.volume}m³）</span>
              <span className="k">排期</span><span>{appt.scheduledDate} {appt.scheduledSession}</span>
              <span className="k">提前丢弃</span><span>{appt.earlyDump ? `已关联（${appt.earlyDump.supervisor} 登记）` : '无'}</span>
              {appt.haulResult && (
                <>
                  <span className="k">清运保洁</span><span style={{ color: 'var(--red)', fontWeight: 700 }}>¥{appt.haulResult.cleaningCost}</span>
                  <span className="k">居民配合</span><span>{appt.haulResult.cooperationText}，积分 {appt.haulResult.pointsDelta >= 0 ? '+' : ''}{appt.haulResult.pointsDelta}</span>
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* 清运反馈 */}
      <div className="divider" />
      <h3 className="small" style={{ marginBottom: 8 }}>🚚 清运反馈（影响整改任务与点位档案）</h3>
      {e.hauling ? (
        <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12 }}>
          <div className="spread">
            <QualityBadge score={e.hauling.qualityScore} />
            <span className="small muted">{formatTime(e.hauling.at)} · {e.hauling.vehicle} · {e.hauling.worker}</span>
          </div>
          {issueKeys.length > 0 && (
            <div className="row" style={{ marginTop: 8 }}>
              {issueKeys.map((k) => <span key={k} className="badge badge-red">{HAULING_ISSUE_LABELS[k]}</span>)}
            </div>
          )}
          <div className="small" style={{ marginTop: 6 }}>{e.hauling.note}</div>
        </div>
      ) : (
        <p className="muted small">暂无清运反馈。清运人员可在「清运反馈」页到场登记，污染严重等问题会自动生成整改任务。</p>
      )}

      {/* 居民反馈 */}
      <div className="divider" />
      <h3 className="small" style={{ marginBottom: 8 }}>💬 居民反馈</h3>
      <div className="row">
        <input
          className=""
          style={{ flex: 1, border: '1px solid var(--gray-300)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}
          defaultValue={e.residentFeedback ?? ''}
          placeholder="记录居民说法，用于社区研判（设施问题 or 习惯问题）"
          onChange={(ev) => setFeedback(ev.target.value)}
        />
        <button
          className="btn btn-outline btn-sm"
          onClick={() => {
            setResidentFeedback(e.id, feedback);
            toast('居民反馈已保存');
          }}
        >
          保存反馈
        </button>
      </div>
      {e.residentFeedback && <div className="small muted" style={{ marginTop: 6 }}>已记录：「{e.residentFeedback}」</div>}

      {/* 整改任务 */}
      <div className="divider" />
      <h3 className="small" style={{ marginBottom: 8 }}>🛠️ 整改任务</h3>
      {e.rectification ? (
        <div style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12 }}>
          <div className="kv">
            <span className="k">整改措施</span><span>{e.rectification.measure}</span>
            <span className="k">责任人</span><span>{e.rectification.assignee}</span>
            <span className="k">期限</span><span>{e.rectification.dueAt}</span>
            <span className="k">完成情况</span>
            <span>{e.rectification.completedAt ? `已于 ${e.rectification.completedAt} 完成整改` : '整改进行中'}</span>
          </div>
          {!e.rectification.completedAt && e.status === 'rectifying' && (
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => {
                completeRectification(e.id);
                toast('整改措施已完成，等待督导复查');
              }}
            >
              标记整改完成
            </button>
          )}
        </div>
      ) : (
        <div className="stack">
          <div className="form-row" style={{ marginBottom: 0 }}>
            <div className="field">
              <label>整改措施</label>
              <input value={measure} onChange={(ev) => setMeasure(ev.target.value)} placeholder="如：上门讲解破袋并发放沥水桶" />
            </div>
            <div className="field">
              <label>责任人</label>
              <input value={assignee} onChange={(ev) => setAssignee(ev.target.value)} />
            </div>
          </div>
          <div className="form-row" style={{ marginBottom: 0 }}>
            <div className="field">
              <label>整改期限</label>
              <input type="date" value={dueAt} onChange={(ev) => setDueAt(ev.target.value)} />
            </div>
            <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={!measure}
                onClick={() => {
                  startRectification(e.id, { measure, assignee, dueAt });
                  toast('整改任务已下发');
                }}
              >
                下发整改任务
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 复查 + 教育 + 积分：闭环三条件 */}
      <div className="divider" />
      <h3 className="small" style={{ marginBottom: 8 }}>✅ 闭环条件（复查 · 教育{needsPoints ? ' · 积分恢复' : ''}）</h3>
      <div className="grid grid-3" style={{ gap: 10, marginBottom: 12 }}>
        <ConditionCard ok={recheckPassed} title="督导复查通过" sub={e.recheck ? `${e.recheck.supervisor} · ${formatTime(e.recheck.at)}` : '整改完成后复查'} />
        <ConditionCard ok={!!e.educationDone} title="居民教育完成" sub={e.educationDone ? EDUCATION_LABELS[e.educationType!] + (e.educationAt ? ` · ${e.educationAt}` : '') : '宣导/上门/值守'} />
        {needsPoints && (
          <ConditionCard ok={!!e.pointsRestored} title="居民积分恢复" sub={e.pointsRestored ? '积分已返还并解冻' : `住户 ${resident?.name} 积分冻结中`} />
        )}
      </div>
      {closureReady && e.status === 'closed' && (
        <div style={{ background: 'var(--green-light)', color: 'var(--green-dark)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
          🎉 该事件已完整闭环，整改、复查、教育{needsPoints ? '、积分' : ''}与清运质量均已回到「{site.name}」点位档案。
        </div>
      )}

      {/* 操作区 */}
      {e.status !== 'closed' && (
        <>
          {/* 复查 */}
          {(!recheckPassed || e.status === 'rectifying') && (
            <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div className="form-row" style={{ marginBottom: 8 }}>
                <div className="field">
                  <label>复查督导员</label>
                  <input value={supervisor} onChange={(ev) => setSupervisor(ev.target.value)} />
                </div>
                <div className="field">
                  <label>复查意见</label>
                  <input value={comment} onChange={(ev) => setComment(ev.target.value)} placeholder="如：连续两日正确投放 / 仍发现整袋厨余" />
                </div>
              </div>
              <div className="row">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    recheck(e.id, true, comment || '复查通过', supervisor);
                    toast('复查通过');
                  }}
                >
                  复查通过
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => {
                    recheck(e.id, false, comment || '复查未通过，退回继续整改', supervisor);
                    toast('复查未通过，已退回整改');
                  }}
                >
                  复查不通过（退回整改）
                </button>
              </div>
            </div>
          )}

          {/* 教育 */}
          {!e.educationDone && (
            <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div className="row">
                <div className="field" style={{ width: 180 }}>
                  <label>教育方式</label>
                  <select value={eduType} onChange={(ev) => setEduType(ev.target.value as typeof eduType)}>
                    <option value="door-visit">上门指导</option>
                    <option value="building-briefing">楼栋宣导</option>
                    <option value="bin-guidance">桶边值守</option>
                  </select>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ alignSelf: 'flex-end' }}
                  onClick={() => {
                    completeEducation(e.id, { type: eduType, at: today });
                    toast(`已登记${EDUCATION_LABELS[eduType]}`);
                  }}
                >
                  登记教育完成
                </button>
                <span className="small muted" style={{ alignSelf: 'flex-end' }}>教育记录同时进入点位档案的关系链</span>
              </div>
            </div>
          )}

          {/* 积分恢复 */}
          {needsPoints && !e.pointsRestored && (
            <div style={{ background: 'var(--amber-light)', borderRadius: 10, padding: 12 }}>
              <div className="row">
                <span className="small">
                  住户 <strong>{resident?.name}</strong> 当前 {resident?.points} 分（冻结中）。复查通过后恢复误投暂扣积分。
                </span>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!recheckPassed}
                  title={!recheckPassed ? '需先复查通过' : undefined}
                  onClick={() => {
                    restorePoints(e.id, 10);
                    toast('已恢复 10 分并解除冻结');
                  }}
                >
                  恢复 10 分并解冻
                </button>
              </div>
              {!recheckPassed && <div className="small muted" style={{ marginTop: 6 }}>积分恢复需以督导复查通过为前提。</div>}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

function ConditionCard({ ok, title, sub }: { ok: boolean; title: string; sub: string }) {
  return (
    <div
      style={{
        border: `1px solid ${ok ? '#86efac' : 'var(--gray-300)'}`,
        background: ok ? 'var(--green-light)' : '#fff',
        borderRadius: 10,
        padding: '10px 12px',
      }}
    >
      <div className="small" style={{ fontWeight: 650 }}>
        {ok ? '✅ ' : '⬜ '}
        {title}
      </div>
      <div className="small muted" style={{ marginTop: 2 }}>{sub}</div>
    </div>
  );
}
