const app = document.getElementById('app');
const tabs = document.getElementById('tabs');

/* ============================================================
   基础请求 / 工具
   ============================================================ */
async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...opts,
    });
  } catch {
    throw new Error('网络连接失败，请稍后重试');
  }
  if (res.status === 401) {
    renderLogin();
    const err = new Error('未登录');
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `请求失败(${res.status})`);
  }
  return res.json();
}

// 训练计划是静态数据：缓存首次结果，避免各页面重复请求
let planPromise = null;
function getPlan() {
  if (!planPromise) {
    planPromise = api('/api/plan').catch(e => { planPromise = null; throw e; });
  }
  return planPromise;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 用本地时区格式化为 YYYY-MM-DD(避免 toISOString 的 UTC 偏移)
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayISO() {
  return toISODate(new Date());
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function pulse(el) {
  if (!el) return;
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

/* ============================================================
   Toast / 轻确认弹窗（替代 alert / confirm）
   ============================================================ */
let toastTimer = null;
function toast(message, kind = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.className = 'toast' + (kind === 'error' ? ' toast-error' : '');
  el.innerHTML = `<span class="toast-dot">${kind === 'error' ? '!' : '✓'}</span><span class="toast-msg">${escapeHtml(message)}</span>`;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

function askConfirm(message, { confirmText = '删除', cancelText = '取消' } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `<div class="dialog" role="dialog" aria-modal="true">
      <p class="dialog-msg">${escapeHtml(message)}</p>
      <div class="dialog-actions">
        <button type="button" class="btn-ghost" data-act="cancel">${escapeHtml(cancelText)}</button>
        <button type="button" class="btn-danger" data-act="ok">${escapeHtml(confirmText)}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const onKey = e => { if (e.key === 'Escape') close(false); };
    const close = val => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 170);
      resolve(val);
    };
    overlay.querySelector('[data-act="cancel"]').onclick = () => close(false);
    overlay.querySelector('[data-act="ok"]').onclick = () => close(true);
    overlay.onclick = e => { if (e.target === overlay) close(false); };
    document.addEventListener('keydown', onKey);
  });
}

/* ============================================================
   统计计算（全部基于真实数据，不编造）
   ============================================================ */
function sortSessions(list) {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}

function greetText(iso) {
  const d = new Date(iso + 'T00:00:00');
  const wk = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
  return `${wk} · ${d.getMonth() + 1}月${d.getDate()}日`;
}

function fmtVolume(v) {
  if (!v) return '0';
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 't';
  return Math.round(v) + 'kg';
}

function weekStartISO(iso) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toISODate(d);
}

function weekCountOf(list, refISO) {
  const start = weekStartISO(refISO);
  const end = toISODate(new Date(new Date(start + 'T00:00:00').getTime() + 6 * 86400000));
  return list.filter(s => s.date >= start && s.date <= end).length;
}

// 连续训练天数：从今天（今天没练则从昨天）向前连续计数
function computeStreak(list, refISO) {
  const set = new Set(list.map(s => s.date));
  if (!set.size) return 0;
  const d = new Date(refISO + 'T00:00:00');
  if (!set.has(toISODate(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (set.has(toISODate(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function paintStreak(n) {
  const el = document.getElementById('heroStreak');
  if (!el) return;
  el.classList.toggle('muted-streak', n <= 0);
  el.innerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-flame" /></svg>${n > 0 ? `连续 ${n} 天` : '开始记录'}`;
}

/* ============================================================
   登录页
   ============================================================ */
function renderLogin() {
  tabs.hidden = true;
  app.innerHTML = `<main class="login-main"><section class="card login-card">
    <div class="login-logo"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-dumbbell" /></svg></div>
    <h1 class="login-title">健身记录</h1>
    <p class="login-sub">请输入密码进入</p>
    <input type="password" id="pw" placeholder="密码" autocomplete="current-password" />
    <button type="button" class="primary big" id="go">进入</button>
  </section></main>`;

  const submit = async () => {
    const password = document.getElementById('pw').value;
    if (!password) { toast('请输入密码', 'error'); return; }
    const btn = document.getElementById('go');
    btn.disabled = true;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) boot();
      else toast(res.status === 401 ? '密码错误' : '登录失败，请重试', 'error');
    } catch {
      toast('网络连接失败，请稍后重试', 'error');
    } finally {
      btn.disabled = false;
    }
  };
  document.getElementById('go').onclick = submit;
  document.getElementById('pw').onkeydown = e => { if (e.key === 'Enter') submit(); };
  document.getElementById('pw').focus();
}

/* ============================================================
   启动 / 标签切换
   ============================================================ */
async function boot() {
  try {
    await getPlan();
  } catch (e) {
    if (e.status === 401) return; // 已在 api() 内渲染登录页
    app.innerHTML = `<main><section class="card load-fail">
      <h3>加载失败</h3><p>${escapeHtml(e.message || '未知错误')}</p>
      <button type="button" class="primary" id="retry">重试</button>
    </section></main>`;
    document.getElementById('retry').onclick = boot;
    return;
  }
  tabs.hidden = false;
  tabs.querySelectorAll('button').forEach(b => {
    b.onclick = () => showTab(b.dataset.tab);
  });
  showTab('today');
}

function showTab(name) {
  // 离开图表页时销毁实例，避免残留引用与后台重绘
  if (name !== 'charts') {
    window.wChart?.destroy(); window.wChart = null;
    window.cChart?.destroy(); window.cChart = null;
  }
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  const fn = { today: renderToday, plan: renderPlan, history: renderHistory, charts: renderCharts, checkin: renderCheckin }[name];
  if (fn) fn();
}

/* ============================================================
   今天：激励头部 + 进度 + 三格数据 + 记录
   ============================================================ */
async function renderToday() {
  const { days } = await getPlan();
  if (!days.length) {
    app.innerHTML = `<main><div class="empty">还没有训练计划。</div></main>`;
    return;
  }

  let sessions = sortSessions((await api('/api/sessions')).sessions);
  const today = todayISO();
  let selectedDate = today;
  const latest = sessions[sessions.length - 1];
  let selectedDayId = (latest && days.some(d => d.id === latest.day_id)) ? latest.day_id : days[0].id;
  let currentLogs = [];

  const dayById = id => days.find(d => d.id === id) || days[0];
  const draftKey = id => 'draft_' + id;

  app.innerHTML = `<main>
    <header class="hero">
      <div class="hero-left">
        <div class="greet" id="heroGreet">${escapeHtml(greetText(selectedDate))}</div>
        <div class="day-name" id="heroDay">${escapeHtml(dayById(selectedDayId).name)}</div>
        <button type="button" class="hero-date" id="heroDateBtn" aria-label="选择日期">${escapeHtml(greetText(selectedDate))}</button>
        <input type="date" class="sr-only" id="dateIn" value="${today}" />
      </div>
      <div class="streak" id="heroStreak"></div>
    </header>

    <section class="bar-sec">
      <div class="progress-label" id="progLabel">今日进度</div>
      <div class="bar"><i id="progBar"></i></div>
      <div class="bar-meta"><span id="progDone">已完成 0</span><span id="progLeft">剩余 0</span></div>
    </section>

    <div class="stats">
      <div class="stat"><b id="stSets">0</b><span>今日组数</span></div>
      <div class="stat"><b id="stVol">0</b><span>总容量</span></div>
      <div class="stat"><b id="stWeek">0</b><span>本周次数</span></div>
    </div>

    <div class="chips" id="dayChips">
      ${days.map(d => `<button type="button" class="chip${d.id === selectedDayId ? ' active' : ''}" data-day="${d.id}">${escapeHtml(d.name)}</button>`).join('')}
    </div>

    <div id="exWrap"></div>
    <button type="button" class="primary big" id="save">完成本次训练</button>
  </main>`;

  const collect = () => {
    const grouped = {};
    document.querySelectorAll('#exWrap input').forEach(inp => {
      const key = inp.dataset.ex + '_' + inp.dataset.set;
      grouped[key] = grouped[key] || { plan_exercise_id: Number(inp.dataset.ex), set_no: Number(inp.dataset.set) };
      grouped[key][inp.dataset.k] = inp.value === '' ? null : Number(inp.value);
    });
    return grouped;
  };

  function paintView() {
    const day = dayById(selectedDayId);
    setText('heroGreet', greetText(selectedDate));
    setText('heroDay', day.name);
    setText('heroDateBtn', greetText(selectedDate));
    const realDate = document.getElementById('dateIn');
    if (realDate) realDate.value = selectedDate;
    paintStreak(computeStreak(sessions, today));

    const totalEx = day.exercises.length;
    const valid = currentLogs.filter(l => l.weight != null || l.reps != null);
    const doneEx = new Set(valid.map(l => Number(l.plan_exercise_id))).size;
    const pct = totalEx ? Math.round((doneEx / totalEx) * 100) : 0;

    setText('progLabel', `今日进度 · ${doneEx}/${totalEx} 动作`);
    const bar = document.getElementById('progBar');
    if (bar) bar.style.width = pct + '%';
    setText('progDone', `已完成 ${doneEx}`);
    setText('progLeft', `剩余 ${Math.max(totalEx - doneEx, 0)}`);

    setText('stSets', String(valid.length));
    setText('stVol', fmtVolume(valid.reduce((a, l) => a + (Number(l.weight) || 0) * (Number(l.reps) || 0), 0)));
    setText('stWeek', String(weekCountOf(sessions, selectedDate)));
  }

  function draw() {
    const day = dayById(selectedDayId);
    const draft = JSON.parse(localStorage.getItem(draftKey(day.id)) || '{}');
    const doneIds = new Set(currentLogs.filter(l => l.weight != null || l.reps != null).map(l => Number(l.plan_exercise_id)));
    // 已保存的明细用于回填输入框：再次保存时才会带上之前记录的组，避免覆盖丢数据
    const savedRow = {};
    currentLogs.forEach(l => { savedRow[`${l.plan_exercise_id}_${l.set_no}`] = l; });

    document.getElementById('exWrap').innerHTML = day.exercises.map(e => {
      const isDone = doneIds.has(e.id);
      const sets = Array.from({ length: e.target_sets }, (_, i) => i + 1);
      return `<div class="ex${isDone ? ' ex-done' : ''}" data-ex="${e.id}">
        <div class="ex-head">
          <div class="ex-titles">
            <div class="ex-name">${escapeHtml(e.name)}</div>
            <div class="ex-sub">${escapeHtml(e.equipment || '自重')} · ${e.target_sets}×${e.target_reps}</div>
          </div>
          <div class="ex-actions">
            <a class="ex-demo" href="${escapeHtml(e.tutorial_url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(e.name)} 动作示范">示范</a>
            ${isDone ? '<span class="ex-check">✓</span>' : ''}
          </div>
        </div>
        ${sets.map(n => {
          const d = draft[e.id]?.[n];                    // 有草稿时以草稿为准（含显式清空）
          const sv = savedRow[`${e.id}_${n}`] || {};
          const w = d ? (d.weight ?? '') : (sv.weight ?? '');
          const rp = d ? (d.reps ?? '') : (sv.reps ?? '');
          return `<div class="set-row">
            <span class="set-no">第${n}组</span>
            <label class="set-field"><input type="number" inputmode="decimal" step="0.5" placeholder="—" aria-label="${escapeHtml(e.name)} 第${n}组 重量" data-ex="${e.id}" data-set="${n}" data-k="weight" value="${w}" /><span class="unit">kg</span></label>
            <label class="set-field"><input type="number" inputmode="numeric" step="1" placeholder="—" aria-label="${escapeHtml(e.name)} 第${n}组 次数" data-ex="${e.id}" data-set="${n}" data-k="reps" value="${rp}" /><span class="unit">次</span></label>
          </div>`;
        }).join('')}
      </div>`;
    }).join('');

    // 输入即存草稿，防手滑丢数据；回车跳下一格，方便连续录入
    const inputs = [...document.querySelectorAll('#exWrap input')];
    inputs.forEach((inp, i) => {
      inp.oninput = () => {
        localStorage.setItem(draftKey(selectedDayId), JSON.stringify(collect()));
      };
      inp.enterKeyHint = i === inputs.length - 1 ? 'done' : 'next';
      inp.onkeydown = ev => {
        if (ev.key !== 'Enter') return;
        ev.preventDefault();
        if (inputs[i + 1]) inputs[i + 1].focus();
        else inp.blur();
      };
    });
  }

  let sessionsLoaded = false;   // 页面内会话缓存标记

  async function syncView(useCache = false) {
    if (!useCache || !sessionsLoaded) {
      sessions = sortSessions((await api('/api/sessions')).sessions);
      sessionsLoaded = true;
    }
    const matches = sessions.filter(s => s.date === selectedDate && s.day_id === selectedDayId);
    const session = matches[matches.length - 1] || null;
    if (session) {
      try {
        const { logs } = await api('/api/set-logs?session_id=' + session.id);
        currentLogs = logs || [];
      } catch {
        currentLogs = [];
      }
    } else {
      currentLogs = [];
    }
    paintView();
    draw();
  }

  document.getElementById('dayChips').addEventListener('click', ev => {
    const btn = ev.target.closest('[data-day]');
    if (!btn) return;
    selectedDayId = Number(btn.dataset.day);
    document.querySelectorAll('#dayChips .chip').forEach(c =>
      c.classList.toggle('active', Number(c.dataset.day) === selectedDayId));
    syncView(true);
  });

  document.getElementById('dateIn').onchange = e => {
    selectedDate = e.target.value || today;
    setText('heroGreet', greetText(selectedDate));
    setText('heroDateBtn', greetText(selectedDate));
    syncView(true);
  };

  document.getElementById('heroDateBtn').addEventListener('click', () => {
    const picker = document.getElementById('dateIn');
    if (!picker) return;
    // showPicker() 在老浏览器不可用时回退 focus
    if (picker.showPicker) picker.showPicker();
    else picker.focus();
  });

  document.getElementById('save').onclick = async () => {
    const grouped = collect();
    const rows = Object.values(grouped).filter(r => r.weight !== null || r.reps !== null);
    if (rows.length === 0) { toast('至少填一组再保存', 'error'); return; }

    const btn = document.getElementById('save');
    btn.disabled = true;
    try {
      // 一次请求提交整次训练：服务端按(日期,训练日)复用 session 并覆盖明细
      await api('/api/sessions', {
        method: 'POST', body: JSON.stringify({ date: selectedDate, day_id: selectedDayId, logs: rows }),
      });
      localStorage.removeItem(draftKey(selectedDayId));
      toast('已保存 · 完成本次训练');
      pulse(btn);
      await syncView();
    } catch (e) {
      localStorage.setItem(draftKey(selectedDayId), JSON.stringify(grouped));
      toast('保存失败，已存本地草稿', 'error');
    } finally {
      btn.disabled = false;
    }
  };

  await syncView();
}

/* ============================================================
   计划
   ============================================================ */
async function renderPlan() {
  const { days } = await getPlan();
  app.innerHTML = `<main>
    <div class="page-head"><h1>训练计划</h1><p>${days.length} 个训练日 · 共 ${days.reduce((a, d) => a + d.exercises.length, 0)} 个动作</p></div>
    ${days.map(d => `
      <section class="card plan-card">
        <h3>${escapeHtml(d.name)}</h3>
        <ol class="plan-list">
          ${d.exercises.map(e => `<li><span class="pe-name">${escapeHtml(e.name)}</span><a class="pe-demo" href="${escapeHtml(e.tutorial_url)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(e.name)} 动作示范">示范</a><span class="pe-meta">${e.target_sets}×${e.target_reps} · ${escapeHtml(e.equipment || '自重')}</span></li>`).join('')}
        </ol>
      </section>`).join('')}
  </main>`;
}

/* ============================================================
   历史记录（游标分页：首屏 50 条 + 加载更多）
   ============================================================ */
let histState = { items: [], hasMore: false, next: null };

async function renderHistory(reset = true) {
  const { days } = await getPlan();
  const dayName = id => (days.find(d => d.id === id) || {}).name || `Day${id}`;
  const exName = id => {
    for (const d of days) {
      const e = d.exercises.find(x => x.id === id);
      if (e) return e.name;
    }
    return `动作${id}`;
  };

  if (reset) {
    const first = await api('/api/history');
    histState = { items: first.items, hasMore: first.hasMore, next: null };
  } else {
    if (!histState.next) return;
    const more = await api('/api/history?before=' + encodeURIComponent(histState.next));
    histState.items = histState.items.concat(more.items);
    histState.hasMore = more.hasMore;
  }
  const last = histState.items[histState.items.length - 1];
  histState.next = last ? `${last.date},${last.id}` : null;

  const detailHtml = s => {
    const valid = s.logs.filter(l => l.weight != null || l.reps != null);
    if (!valid.length) return '<span class="loading-txt">无明细</span>';
    const groups = {};
    valid.forEach(l => { (groups[l.plan_exercise_id] = groups[l.plan_exercise_id] || []).push(l); });
    const vol = valid.reduce((a, l) => a + (Number(l.weight) || 0) * (Number(l.reps) || 0), 0);
    return `<div class="hist-vol">总容量 ${fmtVolume(vol)} · ${valid.length} 组</div>` +
      Object.keys(groups).map(pid => {
        const g = groups[pid].sort((a, b) => a.set_no - b.set_no);
        return `<div class="hist-ex">
          <span class="hist-ex-name">${escapeHtml(exName(Number(pid)))}</span>
          <span class="hist-ex-sets">${g.map(l => `${l.weight ?? '-'}kg×${l.reps ?? '-'}`).join(' · ')}</span>
        </div>`;
      }).join('');
  };

  app.innerHTML = `<main>
    <div class="page-head"><h1>训练记录</h1><p>已加载 ${histState.items.length} 次训练</p></div>
    ${histState.items.length ? histState.items.map(s => `
      <section class="card hist-card">
        <div class="hist-head">
          <div>
            <div class="hist-date">${escapeHtml(s.date)}</div>
            <div class="hist-day">${escapeHtml(dayName(s.day_id))}</div>
          </div>
          <button type="button" class="btn-del" data-del="${s.id}">删除</button>
        </div>
        <div class="hist-detail">${detailHtml(s)}</div>
      </section>`).join('') : '<div class="empty">还没有训练记录，去「今天」记录一次吧。</div>'}
    ${histState.hasMore ? '<button type="button" class="primary big" id="histMore">加载更多</button>' : ''}
  </main>`;

  const moreBtn = document.getElementById('histMore');
  if (moreBtn) moreBtn.onclick = async () => {
    moreBtn.disabled = true;
    try { await renderHistory(false); }
    catch { toast('加载失败，请重试', 'error'); moreBtn.disabled = false; }
  };

  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const ok = await askConfirm('删除这次训练？此操作不可恢复。', { confirmText: '删除' });
    if (!ok) return;
    try {
      await api('/api/sessions?id=' + b.dataset.del, { method: 'DELETE' });
      toast('已删除该次训练');
      renderHistory(true);
    } catch {
      toast('删除失败，请重试', 'error');
    }
  });
}

