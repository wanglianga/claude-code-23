import React, { createContext, useCallback, useContext, useState } from 'react';
import type { BindTarget, EventStatus, HaulingIssues, WasteCategory } from '../types';
import { CATEGORY_RULES } from '../data/rules';

// ===== 状态徽章 =====
export function StatusBadge({ status }: { status: EventStatus }) {
  const map: Record<EventStatus, { text: string; cls: string }> = {
    open: { text: '待整改', cls: 'badge-red' },
    rectifying: { text: '整改中', cls: 'badge-amber' },
    rechecked: { text: '复查通过', cls: 'badge-blue' },
    closed: { text: '已闭环', cls: 'badge-green' },
  };
  const m = map[status];
  return <span className={`badge ${m.cls}`}>{m.text}</span>;
}

export function BindBadge({ target }: { target: BindTarget }) {
  const map: Record<BindTarget, { text: string; cls: string }> = {
    resident: { text: '绑定住户', cls: 'badge-blue' },
    building: { text: '绑定楼栋', cls: 'badge-amber' },
    anonymous: { text: '匿名事件', cls: 'badge-gray' },
  };
  const m = map[target];
  return <span className={`badge ${m.cls}`}>{m.text}</span>;
}

// ===== 垃圾类型徽章 =====
export function CategoryChip({ category, size }: { category: WasteCategory; size?: 'sm' }) {
  const r = CATEGORY_RULES[category];
  return (
    <span
      className="cat-chip"
      style={{ background: r.bg, color: r.color, fontSize: size === 'sm' ? 11.5 : undefined }}
      title={`${r.binColor} · ${r.short}`}
    >
      <span>{r.emoji}</span>
      {r.name}
    </span>
  );
}

export const HAULING_ISSUE_LABELS: Record<keyof HaulingIssues, string> = {
  heavyPollution: '桶内污染严重',
  wetBagIntact: '湿垃圾未破袋',
  recyclableInKitchen: '可回收物混入厨余',
  hazardousNotSealed: '有害垃圾未单独封存',
};

// ===== 弹窗 =====
export function Modal({
  open,
  onClose,
  title,
  wide,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  wide?: boolean;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="modal-mask" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="close-x" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ===== 进度条 =====
export function ProgressBar({ value, tone }: { value: number; tone?: 'green' | 'amber' | 'red' }) {
  const cls = tone === 'red' ? 'red' : tone === 'amber' ? 'amber' : '';
  return (
    <div className={`progress ${cls}`}>
      <div style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

// ===== 横向条形图 =====
export function BarList({ data, color = '#15803d' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="bars">
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.label}
          </span>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
          <span className="bar-val">{d.value}</span>
        </div>
      ))}
      {data.length === 0 && <p className="muted small">暂无数据</p>}
    </div>
  );
}

// ===== 柱状图 =====
export function ColumnChart({ data, color }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="column-chart">
      {data.map((d) => (
        <div className="column" key={d.label}>
          <div className="col-bar" style={{ height: `${(d.value / max) * 82 + 4}%`, background: color }}>
            <span className="col-num">{d.value}</span>
          </div>
          <div className="col-label">{d.label}</div>
        </div>
      ))}
    </div>
  );
}

// ===== 轻提示 =====
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg(null), 2400);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ===== 质量分徽标 =====
export function QualityBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'badge-green' : score >= 65 ? 'badge-amber' : 'badge-red';
  return <span className={`badge ${cls}`}>清运质量 {score} 分</span>;
}
