import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BindTarget,
  Building,
  BulkyAppointment,
  BulkyHaulResult,
  BulkyItemType,
  DisposalSite,
  HaulingFeedback,
  HaulingIssues,
  MisDumpEvent,
  Resident,
  Role,
  SiteArchive,
  WatchlistItem,
  WasteCategory,
} from '../types';
import {
  seedArchives,
  seedBuildings,
  seedBulkyAppointments,
  seedEvents,
  seedHauling,
  seedResidents,
  seedSites,
  seedWatchlist,
} from '../data/seed';
import { buildingPerformance, computeSiteStats, isHighFrequency } from '../lib/analytics';
import { buildingBriefingFocus, suggestSchedule } from '../lib/bulky';

interface NewEventInput {
  siteId: string;
  binCode: string;
  sessionLabel: string;
  buildingId: string;
  residentId: string | null;
  bindTarget: BindTarget;
  category: WasteCategory;
  photo: string;
  note: string;
  persuaded: boolean;
  cooperated: boolean | null;
}

interface RectificationInput {
  measure: string;
  assignee: string;
  dueAt: string;
}

interface EducationInput {
  type: 'building-briefing' | 'door-visit' | 'bin-guidance';
  at: string;
}

interface State {
  role: Role;
  buildings: Building[];
  sites: DisposalSite[];
  residents: Resident[];
  events: MisDumpEvent[];
  hauling: HaulingFeedback[];
  archives: SiteArchive[];
  watchlist: WatchlistItem[];
  bulkyAppointments: BulkyAppointment[];

  setRole: (r: Role) => void;
  resetDemo: () => void;

  addEvent: (input: NewEventInput) => string;
  startRectification: (eventId: string, input: RectificationInput) => void;
  completeRectification: (eventId: string) => void;
  recheck: (eventId: string, passed: boolean, comment: string, supervisor: string) => void;
  addHaulingFeedback: (
    siteId: string,
    input: { vehicle: string; worker: string; issues: HaulingIssues; note: string; qualityScore: number; linkedEventIds: string[] },
  ) => void;
  setResidentFeedback: (eventId: string, feedback: string) => void;
  completeEducation: (eventId: string, input: EducationInput) => void;
  restorePoints: (eventId: string, points: number) => void;
  addCleaningCost: (siteId: string, amount: number, note: string, date: string) => void;
  addGuardDuty: (siteId: string, shift: string, guarder: string, note: string, date: string) => void;
  addBriefing: (siteId: string, buildingId: string, topic: string, audience: number, date: string) => void;
  addBinAdjustment: (siteId: string, change: string, reason: string, date: string) => void;
  addWatchlist: (siteId: string, level: '重点' | '挂牌') => void;
  removeWatchlist: (siteId: string) => void;
  /** 依据高发规则重建系统自动识别项（保留人工挂牌项） */
  refreshWatchlist: () => void;

  // ===== 大件垃圾预约联动 =====
  submitBulky: (input: BulkySubmitInput) => string;
  /** 督导把提前丢弃现场照片关联到预约，并生成/绑定误投事件 */
  linkEarlyDump: (appointmentId: string, input: EarlyDumpInput) => string;
  /** 清运完成：同步保洁成本到点位档案、居民积分、预约结果 */
  completeBulkyHaul: (appointmentId: string, result: CompleteBulkyInput) => void;
  /** 依据楼栋误投类型安排一场重点内容宣导，并记录到点位档案 */
  arrangeBuildingBriefing: (buildingId: string) => void;
}

export interface BulkySubmitInput {
  buildingId: string;
  residentId: string | null;
  residentName: string;
  room: string;
  itemType: BulkyItemType;
  itemName: string;
  volume: number;
  floor: number;
  requestedDate: string;
}

export interface EarlyDumpInput {
  photo: string;
  note: string;
  supervisor: string;
}

export interface CompleteBulkyInput {
  vehicle: string;
  worker: string;
  cleaningCost: number;
  note: string;
  cooperation: BulkyHaulResult['cooperation'];
  cooperationText: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextCode(events: MisDumpEvent[]) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = events.filter((e) => e.code.includes(ymd)).length + 1;
  return `WG-${ymd}-${String(seq).padStart(2, '0')}`;
}

function nextBulkyCode(appointments: BulkyAppointment[]) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const seq = appointments.filter((a) => a.code.includes(ymd)).length + 1;
  return `YY-${ymd}-${String(seq).padStart(2, '0')}`;
}