/* ============================================================
   图表
   ============================================================ */
async function ensureChart() {
  if (window.Chart) return true;
  try {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = '/vendor/chart.umd.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('图表库加载失败'));
      document.head.appendChild(s);
    });
    return !!window.Chart;
  } catch {
    return false;
  }
}

async function renderCharts() {
  const [{ weights }, { sessions }] = await Promise.all([api('/api/body-weights'), api('/api/sessions')]);
  const chartLoaded = await ensureChart();
  app.innerHTML = `<main>
    <div class="page-head"><h1>数据图表</h1><p>体重变化与每周训练频率</p></div>
    <section class="card">
      <div class="row">
        <input type="date" class="control" id="bwDate" value="${todayISO()}" />
        <input type="number" class="control" step="0.1" inputmode="decimal" id="bwVal" placeholder="体重 kg" />
        <button type="button" class="primary" id="bwAdd">记录</button>
      </div>
    </section>
    <section class="card"><h3>体重曲线</h3>${chartLoaded ? '<div class="chart-wrap"><canvas id="wChart"></canvas></div>' : '<p class="loading-txt">图表库加载失败，请刷新重试。</p>'}</section>
    <section class="card"><h3>每周训练次数</h3>${chartLoaded ? '<div class="chart-wrap"><canvas id="cChart"></canvas></div>' : ''}</section>
  </main>`;

  if (chartLoaded) {
    const accent = '#1FBF5F', grid = '#E6E9E0', tick = '#6B7367';
    if (window.wChart) window.wChart.destroy();
    if (window.cChart) window.cChart.destroy();

    window.wChart = new Chart(document.getElementById('wChart'), {
      type: 'line',
      data: {
        labels: weights.map(w => w.date),
        datasets: [{
          label: '体重(kg)',
          data: weights.map(w => w.weight),
          borderColor: accent,
          backgroundColor: 'rgba(31,191,95,.12)',
          fill: true,
          tension: .3,
          pointRadius: 3,
          pointBackgroundColor: accent,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: grid }, ticks: { color: tick } },
          y: { grid: { color: grid }, ticks: { color: tick } },
        },
      },
    });

    const byWeek = {};
    sessions.forEach(s => {
      const key = weekStartISO(s.date);
      byWeek[key] = (byWeek[key] || 0) + 1;
    });
    const keys = Object.keys(byWeek).sort();
    window.cChart = new Chart(document.getElementById('cChart'), {
      type: 'bar',
      data: {
        labels: keys,
        datasets: [{ label: '次数', data: keys.map(k => byWeek[k]), backgroundColor: accent, borderRadius: 6, maxBarThickness: 34 }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: tick } },
          y: { beginAtZero: true, grid: { color: grid }, ticks: { color: tick, precision: 0 } },
        },
      },
    });
  }

  document.getElementById('bwAdd').onclick = async () => {
    const date = document.getElementById('bwDate').value;
    const weight = Number(document.getElementById('bwVal').value);
    if (!weight) { toast('请输入体重', 'error'); return; }
    try {
      await api('/api/body-weights', { method: 'POST', body: JSON.stringify({ date, weight }) });
      toast('已记录体重');
      renderCharts();
    } catch {
      toast('记录失败，请重试', 'error');
    }
  };
}

