async function loadSchedules() {
  const month = getSelectedMonth();
  const calYear = getCalendarYear();

  try {
    const schedules = await API.get(`/api/schedules?year=${calYear}&month=${month}`);
    renderSchedules(schedules);
  } catch (e) {
    document.getElementById('schedule-list').innerHTML = '';
  }
}

function renderSchedules(schedules) {
  const container = document.getElementById('schedule-list');
  const dayNames = currentLang === 'ja'
    ? ['日','月','火','水','木','金','土']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  container.innerHTML = schedules.map(s => {
    const d = new Date(s.date);
    const label = `${d.getMonth()+1}/${d.getDate()} (${dayNames[d.getDay()]})`;
    const tags = [
      s.isExcluded ? t('excluded') : '',
      s.isEvent ? t('eventDay') : '',
      s.isSplitClass ? t('splitClassDay') : '',
    ].filter(Boolean).join(' / ');
    return `<div class="schedule-card ${s.isExcluded ? 'excluded' : ''} ${s.isEvent ? 'event-day' : ''} ${s.isSplitClass ? 'split-class' : ''}">
      <div class="date">${label}</div>
      <div>${tags}</div>
      <div class="schedule-actions">
        <button class="btn-small" data-action="toggle-exclusion" data-id="${escapeHtml(s.id)}">
          ${s.isExcluded ? t('include') : t('exclude')}
        </button>
        <button class="btn-small btn-event ${s.isEvent ? 'active' : ''}" data-action="toggle-event" data-id="${escapeHtml(s.id)}" ${s.isExcluded ? 'disabled' : ''}>
          ${t('event')}
        </button>
        <button class="btn-small btn-split ${s.isSplitClass ? 'active' : ''}" data-action="toggle-split-class" data-id="${escapeHtml(s.id)}" ${s.isExcluded ? 'disabled' : ''}>
          ${t('splitClass')}
        </button>
      </div>
    </div>`;
  }).join('');
}

// Event delegation for schedule actions
document.getElementById('schedule-list')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (action === 'toggle-exclusion') toggleScheduleExclusion(id);
  if (action === 'toggle-event') toggleScheduleEvent(id);
  if (action === 'toggle-split-class') toggleScheduleSplitClass(id);
});

async function generateSchedules() {
  const month = getSelectedMonth();
  const calYear = getCalendarYear();

  try {
    await API.post('/api/schedules/generate', { year: calYear, month });
    loadSchedules();
  } catch (e) {
    alert(e.message);
  }
}

async function toggleScheduleExclusion(id) {
  try {
    await API.post(`/api/schedules/${id}/toggle-exclusion`);
    loadSchedules();
  } catch (e) {
    alert(e.message);
  }
}

async function toggleScheduleEvent(id) {
  try {
    await API.post(`/api/schedules/${id}/toggle-event`);
    loadSchedules();
  } catch (e) {
    alert(e.message);
  }
}

async function toggleScheduleSplitClass(id) {
  try {
    await API.post(`/api/schedules/${id}/toggle-split-class`);
    loadSchedules();
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('btn-generate-schedule')?.addEventListener('click', generateSchedules);
