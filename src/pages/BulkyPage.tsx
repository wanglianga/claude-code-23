import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { BULKY_ITEMS, BULKY_ORDER, COOPERATION_LABELS } from '../data/rules';
import { buildingBriefingFocus, siteDayUsage, suggestSchedule } from '../lib/bulky';
import { ProgressBar, useToast } from '../components/ui';
import type { BulkyAppointment, BulkyHaulResult, BulkyItemType } from '../types';

type Cooperation = BulkyHaulResult['cooperation'];

const STATUS_META: Record<BulkyAppointment['status'], { text: string; cls: string }> = {
  submitted: { text: '待排期', cls: 'badge-gray' },
  scheduled: { text: '已排期', cls: 'badge-blue' },
  'early-dumped': { text: '提前丢弃·待清运', cls: 'badge-red' },
  completed: { text: '清运完成', cls: 'badge-green' },
};

const EARLY_PHOTOS = ['🛋️🚫', '🛏️🚫', '🧊🚫', '🚪🚫', '📷'];

function todayISO(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function BulkyPage({ onOpenEvent }: { onOpenEvent: (id: string) => void }) {
  const {
    role,
    sites,
    buildings,
    residents,
    bulkyAppointments,
    submitBulky,
    linkEarlyDump,
    completeBulkyHaul,
    arrangeBuildingBriefing,
  } = useStore();
  const toast = useToast();

  const bulkySite = sites.find((s) => s.bulkyCapacity)!;

  // ===== 预约表单 =====
  const [buildingId, setBuildingId] = useState(buildings[0].id);
  const [bindResident, setBindResident] = useState(true);
  const [residentId, setResidentId] = useState<string | null>(
    () => residents.find((r) => r.buildingId === buildings[0].id)?.id ?? null,
  );
  const [anonymousName, setAnonymousName] = useState('');
  const [anonymousRoom, setAnonymousRoom] = useState('');
  const [itemType, setItemType] = useState<BulkyItemType>('furniture');
  const [itemName, setItemName] = useState(BULKY_ITEMS.furniture.examples[0]);
  const [volume, setVolume] = useState(BULKY_ITEMS.furniture.defaultVolume);
  const [floor, setFloor] = useState(1);
  const [requestedDate, setRequestedDate] = useState(todayISO(1));
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  const building = buildings.find((b) => b.id === buildingId)!;
  const buildingResidents = residents.filter((r) => r.buildingId === buildingId);

  const suggestion = useMemo(
    () =>
      suggestSchedule({
        site: bulkySite,
        building,
        volume,
        floor,
        requestedDate,
        appointments: bulkyAppointments,
      }),
    [bulkySite, building, volume, floor, requestedDate, bulkyAppointments],
  );

  const usage = useMemo(
    () => siteDayUsage(bulkyAppointments, bulkySite.id, suggestion.feasible ? suggestion.date : requestedDate),
    [bulkyAppointments, bulkySite.id, suggestion, requestedDate],
  );

  const changeBuilding = (id: string) => {
    setBuildingId(id);
    setResidentId(residents.find((r) => r.buildingId === id)?.id ?? null);
  };
  const changeType = (t: BulkyItemType) => {
    setItemType(t);
    setItemName(BULKY_ITEMS[t].examples[0]);
    setVolume(BULKY_ITEMS[t].defaultVolume);
  };

  const submit = () => {
    if (!itemName.trim()) {
      toast('请填写具体物品名称');
      return;
    }
    if (bindResident && !residentId) {
      toast('该楼栋无登记住户，请改为匿名预约');
      return;
    }
    const resident = residents.find((r) => r.id === residentId);
    submitBulky({
      buildingId,
      residentId: bindResident ? residentId : null,
      residentName: bindResident ? resident!.name : anonymousName || '匿名住户',
      room: bindResident ? resident!.room : anonymousRoom || '未登记门牌',
      itemType,
      itemName: itemName.trim(),
      volume,
      floor,
      requestedDate,
    });
    toast(suggestion.feasible ? `预约已提交并排期：${suggestion.date} ${suggestion.session}` : '预约已提交，容量紧张待社区复核排期');
  };

  const list = [...bulkyAppointments].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = filter === 'active' ? list.filter((a) => a.status !== 'completed') : list;
  const monthCost = bulkyAppointments
    .filter((a) => a.haulResult)
    .reduce((s, a) => s + (a.haulResult?.cleaningCost ?? 0), 0);

  return (
    <div className="stack">
      <div className="grid grid-4">
        <div className="stat accent-blue">
          <div className="label">待清运预约</div>
          <div className="value">{bulkyAppointments.filter((a) => a.status !== 'completed').length}</div>
          <div className="sub">已排期 / 待排期 / 提前丢弃</div>
        </div>
        <div className="stat accent-green">
          <div className="label">本月已完成大件清运</div>
          <div className="value">{bulkyAppointments.filter((a) => a.status === 'completed').length}</div>
          <div className="sub">规范投放可获 +5 绿色积分</div>
        </div>
        <div className="stat accent-red">
          <div className="label">提前丢弃</div>
          <div className="value">
            {bulkyAppointments.filter((a) => a.status === 'early-dumped' || a.haulResult?.cooperation === 'early-dumped').length}
          </div>
          <div className="sub">均已/需关联误投事件</div>
        </div>
        <div className="stat accent-amber">
          <div className="label">大件清运保洁成本</div>
          <div className="value">¥{monthCost}</div>
          <div className="sub">随清运完成回流点位档案</div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 5fr)', alignItems: 'start' }}>
        {/* 左：预约 + 容量 */}
        <div className="stack">
          <div className="card">
            <h2>🛋️ 大件垃圾投放预约（旧家具 / 床垫 / 家电）</h2>
            <div className="form-row">
              <div className="field">
                <label>居民楼栋</label>
                <select value={buildingId} onChange={(e) => changeBuilding(e.target.value)}>
                  {buildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}（{b.hasElevator ? '有电梯' : '无电梯'}）
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>楼层</label>
                <input type="number" min={1} max={40} value={floor} onChange={(e) => setFloor(Number(e.target.value))} />
              </div>
            </div>

            <div className="field" style={{ marginBottom: 10 }}>
              <label>预约人</label>
              <div className="pill-radio">
                <label className={bindResident ? 'checked' : ''}>
                  <input type="radio" checked={bindResident} onChange={() => setBindResident(true)} />
                  扫码识别住户
                </label>
                <label className={!bindResident ? 'checked' : ''}>
                  <input type="radio" checked={!bindResident} onChange={() => setBindResident(false)} />
                  匿名预约
                </label>
              </div>
            </div>
            {bindResident ? (
              <div className="field" style={{ marginBottom: 10 }}>
                <select value={residentId ?? ''} onChange={(e) => setResidentId(e.target.value || null)}>
                  {buildingResidents.length === 0 && <option value="">该楼栋无登记住户</option>}
                  {buildingResidents.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.room} · {r.qrCode}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="form-row">
                <div className="field">
                  <label>称呼</label>
                  <input value={anonymousName} onChange={(e) => setAnonymousName(e.target.value)} placeholder="如 新搬入住户" />
                </div>
                <div className="field">
                  <label>门牌号（选填）</label>
                  <input value={anonymousRoom} onChange={(e) => setAnonymousRoom(e.target.value)} placeholder="如 3-402" />
                </div>
              </div>
            )}

            <div className="field" style={{ marginBottom: 10 }}>
              <label>物品类型</label>
              <div className="pill-radio">
                {BULKY_ORDER.map((t) => (
                  <label key={t} className={itemType === t ? 'checked' : ''}>
                    <input type="radio" checked={itemType === t} onChange={() => changeType(t)} />
                    {BULKY_ITEMS[t].emoji} {BULKY_ITEMS[t].name}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <div className="field">
                <label>具体物品</label>
                <input value={itemName} onChange={(e) => setItemName(e.target.value)} />
                <div className="hint">常见：{BULKY_ITEMS[itemType].examples.join('、')}</div>
              </div>
              <div className="field">
                <label>估算体积（m³）</label>
                <input
                  type="number"
                  step={0.1}
                  min={0.1}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 10 }}>
              <label>期望投放日期</label>
              <input type="date" value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} />
            </div>

            {/* 调度建议面板 */}
            <div
              style={{
                background: suggestion.feasible ? 'var(--green-light)' : 'var(--amber-light)',
                borderRadius: 10,
                padding: '12px 14px',
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 650, color: suggestion.feasible ? 'var(--green-dark)' : 'var(--amber)' }}>
                {suggestion.feasible ? '✅ 系统排期建议' : '⚠️ 容量不足，需人工复核'}
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                {suggestion.feasible ? (
                      <>
                    建议 <strong>{suggestion.date} {suggestion.session}</strong> 投送至 {bulkySite.name}
                  </>
                ) : (
                  suggestion.date + ' ' + suggestion.session
                )}
              </div>
              <div className="small muted" style={{ marginTop: 4 }}>{suggestion.reason}</div>
              {suggestion.feasible && (
                <div className="stack" style={{ marginTop: 8 }}>
                  <div>
                    <div className="spread small" style={{ marginBottom: 3 }}>
                      <span className="muted">车次装载</span>
                      <span>{suggestion.vehicleLoad.toFixed(1)} / {suggestion.vehicleCapacity} m³</span>
                    </div>
                    <ProgressBar value={(suggestion.vehicleLoad / suggestion.vehicleCapacity) * 100} tone={suggestion.vehicleLoad / suggestion.vehicleCapacity > 0.85 ? 'red' : 'green'} />
                  </div>
                  <div>
                    <div className="spread small" style={{ marginBottom: 3 }}>
                      <span className="muted">暂存点空间</span>
                      <span>{suggestion.storageAfter.toFixed(1)} / {suggestion.storageCapacity} m³</span>
                    </div>
                    <ProgressBar value={(suggestion.storageAfter / suggestion.storageCapacity) * 100} tone={suggestion.storageAfter / suggestion.storageCapacity > 0.85 ? 'red' : 'amber'} />
                  </div>
                </div>
              )}
              <div className="small muted" style={{ marginTop: 8 }}>
                {suggestion.date} 当日已排 {usage.count} 件、合计 {usage.total.toFixed(1)}m³
                {Object.entries(usage.bySession).map(([s, v]) => `｜${s}: ${v.toFixed(1)}m³`)}
              </div>
            </div>

            <button className="btn btn-primary" onClick={submit}>提交预约并按建议排期</button>
          </div>

          <BuildingFocusCard buildingId={buildingId} onArrange={(topic) => { arrangeBuildingBriefing(buildingId); toast(`已安排楼栋宣导：${topic}`); }} />
        </div>

        {/* 右：预约列表与处置动作 */}
        <div className="card">
          <h2>
            📋 大件预约与联动处置
            <span className="hint">督导关联提前丢弃 · 物业清运完成同步成本与积分</span>
          </h2>
          <div className="row" style={{ marginBottom: 10 }}>
            <button className={`btn btn-sm ${filter === 'active' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('active')}>
              待处置
            </button>
            <button className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setFilter('all')}>
              全部
            </button>
          </div>
          <div className="stack">
            {shown.map((a) => (
              <AppointmentCard key={a.id} appt={a} role={role} onOpenEvent={onOpenEvent}
                onEarlyDump={(photo, note, supervisor) => {
                  const id = linkEarlyDump(a.id, { photo, note, supervisor });
                  toast(`已关联现场照片并生成误投事件，可在事件中跟进整改（编号见列表）`);
                  onOpenEvent(id);
                }}
                onComplete={(payload) => {
                  completeBulkyHaul(a.id, payload);
                  toast('清运完成：保洁成本已入点位档案，居民积分与配合情况已同步');
                }}
              />
            ))}
            {shown.length === 0 && <p className="muted small">暂无预约</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===== 单条预约卡（含各状态动作） =====
function AppointmentCard({
  appt,
  role,
  onOpenEvent,
  onEarlyDump,
  onComplete,
}: {
  appt: BulkyAppointment;
  role: string;
  onOpenEvent: (id: string) => void;
  onEarlyDump: (photo: string, note: string, supervisor: string) => void;
  onComplete: (p: {
    vehicle: string;
    worker: string;
    cleaningCost: number;
    note: string;
    cooperation: Cooperation;
    cooperationText: string;
  }) => void;
}) {
  const { sites, buildings } = useStore();
  const site = sites.find((s) => s.id === appt.siteId)!;
  const building = buildings.find((b) => b.id === appt.buildingId)!;
  const meta = BULKY_ITEMS[appt.itemType];
  const [mode, setMode] = useState<'none' | 'early' | 'haul'>('none');
  const [photo, setPhoto] = useState(EARLY_PHOTOS[0]);
  const [note, setNote] = useState('');
  const [supervisor, setSupervisor] = useState('周敏');
  const [vehicle, setVehicle] = useState('沪大件·运 0086');
  const [worker, setWorker] = useState('马清运');
  const [cost, setCost] = useState(120);
  const [haulNote, setHaulNote] = useState('');
  const [coop, setCoop] = useState<Cooperation>(
    appt.status === 'early-dumped' ? 'early-dumped' : 'cooperative',
  );

  return (
    <div style={{ border: '1px solid var(--gray-200)', borderRadius: 12, padding: 14 }}>
      <div className="spread">
        <div className="row">
          <span style={{ fontSize: 18 }}>{meta.emoji}</span>
          <strong>{appt.itemName}</strong>
          <span className={`badge ${STATUS_META[appt.status].cls}`}>{STATUS_META[appt.status].text}</span>
        </div>
        <span className="mono small muted">{appt.code}</span>
      </div>
      <div className="small muted" style={{ margin: '4px 0' }}>
        {building.name}（{appt.elevator === 'yes' ? '有电梯' : '无电梯'}）· {appt.floor} 楼 · {appt.residentName} {appt.room} · {appt.volume}m³
      </div>
      <div className="small">
        期望 {appt.requestedDate} ｜ 排期 {appt.scheduledDate ?? '—'} {appt.scheduledSession ?? ''} ｜ {site.name}
      </div>
      <div className="small muted" style={{ marginTop: 2 }}>{appt.scheduledReason}</div>

      {/* 提前丢弃证据 */}
      {appt.earlyDump && (
        <div style={{ background: 'var(--red-light)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }} className="small">
          <div className="row">
            <span style={{ fontSize: 18 }}>{appt.earlyDump.photo === '📷' ? '🛋️' : appt.earlyDump.photo}</span>
            <strong>督导 {appt.earlyDump.supervisor} 关联提前丢弃照片</strong>
          </div>
          <div className="muted">{appt.earlyDump.note}</div>
          {appt.earlyDump.linkedEventId && (
            <button className="btn btn-outline btn-sm" style={{ marginTop: 6 }} onClick={() => onOpenEvent(appt.earlyDump!.linkedEventId!)}>
              查看关联误投事件
            </button>
          )}
        </div>
      )}

      {/* 清运结果（物业视角） */}
      {appt.haulResult && (
        <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '8px 10px', marginTop: 8 }}>
          <div className="spread small">
            <strong>清运结果（物业评估）</strong>
            <span className="badge badge-green">{appt.haulResult.vehicle}</span>
          </div>
          <div className="kv" style={{ marginTop: 6 }}>
            <span className="k">保洁成本</span>
            <span style={{ color: 'var(--red)', fontWeight: 700 }}>¥{appt.haulResult.cleaningCost}</span>
            <span className="k">居民配合</span>
            <span>{COOPERATION_LABELS[appt.haulResult.cooperation]}</span>
            <span className="k">积分变动</span>
            <span style={{ color: appt.haulResult.pointsDelta >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
              {appt.haulResult.pointsDelta >= 0 ? `+${appt.haulResult.pointsDelta}` : appt.haulResult.pointsDelta} 分
            </span>
            <span className="k">清运备注</span>
            <span>{appt.haulResult.note}</span>
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            物业研判：保洁成本偏高且配合为「提前丢弃/残留」时，应对该楼栋加大家电家具预约流程宣传与桶边提醒。
          </div>
        </div>
      )}

      {/* 动作区 */}
      {appt.status !== 'completed' && (
        <div className="btn-row" style={{ marginTop: 10 }}>
          {(role === 'supervisor' || role === 'community') && appt.status !== 'early-dumped' && (
            <button className="btn btn-danger btn-sm" onClick={() => setMode(mode === 'early' ? 'none' : 'early')}>
              居民提前丢弃了？关联现场照片
            </button>
          )}
          {(role === 'community' || role === 'hauler') && (
            <button className="btn btn-primary btn-sm" onClick={() => setMode(mode === 'haul' ? 'none' : 'haul')}>
              登记清运完成
            </button>
          )}
        </div>
      )}

      {mode === 'early' && (
        <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 12, marginTop: 10 }} className="stack">
          <div className="field">
            <label>现场照片（演示示意）</label>
            <div className="row">
              {EARLY_PHOTOS.map((p) => (
                <button key={p} className={`btn btn-sm ${photo === p ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPhoto(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>督导员</label>
              <input value={supervisor} onChange={(e) => setSupervisor(e.target.value)} />
            </div>
            <div className="field">
              <label>现场情况</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：堵塞通道、未捆扎" />
            </div>
          </div>
          <button
            className="btn btn-danger btn-sm"
            onClick={() => onEarlyDump(photo === '📷' ? meta.emoji : photo, note || '提前丢弃在桶边', supervisor)}
          >
            确认关联并生成误投事件
          </button>
        </div>
      )}

      {mode === 'haul' && (
        <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: 12, marginTop: 10 }} className="stack">
          <div className="form-row">
            <div className="field">
              <label>清运车辆</label>
              <input value={vehicle} onChange={(e) => setVehicle(e.target.value)} />
            </div>
            <div className="field">
              <label>清运人员</label>
              <input value={worker} onChange={(e) => setWorker(e.target.value)} />
            </div>
          </div>
          <div className="form-row">
            <div className="field">
              <label>现场保洁成本（元）</label>
              <input type="number" min={0} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>居民配合情况</label>
              <select value={coop} onChange={(e) => setCoop(e.target.value as typeof coop)}>
                <option value="cooperative">{COOPERATION_LABELS.cooperative}</option>
                <option value="late">{COOPERATION_LABELS.late}</option>
                <option value="early-dumped">{COOPERATION_LABELS['early-dumped']}</option>
                <option value="left-debris">{COOPERATION_LABELS['left-debris']}</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>清运/保洁备注</label>
            <input value={haulNote} onChange={(e) => setHaulNote(e.target.value)} placeholder="如：通道清理、无残留" />
          </div>
          <div className="small muted">
            提交后：保洁成本计入 {site.name} 档案；
            {coop === 'cooperative' ? '居民 +5 分' : coop === 'left-debris' ? '居民 -5 分' : '积分不变，提前丢弃需待误投事件复查闭环'}
            ；配合情况供物业研判楼栋宣传方式。
          </div>
          <button
            className="btn btn-primary btn-sm"
            onClick={() =>
              onComplete({
                vehicle,
                worker,
                cleaningCost: cost,
                note: haulNote || '大件清运完成',
                cooperation: coop,
                cooperationText: COOPERATION_LABELS[coop],
              })
            }
          >
            确认清运完成并同步档案
          </button>
        </div>
      )}
    </div>
  );
}

