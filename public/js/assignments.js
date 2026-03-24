let memberCountMap = {};

async function loadAssignments() {
  const year = getSelectedFiscalYear();
  const month = getSelectedMonth();
  const calYear = getCalendarYear();

  // Load counts first so we can display them alongside assignments
  try {
    const countsData = await API.get(`/api/assignments/counts?fiscalYear=${year}`);
    memberCountMap = {};
    for (const m of countsData.members) {
      memberCountMap[m.id] = m.count;
    }
    renderAssignmentCounts(countsData);
  } catch (e) {
    memberCountMap = {};
    document.getElementById('assignment-counts-section').style.display = 'none';
  }

  // Load schedules to know which dates are event days
  let scheduleMap = {};
  try {
    const schedules = await API.get(`/api/schedules?year=${calYear}&month=${month}`);
    for (const s of schedules) scheduleMap[s.date] = s;
  } catch (_) { /* ignore */ }

  try {
    const assignments = await API.get(`/api/assignments?year=${calYear}&month=${month}`);
    renderAssignments(assignments, scheduleMap);
    updateClearMonthButton(assignments);
  } catch (e) {
    document.getElementById('assignments-list').innerHTML = `<p>${t('noAssignments')}</p>`;
    updateClearMonthButton([]);
  }
}

function renderAssignments(assignments, scheduleMap = {}) {
  const container = document.getElementById('assignments-list');

  if (!assignments || assignments.length === 0) {
    container.innerHTML = `<p>${t('noAssignments')}</p>`;
    return;
  }

  // Group by date
  const byDate = {};
  for (const a of assignments) {
    if (!byDate[a.date]) byDate[a.date] = [];
    byDate[a.date].push(a);
  }

  const dayNames = currentLang === 'ja'
    ? ['日','月','火','水','木','金','土']
    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  const html = Object.keys(byDate).sort().map(date => {
    const d = new Date(date);
    const isEvent = scheduleMap[date]?.isEvent ?? false;
    const isSplitClass = scheduleMap[date]?.isSplitClass ?? false;
    const eventTag = isEvent ? ` <span class="event-tag">${t('eventDay')}</span>` : '';
    const splitTag = isSplitClass ? ` <span class="split-tag">${t('splitClassDay')}</span>` : '';
    const dateLabel = `${d.getMonth()+1}/${d.getDate()} (${dayNames[d.getDay()]})${eventTag}${splitTag}`;
    const groups = byDate[date].sort((a, b) => a.groupNumber - b.groupNumber);

    // Collect all assigned member IDs for this date
    const assignedOnDate = new Set();
    for (const g of groups) {
      for (const m of g.members) assignedOnDate.add(m.id);
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const canClear = date >= todayStr;
    const clearBtn = canClear
      ? ` <button class="btn-small btn-clear-day" data-action="clear-day" data-date="${escapeHtml(date)}">${t('clear')}</button>`
      : '';

    return `<div class="assignment-day">
      <h3>${dateLabel}${clearBtn}</h3>
      ${groups.map(g => `
        <div class="assignment-group">
          <span class="group-label">${t('group')} ${g.groupNumber}:</span>
          <span>${g.members.map((m, idx) => {
            const count = memberCountMap[m.id];
            const countStr = count != null ? `(${count})` : '';
            const partnerId = g.members[1 - idx]?.id || '';
            const shortLabel = m.gradeGroup === 'UPPER' ? t('upperShort') : t('lowerShort');
            const isCrossover = m.gradeGroup && g.gradeGroup && m.gradeGroup !== g.gradeGroup;
            const crossoverClass = isCrossover ? ' crossover' : '';
            return `<span class="grade-label${crossoverClass}">[${shortLabel}]</span>` +
              `<span class="member-name" data-member-id="${escapeHtml(m.id)}">${escapeHtml(m.name)}</span>${countStr}` +
              ` <button class="replace-btn" data-action="start-replace" data-assignment-id="${escapeHtml(g.id)}" data-member-id="${escapeHtml(m.id)}" data-assigned='${escapeHtml(JSON.stringify([...assignedOnDate]))}' data-date="${escapeHtml(date)}" data-partner-id="${escapeHtml(partnerId)}" data-role="${g.gradeGroup || ''}">${t('replace')}</button>`;
          }).join(currentLang === 'ja' ? ' ・ ' : ' & ')}</span>
        </div>
      `).join('')}
    </div>`;
  }).join('');

  container.innerHTML = html;
}

// Event delegation for assignment actions
document.getElementById('assignments-list')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'clear-day') clearDayAssignments(btn.dataset.date);
  if (action === 'start-replace') startReplace(btn.dataset.assignmentId, btn.dataset.memberId, btn);
});

