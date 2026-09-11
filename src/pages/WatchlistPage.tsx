import { useStore } from '../store/useStore';
import { computeSiteStats, causeMeta } from '../lib/analytics';
import { useToast } from '../components/ui';

export default function WatchlistPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { sites, events, archives, watchlist, removeWatchlist, addWatchlist } = useStore();
  const toast = useToast();

  const rows = sites.map((site) => {
    const st = computeSiteStats(site, events, archives.find((a) => a.siteId === site.id));
    const w = watchlist.find((x) => x.siteId === site.id);
    return { site, st, w };
  });
  const listed = rows.filter((r) => r.w);
  const unlisted = rows.filter((r) => !r.w);

  return (
    <div className="stack">
      <div className="card">
        <h2>
          🚨 长期高发点位专项治理清单
          <span className="hint">规则：近 7 天误投 ≥3 起，或清运均分 &lt;65 且清运 ≥2 次自动纳入；社区可人工挂牌 / 摘牌</span>
        </h2>
        {listed.length === 0 && <p className="muted small">暂无专项治理点位</p>}
        <div className="stack">
          {listed.map(({ site, st, w }) => {
            const cm = causeMeta(st.primaryCause);
            return (
              <div
                key={site.id}
                style={{
                  border: '1px solid #fecaca',
                  background: '#fff7f7',
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div className="spread">
                  <div>
                    <div className="row">
                      <h3 style={{ fontSize: 15 }}>{site.name}</h3>
                      <span className="badge badge-red">{w!.level}治理</span>
                      <span className="badge badge-gray">{w!.auto ? '系统识别' : '人工挂牌'}</span>
                      <span className="muted small">纳入时间 {w!.since}</span>
                    </div>
                    <div className="small muted" style={{ marginTop: 4 }}>{site.location}</div>
                  </div>
                  <div className="row">
                    <button className="btn btn-outline btn-sm" onClick={() => onNavigate('sites')}>
                      查看档案
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        removeWatchlist(site.id);
                        toast('已从专项治理清单摘牌（若仍满足高发规则，刷新后系统会重新识别）');
                        useStore.getState().refreshWatchlist();
                      }}
                    >
                      摘牌
                    </button>
                  </div>
                </div>
                <div className="small" style={{ marginTop: 8 }}>{w!.reason}</div>
                <div className="grid grid-4" style={{ marginTop: 10, gap: 10 }}>
                  <Cell label="近 7 天误投" value={`${st.recentCount} 起`} danger={st.recentCount >= 3} />
                  <Cell label="清运均分" value={st.avgQuality === null ? '—' : `${st.avgQuality}`} danger={(st.avgQuality ?? 100) < 65} />
                  <Cell label="主要根因" value={cm.label} />
                  <Cell label="专项建议" value={st.recommendation} small />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <h2>✅ 未纳入点位（可人工挂牌）</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>投放点</th>
              <th>近 7 天</th>
              <th>清运均分</th>
              <th>整改进度</th>
              <th>根因</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {unlisted.map(({ site, st }) => {
              const cm = causeMeta(st.primaryCause);
              return (
                <tr key={site.id}>
                  <td>
                    {site.name}
                    <div className="muted small">{site.location}</div>
                  </td>
                  <td className={st.recentCount >= 3 ? '' : ''}>{st.recentCount} 起</td>
                  <td>{st.avgQuality ?? '—'}</td>
                  <td>{st.progress}%</td>
                  <td>{cm.label}</td>
                  <td>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        addWatchlist(site.id, '挂牌');
                        toast(`已将 ${site.name} 人工挂牌纳入专项治理`);
                      }}
                    >
                      人工挂牌
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ label, value, danger, small }: { label: string; value: string; danger?: boolean; small?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--gray-200)' }}>
      <div className="small muted">{label}</div>
      <div className={small ? 'small' : ''} style={{ fontWeight: 650, color: danger ? 'var(--red)' : undefined, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
