import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  BindTarget,
  Building,
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
  seedEvents,
  seedHauling,
  seedResidents,
  seedSites,
  seedWatchlist,
} from '../data/seed';
import { buildingPerformance, computeSiteStats, isHighFrequency } from '../lib/analytics';

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
          const residents = s.residents.map((r) =>
            target?.residentId && r.id === target.residentId
              ? { ...r, points: r.points + points, frozen: false }
              : r,
          );
          const events = s.events.map((e) =>
            e.id === eventId ? applyClosure({ ...e, pointsRestored: true }) : e,
          );
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
      name: 'waste-supervision-v1',
      // refreshWatchlist 作为 store 上的派生辅助（不持久化方法），通过模块函数实现：
      partialize: (s) => ({
        role: s.role,
        buildings: s.buildings,
        sites: s.sites,
        residents: s.residents,
        events: s.events,
        hauling: s.hauling,
        archives: s.archives,
        watchlist: s.watchlist,
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
