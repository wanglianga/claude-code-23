// 全局领域模型类型定义

/** 垃圾大类：题目要求覆盖湿垃圾、可回收物、有害垃圾、大件垃圾（干垃圾作为第五类保留） */
export type WasteCategory = 'wet' | 'recyclable' | 'hazardous' | 'bulky' | 'residual';

/** 误投/督导事件状态 */
export type EventStatus =
  | 'open' // 待整改
  | 'rectifying' // 整改中
  | 'rechecked' // 督导复查通过
  | 'closed'; // 已闭环归档

/** 证据绑定方式：绑定住户 / 绑定楼栋（不指明住户）/ 匿名事件 */
export type BindTarget = 'resident' | 'building' | 'anonymous';

/** 清运问题标记（对应题目四种情形） */
export interface HaulingIssues {
  heavyPollution: boolean; // 桶内污染严重
  wetBagIntact: boolean; // 湿垃圾未破袋
  recyclableInKitchen: boolean; // 可回收物混入厨余
  hazardousNotSealed: boolean; // 有害垃圾未单独封存
}

export interface Resident {
  id: string;
  name: string;
  buildingId: string;
  room: string; // 门牌号
  qrCode: string; // 投放二维码
  points: number; // 当前积分
  baselinePoints: number; // 本期初始积分（用于展示恢复情况）
  frozen: boolean; // 积分是否因未整改误投被冻结
}

export interface Building {
  id: string;
  name: string; // 如 3 号楼
  households: number;
  hasElevator: boolean; // 楼栋是否有电梯（影响大件搬运安排）
  /** 该楼栋大件默认清运的暂存点 */
  preferredSiteId: string;
}

export interface DisposalSite {
  id: string;
  name: string; // 投放点名
  location: string;
  bins: string[]; // 桶位编号
  /** 定时投放时段 */
  sessions: { label: string; start: string; end: string }[];
  /** 大件暂存容量（仅大件暂存点配置） */
  bulkyCapacity?: BulkyCapacity;
}

export interface MisDumpEvent {
  id: string;
  code: string; // 业务编号，如 WG-20260901-01
  siteId: string;
  binCode: string; // 桶位
  sessionLabel: string; // 时段
  time: string; // ISO 时间
  buildingId: string; // 居民楼栋
  residentId: string | null; // 绑定住户（匿名/楼栋时为空）
  bindTarget: BindTarget;
  category: WasteCategory; // 垃圾类型
  photo: string; // 误投照片（演示用 emoji 占位）
  note: string;
  persuaded: boolean; // 是否当场劝导
  cooperated: boolean | null; // 居民是否配合
  status: EventStatus;
  // 整改闭环
  rectification?: {
    measure: string; // 整改措施
    assignee: string; // 责任人
    dueAt: string;
    completedAt?: string;
  };
  recheck?: {
    passed: boolean;
    at: string;
    supervisor: string;
    comment: string;
  };
  // 清运反馈（可由清运人员补充登记，影响整改任务）
  hauling?: {
    id: string;
    vehicle: string;
    worker: string;
    at: string;
    issues: HaulingIssues;
    note: string;
    qualityScore: number; // 0-100
  };
  residentFeedback?: string; // 居民反馈
  pointsRestored?: boolean; // 居民积分是否已恢复
  educationDone?: boolean; // 是否完成居民教育（楼栋宣导/上门指导/桶边值守）
  educationType?: 'building-briefing' | 'door-visit' | 'bin-guidance';
  educationAt?: string;
  /** 若该大件误投由督导关联到大件预约，则记录预约 id */
  bulkyAppointmentId?: string;
}

export interface HaulingFeedback {
  id: string;
  siteId: string;
  vehicle: string;
  worker: string;
  at: string;
  issues: HaulingIssues;
  note: string;
  qualityScore: number;
  linkedEventIds: string[];
}

export interface SiteArchive {
  siteId: string;
  // 物业保洁成本（元），按日期登记
  cleaningCosts: { date: string; amount: number; note: string }[];
  // 桶位调整记录
  binAdjustments: { date: string; change: string; reason: string }[];
  // 桶边值守安排
  guardDuties: { date: string; shift: string; guarder: string; note: string }[];
  // 楼栋宣导记录
  briefings: { date: string; buildingId: string; topic: string; audience: number }[];
}

/** 大件垃圾品类 */
export type BulkyItemType = 'furniture' | 'mattress' | 'appliance' | 'other';

/** 大件预约状态：待确认 → 已排期 → 已完成；提前丢弃 → 待整改 */
export type BulkyStatus = 'submitted' | 'scheduled' | 'early-dumped' | 'completed';

/** 大件预约关联的提前丢弃事件 / 清运结果 */
export interface BulkyHaulResult {
  at: string; // 清运完成时间
  vehicle: string;
  worker: string;
  cleaningCost: number; // 物业保洁成本（元）
  note: string;
  /** 居民配合评价 */
  cooperation: 'cooperative' | 'late' | 'early-dumped' | 'left-debris';
  /** 居民配合情况文字 */
  cooperationText: string;
  /** 本次清运奖励积分（提前丢弃为 0 或扣减） */
  pointsDelta: number;
}

export interface BulkyAppointment {
  id: string;
  code: string; // YY-20260911-01
  siteId: string; // 排入的大件暂存点
  buildingId: string;
  residentId: string | null;
  residentName: string;
  room: string;
  itemType: BulkyItemType;
  itemName: string; // 具体物品，如 三人沙发
  volume: number; // 估算体积（立方米）
  elevator: 'yes' | 'no' | 'unknown'; // 居民楼栋是否有电梯
  floor: number;
  requestedDate: string; // 居民期望日期
  status: BulkyStatus;
  scheduledDate: string | null; // 系统安排日期
  scheduledSession: string | null; // 系统安排时段
  scheduledReason: string; // 调度说明（楼栋/电梯/车次/暂存容量）
  earlyDump?: {
    at: string;
    photo: string;
    note: string;
    linkedEventId: string | null; // 关联生成的误投事件
    supervisor: string;
  };
  haulResult?: BulkyHaulResult;
  createdAt: string;
}

/** 暂存点单日容量配置（大件清运车次与暂存空间） */
export interface BulkyCapacity {
  /** 时段 → 当日车次容量（车次） */
  vehicleSlots: { label: string; maxTrips: number; tripVolume: number }[];
  /** 暂存点空间上限（立方米） */
  storageVolume: number;
}

/** 长期高发点位专项治理清单条目 */
export interface WatchlistItem {
  siteId: string;
  reason: string;
  level: '重点' | '挂牌';
  since: string;
  /** true=系统按高发规则自动识别；false=社区人工纳入 */
  auto?: boolean;
}

export type Role = 'supervisor' | 'hauler' | 'community' | 'resident';
