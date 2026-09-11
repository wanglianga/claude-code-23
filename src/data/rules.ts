import type { BulkyItemType, BulkyHaulResult, WasteCategory } from '../types';

export interface CategoryRule {
  key: WasteCategory;
  name: string;
  short: string;
  color: string; // 主题色
  bg: string; // 浅底色
  /** 桶身颜色提示 */
  binColor: string;
  /** 现场处置要求（督导员视角） */
  handling: string[];
  /** 整改 / 后续流向 */
  flow: string[];
  /** 该类常见误投情形 */
  commonMistakes: string[];
  emoji: string;
}

// 四类核心垃圾的差异化处置规则（湿垃圾 / 可回收物 / 有害垃圾 / 大件垃圾）
export const CATEGORY_RULES: Record<WasteCategory, CategoryRule> = {
  wet: {
    key: 'wet',
    name: '湿垃圾',
    short: '厨余/易腐',
    color: '#7a5c2e',
    bg: '#f3ead8',
    binColor: '棕色桶',
    emoji: '🥬',
    handling: [
      '投放前必须破袋，厨余倒入棕色湿垃圾桶',
      '塑料袋沥干后投入干垃圾（残垃圾袋）',
      '大块骨头、贝壳、椰子壳属干垃圾，不得混入',
    ],
    flow: ['清运至厨余处理厂', '厌氧产沼 / 堆肥处理', '加工为资源化产品（肥料、工业油脂）'],
    commonMistakes: ['整袋投放未破袋', '塑料袋、餐盒混入', '汤液未沥干造成污水'],
  },
  recyclable: {
    key: 'recyclable',
    name: '可回收物',
    short: '玻金塑纸衣',
    color: '#2563eb',
    bg: '#e3edff',
    binColor: '蓝色桶',
    emoji: '♻️',
    handling: [
      '玻璃、金属、塑料、纸张、织物分类暂存',
      '瓶罐清空并简单冲洗，压扁节省空间',
      '纸板拆开打捆，织物洗净装袋',
    ],
    flow: ['可回收物服务点/中转站', '再生资源企业分拣', '进入再生原料渠道循环利用'],
    commonMistakes: ['油污外卖盒未清洗直接投放', '混入厨余被污染失去回收价值', '有害小物件（电池、灯管）误投入内'],
  },
  hazardous: {
    key: 'hazardous',
    name: '有害垃圾',
    short: '电池灯管药品',
    color: '#b91c1c',
    bg: '#fde8e8',
    binColor: '红色桶（上锁封存点）',
    emoji: '☣️',
    handling: [
      '必须单独投放、单独封存，红色收集箱上锁管理',
      '废电池保持完整防短路，灯管轻放防破碎',
      '废药品连同包装登记投放，不得与其他垃圾混装',
    ],
    flow: ['危废暂存点专柜暂存', '有资质单位定期收运', '危废处置厂无害化处理并留存联单'],
    commonMistakes: ['随手投入其他桶', '未单独封存造成泄漏风险', '碎灯管与普通玻璃混投'],
  },
  bulky: {
    key: 'bulky',
    name: '大件垃圾',
    short: '家具家电',
    color: '#6d28d9',
    bg: '#ede9fe',
    binColor: '大件暂存区（不入桶）',
    emoji: '🛋️',
    handling: [
      '不得投入桶内，放置大件垃圾指定暂存区',
      '提前通过物业/小程序预约，登记品类与数量',
      '家具拆除五金件，家电保持完整防冷媒泄漏',
    ],
    flow: ['预约清运至大件垃圾拆解中心', '可复用家具进入二手/慈善渠道', '拆解后木料金属泡沫分流资源化'],
    commonMistakes: ['堆放在桶站堵塞通道', '未预约长期占道', '冰箱空调自行放掉冷媒'],
  },
  residual: {
    key: 'residual',
    name: '干垃圾',
    short: '其他/残余',
    color: '#374151',
    bg: '#eceef1',
    binColor: '黑色桶',
    emoji: '🗑️',
    handling: ['密闭袋装后投入黑色干垃圾桶', '受污染且无法回收的包装物归此类', '沥干水分后投放'],
    flow: ['清运至焚烧发电厂', '焚烧发电 / 卫生填埋', '达标排放与灰渣处置'],
    commonMistakes: ['湿垃圾整袋投入', '有害垃圾混入', '可回收物被污染后只能按干垃圾处置'],
  },
};

export const CATEGORY_ORDER: WasteCategory[] = ['wet', 'recyclable', 'hazardous', 'bulky', 'residual'];

export const EDUCATION_LABELS: Record<string, string> = {
  'building-briefing': '楼栋宣导',
  'door-visit': '上门指导',
  'bin-guidance': '桶边值守',
};

export interface BulkyItemMeta {
  key: BulkyItemType;
  name: string;
  emoji: string;
  examples: string[];
  /** 常见单件体积（立方米），用于车次与暂存容量估算 */
  defaultVolume: number;
  /** 无电梯楼层每层附加搬运说明 */
  handling: string[];
}

export const BULKY_ITEMS: Record<BulkyItemType, BulkyItemMeta> = {
  furniture: {
    key: 'furniture',
    name: '旧家具',
    emoji: '🛋️',
    examples: ['沙发', '床垫外的床架', '衣柜', '桌椅', '书柜'],
    defaultVolume: 1.2,
    handling: ['拆除五金件并尽量拆分', '高层无电梯需安排搬运工与时段'],
  },
  mattress: {
    key: 'mattress',
    name: '床垫',
    emoji: '🛏️',
    examples: ['弹簧床垫', '棕垫', '乳胶床垫'],
    defaultVolume: 0.7,
    handling: ['保持干燥清洁，捆扎防污染', '电梯容纳不下时走楼梯，优先低层/早班清运'],
  },
  appliance: {
    key: 'appliance',
    name: '家电',
    emoji: '🧊',
    examples: ['冰箱', '洗衣机', '空调', '电视机', '热水器'],
    defaultVolume: 0.9,
    handling: ['保持完整，禁止自行放掉冷媒', '有电梯楼栋优先安排，避免占用楼道'],
  },
  other: {
    key: 'other',
    name: '其他大件',
    emoji: '🚪',
    examples: ['马桶', '门板', '浴缸', '大型健身器材'],
    defaultVolume: 0.6,
    handling: ['提前说明尺寸，便于车次配载', '易碎件做好包裹'],
  },
};

export const BULKY_ORDER: BulkyItemType[] = ['furniture', 'mattress', 'appliance', 'other'];

export const COOPERATION_LABELS: Record<BulkyHaulResult['cooperation'], string> = {
  cooperative: '按预约时间规范投放，配合良好',
  late: '未在预约时段投放但未提前丢弃',
  'early-dumped': '提前丢弃在桶边，已关联误投事件',
  'left-debris': '清运后残留杂物/包装，增加保洁量',
};