/* ============================================================
   本周打卡（本周网格 + 近 5 周热力图 + 月度/累计统计 + 近 4 周趋势）
   ============================================================ */
async function renderCheckin() {
  const d = new Date();
  const today = todayISO();
  const monthStart = toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
  const stats = await api('/api/stats?monthStart=' + monthStart);
  const sess = stats.dates.map(date => ({ date }));   // 复用 computeStreak / weekCountOf 所需结构

  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const isoOf = dt => toISODate(dt);
  const done = new Set(stats.dates);
  const labels = ['一','二','三','四','五','六','日'];

  // 1) 本周网格
  const weekCells = labels.map((label, i) => {
    const dt = new Date(monday); dt.setDate(monday.getDate() + i);
    const iso = isoOf(dt);
    const ok = done.has(iso);
    return `<div class="day-cell${ok ? ' done' : ''}${iso === today ? ' today' : ''}">
      <span class="dc-w">周${label}</span>
      <span class="dc-mark">${ok ? '✓' : ''}</span>
      <span class="dc-date">${dt.getMonth() + 1}/${dt.getDate()}</span>
    </div>`;
  }).join('');

  // 2) 近 5 周热力图（周一对齐，5 行 × 7 列）
  let heat = '';
  for (let w = 4; w >= 0; w--) {
    for (let i = 0; i < 7; i++) {
      const dt = new Date(monday); dt.setDate(monday.getDate() - w * 7 + i);
      const iso = isoOf(dt);
      heat += `<div class="heat-cell${done.has(iso) ? ' on' : ''}${iso === today ? ' today' : ''}" title="${iso}"></div>`;
    }
  }

  // 3) 近 4 周趋势（含本周）
  const offsets = [3, 2, 1, 0];
  const counts = offsets.map(o => {
    const ws = new Date(monday); ws.setDate(monday.getDate() - o * 7);
    return weekCountOf(sess, isoOf(ws));
  });
  const maxCount = Math.max(1, ...counts);
  const trend = offsets.map((o, idx) => {
    const ws = new Date(monday); ws.setDate(monday.getDate() - o * 7);
    const h = Math.round((counts[idx] / maxCount) * 100);
    return `<div class="trend-col"><div class="trend-bar" style="height:${h}%">${counts[idx] > 0 ? `<span>${counts[idx]}</span>` : ''}</div><div class="trend-lb">${ws.getMonth() + 1}/${ws.getDate()}</div></div>`;
  }).join('');

  app.innerHTML = `<main>
    <div class="page-head"><h1>本周打卡</h1><p>本周已练 ${weekCountOf(sess, today)} 次</p></div>
    <div class="checkin-grid">${weekCells}</div>

    <section class="card"><h3>近 5 周</h3><div class="heat-grid">${heat}</div></section>

    <div class="stats stats-4">
      <div class="stat"><b>${stats.monthSessions}</b><span>本月次数</span></div>
      <div class="stat"><b>${computeStreak(sess, today)}</b><span>连续天数</span></div>
      <div class="stat"><b>${stats.totalSessions}</b><span>累计次数</span></div>
      <div class="stat"><b>${fmtVolume(stats.monthVolume)}</b><span>本月容量</span></div>
    </div>

    <section class="card"><h3>近 4 周趋势</h3><div class="trend">${trend}</div></section>
  </main>`;
}

boot();
