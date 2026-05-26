let memberCountMap = {};

function closeOpenNotePanels(exceptWrap = null) {
  document.querySelectorAll('.member-note-wrap.open').forEach((el) => {
    if (exceptWrap && el === exceptWrap) return;
    el.classList.remove('open');
  });
}

function renderInlineNotes(notes, memberId) {
  if (!notes) return '';
  return (
    ` <span class="member-note-wrap" data-member-id="${escapeHtml(memberId)}">` +
    `<button type="button" class="member-note-badge" data-action="toggle-note" aria-label="${t('memberNote')}">${t('memberNote')}</button>` +
    `<span class="member-note-panel">${escapeHtml(notes).replace(/\n/g, '<br>')}</span>` +
    `</span>`
  );
}

function renderCandidateOptions(candidates, timesLabel) {
  const renderOption = (m) => {
    const prefix = m.recommended ? '★ ' : '⚠ ';
    const countLabel = m.count != null ? ` (${m.count}${timesLabel})` : '';
    return `<option value="${escapeHtml(m.id)}">${escapeHtml(`${prefix}${m.name}${countLabel}`)}</option>`;
  };
  const regular = candidates.filter((c) => !c.hiddenByDefault);
  const nonRecommended = candidates.filter((c) => c.hiddenByDefault);
  const groups = [];
  if (regular.length > 0) {
    groups.push(
      `<optgroup label="${escapeHtml(t('candidateRecommended'))}">` +
      regular.map(renderOption).join('') +
      '</optgroup>',
    );
  }
  if (nonRecommended.length > 0) {
    groups.push(
      `<optgroup label="${escapeHtml(t('candidateNonRecommended'))}">` +
      nonRecommended.map(renderOption).join('') +
      '</optgroup>',
    );
  }
  return groups.join('');
}

