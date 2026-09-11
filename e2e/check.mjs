import { chromium } from 'playwright-core';

const BASE = process.env.BASE_URL || 'http://host.docker.internal:3023';
const results = [];
const ok = (name, cond, extra = '') => {
  results.push({ name, pass: !!cond, extra });
  console.log(`${cond ? '✅' : '❌'} ${name} ${extra}`);
};

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

await page.goto(BASE, { waitUntil: 'networkidle' });

// ---- 登录（督导员）----
await page.locator('input[type="text"], input:not([type])').first().fill('supervisor');
await page.locator('input[type="password"]').first().fill('sup123');
await page.getByRole('button', { name: '登录' }).click();
await page.getByRole('button', { name: '督导记录' }).click();
await page.waitForTimeout(300);

// 选择器：按字段标签定位
const fieldSelect = (label) => page.locator('.field', { hasText: label }).first().locator('select');
const buildingSelect = fieldSelect('居民楼栋');
const submitBtn = page.getByRole('button', { name: '提交误投记录' });

// 住户下拉：证据绑定方式区域内含 QR- 选项的 select（绑定楼栋/匿名时不渲染）
const residentSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'QR-' }) });

const readState = async () => {
  return await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('waste-supervision-v2'));
    return raw.state;
  });
};
const resetDemo = async () => {
  await page.getByRole('button', { name: '重置演示' }).click();
  await page.waitForTimeout(200);
  // 重置演示会回到工作台，需重新进入督导记录页
  await page.getByRole('button', { name: '督导记录' }).first().click();
  await page.waitForTimeout(300);
};
const choosePill = (text) => page.locator('.pill-radio label', { hasText: text }).click();
const newestEvent = (st) => st.events[0];

// 种子基线
let st0 = await readState();
const seedPoints = Object.fromEntries(st0.residents.map((r) => [r.id, r.points]));
console.log('种子积分:', seedPoints);
const r1Before = seedPoints.r1; // 王阿姨 72（3 号楼）

// ===== 路径 1：默认提交（默认 1 号楼）=====
{
  // 默认楼栋文本
  const defaultBuilding = await buildingSelect.inputValue();
  const defaultBuildingText = await buildingSelect.locator('option:checked').innerText();
  ok('P1 默认楼栋为 1 号楼', defaultBuildingText.includes('1 号楼'), `(${defaultBuildingText})`);

  // 住户下拉里的选项必须全部属于 1 号楼
  const residentOptions = await residentSelect.locator('option').allInnerTexts();
  ok(
    'P1 默认住户属于 1 号楼（张女士 1-303），不含王阿姨',
    residentOptions.some((t) => t.includes('张女士') && t.includes('1-303')) &&
      !residentOptions.some((t) => t.includes('王阿姨')),
    `(${residentOptions.map((s) => s.trim()).join(' | ')})`,
  );
  const chosenText = await residentSelect.locator('option:checked').innerText();
  ok('P1 默认选中住户为张女士', chosenText.includes('张女士'), `(${chosenText.trim()})`);

  await submitBtn.click();
  await page.waitForTimeout(300);
  const st = await readState();
  const ev = newestEvent(st);
  ok('P1 事件楼栋=1 号楼(b1)', ev.buildingId === 'b1', `(${ev.buildingId})`);
  ok('P1 事件住户=张女士(r3)', ev.residentId === 'r3' && ev.bindTarget === 'resident', `(${ev.residentId}/${ev.bindTarget})`);
  const r3 = st.residents.find((r) => r.id === 'r3');
  const r1 = st.residents.find((r) => r.id === 'r1');
  ok('P1 张女士积分扣 10 并冻结', r3.points === seedPoints.r3 - 10 && r3.frozen === true, `(${r3.points}, frozen=${r3.frozen})`);
  ok('P1 王阿姨积分未受影响', r1.points === r1Before, `(r1=${r1.points})`);
  await resetDemo();
}