function emptyIssues(): HaulingIssues {
  return { heavyPollution: false, wetBagIntact: false, recyclableInKitchen: false, hazardousNotSealed: false };
}

/** 闭环条件：复查通过 + 居民教育完成；绑定住户的还需积分恢复 */
function applyClosure(e: MisDumpEvent): MisDumpEvent {
  const recheckedOk = e.status === 'rechecked' || e.status === 'closed';
  const pointsOk = e.bindTarget !== 'resident' || e.pointsRestored;
  if (recheckedOk && e.educationDone && pointsOk) return { ...e, status: 'closed' };
  return e;
}

// 根据清运问题质量分：基础 90，每个命中问题扣分
export function scoreFromIssues(issues: HaulingIssues) {
  return Math.max(
    20,
    90 -
      (issues.heavyPollution ? 22 : 0) -
      (issues.wetBagIntact ? 14 : 0) -
      (issues.recyclableInKitchen ? 12 : 0) -
      (issues.hazardousNotSealed ? 18 : 0),
  );
}

function applyHaulingToEvent(event: MisDumpEvent | undefined, fb: HaulingFeedback) {
  if (!event) return;
  const anyIssue = Object.values(fb.issues).some(Boolean);
  event.hauling = {
    id: fb.id,
    vehicle: fb.vehicle,
    worker: fb.worker,
    at: fb.at,
    issues: fb.issues,
    note: fb.note,
    qualityScore: fb.qualityScore,
  };
  // 清运发现污染问题 → 未整改事件自动升级/生成整改任务
  if (anyIssue && (event.status === 'open')) {
    event.status = 'rectifying';
    if (!event.rectification) {
      event.rectification = {
        measure: '依据清运反馈立行整改：现场分拣、冲洗并加强该时段桶边督导',
        assignee: '物业 + 督导员',
        dueAt: today(),
      };
    }
  }
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      role: 'community',
      buildings: seedBuildings,
      sites: seedSites,
      residents: seedResidents,
      events: seedEvents,
      hauling: seedHauling,
      archives: seedArchives,
      watchlist: seedWatchlist,
      bulkyAppointments: seedBulkyAppointments,

      setRole: (r) => set({ role: r }),
      resetDemo: () =>
        set({
          buildings: seedBuildings,
          sites: seedSites,
          residents: seedResidents,
          events: seedEvents,
          hauling: seedHauling,
          archives: seedArchives,
          watchlist: seedWatchlist,
          bulkyAppointments: seedBulkyAppointments,
        }),

      addEvent: (rawInput) => {
        // 防御性兜底：任何调用路径都不允许写入「住户不属于所选楼栋」的数据
        let input = rawInput;
        if (rawInput.bindTarget === 'resident' && rawInput.residentId) {
          const resident = get().residents.find((r) => r.id === rawInput.residentId);
          if (!resident || resident.buildingId !== rawInput.buildingId) {
            // 归属不一致：降级为楼栋绑定，避免错误扣减居民积分 / 污染楼栋统计
            input = { ...rawInput, residentId: null, bindTarget: 'building' };
          }
        }
        if (input.bindTarget !== 'resident') {
          input = { ...input, residentId: null };
        }
        const id = `e${Date.now()}`;
        const code = nextCode(get().events);
        const event: MisDumpEvent = {
          id,
          code,
          time: new Date().toISOString(),
          status: 'open',
          ...input,
        };
        const residents = get().residents.map((r) =>
          input.bindTarget === 'resident' && r.id === input.residentId
            ? // 绑定住户：误投暂记（冻结积分，教育复查通过后恢复）
              { ...r, frozen: true, points: Math.max(0, r.points - 10) }
            : r,
        );
        set((s) => ({ events: [event, ...s.events], residents }));
        return id;
      },

      startRectification: (eventId, input) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.id === eventId
              ? { ...e, status: 'rectifying', rectification: { ...input }, residentFeedback: e.residentFeedback }
              : e,
          ),
        })),

      completeRectification: (eventId) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.id === eventId && e.rectification
              ? { ...e, rectification: { ...e.rectification, completedAt: today() } }
              : e,
          ),
        })),

      // 督导复查：通过 → 复查通过（满足教育/积分条件后闭环）；不通过 → 退回整改中
      recheck: (eventId, passed, comment, supervisor) =>
        set((s) => ({
          events: s.events.map((e) => {
            if (e.id !== eventId) return e;
            if (!passed) {
              return { ...e, status: 'rectifying', recheck: { passed: false, at: new Date().toISOString(), supervisor, comment } };
            }
            return applyClosure({
              ...e,
              status: 'rechecked',
              recheck: { passed: true, at: new Date().toISOString(), supervisor, comment },
            });
          }),
        })),

      addHaulingFeedback: (siteId, input) => {
        const fb: HaulingFeedback = {
          id: `h${Date.now()}`,
          siteId,
          at: new Date().toISOString(),
          ...input,
        };
        set((s) => {
          const events = s.events.map((e) => {
            if (input.linkedEventIds.includes(e.id)) {
              const copy = { ...e, hauling: undefined };
              const linkedFb: HaulingFeedback = { ...fb, linkedEventIds: [e.id] };
              applyHaulingToEvent(copy, linkedFb);
              return copy;
            }
            return e;
          });
          return { events, hauling: [fb, ...s.hauling] };
        });
        get().refreshWatchlist();
      },

      setResidentFeedback: (eventId, feedback) =>
        set((s) => ({ events: s.events.map((e) => (e.id === eventId ? { ...e, residentFeedback: feedback } : e)) })),

      // 居民教育完成（楼栋宣导 / 上门指导 / 桶边值守）
      completeEducation: (eventId, input) =>
        set((s) => ({
          events: s.events.map((e) =>
            e.id === eventId
              ? applyClosure({ ...e, educationDone: true, educationType: input.type, educationAt: input.at })
              : e,
          ),
        })),

      // 复查 + 教育完成后恢复居民积分（仅绑定住户事件）；满足条件自动闭环
      restorePoints: (eventId, points) =>
        set((s) => {
          const target = s.events.find((e) => e.id === eventId);
          const events = s.events.map((e) =>
            e.id === eventId ? applyClosure({ ...e, pointsRestored: true }) : e,
          );
          // 该住户仍有其他未闭环事件时保持冻结
          const residents = s.residents.map((r) => {
            if (!target?.residentId || r.id !== target.residentId) return r;
            const stillOpen = events.some((e) => e.residentId === r.id && e.status !== 'closed');
            return { ...r, points: r.points + points, frozen: stillOpen };
          });
          return { residents, events };
        }),

      addCleaningCost: (siteId, amount, note, date) =>
        set((s) => ({
          archives: s.archives.map((a) =>
            a.siteId === siteId ? { ...a, cleaningCosts: [{ date, amount, note }, ...a.cleaningCosts] } : a,
          ),
        })),

      addGuardDuty: (siteId, shift, guarder, note, date) =>
        set((s) => ({
          archives: s.archives.map((a) =>
            a.siteId === siteId ? { ...a, guardDuties: [{ date, shift, guarder, note }, ...a.guardDuties] } : a,
          ),
        })),

      addBriefing: (siteId, buildingId, topic, audience, date) =>
        set((s) => ({
          archives: s.archives.map((a) =>
            a.siteId === siteId ? { ...a, briefings: [{ date, buildingId, topic, audience }, ...a.briefings] } : a,
          ),
        })),

      addBinAdjustment: (siteId, change, reason, date) =>
        set((s) => ({
          archives: s.archives.map((a) =>
            a.siteId === siteId ? { ...a, binAdjustments: [{ date, change, reason }, ...a.binAdjustments] } : a,
          ),
        })),

      addWatchlist: (siteId, level) =>
        set((s) => {
          const reason = `人工${level}治理：结合高发时段与清运反馈纳入专项清单`;
          const others = s.watchlist.filter((w) => w.siteId !== siteId);
          return { watchlist: [...others, { siteId, reason, level, since: today() }] };
        }),

      removeWatchlist: (siteId) => set((s) => ({ watchlist: s.watchlist.filter((w) => w.siteId !== siteId) })),

      // ============ 大件垃圾预约联动 ============

      submitBulky: (input) => {
        const id = `a${Date.now()}`;
        const code = nextBulkyCode(get().bulkyAppointments);
        const s = get();
        const building = s.buildings.find((b) => b.id === input.buildingId)!;
        const site = s.sites.find((x) => x.id === building.preferredSiteId)!;
        const suggestion = suggestSchedule({
          site,
          building,
          volume: input.volume,
          floor: input.floor,
          requestedDate: input.requestedDate,
          appointments: s.bulkyAppointments,
        });
        const appt: BulkyAppointment = {
          id,
          code,
          siteId: site.id,
          buildingId: input.buildingId,
          residentId: input.residentId,
          residentName: input.residentName,
          room: input.room,
          itemType: input.itemType,
          itemName: input.itemName,
          volume: input.volume,
          elevator: building.hasElevator ? 'yes' : 'no',
          floor: input.floor,
          requestedDate: input.requestedDate,
          status: suggestion.feasible ? 'scheduled' : 'submitted',
          scheduledDate: suggestion.feasible ? suggestion.date : null,
          scheduledSession: suggestion.feasible ? suggestion.session : null,
          scheduledReason: suggestion.reason,
          createdAt: new Date().toISOString(),
        };
        set((st) => ({ bulkyAppointments: [appt, ...st.bulkyAppointments] }));
        return id;
      },

      linkEarlyDump: (appointmentId, input) => {
        const st = get();
        const appt = st.bulkyAppointments.find((a) => a.id === appointmentId);
        if (!appt) return '';
        // 1) 生成关联的大件误投事件（匿名/绑定楼栋；若预约识别住户则绑定住户，保持同栋校验）
        const bindResident = appt.residentId && st.residents.find((r) => r.id === appt.residentId);
        const eventId = `e${Date.now()}`;
        const code = nextCode(st.events);
        const event: MisDumpEvent = {
          id: eventId,
          code,
          siteId: appt.siteId,
          binCode: '大件暂存区',
          sessionLabel: appt.scheduledSession ?? '非投放时段',
          time: new Date().toISOString(),
          buildingId: appt.buildingId,
          residentId: bindResident ? appt.residentId : null,
          bindTarget: bindResident ? 'resident' : 'anonymous',
          category: 'bulky',
          photo: input.photo,
          note: `大件「${appt.itemName}」提前丢弃在桶边，关联预约 ${appt.code}。${input.note}`,
          persuaded: true,
          cooperated: false,
          status: 'rectifying',
          rectification: {
            measure: '督导关联预约，通知居民按排期投放并协调即时清运',
            assignee: `督导员 ${input.supervisor}`,
            dueAt: today(),
          },
          bulkyAppointmentId: appt.id,
        };
        // 2) 预约标记为提前丢弃
        const updatedAppt: BulkyAppointment = {
          ...appt,
          status: 'early-dumped',
          earlyDump: {
            at: new Date().toISOString(),
            photo: input.photo,
            note: input.note,
            linkedEventId: eventId,
            supervisor: input.supervisor,
          },
        };
        // 3) 绑定住户：提前丢弃不奖励、积分冻结（待整改复查恢复）
        const residents = st.residents.map((r) =>
          bindResident && r.id === appt.residentId ? { ...r, frozen: true } : r,
        );
        set((s) => ({
          events: [event, ...s.events],
          residents,
          bulkyAppointments: s.bulkyAppointments.map((a) => (a.id === appointmentId ? updatedAppt : a)),
        }));
        return eventId;
      },

      completeBulkyHaul: (appointmentId, input) => {
        const st = get();
        const appt = st.bulkyAppointments.find((a) => a.id === appointmentId);
        if (!appt) return;
        const date = today();
        const result: BulkyHaulResult = {
          at: new Date().toISOString(),
          vehicle: input.vehicle,
          worker: input.worker,
          cleaningCost: input.cleaningCost,
          note: input.note,
          cooperation: input.cooperation,
          cooperationText: input.cooperationText,
          // 规范投放 +5 分；提前丢弃 0 分（积分维持冻结，待误投事件闭环）；残留杂物 -5 分
          pointsDelta: input.cooperation === 'cooperative' ? 5 : input.cooperation === 'left-debris' ? -5 : 0,
        };

        // 1) 物业保洁成本回到同一暂存点档案
        const archives = st.archives.map((a) =>
          a.siteId === appt.siteId
            ? {
                ...a,
                cleaningCosts: [
                  { date, amount: input.cleaningCost, note: `大件清运保洁：${appt.itemName}（${appt.code}）` },
                  ...a.cleaningCosts,
                ],
              }
            : a,
        );

        // 3) 预约完成；关联的提前丢弃事件若已复查通过，则随大件专项宣导一并闭环
        const linkedId = appt.earlyDump?.linkedEventId;
        const events = st.events.map((e) => {
          if (linkedId && e.id === linkedId) {
            const passed = e.recheck?.passed || e.status === 'closed';
            if (passed) {
              return {
                ...e,
                status: 'closed' as const,
                educationDone: true,
                educationType: 'building-briefing' as const,
                educationAt: date,
                pointsRestored: e.bindTarget === 'resident' ? true : e.pointsRestored,
              };
            }
          }
          return e;
        });

        // 2) 居民积分同步（解冻状态以更新后的事件为准：仍有未闭环事件则保持冻结）
        const residentStillOpen = (rid: string) =>
          events.some((e) => e.residentId === rid && e.status !== 'closed');
        //   规范投放 +5 分；提前丢弃 0 分；残留杂物 -5 分。
        const residents = st.residents.map((r) => {
          if (!appt.residentId || r.id !== appt.residentId) return r;
          if (input.cooperation === 'cooperative' || input.cooperation === 'late') {
            return { ...r, points: r.points + result.pointsDelta, frozen: residentStillOpen(r.id) };
          }
          if (input.cooperation === 'left-debris') {
            return { ...r, points: Math.max(0, r.points + result.pointsDelta), frozen: true };
          }
          // early-dumped：不奖分；关联事件闭环且无其他未闭环事件时才解冻
          return { ...r, frozen: residentStillOpen(r.id) };
        });

        set((s) => ({
          archives,
          residents,
          events,
          bulkyAppointments: s.bulkyAppointments.map((a) =>
            a.id === appointmentId ? { ...a, status: 'completed', haulResult: result } : a,
          ),
        }));
        st.refreshWatchlist();
      },

      arrangeBuildingBriefing: (buildingId) => {
        const st = get();
        const building = st.buildings.find((b) => b.id === buildingId)!;
        const focus = buildingBriefingFocus(buildingId, st.events, st.bulkyAppointments);
        const date = today();
        // 宣导记录写入该楼栋默认暂存点（大件/投放点位）档案
        const archives = st.archives.map((a) =>
          a.siteId === building.preferredSiteId
            ? { ...a, briefings: [{ date, buildingId, topic: focus.topic, audience: 30 }, ...a.briefings] }
            : a,
        );
        // 该楼栋在办事件标记教育完成（楼栋宣导），复查通过后自动闭环
        const events = st.events.map((e) => {
          if (e.buildingId === buildingId && !e.educationDone && e.status !== 'closed') {
            return { ...e, educationDone: true, educationType: 'building-briefing' as const, educationAt: date };
          }
          return e;
        });
        set({ archives, events });
        return focus.topic;
      },

      refreshWatchlist: () =>
        set((s) => {
          // 保留人工项，按近 7 天数据重新计算系统识别项
          const manual = s.watchlist.filter((w) => !w.auto);
          const auto: WatchlistItem[] = [];
          s.sites.forEach((site) => {
            if (manual.some((w) => w.siteId === site.id)) return;
            const stats = computeSiteStats(
              site,
              s.events,
              s.archives.find((a) => a.siteId === site.id),
            );
            if (isHighFrequency(stats, stats.avgQuality, stats.haulingCount)) {
              auto.push({
                siteId: site.id,
                reason: `近 7 天误投 ${stats.recentCount} 起，清运均分 ${stats.avgQuality ?? '—'}，系统识别为长期高发`,
                level: '重点',
                since: today(),
                auto: true,
              });
            }
          });
          return { watchlist: [...manual, ...auto] };
        }),
    }),
    {
      name: 'waste-supervision-v2',
      version: 2,
      // v1 缓存缺少大件预约与电梯/容量字段：结构变更时直接回退到内置种子数据
      migrate: () => undefined,
      partialize: (s) => ({
        role: s.role,
        buildings: s.buildings,
        sites: s.sites,
        residents: s.residents,
        events: s.events,
        hauling: s.hauling,
        archives: s.archives,
        watchlist: s.watchlist,
        bulkyAppointments: s.bulkyAppointments,
      }),
    },
  ),
);

// 初始化时按当前数据刷新一次系统自动识别的专项清单
useStore.getState().refreshWatchlist();

export function useSiteStats(siteId: string) {
  const { sites, events, archives } = useStore();
  const site = sites.find((s) => s.id === siteId)!;
  const archive = archives.find((a) => a.siteId === siteId);
  return computeSiteStats(site, events, archive);
}

export { buildingPerformance };