// ===== 楼栋宣导重点卡（按误投类型 + 大件提前丢弃生成） =====
function BuildingFocusCard({ buildingId, onArrange }: { buildingId: string; onArrange: (topic: string) => void }) {
  const { events, bulkyAppointments, buildings } = useStore();
  const building = buildings.find((b) => b.id === buildingId)!;
  const focus = buildingBriefingFocus(buildingId, events, bulkyAppointments);
  return (
    <div className="card">
      <h2>
        🎯 {building.name} 宣导重点（按本楼栋误投类型生成）
      </h2>
      <div style={{ background: 'var(--green-light)', borderRadius: 8, padding: '8px 12px', fontWeight: 600, color: 'var(--green-dark)', fontSize: 13 }}>
        {focus.topic}
      </div>
      <div className="stack" style={{ marginTop: 10 }}>
        {focus.lines.map((l, i) => (
          <div key={i} className="small" style={{ borderLeft: '3px solid var(--green)', paddingLeft: 10 }}>
            {l.text}
          </div>
        ))}
        {focus.lines.length === 0 && <p className="muted small">本楼栋近期无误投，宣导以巩固规则为主。</p>}
      </div>
      <div className="btn-row">
        <button className="btn btn-outline btn-sm" onClick={() => onArrange(focus.topic)}>
          按此重点安排楼栋宣导（写入点位档案并关联在办事件教育）
        </button>
      </div>
    </div>
  );
}
