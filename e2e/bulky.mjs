import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://host.docker.internal:3023';
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond });
  console.log(`${cond ? '✅' : '❌'} ${name} ${extra}`);
};

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

const readState = async () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('waste-supervision-v2')).state);

// 登录社区账号（可执行督导关联与清运完成全部动作）
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.locator('input:not([type])').first().fill('community');
await page.locator('input[type="password"]').first().fill('community123');
await page.getByRole('button', { name: '登录' }).click();
await page.getByRole('button', { name: '大件预约' }).click();
await page.waitForTimeout(400);

const formCard = page.locator('.card', { hasText: '大件垃圾投放预约' }).first();
const buildingSelect = formCard.locator('select').first();
const residentSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'QR-' }) }).first();
const pill = (t) => page.locator('.pill-radio label', { hasText: t }).first();
const cardByCode = (code) =>
  page.locator('.mono', { hasText: code }).first().locator('xpath=ancestor::div[contains(@style,"border: 1px solid")][1]');

let st = await readState();
const s3CostBefore = st.archives.find((a) => a.siteId === 's3').cleaningCosts.reduce((s, c) => s + c.amount, 0);
const briefingsBefore = st.archives.find((a) => a.siteId === 's3').briefings.length;
const r2Before = st.residents.find((r) => r.id === 'r2').points; // 李先生 210
const r4Before = st.residents.find((r) => r.id === 'r4').points; // 陈师傅 40
const apptCountBefore = st.bulkyAppointments.length;

// ===== Flow A：1 号楼有电梯住户提交家具预约 → 自动排期 =====
{
  await buildingSelect.selectOption({ value: 'b1' });
  await page.waitForTimeout(200);
  const residentText = await residentSelect.locator('option:checked').innerText();
  ok('A 1 号楼预约人自动同步为张女士', residentText.includes('张女士'), `(${residentText.trim()})`);
  await formCard.locator('input[type="number"]').first().fill('3'); // 楼层
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const target = date.toISOString().slice(0, 10);
  await formCard.locator('input[type="date"]').fill(target);
  await page.waitForTimeout(200);
  const panel = page.locator('text=系统排期建议').first();
  ok('A 容量可行，出现系统排期建议', (await panel.count()) === 1);
  const panelText = await page.locator('.card', { hasText: '系统排期建议' }).first().innerText();
  ok('A 排期说明含楼栋电梯/车次/暂存容量', panelText.includes('电梯') && panelText.includes('车次') && panelText.includes('暂存'), '');

  await page.getByRole('button', { name: '提交预约并按建议排期' }).click();
  await page.waitForTimeout(300);
  st = await readState();
  const appt = st.bulkyAppointments[0];
  ok('A 新预约已生成', st.bulkyAppointments.length === apptCountBefore + 1, appt.code);
  ok('A 预约归属 s3 暂存点 / 1 号楼 / 张女士', appt.siteId === 's3' && appt.buildingId === 'b1' && appt.residentId === 'r3', `(${appt.siteId}/${appt.buildingId}/${appt.residentId})`);
  ok('A 已排期且时段非空', appt.status === 'scheduled' && !!appt.scheduledDate && !!appt.scheduledSession, `(${appt.status} ${appt.scheduledDate} ${appt.scheduledSession})`);
}

// ===== Flow B：3 号楼无电梯 5 楼床垫 → 优先上午车次 =====
let codeB;
{
  await buildingSelect.selectOption({ value: 'b2' });
  await page.waitForTimeout(200);
  // 显式选择李先生（无在办事件、初始未冻结），避免与默认第一位王阿姨的既有冻结混淆
  await residentSelect.selectOption({ label: (await residentSelect.locator('option').allInnerTexts()).find((t) => t.includes('李先生')) });
  await pill('床垫').click();
  await formCard.locator('input[type="number"]').first().fill('5');
  await page.waitForTimeout(250);
  const panelText = await page.locator('.card', { hasText: '系统排期建议' }).first().innerText();
  ok('B 无电梯高楼层优先上午并加派搬运工', panelText.includes('上午') && panelText.includes('搬运工'), `(${panelText.split('；').filter((x) => x.includes('上午') || x.includes('搬运')).join('/')})`);
  await page.getByRole('button', { name: '提交预约并按建议排期' }).click();
  await page.waitForTimeout(300);
  st = await readState();
  codeB = st.bulkyAppointments[0].code;
  ok('B 床垫预约排入上午时段', st.bulkyAppointments[0].scheduledSession.includes('上午'), `(${codeB} ${st.bulkyAppointments[0].scheduledSession})`);
}