async function loadAssignments() {
  const year = getSelectedFiscalYear();
  const month = getSelectedMonth();
  const calYear = getCalendarYear();

  // 割り当てと一緒に表示できるよう、先に回数を読み込む
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

  // どの日がイベント日か判断するため、スケジュールを読み込む
  let scheduleMap = {};
  try {
    const schedules = await API.get(`/api/schedules?year=${calYear}&month=${month}`);
    for (const s of schedules) scheduleMap[s.date] = s;
  } catch (_) { /* 無視 */ }

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

  // 日付ごとにまとめる
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
    const isEbt = scheduleMap[date]?.isEbt ?? false;
    const isSplitClass = scheduleMap[date]?.isSplitClass ?? false;
    const schedule = scheduleMap[date];
    let eventLabel = t('eventDay');
    if (isEvent && schedule) {
      const primaryName = currentLang === 'ja' ? schedule.eventNameJa : schedule.eventNameEn;
      const fallbackName = currentLang === 'ja' ? schedule.eventNameEn : schedule.eventNameJa;
      if (primaryName) eventLabel = primaryName;
      else if (fallbackName) eventLabel = fallbackName;
    }
    const eventTag = isEvent ? ` <span class="event-tag">${escapeHtml(eventLabel)}</span>` : '';
    const ebtTag = isEbt ? ` <span class="ebt-tag">${t('ebtDay')}</span>` : '';
    const splitTag = isSplitClass ? ` <span class="split-tag">${t('splitClassDay')}</span>` : '';
    const dateLabel = `${d.getMonth()+1}/${d.getDate()} (${dayNames[d.getDay()]})${eventTag}${ebtTag}${splitTag}`;
    const groups = byDate[date].sort((a, b) => a.groupNumber - b.groupNumber);

    // この日付に割り当て済みのメンバーIDをすべて集める
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
      ${groups.map(g => {
        const isMixed = g.gradeGroup === 'MIXED';
        const groupLabelText = isMixed ? `${t('leaders')}:` : `${t('group')} ${g.groupNumber}:`;
        const sep = currentLang === 'ja' ? ' ・ ' : ' & ';
        const memberSlots = g.members.map((m, idx) => {
            const count = memberCountMap[m.id];
            const countStr = count != null ? `(${count})` : '';
            const otherMembers = g.members.filter((_, i) => i !== idx);
            const partnerId = otherMembers.map(om => om.id).join(',');
            const shortLabel = m.gradeGroup === 'UPPER' ? t('upperShort') : t('lowerShort');
            const isCrossover = !isMixed && m.gradeGroup && g.gradeGroup && m.gradeGroup !== g.gradeGroup;
            const crossoverClass = isCrossover ? ' crossover' : '';
            return `<span class="grade-label${crossoverClass}">[${shortLabel}]</span>` +
              `<span class="member-name" data-member-id="${escapeHtml(m.id)}">${escapeHtml(m.name)}</span>${renderInlineNotes(m.notes, m.id)}${countStr}` +
              ` <button class="replace-btn" data-action="start-replace" data-assignment-id="${escapeHtml(g.id)}" data-member-id="${escapeHtml(m.id)}" data-assigned='${escapeHtml(JSON.stringify([...assignedOnDate]))}' data-date="${escapeHtml(date)}" data-partner-id="${escapeHtml(partnerId)}" data-role="${g.gradeGroup || ''}">${t('replace')}</button>` +
              ` <button class="unassign-btn" data-action="unassign" data-assignment-id="${escapeHtml(g.id)}" data-member-id="${escapeHtml(m.id)}" data-date="${escapeHtml(date)}">${t('unassign')}</button>`;
        });
        const vacantCount = g.vacantSlots || 0;
        for (let vi = 0; vi < vacantCount; vi++) {
          memberSlots.push(
            `<span class="vacant-slot">${t('vacant')}` +
            ` <button class="assign-btn" data-action="start-assign" data-assignment-id="${escapeHtml(g.id)}" data-date="${escapeHtml(date)}" data-assigned='${escapeHtml(JSON.stringify([...assignedOnDate]))}' data-partner-id="${g.members.map(om => om.id).join(',')}" data-role="${g.gradeGroup || ''}">${t('assign')}</button>` +
            `</span>`
          );
        }
        return `
        <div class="assignment-group">
          <span class="group-label">${groupLabelText}</span>
          <span>${memberSlots.join(sep)}</span>
        </div>
      `}).join('')}
    </div>`;
  }).join('');

  container.innerHTML = html;
}

// 割り当て操作のイベント委譲
document.getElementById('assignments-list')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) {
    if (!e.target.closest('.member-note-wrap')) closeOpenNotePanels();
    return;
  }
  const action = btn.dataset.action;
  if (action === 'toggle-note') {
    const wrap = btn.closest('.member-note-wrap');
    if (!wrap) return;
    const willOpen = !wrap.classList.contains('open');
    closeOpenNotePanels(wrap);
    wrap.classList.toggle('open', willOpen);
    return;
  }
  if (action === 'clear-day') clearDayAssignments(btn.dataset.date);
  if (action === 'start-replace') startReplace(btn.dataset.assignmentId, btn.dataset.memberId, btn);
  if (action === 'unassign') doUnassign(btn.dataset.assignmentId, btn.dataset.memberId, btn.dataset.date);
  if (action === 'start-assign') startAssign(btn.dataset.assignmentId, btn);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.member-note-wrap')) closeOpenNotePanels();
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
    // すべて再読み込みする（回数 + イベントタグ用 scheduleMap 付きの割り当て）
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
  // 方向パラメーターを変換する
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
    // 警告のハイライトをすべて消す
    document.querySelectorAll('.warning-member').forEach(el => el.classList.remove('warning-member'));
    return;
  }

  area.style.display = 'block';
  area.innerHTML = `<h4>${t('warnings')}</h4><ul>${violations.map(v =>
    `<li>${translateViolation(v)}</li>`
  ).join('')}</ul>`;

  // 機能4: 警告対象メンバーをハイライトする
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

  // 未割り当て週の情報メッセージを表示/非表示にする
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
    // すべての週が割り当て済みのときだけ、過多/過少ラベルを表示する
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
  // すでに選択欄を表示している場合は削除する
  const existing = btnEl.parentElement.querySelector('.replace-inline');
  if (existing) { existing.remove(); return; }

  const assignedIds = JSON.parse(btnEl.dataset.assigned);
  const date = btnEl.dataset.date;

  // 機能6: 過去日を置き換えるときに警告する
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) {
    if (!confirm(t('pastAssignmentWarning'))) return;
  }

  const partnerId = btnEl.dataset.partnerId || '';
  const role = btnEl.dataset.role || '';

  const wrapper = document.createElement('span');
  wrapper.className = 'replace-inline';

  const sel = document.createElement('select');
  sel.className = 'replace-select';
  const timesLabel = currentLang === 'ja' ? '回' : 'x';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '--';
  sel.appendChild(defaultOpt);

  const notesEl = document.createElement('div');
  notesEl.className = 'candidate-notes';
  let candidates = [];
  const updateNotes = () => {
    const selected = candidates.find((c) => c.id === sel.value);
    notesEl.innerHTML = selected?.notes ? escapeHtml(selected.notes).replace(/\n/g, '<br>') : '';
    notesEl.style.display = selected?.notes ? 'block' : 'none';
  };
  sel.addEventListener('change', updateNotes);

  const assistLabel = document.createElement('label');
  assistLabel.className = 'input-assist-toggle';
  const assistToggle = document.createElement('input');
  assistToggle.type = 'checkbox';
  assistLabel.appendChild(assistToggle);
  assistLabel.appendChild(document.createTextNode(t('disableInputAssist')));

  const loadCandidates = async () => {
    const suffix = assistToggle.checked ? '&includeNonRecommended=true' : '';
    try {
      candidates = await API.get(`/api/assignments/candidates?date=${date}&excludeIds=${assignedIds.join(',')}&partnerId=${partnerId}&role=${role}${suffix}`);
    } catch (_) {
      candidates = [];
    }
    sel.innerHTML = '<option value="">--</option>' + renderCandidateOptions(candidates, timesLabel);
    updateNotes();
  };
  assistToggle.addEventListener('change', loadCandidates);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'replace-btn';
  confirmBtn.textContent = t('confirm');
  confirmBtn.addEventListener('click', () => doReplace(assignmentId, memberId, sel.value, wrapper));

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'replace-btn';
  cancelBtn.textContent = t('cancel');
  cancelBtn.addEventListener('click', () => wrapper.remove());

  wrapper.appendChild(sel);
  wrapper.appendChild(assistLabel);
  wrapper.appendChild(notesEl);
  wrapper.appendChild(confirmBtn);
  wrapper.appendChild(cancelBtn);
  btnEl.after(wrapper);
  await loadCandidates();
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

async function doUnassign(assignmentId, memberId, date) {
  const today = new Date().toISOString().slice(0, 10);
  if (date < today) {
    if (!confirm(t('pastAssignmentWarning'))) return;
  }
  if (!confirm(t('unassignConfirm'))) return;
  try {
    await API.put(`/api/assignments/${assignmentId}/unassign`, { memberId });
    loadAssignments();
  } catch (e) {
    alert(e.message);
  }
}

async function startAssign(assignmentId, btnEl) {
  const existing = btnEl.parentElement.querySelector('.replace-inline');
  if (existing) { existing.remove(); return; }

  const assignedIds = JSON.parse(btnEl.dataset.assigned);
  const date = btnEl.dataset.date;
  const partnerId = btnEl.dataset.partnerId || '';
  const role = btnEl.dataset.role || '';

  const wrapper = document.createElement('span');
  wrapper.className = 'replace-inline';

  const sel = document.createElement('select');
  sel.className = 'replace-select';
  const timesLabel = currentLang === 'ja' ? '回' : 'x';
  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '--';
  sel.appendChild(defaultOpt);

  const notesEl = document.createElement('div');
  notesEl.className = 'candidate-notes';
  let candidates = [];
  const updateNotes = () => {
    const selected = candidates.find((c) => c.id === sel.value);
    notesEl.innerHTML = selected?.notes ? escapeHtml(selected.notes).replace(/\n/g, '<br>') : '';
    notesEl.style.display = selected?.notes ? 'block' : 'none';
  };
  sel.addEventListener('change', updateNotes);

  const assistLabel = document.createElement('label');
  assistLabel.className = 'input-assist-toggle';
  const assistToggle = document.createElement('input');
  assistToggle.type = 'checkbox';
  assistLabel.appendChild(assistToggle);
  assistLabel.appendChild(document.createTextNode(t('disableInputAssist')));

  const loadCandidates = async () => {
    const suffix = assistToggle.checked ? '&includeNonRecommended=true' : '';
    try {
      candidates = await API.get(`/api/assignments/candidates?date=${date}&excludeIds=${assignedIds.join(',')}&partnerId=${partnerId}&role=${role}${suffix}`);
    } catch (_) {
      candidates = [];
    }
    sel.innerHTML = '<option value="">--</option>' + renderCandidateOptions(candidates, timesLabel);
    updateNotes();
  };
  assistToggle.addEventListener('change', loadCandidates);

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'replace-btn';
  confirmBtn.textContent = t('confirm');
  confirmBtn.addEventListener('click', () => doAssign(assignmentId, sel.value, wrapper));

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'replace-btn';
  cancelBtn.textContent = t('cancel');
  cancelBtn.addEventListener('click', () => wrapper.remove());

  wrapper.appendChild(sel);
  wrapper.appendChild(assistLabel);
  wrapper.appendChild(notesEl);
  wrapper.appendChild(confirmBtn);
  wrapper.appendChild(cancelBtn);
  btnEl.after(wrapper);
  await loadCandidates();
}

async function doAssign(assignmentId, memberId, wrapperEl) {
  if (!memberId) return;
  try {
    const result = await API.put(`/api/assignments/${assignmentId}/assign`, { memberId });
    showViolations(result.violations || []);
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
