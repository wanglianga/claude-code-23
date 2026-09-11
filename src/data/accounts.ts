import type { Role } from '../types';

export interface DemoAccount {
  username: string;
  password: string;
  name: string;
  role: Role;
  /** 账号可见页面与权限说明 */
  permissions: string[];
}

// 演示账号（前端演示用，非真实鉴权；生产环境应对接统一身份认证）
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: 'community',
    password: 'community123',
    name: '林芳（社区工作人员）',
    role: 'community',
    permissions: ['工作台总览', '社区研判与措施安排', '点位档案', '专项治理清单挂牌/摘牌', '查看全部督导与清运记录'],
  },
  {
    username: 'supervisor',
    password: 'sup123',
    name: '周敏（督导员）',
    role: 'supervisor',
    permissions: ['督导误投登记（桶位/时段/楼栋/类型/照片/劝导/配合/证据绑定）', '下发与复查整改任务', '登记居民教育（宣导/上门/桶边值守）', '恢复居民积分', '查看点位档案'],
  },
  {
    username: 'hauler',
    password: 'haul123',
    name: '刘清运（清运人员）',
    role: 'hauler',
    permissions: ['清运到场反馈（四类污染情形勾选与质量分）', '反馈联动整改任务', '查看点位档案与工作台'],
  },
  {
    username: 'resident',
    password: 'res123',
    name: '王阿姨（3 号楼 3-201 住户）',
    role: 'resident',
    permissions: ['查看个人绿色积分与冻结状态', '近期误投提醒', '本楼栋分类表现与全社区对比'],
  },
];
