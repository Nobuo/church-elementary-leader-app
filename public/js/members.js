let allMembers = [];

async function loadMembers() {
  const showInactive = document.getElementById('show-inactive').checked;
  try {
    allMembers = await API.get(`/api/members?activeOnly=${!showInactive}`);
    renderMembers();
  } catch (e) {
    alert(e.message);
  }
}

function renderMembers() {
  const tbody = document.getElementById('members-body');
  const genderMap = { MALE: () => t('male'), FEMALE: () => t('female') };
  const langMap = { JAPANESE: () => t('japanese'), ENGLISH: () => t('english'), BOTH: () => t('both') };
  const gradeMap = { LOWER: () => t('lower'), UPPER: () => t('upper') };
  const typeMap = { PARENT_COUPLE: () => t('parentCouple'), PARENT_SINGLE: () => t('parentSingle'), HELPER: () => t('helper') };

  tbody.innerHTML = allMembers.map(m => {
    const spouse = m.spouseId ? allMembers.find(s => s.id === m.spouseId) : null;
    const datesLabel = m.availableDates ? m.availableDates.length + t('days') : t('allDays');
    return `<tr>
      <td>${escapeHtml(m.name)}</td>
      <td>${genderMap[m.gender]()}</td>
      <td>${langMap[m.language]()}</td>
      <td>${gradeMap[m.gradeGroup]()}</td>
      <td>${typeMap[m.memberType]()}</td>
      <td>${m.sameGenderOnly ? t('yes') : t('no')}</td>
      <td>${spouse ? escapeHtml(spouse.name) : '-'}</td>
      <td>${datesLabel}</td>
      <td class="${m.isActive ? 'status-active' : 'status-inactive'}">${m.isActive ? t('active') : t('inactive')}</td>
      <td>
        <button class="btn-small" onclick="editMember('${m.id}')">${t('edit')}</button>
        ${m.isActive
          ? `<button class="btn-danger" onclick="deactivateMemberAction('${m.id}')">${t('deactivate')}</button>`
          : `<button class="btn-small" onclick="reactivateMemberAction('${m.id}')">${t('reactivate')}</button>`}
      </td>
    </tr>`;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openMemberForm(member) {
  const dialog = document.getElementById('member-dialog');
  const title = document.getElementById('form-title');
  title.textContent = member ? t('editMember') : t('addMember');

  document.getElementById('form-member-id').value = member?.id || '';
  document.getElementById('form-name').value = member?.name || '';
  document.getElementById('form-gender').value = member?.gender || 'MALE';
  document.getElementById('form-language').value = member?.language || 'JAPANESE';
  document.getElementById('form-grade').value = member?.gradeGroup || 'LOWER';
  document.getElementById('form-type').value = member?.memberType || 'PARENT_SINGLE';
  document.getElementById('form-same-gender').checked = member?.sameGenderOnly || false;

  // Populate spouse dropdown — only PARENT_COUPLE members or those without a spouse
  const spouseSelect = document.getElementById('form-spouse');
  spouseSelect.innerHTML = `<option value="">${t('none')}</option>`;
  allMembers
    .filter(m => m.id !== member?.id && m.isActive && m.memberType === 'PARENT_COUPLE' && !m.spouseId)
    .forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      if (member?.spouseId === m.id) opt.selected = true;
      spouseSelect.appendChild(opt);
    });
  // Also add current spouse if editing
  if (member?.spouseId) {
    const currentSpouse = allMembers.find(m => m.id === member.spouseId);
    if (currentSpouse && !spouseSelect.querySelector(`option[value="${currentSpouse.id}"]`)) {
      const opt = document.createElement('option');
      opt.value = currentSpouse.id;
      opt.textContent = currentSpouse.name;
      opt.selected = true;
      spouseSelect.appendChild(opt);
    }
  }

  // Available dates
  const allDatesCheck = document.getElementById('form-all-dates');
  const datesPicker = document.getElementById('dates-picker');
  const datesList = document.getElementById('dates-list');
  if (member?.availableDates) {
    allDatesCheck.checked = false;
    datesPicker.style.display = 'block';
    datesList.innerHTML = member.availableDates.map(d =>
      `<li data-date="${d}">${d} <button type="button" class="btn-small btn-danger" onclick="removeDate(this)">&times;</button></li>`
    ).join('');
  } else {
    allDatesCheck.checked = true;
    datesPicker.style.display = 'none';
    datesList.innerHTML = '';
  }

  updateSpouseVisibility();
  dialog.showModal();
}

function updateSpouseVisibility() {
  const type = document.getElementById('form-type').value;
  const spouseGroup = document.getElementById('spouse-group');
  const spouseSelect = document.getElementById('form-spouse');
  if (type === 'PARENT_COUPLE') {
    spouseGroup.style.display = 'block';
  } else {
    spouseGroup.style.display = 'none';
    spouseSelect.value = '';
  }
}

document.getElementById('form-type')?.addEventListener('change', updateSpouseVisibility);

document.getElementById('form-all-dates')?.addEventListener('change', (e) => {
  document.getElementById('dates-picker').style.display = e.target.checked ? 'none' : 'block';
});

document.getElementById('btn-add-date')?.addEventListener('click', () => {
  const input = document.getElementById('form-date-input');
  const date = input.value;
  if (!date) return;
  const datesList = document.getElementById('dates-list');
  // Prevent duplicates
  if (datesList.querySelector(`[data-date="${date}"]`)) return;
  const li = document.createElement('li');
  li.dataset.date = date;
  li.innerHTML = `${date} <button type="button" class="btn-small btn-danger" onclick="removeDate(this)">&times;</button>`;
  datesList.appendChild(li);
  input.value = '';
});

function removeDate(btn) {
  btn.parentElement.remove();
}

function getSelectedDates() {
  if (document.getElementById('form-all-dates').checked) return null;
  const items = document.querySelectorAll('#dates-list li');
  const dates = Array.from(items).map(li => li.dataset.date).filter(Boolean).sort();
  return dates.length > 0 ? dates : null;
}

document.getElementById('member-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('form-member-id').value;
  const data = {
    name: document.getElementById('form-name').value,
    gender: document.getElementById('form-gender').value,
    language: document.getElementById('form-language').value,
    gradeGroup: document.getElementById('form-grade').value,
    memberType: document.getElementById('form-type').value,
    sameGenderOnly: document.getElementById('form-same-gender').checked,
    spouseId: document.getElementById('form-spouse').value || null,
    availableDates: getSelectedDates(),
  };

  try {
    if (id) {
      await API.put(`/api/members/${id}`, data);
    } else {
      await API.post('/api/members', data);
    }
    document.getElementById('member-dialog').close();
    loadMembers();
  } catch (e) {
    alert(e.message);
  }
});

