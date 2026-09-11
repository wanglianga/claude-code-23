import { useState } from 'react';
import { useStore } from '../store/useStore';
import { causeMeta, computeSiteStats } from '../lib/analytics';
import { CATEGORY_RULES } from '../data/rules';
import { BarList, ColumnChart, CategoryChip, useToast } from '../components/ui';
import type { WasteCategory } from '../types';

type ActionType = 'briefing' | 'guard' | 'bin' | 'door';

export default function CommunityPage({
  onOpenEvent,
  onNavigate,
}: {
  onOpenEvent: (id: string) => void;
  onNavigate: (p: string) => void;
}) {
  const { sites, buildings, events, archives, addBriefing, addGuardDuty, addBinAdjustment, completeEducation, watchlist } =
    useStore();
  const toast = useToast();

  const allStats = sites.map((s) =>
    computeSiteStats(
      s,
      events,
      archives.find((a) => a.siteId === s.id),
    ),
  );

  // ===== 聚合：类型 / 时段 / 楼栋 =====
  const catData = (['wet', 'recyclable', 'hazardous', 'bulky', 'residual'] as WasteCategory[]).map((c) => ({
    label: `${CATEGORY_RULES[c].emoji}${CATEGORY_RULES[c].name.slice(0, 2)}`,
    value: events.filter((e) => e.category === c).length,
  }));

  const sessionMap: Record<string, number> = {};
  events.forEach((e) => (sessionMap[e.sessionLabel] = (sessionMap[e.sessionLabel] ?? 0) + 1));
  const sessionData = Object.entries(sessionMap)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const buildingData = buildings.map((b) => ({
    id: b.id,
    label: b.name,
    value: events.filter((e) => e.buildingId === b.id).length,
    open: events.filter((e) => e.buildingId === b.id && (e.status === 'open' || e.status === 'rectifying')).length,
  }));

  // 居民反馈聚类 → 建议措施
  const feedbacks = events.filter((e) => e.residentFeedback);
  const facilityLike = feedbacks.filter((e) => /灯|标识|看不清|找不到|脏手|远|暗/.test(e.residentFeedback!));
  const habitLike = feedbacks.filter((e) => !/灯|标识|看不清|找不到|脏手|远|暗/.test(e.residentFeedback!));

  return (
    <div className="stack">
      {/* 分析三图 */}
      <div className="grid grid-3">
        <div className="card">
          <h2>🗑️ 按垃圾类型</h2>
          <ColumnChart data={catData} color="linear-gradient(180deg,#86efac,#15803d)" />
          <div className="small muted" style={{ marginTop: 8 }}>
            湿垃圾破袋与有害垃圾封存是本社区两大失分点。
          </div>
        </div>
        <div className="card">
          <h2>🕖 高发时段</h2>
          <BarList data={sessionData} color="#b45309" />
          <div className="small muted" style={{ marginTop: 8 }}>
            桶边值守与宣传应优先压到 Top 时段。
          </div>
        </div>
        <div className="card">
          <h2>🏢 高发楼栋</h2>
          <BarList
            data={buildingData.map((b) => ({ label: b.label, value: b.value }))}
            color="#1d4ed8"
          />
          <div className="small muted" style={{ marginTop: 8 }}>
            橙色条越短越好；点击下方楼栋反馈可直达事件。
          </div>
        </div>
      </div>

      {/* 居民反馈 */}
      <div className="card">
        <h2>
          💬 居民反馈聚类
          <span className="hint">用于区分「该上门沟通」还是「该调整投放设施」</span>
        </h2>
        <div className="grid grid-2">
          <div>
            <div className="section-tag" style={{ marginBottom: 8 }}>设施类反馈（{facilityLike.length}）→ 倾向调整桶位/照明/标识</div>
            <div className="stack">
              {facilityLike.map((e) => (
                <FeedbackLine key={e.id} text={e.residentFeedback!} code={e.code} onClick={() => onOpenEvent(e.id)} />
              ))}
              {facilityLike.length === 0 && <p className="muted small">暂无</p>}
            </div>
          </div>
          <div>
            <div className="section-tag" style={{ marginBottom: 8, background: 'var(--amber-light)', color: 'var(--amber)' }}>
              习惯类反馈（{habitLike.length}）→ 倾向楼栋宣导 / 上门指导
            </div>
            <div className="stack">
              {habitLike.map((e) => (
                <FeedbackLine key={e.id} text={e.residentFeedback!} code={e.code} onClick={() => onOpenEvent(e.id)} />
              ))}
              {habitLike.length === 0 && <p className="muted small">暂无</p>}
            </div>
          </div>
        </div>
      </div>

      {/* 点位决策卡 */}
      <div className="card">
        <h2>
          🧭 逐点位决策：上门沟通 还是 调整设施？
          <span className="hint">根因得分由劝导、配合、清运问题、设施反馈、保洁成本等信号归一化计算</span>
        </h2>
        <div className="stack">
          {sites.map((site) => {
            const st = allStats.find((x) => x.siteId === site.id)!;
            const cm = causeMeta(st.primaryCause);
            return <SiteDecision key={site.id} siteId={site.id} />;
          })}
        </div>
      </div>

      <div className="card">
        <h2>📌 专项治理联动</h2>
        <p className="small muted" style={{ marginBottom: 8 }}>
          近 7 天误投 ≥3 起，或清运均分低于 65 分且清运 ≥2 次的点位自动进入专项治理清单；社区也可人工挂牌。
        </p>
        <div className="row">
          {watchlist.length === 0 && <span className="muted small">当前无高发点位</span>}
          {watchlist.map((w) => {
            const s = sites.find((x) => x.id === w.siteId)!;
            return (
              <span key={w.siteId} className="badge badge-red">
                {s.name} · {w.level}{w.auto ? '（系统识别）' : '（人工挂牌）'}
              </span>
            );
          })}
          <button className="btn btn-outline btn-sm" onClick={() => onNavigate('watchlist')}>
            打开专项治理清单
          </button>
        </div>
      </div>
    </div>
  );

  function SiteDecision({ siteId }: { siteId: string }) {
    const site = sites.find((s) => s.id === siteId)!;
    const st = allStats.find((x) => x.siteId === siteId)!;
    const cm = causeMeta(st.primaryCause);
    const archive = archives.find((a) => a.siteId === siteId);
    const [action, setAction] = useState<ActionType>('briefing');
    const [buildingId, setBuildingId] = useState(buildings[0].id);
    const [text1, setText1] = useState('');
    const [num, setNum] = useState(30);

    const causeRows: { key: keyof typeof st.causes; label: string; color: string }[] = [
      { key: 'habit', label: '居民习惯', color: '#b45309' },
      { key: 'facility', label: '桶位设计', color: '#1d4ed8' },
      { key: 'supervision', label: '督导缺位', color: '#be123c' },
      { key: 'cleaning', label: '物业清洁不足', color: '#0f766e' },
    ];

    const submit = () => {
      const today = new Date().toISOString().slice(0, 10);
      if (action === 'briefing') {
        addBriefing(siteId, buildingId, text1 || '垃圾分类专项宣导', num, today);
        // 同时把该楼栋相关在办事件标记为教育完成（楼栋宣导）
        events
          .filter((e) => e.siteId === siteId && e.buildingId === buildingId && !e.educationDone)
          .forEach((e) => completeEducation(e.id, { type: 'building-briefing', at: today }));
        toast('楼栋宣导已安排，并关联该楼栋在办事件的教育记录');
      } else if (action === 'guard') {
        addGuardDuty(siteId, text1 || '晚高峰 18:00-20:00', '督导员 周敏', '桶边值守提醒', today);
        toast('桶边值守已排入点位档案');
      } else if (action === 'bin') {
        addBinAdjustment(siteId, text1, '依据居民反馈与清运问题调整设施', today);
        toast('桶位调整已记入点位档案');
      } else {
        // 上门指导：选择该点位不配合住户的在办事件
        const target = events.find(
          (e) => e.siteId === siteId && e.cooperated === false && !e.educationDone && e.status !== 'closed',
        );
        if (target) {
          completeEducation(target.id, { type: 'door-visit', at: today });
          toast(`已对事件 ${target.code} 登记上门指导，复查通过后可恢复居民积分`);
        } else toast('该点位暂无需上门的不配合住户事件');
      }
      setText1('');
    };

    return (
      <div style={{ border: '1px solid var(--gray-200)', borderRadius: 12, padding: 16 }}>
        <div className="spread">
          <div>
            <strong>{site.name}</strong>
            <span className="muted small" style={{ marginLeft: 8 }}>{site.location}</span>
          </div>
          <span className="badge" style={{ background: `${cm.color}1a`, color: cm.color }}>
            主要根因：{cm.label}（{st.causes[st.primaryCause]}%）
          </span>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,5fr) minmax(0,5fr)', gap: 16, marginTop: 12 }}>
          <div className="stack">
            {causeRows.map((r) => (
              <div key={r.key}>
                <div className="spread small" style={{ marginBottom: 3 }}>
                  <span className={st.primaryCause === r.key ? '' : 'muted'}>
                    {st.primaryCause === r.key ? '🔸 ' : ''}{r.label}
                  </span>
                  <span>{st.causes[r.key]}%</span>
                </div>
                <div className="progress">
                  <div style={{ width: `${st.causes[r.key]}%`, background: r.color }} />
                </div>
              </div>
            ))}
            <div className="small" style={{ background: 'var(--green-light)', borderRadius: 8, padding: '8px 10px', color: 'var(--green-dark)' }}>
              👉 {st.recommendation}
            </div>
            <div className="small muted">
              信号：{st.total} 起误投（湿 {st.byCategory.wet}/可 {st.byCategory.recyclable}/危 {st.byCategory.hazardous}/大件 {st.byCategory.bulky}）
              ｜清运问题 {Object.values(st.issueCounts).reduce((a, b) => a + b, 0)} 项
              ｜保洁支出 ¥{st.totalCleaningCost}
              ｜已安排值守 {archive?.guardDuties.length ?? 0} 次、宣导 {archive?.briefings.length ?? 0} 场、设施调整 {archive?.binAdjustments.length ?? 0} 次
            </div>
          </div>

          {/* 安排措施 */}
          <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 14 }}>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>安排下一步措施</label>
              <div className="pill-radio">
                {(
                  [
                    ['briefing', '楼栋宣导'],
                    ['door', '上门指导'],
                    ['guard', '桶边值守'],
                    ['bin', '桶位调整'],
                  ] as [ActionType, string][]
                ).map(([v, label]) => (
                  <label key={v} className={action === v ? 'checked' : ''}>
                    <input type="radio" checked={action === v} onChange={() => setAction(v)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {action === 'briefing' && (
              <div className="form-row">
                <div className="field">
                  <label>宣导楼栋</label>
                  <select value={buildingId} onChange={(e) => setBuildingId(e.target.value)}>
                    {buildings.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>参与人数</label>
                  <input type="number" value={num} onChange={(e) => setNum(Number(e.target.value))} />
                </div>
              </div>
            )}
            <div className="field" style={{ marginBottom: 10 }}>
              <label>
                {action === 'briefing' ? '宣导主题' : action === 'guard' ? '值守时段 / 人员' : action === 'bin' ? '调整内容（必填）' : '上门对象'}
              </label>
              <input
                value={text1}
                onChange={(e) => setText1(e.target.value)}
                placeholder={
                  action === 'briefing'
                    ? '如：破袋与棒骨分类误区'
                    : action === 'guard'
                      ? '如：晚高峰 18:00-20:00 / 志愿者郑涛'
                      : action === 'bin'
                        ? '如：湿垃圾桶前移至照明下方，加装洗手装置'
                        : '自动匹配该点位不配合住户的在办事件'
                }
                disabled={action === 'door'}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={action === 'bin' && !text1}>
              确认安排
            </button>
          </div>
        </div>
      </div>
    );
  }
}

function FeedbackLine({ text, code, onClick }: { text: string; code: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        border: '1px solid var(--gray-200)',
        borderRadius: 8,
        padding: '8px 10px',
        background: '#fff',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      「{text}」
      <span className="mono muted small" style={{ marginLeft: 6 }}>{code}</span>
    </button>
  );
}