// ===== 路径 2：切换楼栋后提交（1→3 号楼；再切 5 号楼）=====
{
  // 切到 3 号楼
  await buildingSelect.selectOption({ label: '3 号楼' });
  await page.waitForTimeout(200);
  const opts3 = await residentSelect.locator('option').allInnerTexts();
  ok(
    'P2 切到 3 号楼后住户列表同步（王阿姨/李先生/孙大爷，无张女士）',
    opts3.some((t) => t.includes('王阿姨')) && opts3.some((t) => t.includes('孙大爷')) && !opts3.some((t) => t.includes('张女士')),
    `(${opts3.map((s) => s.trim()).join(' | ')})`,
  );
  const chosen3 = await residentSelect.locator('option:checked').innerText();
  ok('P2 默认选中 3 号楼第一位住户（王阿姨）', chosen3.includes('王阿姨'), `(${chosen3.trim()})`);
  await submitBtn.click();
  await page.waitForTimeout(300);
  let st = await readState();
  let ev = newestEvent(st);
  ok('P2 事件楼栋=3 号楼(b2) 且住户=王阿姨(r1)', ev.buildingId === 'b2' && ev.residentId === 'r1', `(${ev.buildingId}/${ev.residentId})`);
  let r1 = st.residents.find((r) => r.id === 'r1');
  ok('P2 王阿姨积分扣 10（72→62）', r1.points === r1Before - 10, `(${r1.points})`);
  await resetDemo();

  // 再切 5 号楼
  await buildingSelect.selectOption({ label: '5 号楼' });
  await page.waitForTimeout(200);
  const opts5 = await residentSelect.locator('option').allInnerTexts();
  ok('P2 切到 5 号楼后只显示陈师傅', opts5.some((t) => t.includes('陈师傅')) && opts5.length === 1, `(${opts5.map((s) => s.trim())})`);
  await submitBtn.click();
  await page.waitForTimeout(300);
  st = await readState();
  ev = newestEvent(st);
  const r4 = st.residents.find((r) => r.id === 'r4');
  ok('P2 事件楼栋=5 号楼(b3) 且住户=陈师傅(r4)', ev.buildingId === 'b3' && ev.residentId === 'r4', `(${ev.buildingId}/${ev.residentId})`);
  ok('P2 陈师傅积分扣 10（40→30）', r4.points === seedPoints.r4 - 10, `(${r4.points})`);
  await resetDemo();
}

// ===== 路径 3：只绑定楼栋（3 号楼），不扣任何住户积分 =====
{
  await buildingSelect.selectOption({ label: '3 号楼' });
  await page.waitForTimeout(150);
  await choosePill('绑定楼栋');
  await page.waitForTimeout(150);
  // 绑定楼栋时不应出现住户下拉
  const residentVisible = await page.locator('select').filter({ hasText: '王阿姨' }).count();
  ok('P3 绑定楼栋模式下无住户下拉', residentVisible === 0, `(select count=${residentVisible})`);
  await submitBtn.click();
  await page.waitForTimeout(300);
  const st = await readState();
  const ev = newestEvent(st);
  ok('P3 事件绑定楼栋(building) 且 residentId 为空', ev.bindTarget === 'building' && ev.residentId === null, `(${ev.bindTarget}/${ev.residentId})`);
  ok('P3 事件楼栋=3 号楼(b2)', ev.buildingId === 'b2', `(${ev.buildingId})`);
  const allUnchanged = st.residents.every((r) => r.points === seedPoints[r.id]);
  ok('P3 所有住户积分不变、无新增冻结', allUnchanged, `(${st.residents.map((r) => `${r.id}:${r.points}`).join(',')})`);
  await resetDemo();
}

// ===== 路径 4：匿名提交（8 号楼），不扣积分 =====
{
  await buildingSelect.selectOption({ label: '8 号楼' });
  await page.waitForTimeout(150);
  await choosePill('匿名事件');
  await page.waitForTimeout(150);
  await submitBtn.click();
  await page.waitForTimeout(300);
  const st = await readState();
  const ev = newestEvent(st);
  ok('P4 事件匿名(anonymous) 且 residentId 为空', ev.bindTarget === 'anonymous' && ev.residentId === null, `(${ev.bindTarget}/${ev.residentId})`);
  ok('P4 事件楼栋=8 号楼(b4)', ev.buildingId === 'b4', `(${ev.buildingId})`);
  const allUnchanged = st.residents.every((r) => r.points === seedPoints[r.id]);
  ok('P4 所有住户积分不变', allUnchanged, `(${st.residents.map((r) => `${r.id}:${r.points}`).join(',')})`);

  // 列表卡片 UI 复核：最新匿名卡片含“匿名事件”徽标
  const firstCard = page.locator('.card .stack > div').first();
  const cardText = await firstCard.innerText();
  ok('P4 列表首卡展示匿名事件徽标与 8 号楼归属', cardText.includes('匿名事件') && cardText.includes('8 号楼'), '');
}

// 截图存档
await page.screenshot({ path: '/e2e/p4-anonymous.png', fullPage: true });

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
await browser.close();
process.exit(failed.length ? 1 : 0);
