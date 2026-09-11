import type { HaulingIssues, MisDumpEvent, SiteArchive, WasteCategory } from '../types';
import type { DisposalSite } from '../types';
import { CATEGORY_RULES } from '../data/rules';

export interface SiteStats {
  siteId: string;
  total: number;
  openCount: number; // 待整改 + 整改中
  doneCount: number; // 复查通过 + 闭环
  progress: number; // 0-100
  byCategory: Record<WasteCategory, number>;
  bySession: Record<string, number>;
  byBuilding: Record<string, number>;
  haulingCount: number;
  avgQuality: number | null;
  issueCounts: Record<keyof HaulingIssues, number>;
  totalCleaningCost: number;
  recentDays: number;
  recentCount: number;
  /** 四类根因得分（0-100，归一化） */
  causes: { habit: number; facility: number; supervision: number; cleaning: number };
  primaryCause: 'habit' | 'facility' | 'supervision' | 'cleaning';
  recommendation: string;
}

const CAUSE_META: Record<SiteStats['primaryCause'], { label: string; color: string }> = {
  habit: { label: '居民习惯', color: '#b45309' },
  facility: { label: '桶位设计', color: '#1d4ed8' },
  supervision: { label: '督导缺位', color: '#be123c' },
  cleaning: { label: '物业清洁不足', color: '#0f766e' },
};

export function causeMeta(key: SiteStats['primaryCause']) {
  return CAUSE_META[key];
}

const FACILITY_KEYWORDS = ['灯', '标识', '看不清', '位置', '找不到', '通道', '洗手', '沥水', '远', '暗', '堵塞'];

function withinDays(iso: string, days: number, now = new Date()) {
  const t = new Date(iso).getTime();
  return now.getTime() - t <= days * 86400000;
}

