const app = document.getElementById('app');
const tabs = document.getElementById('tabs');

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) { renderLogin(); throw new Error('unauthorized'); }
  return res.json();
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

function renderLogin() {
  tabs.hidden = true;
  app.innerHTML = `<main><div class="card">
    <h3>登录</h3>
    <input type="password" id="pw" placeholder="密码" />
    <button class="primary" id="go">进入</button>
  </div></main>`;
  document.getElementById('go').onclick = async () => {
    const password = document.getElementById('pw').value;
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) boot(); else alert('密码错误');
  };
}

async function boot() {
  try { await api('/api/plan'); } catch { return; }
  tabs.hidden = false;
  tabs.querySelectorAll('button').forEach(b => {
    b.onclick = () => showTab(b.dataset.tab);
  });
  showTab('today');
}

function showTab(name) {
  tabs.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ({ today: renderToday, plan: renderPlan, history: renderHistory, charts: renderCharts, checkin: renderCheckin }[name])();
}

async function renderToday() {
  const { days } = await api('/api/plan');
  const today = todayISO();
  app.innerHTML = `<main>
    <div class="card">
      <label>今天练:<select id="daySel">${days.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></label>
      <p>日期:<input type="date" id="dateIn" value="${today}" /></p>
    </div>
    <div id="exWrap"></div>
    <button class="primary" id="save">保存本次</button>
  </main>`;

  const draftKey = dayId => 'draft_' + dayId;

  const collect = () => {
    const grouped = {};
    document.querySelectorAll('#exWrap input').forEach(inp => {
      const key = inp.dataset.ex + '_' + inp.dataset.set;
      grouped[key] = grouped[key] || { plan_exercise_id: Number(inp.dataset.ex), set_no: Number(inp.dataset.set) };
      grouped[key][inp.dataset.k] = inp.value === '' ? null : Number(inp.value);
    });
    return grouped;
  };

  const draw = () => {
    const day = days.find(d => d.id === Number(document.getElementById('daySel').value));
    const draft = JSON.parse(localStorage.getItem(draftKey(day.id)) || '{}');
    document.getElementById('exWrap').innerHTML = day.exercises.map(e => {
      const sets = Array.from({ length: e.target_sets }, (_, i) => i + 1);
      return `<div class="card"><b>${e.name}</b> <small>${e.equipment} · ${e.target_sets}×${e.target_reps}</small>
        ${sets.map(n => {
          const d = draft[e.id]?.[n] || {};
          return `<div class="row">第${n}组
            <input type="number" step="0.5" placeholder="kg" data-ex="${e.id}" data-set="${n}" data-k="weight" value="${d.weight ?? ''}" />
            <input type="number" placeholder="次" data-ex="${e.id}" data-set="${n}" data-k="reps" value="${d.reps ?? ''}" /></div>`;
        }).join('')}
      </div>`;
    }).join('');
    // 输入即存草稿,防手滑丢数据
    document.querySelectorAll('#exWrap input').forEach(inp => {
      inp.oninput = () => {
        const day_id = Number(document.getElementById('daySel').value);
        localStorage.setItem(draftKey(day_id), JSON.stringify(collect()));
      };
    });
  };

  document.getElementById('daySel').onchange = draw;
  draw();

  document.getElementById('save').onclick = async () => {
    const day_id = Number(document.getElementById('daySel').value);
    const date = document.getElementById('dateIn').value;
    const grouped = collect();
    const rows = Object.values(grouped).filter(r => r.weight !== null || r.reps !== null);
    if (rows.length === 0) return alert('至少填一组');
    try {
      const { id: session_id } = await api('/api/sessions', {
        method: 'POST', body: JSON.stringify({ date, day_id }),
      });
      for (const r of rows) {
        await api('/api/set-logs', { method: 'POST', body: JSON.stringify({ session_id, ...r }) });
      }
      localStorage.removeItem(draftKey(day_id));
      alert('已保存');
      renderHistory();
    } catch (e) {
      localStorage.setItem(draftKey(day_id), JSON.stringify(grouped));
      alert('保存失败,已存本地草稿');
    }
  };
}

