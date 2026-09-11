import type { BulkyAppointment, Building, DisposalSite, MisDumpEvent, WasteCategory } from '../types';
import { BULKY_ITEMS, CATEGORY_RULES } from '../data/rules';

export interface ScheduleSuggestion {
  date: string;
  session: string;
  reason: string;
  feasible: boolean;
  storageAfter: number; // 排单后暂存点占用（m³）
  vehicleLoad: number; // 排单后车次装载（m³）
  vehicleCapacity: number;
  storageCapacity: number;
}

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateISO: string, n: number) {
  const d = new Date(`${dateISO}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/**
 * 根据楼栋（电梯/楼层）、清运车容量、暂存点空间安排预约时段。
 * 容量口径：
 *  - 车次：同一日期同一时段已排体积 + 本次体积 ≤ 该车次容量
 *  - 暂存：当日排入暂存点且尚未清运的体积 + 本次体积 ≤ 暂存空间
 */
export function suggestSchedule(args: {
  site: DisposalSite;
  building: Building;
  volume: number;
  floor: number;
  requestedDate: string;
  appointments: BulkyAppointment[];
}): ScheduleSuggestion {
  const { site, building, volume, floor, requestedDate, appointments } = args;
  const cap = site.bulkyCapacity;
  const storageCapacity = cap?.storageVolume ?? 0;
  const slots = cap?.vehicleSlots ?? [];

  if (!cap || slots.length === 0) {
    return {
      date: requestedDate,
      session: '',
      reason: '该点位未配置大件暂存容量，请联系社区协调',
      feasible: false,
      storageAfter: volume,
      vehicleLoad: volume,
      vehicleCapacity: 0,
      storageCapacity,
    };
  }

  // 无电梯且高楼层：优先上午车次（搬运体力充足、可加派搬运工）
  const preferMorning = !building.hasElevator && floor >= 4;

  const orderedSlots = [...slots].sort((a, b) => {
    if (preferMorning) return a.label.includes('上午') ? -1 : 1;
    return 0;
  });

  for (let offset = 0; offset < 8; offset++) {
    const date = addDays(requestedDate, offset);
    // 当日暂存点占用：当天已排入、尚未清运的大件
    const sameDay = appointments.filter(
      (a) => a.siteId === site.id && a.scheduledDate === date && a.status !== 'completed',
    );
    const storageUsed = sameDay.reduce((s, a) => s + a.volume, 0);

    for (const slot of orderedSlots) {
      const slotLoad = sameDay
        .filter((a) => a.scheduledSession === slot.label)
        .reduce((s, a) => s + a.volume, 0);
      const vehicleAfter = slotLoad + volume;
      const storageAfter = storageUsed + volume;

      if (vehicleAfter <= slot.tripVolume && storageAfter <= storageCapacity) {
        const bits: string[] = [];
        bits.push(`${building.name}${building.hasElevator ? '有电梯' : '无电梯'}、${floor} 楼`);
        if (!building.hasElevator && floor >= 4) bits.push('高楼层无电梯，优先安排上午并加派搬运工');
        bits.push(`车次装载 ${vehicleAfter.toFixed(1)}/${slot.tripVolume}m³`);
        bits.push(`暂存占用 ${storageAfter.toFixed(1)}/${storageCapacity}m³（${Math.round((storageAfter / storageCapacity) * 100)}%）`);
        if (offset > 0) bits.push(`期望日 ${requestedDate} 容量已满，顺延至 ${date}`);
        else bits.push(`满足居民期望日期 ${requestedDate}`);
        return {
          date,
          session: slot.label,
          reason: bits.join('；'),
          feasible: true,
          storageAfter,
          vehicleLoad: vehicleAfter,
          vehicleCapacity: slot.tripVolume,
          storageCapacity,
        };
      }
    }
  }

  return {
    date: addDays(requestedDate, 8),
    session: orderedSlots[0].label,
    reason: '未来 7 天车次/暂存容量均不足，已给出建议日期，请人工复核或加开加班车',
    feasible: false,
    storageAfter: volume,
    vehicleLoad: volume,
    vehicleCapacity: orderedSlots[0].tripVolume,
    storageCapacity,
  };
}

/** 暂存点某日容量占用（供页面展示） */
export function siteDayUsage(appointments: BulkyAppointment[], siteId: string, date: string) {
  const list = appointments.filter((a) => a.siteId === siteId && a.scheduledDate === date && a.status !== 'completed');
  const bySession: Record<string, number> = {};
  list.forEach((a) => {
    if (a.scheduledSession) bySession[a.scheduledSession] = (bySession[a.scheduledSession] ?? 0) + a.volume;
  });
  return { total: list.reduce((s, a) => s + a.volume, 0), count: list.length, bySession };
}

export interface BuildingBriefingFocus {
  topic: string;
  lines: { category: WasteCategory | 'bulky'; text: string; count: number }[];
}

/**
 * 按该楼栋误投类型生成后续宣导重点内容；
 * 大件提前丢弃的预约也作为重点信号纳入。
 */
export function buildingBriefingFocus(
  buildingId: string,
  events: MisDumpEvent[],
  appointments: BulkyAppointment[],
): BuildingBriefingFocus {
  const list = events.filter((e) => e.buildingId === buildingId);
  const counts = new Map<WasteCategory, number>();
  list.forEach((e) => counts.set(e.category, (counts.get(e.category) ?? 0) + 1));
  const earlyBulky = appointments.filter(
    (a) => a.buildingId === buildingId && (a.status === 'early-dumped' || a.haulResult?.cooperation === 'early-dumped'),
  ).length;
  // 大件误投事件中，由预约关联生成的（带 bulkyAppointmentId）已计入上面的预约数，不再重复计数
  const linkedApptIds = new Set(
    appointments
      .filter((a) => a.buildingId === buildingId && a.earlyDump?.linkedEventId)
      .map((a) => a.earlyDump!.linkedEventId),
  );
  const bulkyFromEvents = list.filter((e) => e.category === 'bulky' && !linkedApptIds.has(e.id) && !e.bulkyAppointmentId).length;
  const bulkyTotal = bulkyFromEvents + earlyBulky;
  counts.delete('bulky');

  const lines: BuildingBriefingFocus['lines'] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, count]) => {
      const r = CATEGORY_RULES[category];
      return {
        category,
        count,
        text: `${r.emoji} ${r.name}（${count} 起）：${r.commonMistakes.slice(0, 2).join('；')}。处置要点：${r.handling[0]}`,
      };
    });

  if (bulkyTotal > 0) {
    lines.push({
      category: 'bulky',
      count: bulkyTotal,
      text:
        `🛋️ 大件垃圾（${bulkyTotal} 起，其中提前丢弃 ${earlyBulky} 起）：旧家具/床垫/家电必须先预约、按排期时段投放到暂存区，` +
        `不得提前堆放在桶边或通道；${BULKY_ITEMS.appliance.handling[1]}`,
    });
  }

  const top = [...lines].sort((a, b) => b.count - a.count).slice(0, 3);
  const nameOf = (l: (typeof lines)[number]) =>
    l.category === 'bulky' ? '大件提前丢弃' : CATEGORY_RULES[l.category].name;
  const topic =
    top.length > 0
      ? `楼栋分类重点：${top.map((l) => `${nameOf(l)}（${l.count} 起）`).join(' · ')}`
      : '楼栋分类常规宣导：巩固四类投放规则与大件预约流程';

  return { topic, lines };
}
