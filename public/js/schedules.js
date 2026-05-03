let currentScheduleView = 'month';

async function loadSchedules() {
  if (currentScheduleView === 'year') {
    await loadFiscalYearSchedules();
    return;
  }

  const month = getSelectedMonth();
  const calYear = getCalendarYear();

  try {
    const schedules = await API.get(`/api/schedules?year=${calYear}&month=${month}`);
    renderSchedules(schedules, 'schedule-list');
    document.getElementById('schedule-fiscal-year-list').innerHTML = '';
  } catch (e) {
    document.getElementById('schedule-list').innerHTML = '';
  }
}

async function loadFiscalYearSchedules() {
  const fiscalYear = getSelectedFiscalYear();
  const container = document.getElementById('schedule-fiscal-year-list');

  try {
    const schedules = await API.get(`/api/schedules/fiscal-year?fiscalYear=${fiscalYear}`);
    renderFiscalYearSchedules(schedules);
    document.getElementById('schedule-list').innerHTML = '';
  } catch (e) {
    const message = t('fiscalYearLoadError').replace('{message}', escapeHtml(e.message));
    container.innerHTML = `<div class="schedule-empty schedule-error">${message}</div>`;
    document.getElementById('schedule-list').innerHTML = '';
  }
}

function renderScheduleCards(schedules, options = {}) {
  const isCompact = options.compact === true;
  const dayNames = currentLang === 'ja'
    ? ['日','月','火','水','木','金','土']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return schedules.map(s => {
    const d = new Date(s.date);
    const label = `${d.getMonth()+1}/${d.getDate()} (${dayNames[d.getDay()]})`;
    const tags = [
      s.isExcluded ? t('excluded') : '',
      s.isEvent ? t('eventDay') : '',
      s.isEbt ? t('ebtDay') : '',
      s.isSplitClass ? t('splitClassDay') : '',
    ].filter(Boolean).join(' / ');
    const splitTypeSelect = s.isSplitClass && !s.isExcluded
      ? `<select class="split-type-select" data-action="set-split-type" data-id="${escapeHtml(s.id)}">
          <option value="standard" ${(s.splitType || 'standard') === 'standard' ? 'selected' : ''}>${t('splitTypeStandard')}</option>
          <option value="senior_discussion" ${s.splitType === 'senior_discussion' ? 'selected' : ''}>${t('splitTypeSeniorDiscussion')}</option>
        </select>`
      : '';
    const eventNameInputs = s.isEvent && !s.isExcluded
      ? `<div class="event-name-inputs" data-schedule-id="${escapeHtml(s.id)}">
          <input type="text" class="event-name-input" data-field="ja" data-original="${escapeHtml(s.eventNameJa || '')}" placeholder="${t('eventNamePlaceholderJa')}" value="${escapeHtml(s.eventNameJa || '')}" maxlength="100">
          <input type="text" class="event-name-input" data-field="en" data-original="${escapeHtml(s.eventNameEn || '')}" placeholder="${t('eventNamePlaceholderEn')}" value="${escapeHtml(s.eventNameEn || '')}" maxlength="100">
        </div>`
      : '';
    return `<div class="schedule-card ${isCompact ? 'schedule-card-compact' : ''} ${s.isExcluded ? 'excluded' : ''} ${s.isEvent ? 'event-day' : ''} ${s.isEbt ? 'ebt-day' : ''} ${s.isSplitClass ? 'split-class' : ''}">
      <div class="date">${label}</div>
      <div class="schedule-tags">${tags}</div>
      <div class="schedule-actions">
        <button class="btn-small" data-action="toggle-exclusion" data-id="${escapeHtml(s.id)}">
          ${s.isExcluded ? t('include') : t('exclude')}
        </button>
        <button class="btn-small btn-event ${s.isEvent ? 'active' : ''}" data-action="toggle-event" data-id="${escapeHtml(s.id)}" ${s.isExcluded ? 'disabled' : ''}>
          ${t('event')}
        </button>
        <button class="btn-small btn-ebt ${s.isEbt ? 'active' : ''}" data-action="toggle-ebt" data-id="${escapeHtml(s.id)}" ${s.isExcluded ? 'disabled' : ''}>
          ${t('ebt')}
        </button>
        <button class="btn-small btn-split ${s.isSplitClass ? 'active' : ''}" data-action="toggle-split-class" data-id="${escapeHtml(s.id)}" ${s.isExcluded ? 'disabled' : ''}>
          ${t('splitClass')}
        </button>
        ${splitTypeSelect}
      </div>
      ${eventNameInputs}
    </div>`;
  }).join('');
}

