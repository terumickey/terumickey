const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { chromium } = require('playwright');
const nodemailer = require('nodemailer');

const STATE_FILE = path.join(__dirname, 'state.json');
const DISCOVER_TEXT_FILE = path.join(__dirname, 'day-select.txt');
const DISCOVER_SCREENSHOT_FILE = path.join(__dirname, 'day-select.png');

const LOGIN_URL = requireEnv('RESONA_LOGIN_URL');
const RESONA_ID = requireEnv('RESONA_ID');
const RESONA_PASSWORD = requireEnv('RESONA_PASSWORD');

// 空席通知の対象にしたい日程(「2026/08/05」のように部分一致で判定)
const TARGET_DATES = splitList(process.env.TARGET_DATES);

const isDiscoverMode = process.argv.includes('--discover');

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`環境変数 ${name} が設定されていません。.env を確認してください。`);
    process.exit(1);
  }
  return value;
}

function splitList(value) {
  return (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadState() {
  if (!fs.existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });
  await page.fill('input[name="gksid"]', RESONA_ID);
  await page.fill('input[name="gkspw"]', RESONA_PASSWORD);
  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.click('#loginbtn'),
  ]);
}

// トップページ →(予約確認へ)→(日程を変更するへ)→ 日程選択(空席状況)ページ
async function goToDaySelect(page) {
  await page.waitForTimeout(1000);

  const freeEventFormName = await page.evaluate(() => {
    const forms = Array.from(document.forms).filter((f) => /^form_free_event_\d+$/.test(f.name));
    return forms.length ? forms[0].name : null;
  });

  if (!freeEventFormName) {
    throw new Error(
      '予約確認フォーム(form_free_event_N)が見つかりませんでした。マイページの画面構成が変わった可能性があります。'
    );
  }

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.evaluate((name) => document.forms[name].submit(), freeEventFormName),
  ]);
  await page.waitForTimeout(1000);

  const hasChangeForm = await page.evaluate(() => !!document.forms['form_change']);
  if (!hasChangeForm) {
    throw new Error(
      '「申込内容を変更する」フォーム(form_change)が見つかりませんでした。予約内容確認ページの構成が変わった可能性があります。'
    );
  }

  await Promise.all([
    page.waitForLoadState('networkidle'),
    page.evaluate(() => document.forms['form_change'].submit()),
  ]);
  await page.waitForTimeout(1000);
}

// 「満席」ラベルは対象日程の行の直前の行に出る形式になっているため、
// 日程を含む行から遡って直近の空行以外の行を見て判定する
function isDateFull(lines, dateIndex) {
  for (let i = dateIndex - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '') continue;
    return line === '満席';
  }
  return false;
}

function checkTargetDates(pageText) {
  const lines = pageText.split('\n');
  const results = [];

  for (const targetDate of TARGET_DATES) {
    const idx = lines.findIndex((l) => l.includes(targetDate));
    if (idx === -1) {
      results.push({ date: targetDate, found: false, full: null });
      continue;
    }
    results.push({ date: targetDate, found: true, full: isDateFull(lines, idx) });
  }

  return results;
}

async function sendMail(subject, body) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: requireEnv('GMAIL_USER'),
      pass: requireEnv('GMAIL_APP_PASSWORD'),
    },
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: requireEnv('NOTIFY_TO'),
    subject,
    text: body,
  });
}

async function runDiscover(page) {
  await goToDaySelect(page);

  const text = await page.innerText('body');
  fs.writeFileSync(DISCOVER_TEXT_FILE, text, 'utf-8');
  await page.screenshot({ path: DISCOVER_SCREENSHOT_FILE, fullPage: true });

  console.log('日程選択ページに到達しました。');
  console.log('URL:', page.url());
  console.log(`ページ本文を ${DISCOVER_TEXT_FILE} に保存しました。`);
  console.log(`スクリーンショットを ${DISCOVER_SCREENSHOT_FILE} に保存しました。`);
}

async function runCheck(page) {
  if (TARGET_DATES.length === 0) {
    console.error('環境変数 TARGET_DATES が設定されていません(例: 2026/08/05,2026/08/24)。.env を確認してください。');
    process.exitCode = 1;
    return;
  }

  await goToDaySelect(page);
  const url = page.url();
  const text = await page.innerText('body');
  const results = checkTargetDates(text);
  const prevState = loadState();
  const prevByDate = prevState.dates || {};
  const now = new Date().toISOString();

  const nextByDate = {};
  const newlyOpened = [];

  for (const r of results) {
    if (!r.found) {
      console.warn(`[${now}] 日程 "${r.date}" がページ内に見つかりませんでした。募集終了か表記の変更の可能性があります。`);
      continue;
    }

    const status = r.full ? 'full' : 'open';
    console.log(`[${now}] ${r.date}: ${status}`);

    nextByDate[r.date] = status;

    if (status === 'open' && prevByDate[r.date] !== 'open') {
      newlyOpened.push(r.date);
    }
  }

  if (newlyOpened.length > 0) {
    await sendMail(
      'りそなインターン: 空席が出ました',
      [
        '以下の日程に空席が出ました。至急マイページを確認してください。',
        '',
        ...newlyOpened.map((d) => `・${d}`),
        '',
        url,
        '',
        `検出時刻: ${new Date().toLocaleString('ja-JP')}`,
      ].join('\n')
    );
    console.log('通知メールを送信しました:', newlyOpened.join(', '));
  }

  saveState({ dates: nextByDate, checkedAt: now });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await login(page);

    if (isDiscoverMode) {
      await runDiscover(page);
    } else {
      await runCheck(page);
    }
  } catch (err) {
    console.error('チェック中にエラーが発生しました:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
