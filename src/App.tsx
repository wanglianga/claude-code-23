import { useState } from 'react';
import { useStore } from './store/useStore';
import type { Role } from './types';
import { DEMO_ACCOUNTS, type DemoAccount } from './data/accounts';
import { ToastProvider, useToast } from './components/ui';
import OverviewPage from './pages/OverviewPage';
import SupervisePage from './pages/SupervisePage';
import ResidentPage from './pages/ResidentPage';
import HaulingPage from './pages/HaulingPage';
import CommunityPage from './pages/CommunityPage';
import SitesPage from './pages/SitesPage';
import WatchlistPage from './pages/WatchlistPage';
import BulkyPage from './pages/BulkyPage';
import EventDetailModal from './components/EventDetailModal';

const NAV: { key: string; label: string; roles: Role[]; desc: string }[] = [
  { key: 'overview', label: '工作台', roles: ['community', 'supervisor', 'hauler', 'resident'], desc: '全社区投放点与整改进度总览' },
  { key: 'supervise', label: '督导记录', roles: ['community', 'supervisor'], desc: '桶位 / 时段 / 楼栋 / 类型 / 照片 / 劝导 / 配合' },
  { key: 'resident', label: '居民扫码', roles: ['resident', 'community', 'supervisor'], desc: '积分、近期误投提醒、本楼栋分类表现' },
  { key: 'bulky', label: '大件预约', roles: ['resident', 'community', 'supervisor', 'hauler'], desc: '旧家具/床垫/家电预约排期、提前丢弃关联、清运成本与积分联动' },
  { key: 'hauling', label: '清运反馈', roles: ['hauler', 'community'], desc: '清运问题反馈联动整改任务' },
  { key: 'community', label: '社区研判', roles: ['community'], desc: '高发时段 / 楼栋 / 类型分析与下一步决策' },
  { key: 'sites', label: '点位档案', roles: ['community', 'supervisor', 'hauler'], desc: '整改、复查、积分、清运、保洁成本回到同一点位' },
  { key: 'watchlist', label: '专项治理', roles: ['community'], desc: '长期高发点位清单' },
];

const ROLE_LABELS: Record<Role, string> = {
  supervisor: '督导员',
  hauler: '清运人员',
  community: '社区工作人员',
  resident: '居民',
};

const SESSION_KEY = 'waste-supervision-session';

export default function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

function Shell() {
  const role = useStore((s) => s.role);
  const setRole = useStore((s) => s.setRole);
  const resetDemo = useStore((s) => s.resetDemo);
  const [page, setPage] = useState('overview');
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const [account, setAccount] = useState<DemoAccount | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as DemoAccount) : null;
    } catch {
      return null;
    }
  });

  const login = (acc: DemoAccount) => {
    setRole(acc.role);
    setAccount(acc);
    localStorage.setItem(SESSION_KEY, JSON.stringify(acc));
    setPage('overview');
  };
  const logout = () => {
    setAccount(null);
    localStorage.removeItem(SESSION_KEY);
  };

  if (!account) return <LoginGate onLogin={login} />;

  const visibleNav = NAV.filter((n) => n.roles.includes(role));
  const current = visibleNav.find((n) => n.key === page) ?? visibleNav[0];
  const openEvent = (id: string) => setDetailEventId(id);

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="logo">
            <span className="leaf">♻️</span> 社区垃圾分类督导与误投整改平台
          </div>
          <div className="subtitle">督导记录 · 清运联动 · 整改闭环 · 点位档案 · 专项治理</div>
        </div>
        <nav className="nav">
          {visibleNav.map((n) => (
            <button key={n.key} className={current.key === n.key ? 'active' : ''} onClick={() => setPage(n.key)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="role-switch">
          <span className="small" title={account.permissions.join('；')}>
            {ROLE_LABELS[role]} · {account.name.split('（')[0]}
          </span>
          <button
            className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
            onClick={() => {
              resetDemo();
              setPage('overview');
            }}
            title="恢复内置演示数据"
          >
            重置演示
          </button>
          <button
            className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
            onClick={logout}
          >
            切换账号
          </button>
        </div>
      </header>

      <main className="main">
        <div className="page-head">
          <h1>{current.label}</h1>
          <div className="desc">{current.desc}</div>
        </div>

        {current.key === 'overview' && <OverviewPage onNavigate={setPage} onOpenEvent={openEvent} />}
        {current.key === 'supervise' && <SupervisePage onOpenEvent={openEvent} />}
        {current.key === 'resident' && <ResidentPage onOpenEvent={openEvent} />}
        {current.key === 'bulky' && <BulkyPage onOpenEvent={openEvent} />}
        {current.key === 'hauling' && <HaulingPage onOpenEvent={openEvent} />}
        {current.key === 'community' && <CommunityPage onOpenEvent={openEvent} onNavigate={setPage} />}
        {current.key === 'sites' && <SitesPage onOpenEvent={openEvent} />}
        {current.key === 'watchlist' && <WatchlistPage onNavigate={setPage} />}
      </main>

      {detailEventId && <EventDetailModal eventId={detailEventId} onClose={() => setDetailEventId(null)} />}
    </div>
  );
}

function LoginGate({ onLogin }: { onLogin: (acc: DemoAccount) => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('community');
  const [password, setPassword] = useState('');

  const submit = () => {
    const acc = DEMO_ACCOUNTS.find((a) => a.username === username.trim() && a.password === password);
    if (!acc) {
      toast('账号或密码不正确，请参考 README 中的演示账号');
      return;
    }
    onLogin(acc);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #14532d, #15803d 55%, #22c55e)',
        padding: 20,
      }}
    >
      <div className="card" style={{ width: 760, maxWidth: '100%', display: 'grid', gridTemplateColumns: 'minmax(0,5fr) minmax(0,4fr)', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 28, background: 'var(--green-light)' }}>
          <div style={{ fontSize: 30 }}>♻️</div>
          <h2 style={{ fontSize: 18, margin: '8px 0' }}>社区垃圾分类督导与误投整改平台</h2>
          <p className="small muted" style={{ marginBottom: 12 }}>
            督导记录 → 清运反馈 → 整改任务 → 复查 / 教育 / 积分恢复 → 点位档案 → 专项治理，一条链闭环。
          </p>
          <div className="stack">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.username}
                className="btn btn-outline btn-sm"
                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                onClick={() => {
                  setUsername(a.username);
                  setPassword(a.password);
                }}
                title="点击自动填入该演示账号"
              >
                {ROLE_LABELS[a.role]} · {a.name}
              </button>
            ))}
          </div>
          <p className="small muted" style={{ marginTop: 12 }}>
            点击左侧角色按钮可自动填入演示账号与密码。
          </p>
        </div>
        <div style={{ padding: 28 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16 }}>演示登录</h2>
          <div className="field" style={{ marginBottom: 12 }}>
            <label>账号</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="如 community" />
          </div>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="见 README 演示账号表"
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={submit}>
            登录
          </button>
          <p className="small muted" style={{ marginTop: 14 }}>
            演示环境为前端鉴权（账号信息见 README），不连接真实数据库；业务数据保存在浏览器 localStorage，可用顶栏「重置演示」恢复。
          </p>
        </div>
      </div>
    </div>
  );
}
