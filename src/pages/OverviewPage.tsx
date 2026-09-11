import { useStore } from '../store/useStore';
import { causeMeta, computeSiteStats } from '../lib/analytics';
import { CATEGORY_RULES } from '../data/rules';
import { CategoryChip, ProgressBar, QualityBadge, StatusBadge } from '../components/ui';
import { formatTime } from '../lib/analytics';

export default function OverviewPage({
  onNavigate,
  onOpenEvent,
}: {
  onNavigate: (p: string) => void;
  onOpenEvent: (id: string) => void;
}) {
  const { sites, events, archives, watchlist, residents } = useStore();

  const stats = sites.map((site) =>
    computeSiteStats(site, events, archives.find((a) => a.siteId === site.id)),
  );
  const openTasks = events.filter((e) => e.status === 'open' || e.status === 'rectifying').length;
  const closed = events.filter((e) => e.status === 'closed').length;
  const loopRate = events.length ? Math.round((closed / events.length) * 100) : 0;
  const qualities = events.filter((e) => e.hauling).map((e) => e.hauling!.qualityScore);
  const avgQ = qualities.length ? Math.round(qualities.reduce((a, b) => a + b, 0) / qualities.length) : null;
  const frozenResidents = residents.filter((r) => r.frozen).length;

  const recent = [...events].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 6);

  return (
    <div className="stack">
      <div className="grid grid-4">
        <div className="stat accent-amber">
          <div className="label">进行中整改任务</div>
          <div className="value">{openTasks}</div>
          <div className="sub">待整改 / 整改中事件</div>
        </div>
        <div className="stat accent-green">
          <div className="label">闭环率</div>
          <div className="value">{loopRate}%</div>
          <div className="sub">
            {closed} / {events.length} 起事件已闭环
          </div>
        </div>
        <div className="stat accent-red">
          <div className="label">清运平均质量分</div>
          <div className="value">{avgQ ?? '—'}</div>
          <div className="sub">{qualities.length} 次清运反馈</div>
        </div>
        <div className="stat accent-blue">
          <div className="label">专项治理 / 冻结住户</div>
          <div className="value">
            {watchlist.length} / {frozenResidents}
          </div>
          <div className="sub">长期高发点 / 积分冻结中</div>
        </div>
      </div>

      <div className="card">
        <h2>
          📍 投放点整改进度与根因研判
          <span className="hint">社区工作人员据此判断问题来源：居民习惯 / 桶位设计 / 督导缺位 / 物业清洁不足</span>
        </h2>
        <div className="grid grid-3">
          {stats.map((st) => {
            const site = sites.find((s) => s.id === st.siteId)!;
            const cm = causeMeta(st.primaryCause);
            const onWatch = watchlist.some((w) => w.siteId === site.id);
            return (
              <div key={st.siteId} className="card" style={{ margin: 0, padding: 16 }}>
                <div className="spread">
                  <div>
                    <h3 style={{ fontSize: 14.5 }}>{site.name}</h3>
                    <div className="muted small">{site.location}</div>
                  </div>
                  {onWatch && <span className="badge badge-red">专项治理</span>}
                </div>
                <div style={{ margin: '12px 0 6px' }} className="spread small">
                  <span className="muted">整改进度 {st.progress}%</span>
                  <span>
                    {st.doneCount} 闭环 / {st.openCount} 进行中
                  </span>
                </div>
                <ProgressBar value={st.progress} tone={st.progress >= 70 ? 'green' : st.progress >= 40 ? 'amber' : 'red'} />
                <div className="divider" />
                <div className="kv">
                  <span className="k">近 7 天</span>
                  <span>{st.recentCount} 起误投</span>
                  <span className="k">清运质量</span>
                  <span>{st.avgQuality === null ? '暂无反馈' : <QualityBadge score={st.avgQuality} />}</span>
                  <span className="k">保洁成本</span>
                  <span>累计 ¥{st.totalCleaningCost}</span>
                  <span className="k">主要根因</span>
                  <span className="badge" style={{ background: `${cm.color}1a`, color: cm.color }}>
                    {cm.label}（{st.causes[st.primaryCause]}%）
                  </span>
                </div>
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => onNavigate('sites')}>
                    查看档案
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={() => onNavigate('community')}>
                    研判建议
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>🕓 最新督导事件</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>编号</th>
              <th>时间</th>
              <th>投放点 / 桶位</th>
              <th>类型</th>
              <th>楼栋</th>
              <th>劝导 / 配合</th>
              <th>清运</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((e) => {
              const site = sites.find((s) => s.id === e.siteId)!;
              const b = useStore.getState().buildings.find((x) => x.id === e.buildingId);
              return (
                <tr key={e.id} className="clickable" onClick={() => onOpenEvent(e.id)}>
                  <td className="mono">{e.code}</td>
                  <td className="small">{formatTime(e.time)}</td>
                  <td>
                    {site.name}
                    <div className="muted small">{e.binCode}</div>
                  </td>
                  <td>
                    <CategoryChip category={e.category} size="sm" />
                  </td>
                  <td>{b?.name ?? '—'}</td>
                  <td className="small">
                    {e.persuaded ? (
                      e.cooperated === null ? (
                        <span className="badge badge-gray">已劝导</span>
                      ) : e.cooperated ? (
                        <span className="badge badge-green">已配合</span>
                      ) : (
                        <span className="badge badge-red">不配合</span>
                      )
                    ) : (
                      <span className="badge badge-gray">未劝导</span>
                    )}
                  </td>
                  <td>{e.hauling ? <QualityBadge score={e.hauling.qualityScore} /> : <span className="muted">—</span>}</td>
                  <td>
                    <StatusBadge status={e.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="hint small muted" style={{ marginTop: 8 }}>
          四类垃圾处置规则速览：
          {(['wet', 'recyclable', 'hazardous', 'bulky'] as const).map((c) => (
            <span key={c} className="cat-chip" style={{ background: CATEGORY_RULES[c].bg, color: CATEGORY_RULES[c].color, marginLeft: 8 }}>
              {CATEGORY_RULES[c].emoji} {CATEGORY_RULES[c].name} → {CATEGORY_RULES[c].binColor}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