async function renderPlan() {
  const { days } = await api('/api/plan');
  app.innerHTML = `<main>${days.map(d => `
    <div class="card"><h3>${d.name}</h3>
      <ol>${d.exercises.map(e => `<li>${e.name} — ${e.target_sets}×${e.target_reps} <small>(${e.equipment})</small></li>`).join('')}</ol>
    </div>`).join('')}</main>`;
}

async function renderHistory() {
  const { sessions } = await api('/api/sessions');
  app.innerHTML = `<main>
    <h3>历史记录</h3>
    ${sessions.length ? sessions.map(s => `
      <div class="card">
        <div class="row"><b>${s.date}</b> · Day${s.day_id}
          <button data-del="${s.id}">删除</button></div>
        <div data-detail="${s.id}">加载中…</div>
      </div>`).join('') : '<p>还没有记录</p>'}
  </main>`;
  document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    if (!confirm('删除这次训练?')) return;
    await api('/api/sessions?id=' + b.dataset.del, { method: 'DELETE' });
    renderHistory();
  });
  for (const s of sessions) {
    const { logs } = await api('/api/set-logs?session_id=' + s.id);
    document.querySelector(`[data-detail="${s.id}"]`).innerHTML = logs.map(l =>
      `<div class="row">动作${l.plan_exercise_id} 第${l.set_no}组:${l.weight ?? '-'}kg × ${l.reps ?? '-'}</div>`
    ).join('') || '无明细';
  }
}

async function renderCharts() {
  const [{ weights }, { sessions }] = await Promise.all([api('/api/body-weights'), api('/api/sessions')]);
  app.innerHTML = `<main>
    <div class="card row">
      <input type="date" id="bwDate" value="${todayISO()}" />
      <input type="number" step="0.1" id="bwVal" placeholder="kg" />
      <button class="primary" id="bwAdd">记录体重</button>
    </div>
    <div class="card"><h3>体重曲线</h3><canvas id="wChart"></canvas></div>
    <div class="card"><h3>每周训练次数</h3><canvas id="cChart"></canvas></div>
  </main>`;
  new Chart(document.getElementById('wChart'), {
    type: 'line',
    data: {
      labels: weights.map(w => w.date),
      datasets: [{ label: '体重(kg)', data: weights.map(w => w.weight), borderColor: '#2563eb' }],
    },
  });
  const byWeek = {};
  sessions.forEach(s => {
    const d = new Date(s.date);
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = toISODate(monday);
    byWeek[key] = (byWeek[key] || 0) + 1;
  });
  const keys = Object.keys(byWeek).sort();
  new Chart(document.getElementById('cChart'), {
    type: 'bar',
    data: { labels: keys, datasets: [{ label: '次数', data: keys.map(k => byWeek[k]) }] },
  });
  document.getElementById('bwAdd').onclick = async () => {
    const date = document.getElementById('bwDate').value;
    const weight = Number(document.getElementById('bwVal').value);
    if (!weight) return;
    await api('/api/body-weights', { method: 'POST', body: JSON.stringify({ date, weight }) });
    renderCharts();
  };
}

async function renderCheckin() {
  const { sessions } = await api('/api/sessions');
  const d = new Date();
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const days = ['一', '二', '三', '四', '五', '六', '日'];
  const done = new Set(sessions.map(s => s.date));
  app.innerHTML = `<main><h3>本周打卡</h3>
    <div class="checkin-grid">${days.map((label, i) => {
      const dt = new Date(monday); dt.setDate(monday.getDate() + i);
      const iso = toISODate(dt);
      const ok = done.has(iso);
      return `<div style="background:${ok ? '#dcfce7' : '#fff'}">周${label}<br>${ok ? '✔' : '—'}</div>`;
    }).join('')}</div></main>`;
}

boot();