export function computeSiteStats(
  site: DisposalSite,
  events: MisDumpEvent[],
  archive: SiteArchive | undefined,
  now = new Date(),
): SiteStats {
  const list = events.filter((e) => e.siteId === site.id);
  const total = list.length;
  const done = list.filter((e) => e.status === 'rechecked' || e.status === 'closed').length;
  const openCount = total - done;

  const byCategory = { wet: 0, recyclable: 0, hazardous: 0, bulky: 0, residual: 0 } as Record<WasteCategory, number>;
  const bySession: Record<string, number> = {};
  const byBuilding: Record<string, number> = {};
  list.forEach((e) => {
    byCategory[e.category] += 1;
    bySession[e.sessionLabel] = (bySession[e.sessionLabel] ?? 0) + 1;
    byBuilding[e.buildingId] = (byBuilding[e.buildingId] ?? 0) + 1;
  });

  const haulingList = list.filter((e) => e.hauling).map((e) => e.hauling!);
  const issueCounts: Record<keyof HaulingIssues, number> = {
    heavyPollution: 0,
    wetBagIntact: 0,
    recyclableInKitchen: 0,
    hazardousNotSealed: 0,
  };
  haulingList.forEach((h) => {
    (Object.keys(issueCounts) as (keyof HaulingIssues)[]).forEach((k) => {
      if (h.issues[k]) issueCounts[k] += 1;
    });
  });
  const avgQuality = haulingList.length
    ? Math.round(haulingList.reduce((s, h) => s + h.qualityScore, 0) / haulingList.length)
    : null;
  const totalCleaningCost = archive?.cleaningCosts.reduce((s, c) => s + c.amount, 0) ?? 0;
  const recentCount = list.filter((e) => withinDays(e.time, 7, now)).length;

  // ===== 根因诊断（规则打分） =====
  // 居民习惯：未配合、同一住户/楼栋反复误投、破袋类问题
  const residentIds = list.map((e) => e.residentId).filter(Boolean) as string[];
  const repeatResident = residentIds.some((id) => residentIds.filter((x) => x === id).length >= 2);
  const notCooperated = list.filter((e) => e.cooperated === false).length;
  const habitRaw =
    (repeatResident ? 3 : 0) + notCooperated * 2 + issueCounts.wetBagIntact * 2 + byCategory.wet;

  // 桶位设计：设施类反馈关键词、大件占道、夜间有害垃圾找不到封存点
  const facilityFeedback = list.filter(
    (e) => e.residentFeedback && FACILITY_KEYWORDS.some((k) => e.residentFeedback!.includes(k)),
  ).length;
  const facilityRaw =
    facilityFeedback * 3 +
    byCategory.bulky * 2 +
    issueCounts.hazardousNotSealed * 1.5 +
    (archive?.binAdjustments.length ?? 0);

  // 督导缺位：未当场劝导比例高、且桶边值守少
  const noPersuade = list.filter((e) => !e.persuaded).length;
  const guardCount = archive?.guardDuties.length ?? 0;
  const supervisionRaw = Math.max(0, noPersuade * 2.5 - guardCount * 1.5) + (total > 0 && guardCount === 0 ? 2 : 0);

  // 物业清洁不足：清运低分、污染严重、单位事件保洁成本高
  const lowQuality = avgQuality !== null && avgQuality < 65 ? 2 : 0;
  const cleaningRaw = issueCounts.heavyPollution * 2.5 + lowQuality + totalCleaningCost / 120;

  const raws = { habit: habitRaw, facility: facilityRaw, supervision: supervisionRaw, cleaning: cleaningRaw };
  const sum = Object.values(raws).reduce((a, b) => a + b, 0) || 1;
  const causes = {
    habit: Math.round((raws.habit / sum) * 100),
    facility: Math.round((raws.facility / sum) * 100),
    supervision: Math.round((raws.supervision / sum) * 100),
    cleaning: Math.round((raws.cleaning / sum) * 100),
  };
  const primaryCause = (Object.keys(causes) as (keyof typeof causes)[]).reduce((a, b) =>
    causes[a] >= causes[b] ? a : b,
  );

  // ===== 下一步动作建议 =====
  let recommendation: string;
  if (primaryCause === 'facility') recommendation = '调整投放设施：优化桶位/照明/标识与洗手沥水条件，大件划区预约';
  else if (primaryCause === 'supervision') recommendation = '加强桶边值守与督导排班，高发时段安排专人提醒';
  else if (primaryCause === 'habit') {
    recommendation = repeatResident
      ? '安排上门沟通：对反复误投且不配合的住户一对一指导，教育后复查积分'
      : '开展楼栋宣导：结合典型误投案例组织分类课堂';
  } else recommendation = '督促物业增加冲洗保洁频次，复核清运质量与保洁成本';

  return {
    siteId: site.id,
    total,
    openCount,
    doneCount: done,
    progress: total ? Math.round((done / total) * 100) : 0,
    byCategory,
    bySession,
    byBuilding,
    haulingCount: haulingList.length,
    avgQuality,
    issueCounts,
    totalCleaningCost,
    recentDays: recentCount,
    recentCount,
    causes,
    primaryCause,
    recommendation,
  };
}

/** 长期高发判定：近 7 天 ≥3 起，或清运均分 <65 且 ≥2 次清运 */
export function isHighFrequency(stats: SiteStats, avgQuality: number | null, haulingCount: number) {
  return stats.recentCount >= 3 || (avgQuality !== null && avgQuality < 65 && haulingCount >= 2);
}

export interface BuildingPerformance {
  buildingId: string;
  eventCount: number;
  openCount: number;
  cooperatingRate: number; // 已劝导事件中配合比例
  topCategory: WasteCategory | null;
}

export function buildingPerformance(buildingId: string, events: MisDumpEvent[]): BuildingPerformance {
  const list = events.filter((e) => e.buildingId === buildingId);
  const persuaded = list.filter((e) => e.persuaded && e.cooperated !== null);
  const cooperatingRate = persuaded.length
    ? Math.round((persuaded.filter((e) => e.cooperated).length / persuaded.length) * 100)
    : 100;
  const counts: Partial<Record<WasteCategory, number>> = {};
  list.forEach((e) => (counts[e.category] = (counts[e.category] ?? 0) + 1));
  const top = (Object.keys(counts) as WasteCategory[]).sort((a, b) => counts[b]! - counts[a]!)[0] ?? null;
  return {
    buildingId,
    eventCount: list.length,
    openCount: list.filter((e) => e.status === 'open' || e.status === 'rectifying').length,
    cooperatingRate,
    topCategory: top,
  };
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function categoryName(c: WasteCategory) {
  return CATEGORY_RULES[c].name;
}