function editMember(id) {
  const member = allMembers.find(m => m.id === id);
  if (member) openMemberForm(member);
}

async function deactivateMemberAction(id) {
  const member = allMembers.find(m => m.id === id);
  const name = member ? member.name : '';
  if (!confirm(t('deactivateConfirm').replace('{name}', name))) return;
  try {
    await API.post(`/api/members/${id}/deactivate`);
    loadMembers();
  } catch (e) {
    alert(e.message);
  }
}

async function reactivateMemberAction(id) {
  try {
    await API.post(`/api/members/${id}/reactivate`);
    loadMembers();
  } catch (e) {
    alert(e.message);
  }
}

document.getElementById('btn-export-members-csv')?.addEventListener('click', () => {
  window.open(`/api/members/export/csv?lang=${currentLang}`);
});
document.getElementById('btn-import-members-csv')?.addEventListener('click', () => {
  document.getElementById('csv-file-input').click();
});
document.getElementById('csv-file-input')?.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const res = await fetch('/api/members/import/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: text,
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || res.statusText);
    let msg = `${t('importCreated')}: ${result.created}, ${t('importUpdated')}: ${result.updated}`;
    if (result.errors.length > 0) {
      msg += '\n\n' + result.errors.map(e => `Row ${e.row}: ${e.message}`).join('\n');
    }
    alert(msg);
    loadMembers();
  } catch (err) {
    alert(err.message);
  }
  e.target.value = '';
});
document.getElementById('btn-add-member')?.addEventListener('click', () => openMemberForm(null));
document.getElementById('btn-cancel-member')?.addEventListener('click', () => {
  document.getElementById('member-dialog').close();
});
document.getElementById('show-inactive')?.addEventListener('change', loadMembers);