async function generateAssignmentsAction() {
  const month = getSelectedMonth();
  const calYear = getCalendarYear();

  try {
    const result = await API.post('/api/assignments/generate', { year: calYear, month });
    if (result.message === 'allWeeksAssigned') {
      alert(t('allWeeksAssigned'));
      return;
    }
    showViolations(result.violations);
    // Reload everything (counts + assignments with scheduleMap for event tags)
    await loadAssignments();
  } catch (e) {
    alert(e.message);
  }
}

function translateViolation(v) {
  if (!v.messageKey) return escapeHtml(v.message);
  let template = I18N[currentLang][v.messageKey];
  if (!template) return escapeHtml(v.message);
  const params = v.messageParams || {};
  // Translate direction params
  if (params.direction) {
    const dirKey = 'violations.' + params.direction;
    params.direction = I18N[currentLang][dirKey] || params.direction;
  }

  return template.replace(/\{(\w+)\}/g, (_, key) => escapeHtml(params[key] || key));
}

function showViolations(violations) {
  const area = document.getElementById('violations-area');
  if (!violations || violations.length === 0) {
    area.style.display = 'none';
    // Clear all warning highlights
    document.querySelectorAll('.warning-member').forEach(el => el.classList.remove('warning-member'));
    return;
  }

  area.style.display = 'block';
  area.innerHTML = `<h4>${t('warnings')}</h4><ul>${violations.map(v =>
    `<li>${translateViolation(v)}</li>`
  ).join('')}</ul>`;

  // Feature 4: Highlight warning members
  document.querySelectorAll('.warning-member').forEach(el => el.classList.remove('warning-member'));
  const warningMemberIds = new Set();
  for (const v of violations) {
    if (v.memberIds) {
      for (const id of v.memberIds) warningMemberIds.add(id);
    }
  }
  for (const id of warningMemberIds) {
    document.querySelectorAll(`[data-member-id="${CSS.escape(id)}"]`).forEach(el => el.classList.add('warning-member'));
  }
}

async function exportCsv() {
  const month = getSelectedMonth();
  const calYear = getCalendarYear();
  window.open(`/api/assignments/export/csv?year=${calYear}&month=${month}&lang=${currentLang}`);
}

async function exportLine() {
  const month = getSelectedMonth();
  const calYear = getCalendarYear();

  try {
    const result = await API.get(`/api/assignments/export/line?year=${calYear}&month=${month}&lang=${currentLang}`);
    document.getElementById('line-text').value = result.text;
    document.getElementById('line-dialog').showModal();
  } catch (e) {
    alert(e.message);
  }
}

