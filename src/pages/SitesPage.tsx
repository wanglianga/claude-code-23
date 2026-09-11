import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { causeMeta, computeSiteStats, formatTime } from '../lib/analytics';
import { CATEGORY_RULES } from '../data/rules';
import { CategoryChip, ProgressBar, QualityBadge, StatusBadge, useToast } from '../components/ui';

export default function SitesPage({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const { sites, buildings, events, archives, bulkyAppointments, addCleaningCost } = useStore();
  const toast = useToast();
  const [siteId, setSiteId] = useState(sites[0].id);
  const [costAmount, setCostAmount] = useState(120);
  const [costNote, setCostNote] = useState('');

  const site = sites.find((s) => s.id === siteId)!;
  const archive = archives.find((a) => a.siteId === siteId)!;
  const st = computeSiteStats(site, events, archive);
  const cm = causeMeta(st.primaryCause);
  const siteEvents = useMemo(
    () => events.filter((e) => e.siteId === siteId).sort((a, b) => b.time.localeCompare(a.time)),
    [events, siteId],
  );

  // 把宣导 / 值守 / 清运 / 整改汇成同一点位的时间轴
  type TL = { at: string; title: string; meta: string; tone: 'done' | 'warn' | 'bad' | '' };
  const timeline: TL[] = [];
  archive.briefings.forEach((b) =>
    timeline.push({
      at: b.date,
      title: `楼栋宣导（${buildings.find((x) => x.id === b.buildingId)?.name}）`,
      meta: `${b.topic} · ${b.audience} 人参加`,
      tone: 'done',
    }),
  );
  archive.guardDuties.forEach((g) =>
    timeline.push({ at: g.date, title: `桶边值守 · ${g.shift}`, meta: `${g.guarder}｜${g.note}`, tone: 'done' }),
  );
  archive.binAdjustments.forEach((a) =>
    timeline.push({ at: a.date, title: '桶位 / 设施调整', meta: `${a.change}（原因：${a.reason}）`, tone: 'done' }),
  );
  archive.cleaningCosts.forEach((c) =>
    timeline.push({ at: c.date, title: `物业保洁支出 ¥${c.amount}`, meta: c.note, tone: '' }),
  );
  siteEvents.forEach((e) => {
    timeline.push({
      at: e.time,
      title: `${CATEGORY_RULES[e.category].name}误投 ${e.code}`,
      meta: e.note,
      tone: e.status === 'closed' ? 'done' : e.status === 'open' ? 'bad' : 'warn',
    });
    if (e.hauling) {
      const issues = Object.values(e.hauling.issues).filter(Boolean).length;
      timeline.push({
        at: e.hauling.at,
        title: `清运反馈 ${e.hauling.qualityScore} 分${issues ? `（${issues} 类问题）` : ''}`,
        meta: `${e.hauling.vehicle} · ${e.hauling.worker}｜${e.hauling.note}`,
        tone: e.hauling.qualityScore < 65 ? 'bad' : e.hauling.qualityScore < 80 ? 'warn' : 'done',
      });
    }
    if (e.recheck) {
      timeline.push({
        at: e.recheck.at,
        title: e.recheck.passed ? '督导复查通过' : '复查未通过，退回整改',
        meta: `${e.recheck.supervisor}｜${e.recheck.comment}`,
        tone: e.recheck.passed ? 'done' : 'bad',
      });
    }
  });
  // 大件预约：提前丢弃关联、清运完成（含保洁成本与配合评价）
  bulkyAppointments
    .filter((a) => a.siteId === siteId)
    .forEach((a) => {
      if (a.earlyDump) {
        timeline.push({
          at: a.earlyDump.at,
          title: `大件提前丢弃关联：${a.itemName}（${a.code}）`,
          meta: `督导 ${a.earlyDump.supervisor}｜${a.earlyDump.note}`,
          tone: 'bad',
        });
      }
      if (a.haulResult) {
        timeline.push({
          at: a.haulResult.at,
          title: `大件清运完成：${a.itemName} · 保洁 ¥${a.haulResult.cleaningCost}`,
          meta: `${a.haulResult.vehicle} · ${a.haulResult.worker}｜${a.haulResult.cooperationText}｜积分 ${a.haulResult.pointsDelta >= 0 ? '+' : ''}${a.haulResult.pointsDelta}`,
          tone: a.haulResult.cleaningCost >= 200 || a.haulResult.cooperation !== 'cooperative' ? 'warn' : 'done',
        });
      }
    });
  timeline.sort((a, b) => b.at.localeCompare(a.at));

  const submitCost = () => {
    addCleaningCost(siteId, costAmount, costNote || '物业保洁登记', new Date().toISOString().slice(0, 10));
    toast('保洁成本已计入点位档案');
    setCostNote('');
  };

  return (
    <div className="stack">
      <div className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>🗂️ 投放点统一档案</h2>
          <div className="field" style={{ width: 280 }}>
            <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}（{s.location}）
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-4" style={{ marginTop: 14 }}>
          <div className="stat">
            <div className="label">整改进度</div>
            <div className="value" style={{ fontSize: 22 }}>{st.progress}%</div>
            <ProgressBar value={st.progress} tone={st.progress >= 70 ? 'green' : st.progress >= 40 ? 'amber' : 'red'} />
            <div className="sub">{st.doneCount} 闭环 / {st.openCount} 在办</div>
          </div>
          <div className="stat">
            <div className="label">清运平均质量</div>
            <div className="value" style={{ fontSize: 22 }}>{st.avgQuality ?? '—'}</div>
            <div className="sub">{st.haulingCount} 次清运反馈</div>
          </div>
          <div className="stat">
            <div className="label">物业保洁累计成本</div>
            <div className="value" style={{ fontSize: 22, color: 'var(--red)' }}>¥{st.totalCleaningCost}</div>
            <div className="sub">{archive.cleaningCosts.length} 笔登记</div>
          </div>
          <div className="stat">
            <div className="label">研判主要根因</div>
            <div className="value" style={{ fontSize: 16, paddingTop: 4 }}>
              <span className="badge" style={{ background: `${cm.color}1a`, color: cm.color }}>{cm.label}</span>
            </div>
            <div className="sub">{st.recommendation}</div>
          </div>
        </div>

        <div className="divider" />
        <div className="grid grid-3" style={{ gap: 12 }}>
          <MiniStat label="桶位配置" value={site.bins.join(' / ')} />
          <MiniStat label="投放时段" value={site.sessions.map((s) => s.label).join('；')} />
          <MiniStat
            label="清运问题"
            value={`污染 ${st.issueCounts.heavyPollution}｜未破袋 ${st.issueCounts.wetBagIntact}｜可回收混厨余 ${st.issueCounts.recyclableInKitchen}｜有害未封存 ${st.issueCounts.hazardousNotSealed}`}
          />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 6fr) minmax(0, 4fr)', alignItems: 'start' }}>
        {/* 左：时间轴 + 关系 */}
        <div className="stack">
          <div className="card">
            <h2>
              🔗 宣导 → 桶边值守 → 清运反馈 → 整改复查 关系链
              <span className="hint">判断下一步该上门沟通还是调整投放设施</span>
            </h2>
            <ul className="timeline">
              {timeline.map((t, i) => (
                <li key={i} className={t.tone}>
                  <div className="t-title">{t.title}</div>
                  <div className="t-meta">{t.at.length > 10 ? formatTime(t.at) : t.at} · {t.meta}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2>📁 本点位误投事件（整改闭环口径）</h2>
            <table className="tbl">
              <thead>
                <tr>
                  <th>编号</th>
                  <th>类型</th>
                  <th>楼栋/对象</th>
                  <th>清运</th>
                  <th>教育</th>
                  <th>积分</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {siteEvents.map((e) => {
                  const b = buildings.find((x) => x.id === e.buildingId);
                  const resident = useStore.getState().residents.find((r) => r.id === e.residentId);
                  return (
                    <tr key={e.id} className="clickable" onClick={() => onOpenEvent(e.id)}>
                      <td className="mono small">{e.code}</td>
                      <td><CategoryChip category={e.category} size="sm" /></td>
                      <td className="small">
                        {b?.name}
                        <div className="muted">{resident ? `${resident.name} ${resident.room}` : e.bindTarget === 'building' ? '楼栋绑定' : '匿名'}</div>
                      </td>
                      <td>{e.hauling ? <QualityBadge score={e.hauling.qualityScore} /> : <span className="muted">—</span>}</td>
                      <td>
                        {e.educationDone ? (
                          <span className="badge badge-blue">
                            {e.educationType === 'door-visit' ? '上门指导' : e.educationType === 'bin-guidance' ? '桶边值守' : '楼栋宣导'}
                          </span>
                        ) : (
                          <span className="muted small">未完成</span>
                        )}
                      </td>
                      <td>
                        {e.bindTarget !== 'resident' ? (
                          <span className="muted small">不涉及</span>
                        ) : e.pointsRestored ? (
                          <span className="badge badge-green">已恢复</span>
                        ) : (
                          <span className="badge badge-amber">冻结</span>
                        )}
                      </td>
                      <td><StatusBadge status={e.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 右：设施/保洁/宣导值守信息 */}
        <div className="stack">
          <div className="card">
            <h2>🧹 物业保洁成本登记</h2>
            <div className="form-row">
              <div className="field">
                <label>金额（元）</label>
                <input type="number" value={costAmount} onChange={(e) => setCostAmount(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>说明</label>
                <input value={costNote} onChange={(e) => setCostNote(e.target.value)} placeholder="如：桶站深度冲洗" />
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={submitCost}>登记成本</button>
            <div className="divider" />
            <div className="stack">
              {archive.cleaningCosts.map((c, i) => (
                <div key={i} className="spread small" style={{ borderBottom: '1px dashed var(--gray-200)', paddingBottom: 6 }}>
                  <span>{c.date} · {c.note}</span>
                  <strong style={{ color: 'var(--red)' }}>¥{c.amount}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>🛠️ 桶位 / 设施调整记录</h2>
            {archive.binAdjustments.length === 0 && <p className="muted small">暂无调整</p>}
            <div className="stack">
              {archive.binAdjustments.map((a, i) => (
                <div key={i} style={{ background: 'var(--blue-light)', borderRadius: 8, padding: '8px 10px' }}>
                  <div className="small"><strong>{a.date}</strong> · {a.change}</div>
                  <div className="small muted">原因：{a.reason}</div>
                </div>
              ))}
            </div>
            <div className="small muted" style={{ marginTop: 10 }}>
              设施调整可在「社区研判」页根据居民反馈与根因诊断发起。
            </div>
          </div>

          <div className="card">
            <h2>🎓 宣导与值守投入</h2>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="stat" style={{ padding: 12 }}>
                <div className="label">楼栋宣导</div>
                <div className="value" style={{ fontSize: 20 }}>{archive.briefings.length} 场</div>
                <div className="sub">累计 {archive.briefings.reduce((s, b) => s + b.audience, 0)} 人次</div>
              </div>
              <div className="stat" style={{ padding: 12 }}>
                <div className="label">桶边值守</div>
                <div className="value" style={{ fontSize: 20 }}>{archive.guardDuties.length} 班</div>
                <div className="sub">最近：{archive.guardDuties[0]?.date ?? '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '8px 10px' }}>
      <div className="small muted">{label}</div>
      <div className="small" style={{ marginTop: 2 }}>{value}</div>
    </div>
  );
}
