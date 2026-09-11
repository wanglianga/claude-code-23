import { useState } from 'react';
import { useStore } from '../store/useStore';
import { buildingPerformance } from '../lib/analytics';
import { CATEGORY_RULES } from '../data/rules';
import { CategoryChip, StatusBadge, BarList } from '../components/ui';
import { formatTime } from '../lib/analytics';

export default function ResidentPage({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const { residents, buildings, events, bulkyAppointments } = useStore();
  const [residentId, setResidentId] = useState(residents[0].id);
  const resident = residents.find((r) => r.id === residentId)!;
  const building = buildings.find((b) => b.id === resident.buildingId)!;

  // 个人近期误投提醒
  const myEvents = events
    .filter((e) => e.residentId === resident.id)
    .sort((a, b) => b.time.localeCompare(a.time));
  const openCount = myEvents.filter((e) => e.status === 'open' || e.status === 'rectifying').length;

  // 本楼栋分类表现
  const perf = buildingPerformance(resident.buildingId, events);
  const buildingEvents = events.filter((e) => e.buildingId === resident.buildingId);
  const catDist = (['wet', 'recyclable', 'hazardous', 'bulky', 'residual'] as const)
    .map((c) => ({ label: `${CATEGORY_RULES[c].emoji} ${CATEGORY_RULES[c].name}`, value: buildingEvents.filter((e) => e.category === c).length }))
    .filter((d) => d.value > 0);

  // 全楼栋对比
  const allPerf = buildings.map((b) => ({ building: b, perf: buildingPerformance(b.id, events) }));
  const maxEvent = Math.max(1, ...allPerf.map((p) => p.perf.eventCount));
  const rank = [...allPerf].sort((a, b) => a.perf.eventCount - b.perf.eventCount).findIndex((p) => p.building.id === building.id) + 1;

  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 4fr) minmax(0, 6fr)', alignItems: 'start' }}>
      {/* 左：扫码身份卡 */}
      <div className="stack">
        <div className="card">
          <h2>📱 居民扫码投放</h2>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>模拟扫描住户二维码（演示选择身份）</label>
            <select value={residentId} onChange={(e) => setResidentId(e.target.value)}>
              {residents.map((r) => {
                const b = buildings.find((x) => x.id === r.buildingId)!;
                return (
                  <option key={r.id} value={r.id}>
                    {r.qrCode} ｜ {b.name} {r.room} {r.name}
                  </option>
                );
              })}
            </select>
          </div>
          <div className="row" style={{ alignItems: 'flex-start', gap: 18 }}>
            <div className="qr-mock" />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>
                {resident.name}
                <span className="muted small" style={{ fontWeight: 400, marginLeft: 8 }}>
                  {building.name} {resident.room}
                </span>
              </div>
              <div className="mono small muted">{resident.qrCode}</div>
              <div style={{ marginTop: 10 }} className="row">
                <div className="stat" style={{ padding: '10px 18px' }}>
                  <div className="label">绿色积分</div>
                  <div className="value" style={{ fontSize: 24, color: resident.frozen ? 'var(--amber)' : 'var(--green)' }}>
                    {resident.points}
                  </div>
                  <div className="sub">本期初始 {resident.baselinePoints}</div>
                </div>
                {resident.frozen ? (
                  <span className="badge badge-amber">积分冻结中 · 待整改复查恢复</span>
                ) : (
                  <span className="badge badge-green">积分正常</span>
                )}
              </div>
            </div>
          </div>
          <div className="divider" />
          <div className="small muted">
            积分规则：正确投放 +2 分；经扫码核实的误投暂记 <strong>-10 分并冻结</strong>，
            完成教育且督导复查通过后，积分恢复、事件闭环。绑定楼栋 / 匿名事件不影响个人积分。
          </div>
        </div>

        {/* 近期误投提醒 */}
        <div className="card">
          <h2>
            🔔 近期误投提醒
            {openCount > 0 && <span className="badge badge-red">{openCount} 起待整改</span>}
          </h2>
          {myEvents.length === 0 && <p className="muted small">近期无误投记录，继续保持 👏</p>}
          <div className="stack">
            {myEvents.map((e) => {
              const site = useStore.getState().sites.find((s) => s.id === e.siteId)!;
              return (
                <div
                  key={e.id}
                  onClick={() => onOpenEvent(e.id)}
                  style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12, cursor: 'pointer' }}
                >
                  <div className="spread">
                    <CategoryChip category={e.category} size="sm" />
                    <StatusBadge status={e.status} />
                  </div>
                  <div className="small" style={{ marginTop: 6 }}>
                    {site.name} · {e.binCode}
                  </div>
                  <div className="small muted">{formatTime(e.time)}</div>
                  <div className="small" style={{ marginTop  : 4 }}>
                    {e.note}
                  </div>
                  <div className="row small" style={{ marginTop: 6 }}>
                    {e.persuaded ? (
                      e.cooperated ? (
                        <span className="badge badge-green">当场配合</span>
                      ) : (
                        <span className="badge badge-red">当场未配合</span>
                      )
                    ) : (
                      <span className="badge badge-gray">未现场劝导</span>
                    )}
                    {e.educationDone && <span className="badge badge-blue">已完成教育</span>}
                    {e.pointsRestored && <span className="badge badge-green">积分已恢复</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 大件预约 */}
        <BulkyResidentCard residentId={resident.id} onOpenEvent={onOpenEvent} />
      </div>

      {/* 右：楼栋表现 */}
      <div className="stack">
        <div className="card">
          <h2>🏢 本楼栋分类表现 · {building.name}</h2>
          <div className="grid grid-3">
            <div className="stat">
              <div className="label">楼栋误投</div>
              <div className="value" style={{ color: 'var(--amber)' }}>{perf.eventCount}</div>
              <div className="sub">{perf.openCount} 起未闭环</div>
            </div>
            <div className="stat">
              <div className="label">劝导配合率</div>
              <div className="value" style={{ color: perf.cooperatingRate >= 70 ? 'var(--green)' : 'var(--red)' }}>
                {perf.cooperatingRate}%
              </div>
              <div className="sub">已劝导住户中配合比例</div>
            </div>
            <div className="stat">
              <div className="label">高发类型</div>
              <div className="value" style={{ fontSize: 18, paddingTop: 6 }}>
                {perf.topCategory ? (
                  <CategoryChip category={perf.topCategory} />
                ) : (
                  <span className="muted" style={{ fontSize: 14 }}>暂无</span>
                )}
              </div>
              <div className="sub">全社区楼栋误投排名第 {rank}（越少越好）</div>
            </div>
          </div>
          <div className="divider" />
          <h3 style={{ fontSize: 13.5, marginBottom: 8 }}>本楼栋误投类型分布</h3>
          <BarList
            data={catDist}
            color="#b45309"
          />
        </div>

        <div className="card">
          <h2>📊 全社区楼栋对比</h2>
          <div className="stack">
            {allPerf.map(({ building: b, perf: p }) => (
              <div key={b.id} style={{ opacity: b.id === building.id ? 1 : 0.75 }}>
                <div className="spread small" style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: b.id === building.id ? 700 : 500 }}>
                    {b.name} {b.id === building.id && '（本楼栋）'}
                  </span>
                  <span className="muted">
                    误投 {p.eventCount} · 配合率 {p.cooperatingRate}%
                  </span>
                </div>
                <div className="progress">
                  <div
                    style={{
                      width: `${(p.eventCount / maxEvent) * 100}%`,
                      background:
                        p.cooperatingRate >= 70 ? 'linear-gradient(90deg,#f59e0b,#b45309)' : 'linear-gradient(90deg,#ef4444,#b91c1c)',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>🎓 教育与改进路径</h2>
          <div className="cause-chain">
            <div className="cause-node done active">
              <div className="cn-title">① 扫码核实</div>
              <div className="cn-sub">督导登记误投并绑定住户</div>
            </div>
            <span className="chain-arrow">→</span>
            <div className="cause-node active">
              <div className="cn-title">② 教育劝导</div>
              <div className="cn-sub">桶边值守 / 楼栋宣导 / 上门指导</div>
            </div>
            <span className="chain-arrow">→</span>
            <div className="cause-node active">
              <div className="cn-title">③ 督导复查</div>
              <div className="cn-sub">复查通过后恢复积分</div>
            </div>
            <span className="chain-arrow">→</span>
            <div className="cause-node active">
              <div className="cn-title">④ 事件闭环</div>
              <div className="cn-sub">记录回流楼栋与点位档案</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BulkyResidentCard({ residentId, onOpenEvent }: { residentId: string; onOpenEvent: (id: string) => void }) {
  const { bulkyAppointments, sites } = useStore();
  const list = bulkyAppointments
    .filter((a) => a.residentId === residentId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const STATUS: Record<string, { text: string; cls: string }> = {
    submitted: { text: '待排期', cls: 'badge-gray' },
    scheduled: { text: '已排期', cls: 'badge-blue' },
    'early-dumped': { text: '提前丢弃·待清运', cls: 'badge-red' },
    completed: { text: '清运完成', cls: 'badge-green' },
  };

  return (
    <div className="card">
      <h2>🛋️ 我的大件预约</h2>
      {list.length === 0 && (
        <p className="muted small">暂未预约大件垃圾。旧家具、床垫、家电请先预约排期，切勿提前堆放在桶边。</p>
      )}
      <div className="stack">
        {list.map((a) => {
          const site = sites.find((s) => s.id === a.siteId)!;
          return (
            <div key={a.id} style={{ border: '1px solid var(--gray-200)', borderRadius: 10, padding: 12 }}>
              <div className="spread">
                <strong className="small">{a.itemName}（{a.volume}m³）</strong>
                <span className={`badge ${STATUS[a.status].cls}`}>{STATUS[a.status].text}</span>
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>
                {a.scheduledDate ? `请于 ${a.scheduledDate} ${a.scheduledSession} 投送至 ${site.name}` : '社区正在排期'}
                ｜ <span className="mono">{a.code}</span>
              </div>
              <div className="small muted" style={{ marginTop: 2 }}>{a.scheduledReason}</div>
              {a.earlyDump && (
                <div className="small" style={{ color: 'var(--red)', marginTop: 4 }}>
                  您提前丢弃的大件已被督导记录，已生成关联误投事件，请配合整改。
                </div>
              )}
              {a.haulResult && (
                <div className="small" style={{ marginTop: 4 }}>
                  清运完成，积分变动
                  <strong style={{ color: a.haulResult.pointsDelta >= 0 ? 'var(--green)' : 'var(--red)', marginLeft: 4 }}>
                    {a.haulResult.pointsDelta >= 0 ? `+${a.haulResult.pointsDelta}` : a.haulResult.pointsDelta}
                  </strong>
                  分（{a.haulResult.cooperationText}）
                </div>
              )}
              {a.earlyDump?.linkedEventId && (
                <button className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={() => onOpenEvent(a.earlyDump!.linkedEventId!)}>
                  查看关联事件
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