function renderAssignmentCounts(data) {
  const section = document.getElementById('assignment-counts-section');
  if (!data.members || data.members.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  const titleEl = document.getElementById('counts-title');
  titleEl.textContent = `${t('assignmentCounts')}（${data.fiscalYear}${t('year')}）`;

  const summary = data.summary;
  const diff = summary.max.count - summary.min.count;
  document.getElementById('counts-summary').innerHTML =
    `<span>${t('max')}: <span class="stat">${summary.max.count}${t('times')}（${escapeHtml(summary.max.memberName)}）</span></span>` +
    `<span>${t('min')}: <span class="stat">${summary.min.count}${t('times')}（${escapeHtml(summary.min.memberName)}）</span></span>` +
    `<span>${t('average')}: <span class="stat">${summary.average}${t('times')}</span></span>` +
    `<span>${t('difference')}: <span class="stat">${diff}</span></span>`;

  // Show/hide unassigned weeks info message
  const infoEl = document.getElementById('counts-info');
  if (infoEl) {
    if (data.unassignedWeeks > 0) {
      infoEl.textContent = t('unassignedWeeksInfo').replace('{count}', data.unassignedWeeks);
      infoEl.style.display = 'block';
    } else {
      infoEl.style.display = 'none';
    }
  }

  const maxCount = Math.max(...data.members.map(m => m.count), 1);
  const avg = summary.average;
  const hasUnassigned = data.unassignedWeeks > 0;

  document.getElementById('counts-list').innerHTML = data.members.map(m => {
    const pct = (m.count / maxCount * 100).toFixed(0);
    let barClass = 'count-bar';
    let labelHtml = '';
    // Only show too-many/too-few labels when all weeks are assigned
    if (!hasUnassigned) {
      if (avg > 0 && m.count > avg * 1.5) {
        barClass += ' too-many';
        labelHtml = `<span class="count-label">${t('tooMany')}</span>`;
      } else if (avg > 0 && m.count < avg * 0.5 && m.count > 0) {
        barClass += ' too-few';
        labelHtml = `<span class="count-label too-few">${t('tooFew')}</span>`;
      }
    }
    return `<div class="count-row">
      <span class="count-name">${escapeHtml(m.name)}</span>
      <div class="count-bar-container"><div class="${barClass}" style="width:${pct}%"></div></div>
      <span class="count-value">${m.count}${t('times')}</span>
      ${labelHtml}
    </div>`;
  }).join('');
}

async function startReplace(assignmentId, memberId, btnEl) {
  // If already showing select, remove it
  const existing = btnEl.parentElement.querySelector('.replace-inline');
  if (existing) { existing.remove(); return; }

  const assignedIds = JSON.parse(btnEl.dataset.assigned);
  const date = btnEl.dataset.date;

  // Feature 6: warn when replacing on past dates
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) {
    if (!confirm(t('pastAssignmentWarning'))) return;
  }

  const partnerId = btnEl.dataset.partnerId || '';
  const role = btnEl.dataset.role || '';

  // Fetch candidates from server (filters by availability + active status + recommendations)
  let candidates;
  try {
    candidates = await API.get(`/api/assignments/candidates?date=${date}&excludeIds=${assignedIds.join(',')}&partnerId=${partnerId}&role=${role}`);
  } catch (_) {
    candidates = [];
  }

  const wrapper = document.createElement('span');
  wrapper.className = 'replace-inline';

  const sel = document.createElement('select');
  sel.className = 'replace-select';
  const timesLabel = currentLang === 'ja' ? '回' : 'x';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '--';
  sel.appendChild(defaultOpt);
  for (const m of candidates) {
    const opt = document.createElement('option');
    opt.value = m.id;
    const prefix = m.recommended ? '★ ' : (m.warnings && m.warnings.length > 0 ? '⚠ ' : '');
    const countLabel = m.count != null ? ` (${m.count}${timesLabel})` : '';
    opt.textContent = `${prefix}${m.name}${countLabel}`;
    sel.appendChild(opt);
  }

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'replace-btn';
  confirmBtn.textContent = t('confirm');
  confirmBtn.addEventListener('click', () => doReplace(assignmentId, memberId, sel.value, wrapper));

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'replace-btn';
  cancelBtn.textContent = t('cancel');
  cancelBtn.addEventListener('click', () => wrapper.remove());

  wrapper.appendChild(sel);
  wrapper.appendChild(confirmBtn);
  wrapper.appendChild(cancelBtn);
  btnEl.after(wrapper);
}

async function doReplace(assignmentId, oldMemberId, newMemberId, wrapperEl) {
  if (!newMemberId) return;
  try {
    const result = await API.put(`/api/assignments/${assignmentId}/adjust`, { oldMemberId, newMemberId });
    showViolations(result.violations || []);
    loadAssignments();
  } catch (e) {
    alert(e.message);
  }
}

function updateClearMonthButton(assignments) {
  const btn = document.getElementById('btn-clear-month');
  if (!btn) return;
  const now = new Date();
  const calYear = getCalendarYear();
  const month = getSelectedMonth();
  const isPastOrCurrent = calYear < now.getFullYear() ||
    (calYear === now.getFullYear() && month <= now.getMonth() + 1);
  btn.style.display = (isPastOrCurrent || !assignments || assignments.length === 0) ? 'none' : '';
}

async function clearMonthAssignments() {
  if (!confirm(t('clearMonthConfirm'))) return;
  const month = getSelectedMonth();
  const calYear = getCalendarYear();
  try {
    await API.del(`/api/assignments?year=${calYear}&month=${month}`);
    loadAssignments();
  } catch (e) {
    alert(e.message);
  }
}

async function clearDayAssignments(date) {
  if (!confirm(t('clearConfirm'))) return;
  try {
    await API.del(`/api/assignments/by-date?date=${date}`);
    loadAssignments();
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('btn-generate-assignments')?.addEventListener('click', generateAssignmentsAction);
document.getElementById('btn-clear-month')?.addEventListener('click', clearMonthAssignments);
document.getElementById('btn-export-csv')?.addEventListener('click', exportCsv);
document.getElementById('btn-export-line')?.addEventListener('click', exportLine);
document.getElementById('btn-copy-line')?.addEventListener('click', () => {
  const textarea = document.getElementById('line-text');
  textarea.select();
  navigator.clipboard.writeText(textarea.value);
  document.getElementById('btn-copy-line').textContent = t('copied');
  setTimeout(() => {
    document.getElementById('btn-copy-line').textContent = t('copy');
  }, 2000);
});
document.getElementById('btn-close-line')?.addEventListener('click', () => {
  document.getElementById('line-dialog').close();
});