function renderSchedules(schedules, containerId = 'schedule-list') {
  const container = document.getElementById(containerId);
  container.innerHTML = renderScheduleCards(schedules);
}

function renderFiscalYearSchedules(schedules) {
  const container = document.getElementById('schedule-fiscal-year-list');
  const blocks = getFiscalMonths().map((month) => {
    const monthSchedules = schedules.filter((schedule) => new Date(schedule.date).getMonth() + 1 === month);
    const heading = currentLang === 'ja' ? `${month}月` : `${month}`;
    return `<section class="schedule-month-block">
      <h3>${heading}</h3>
      <div class="schedule-grid">
        ${monthSchedules.length > 0 ? renderScheduleCards(monthSchedules, { compact: true }) : `<div class="schedule-empty">${t('fiscalMonthEmpty')}</div>`}
      </div>
    </section>`;
  });

  container.innerHTML = `${schedules.length === 0 ? `<div class="schedule-empty fiscal-year-empty-banner">${t('fiscalYearEmpty')}</div>` : ''}${blocks.join('')}`;
}

function setScheduleView(view) {
  currentScheduleView = view;
  const monthButton = document.getElementById('btn-schedule-view-month');
  const yearButton = document.getElementById('btn-schedule-view-year');
  const monthList = document.getElementById('schedule-list');
  const yearList = document.getElementById('schedule-fiscal-year-list');

  monthButton.classList.toggle('active', view === 'month');
  yearButton.classList.toggle('active', view === 'year');
  monthList.style.display = view === 'month' ? 'grid' : 'none';
  yearList.style.display = view === 'year' ? 'grid' : 'none';
  loadSchedules();
}

// スケジュール操作のイベント委譲
function bindScheduleInteractions(containerId) {
  document.getElementById(containerId)?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    if (action === 'toggle-exclusion') toggleScheduleExclusion(id);
    if (action === 'toggle-event') toggleScheduleEvent(id);
    if (action === 'toggle-ebt') toggleScheduleEbt(id);
    if (action === 'toggle-split-class') toggleScheduleSplitClass(id);
  });

  document.getElementById(containerId)?.addEventListener('change', (e) => {
    const select = e.target.closest('select[data-action="set-split-type"]');
    if (!select) return;
    setSplitType(select.dataset.id, select.value);
  });

  document.getElementById(containerId)?.addEventListener('focusout', (e) => {
    const input = e.target.closest('.event-name-input');
    if (!input) return;
    const container = input.closest('.event-name-inputs');
    if (container) saveEventName(container.dataset.scheduleId, container);
  });

  document.getElementById(containerId)?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    const input = e.target.closest('.event-name-input');
    if (!input) return;
    input.blur();
  });
}

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

async function generateFiscalYearSchedules() {
  const fiscalYear = getSelectedFiscalYear();
  const button = document.getElementById('btn-generate-fiscal-year-schedule');

  try {
    if (button) button.disabled = true;
    const result = await API.post('/api/schedules/generate-fiscal-year', { fiscalYear });
    await loadSchedules();
    alert(
      t('fiscalYearGenerationResult')
        .replace('{created}', String(result.createdCount))
        .replace('{existing}', String(result.existingCount)),
    );
  } catch (e) {
    alert(e.message);
  } finally {
    if (button) button.disabled = false;
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

async function toggleScheduleEbt(id) {
  try {
    await API.post(`/api/schedules/${id}/toggle-ebt`);
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

async function saveEventName(id, container) {
  const jaInput = container.querySelector('[data-field="ja"]');
  const enInput = container.querySelector('[data-field="en"]');
  if (jaInput.value === jaInput.dataset.original && enInput.value === enInput.dataset.original) return;
  try {
    await API.put(`/api/schedules/${id}/event-name`, {
      eventNameJa: jaInput.value,
      eventNameEn: enInput.value,
    });
    jaInput.dataset.original = jaInput.value;
    enInput.dataset.original = enInput.value;
  } catch (e) {
    alert(e.message);
  }
}

async function setSplitType(id, splitType) {
  try {
    await API.post(`/api/schedules/${id}/split-type`, { splitType });
    loadSchedules();
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('btn-generate-schedule')?.addEventListener('click', generateSchedules);
document.getElementById('btn-generate-fiscal-year-schedule')?.addEventListener('click', generateFiscalYearSchedules);
document.getElementById('btn-schedule-view-month')?.addEventListener('click', () => setScheduleView('month'));
document.getElementById('btn-schedule-view-year')?.addEventListener('click', () => setScheduleView('year'));
bindScheduleInteractions('schedule-list');
bindScheduleInteractions('schedule-fiscal-year-list');