// ===== Flow C：督导把提前丢弃照片关联到预约 → 生成大件误投事件并冻结积分 =====
let linkedEventCode;
{
  const card = cardByCode(codeB);
  await card.getByRole('button', { name: /居民提前丢弃了/ }).click();
  await card.getByRole('button', { name: '确认关联并生成误投事件' }).click();
  await page.waitForTimeout(400);
  st = await readState();
  const appt = st.bulkyAppointments.find((a) => a.code === codeB);
  ok('C 预约状态变为提前丢弃', appt.status === 'early-dumped' && !!appt.earlyDump, `(${appt.status})`);
  const ev = st.events.find((e) => e.id === appt.earlyDump.linkedEventId);
  linkedEventCode = ev.code;
  ok('C 已生成大件误投事件并双向关联', ev.category === 'bulky' && ev.bulkyAppointmentId === appt.id && ev.buildingId === 'b2', `(${ev.code})`);
  ok('C 事件绑定 3 号楼住户李先生', ev.residentId === 'r2' && ev.bindTarget === 'resident', `(${ev.residentId})`);
  const r2 = st.residents.find((r) => r.id === 'r2');
  ok('C 李先生积分未扣但被冻结（待整改）', r2.points === r2Before && r2.frozen === true, `(${r2.points}, frozen=${r2.frozen})`);

  // 弹窗内复查通过（教育尚未完成 → 事件保持复查通过待闭环）
  await page.getByRole('button', { name: '复查通过' }).click();
  await page.waitForTimeout(300);
  st = await readState();
  const ev2 = st.events.find((e) => e.id === appt.earlyDump.linkedEventId);
  ok('C 事件复查通过但未闭环（教育未完成）', ev2.status === 'rechecked', `(${ev2.status})`);
  await page.locator('.close-x').click();
  await page.waitForTimeout(200);
}

// ===== Flow D：清运完成（提前丢弃）→ 保洁成本入档案、事件闭环、居民解冻 =====
{
  const card = cardByCode(codeB);
  await card.getByRole('button', { name: '登记清运完成' }).click();
  await card.locator('input[type="number"]').fill('200');
  const coopSelect = card.locator('.field', { hasText: '居民配合情况' }).locator('select');
  await coopSelect.selectOption({ value: 'early-dumped' });
  await card.getByRole('button', { name: '确认清运完成并同步档案' }).click();
  await page.waitForTimeout(400);
  st = await readState();
  const appt = st.bulkyAppointments.find((a) => a.code === codeB);
  ok('D 预约清运完成并记录保洁成本', appt.status === 'completed' && appt.haulResult.cleaningCost === 200, `(¥${appt.haulResult.cleaningCost})`);
  const s3Cost = st.archives.find((a) => a.siteId === 's3').cleaningCosts;
  ok('D ¥200 保洁成本回到 s3 点位档案', s3Cost.some((c) => c.amount === 200 && c.note.includes(codeB)), `(累计 ${s3Cost.reduce((s, c) => s + c.amount, 0)})`);
  const ev = st.events.find((e) => e.bulkyAppointmentId === appt.id);
  ok('D 复查+大件宣导完成后关联事件闭环', ev.status === 'closed' && ev.educationDone === true && ev.pointsRestored === true, `(${ev.status})`);
  const r2 = st.residents.find((r) => r.id === 'r2');
  ok('D 提前丢弃不奖分，整改闭环后解冻', r2.points === r2Before && r2.frozen === false, `(${r2.points}, frozen=${r2.frozen})`);
}

// ===== Flow E：规范投放清运完成 → 居民 +5 分 =====
{
  const card = cardByCode('YY-20260910-03'); // 陈师傅冰箱
  await card.getByRole('button', { name: '登记清运完成' }).click();
  await card.locator('input[type="number"]').fill('100');
  await card.getByRole('button', { name: '确认清运完成并同步档案' }).click(); // 默认配合良好
  await page.waitForTimeout(400);
  st = await readState();
  const appt = st.bulkyAppointments.find((a) => a.code === 'YY-20260910-03');
  const r4 = st.residents.find((r) => r.id === 'r4');
  ok('E 规范投放 +5 分', appt.haulResult.pointsDelta === 5 && r4.points === r4Before + 5, `(${r4Before}→${r4.points})`);
  const s3Cost = st.archives.find((a) => a.siteId === 's3').cleaningCosts;
  ok('E ¥100 保洁成本同步入档案', s3Cost.some((c) => c.amount === 100 && c.note.includes('YY-20260910-03')));
}

// ===== Flow F：按楼栋误投类型生成宣导重点 =====
{
  // 8 号楼：有大件提前丢弃种子（a1）
  await buildingSelect.selectOption({ value: 'b4' });
  await page.waitForTimeout(250);
  const focusCard = page.locator('.card', { hasText: '宣导重点' }).first();
  const focusText = await focusCard.innerText();
  ok('F 8 号楼宣导重点含大件提前丢弃', focusText.includes('大件'), `(${focusText.split('\n').slice(0, 2).join(' / ')})`);
  await focusCard.getByRole('button', { name: /按此重点安排楼栋宣导/ }).click();
  await page.waitForTimeout(300);
  st = await readState();
  const briefings = st.archives.find((a) => a.siteId === 's3').briefings;
  ok('F 宣导记录写入 s3 点位档案', briefings.length === briefingsBefore + 1 && briefings[0].buildingId === 'b4', `(topic: ${briefings[0].topic.slice(0, 30)}…)`);

  // 3 号楼：高发湿垃圾 → 重点应含湿垃圾破袋
  await buildingSelect.selectOption({ value: 'b2' });
  await page.waitForTimeout(250);
  const t2 = await page.locator('.card', { hasText: '宣导重点' }).first().innerText();
  ok('F 3 号楼宣导重点含湿垃圾', t2.includes('湿垃圾'), '');
}

// ===== 汇总 =====
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
await browser.close();
process.exit(failed.length ? 1 : 0);
