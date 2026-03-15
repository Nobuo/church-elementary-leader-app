// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`page-${btn.dataset.page}`).classList.add('active');

    // Load data for the page
    const page = btn.dataset.page;
    if (page === 'members') loadMembers();
    else if (page === 'schedules') loadSchedules();
    else if (page === 'assignments') loadAssignments();
  });
});

// Language selector
document.getElementById('lang-select').addEventListener('change', (e) => {
  setLanguage(e.target.value);
  // Reload current page data
  const activePage = document.querySelector('.nav-btn.active')?.dataset.page;
  if (activePage === 'members') loadMembers();
  else if (activePage === 'schedules') loadSchedules();
  else if (activePage === 'assignments') loadAssignments();
});

// Year/month selectors
function initDateSelectors() {
  const now = new Date();
  const currentFiscalYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();

  const yearSelect = document.getElementById('fiscal-year');
  for (let y = currentFiscalYear - 1; y <= currentFiscalYear + 1; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === currentFiscalYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  const monthSelect = document.getElementById('month-select');
  // Fiscal year months: 4,5,6,7,8,9,10,11,12,1,2,3
  const fiscalMonths = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  for (const m of fiscalMonths) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = m;
    if (m === (now.getMonth() + 1)) opt.selected = true;
    monthSelect.appendChild(opt);
  }

  yearSelect.addEventListener('change', onDateChange);
  monthSelect.addEventListener('change', onDateChange);
}

function onDateChange() {
  const activePage = document.querySelector('.nav-btn.active')?.dataset.page;
  if (activePage === 'schedules') loadSchedules();
  else if (activePage === 'assignments') loadAssignments();
}

function getSelectedFiscalYear() {
  return parseInt(document.getElementById('fiscal-year').value);
}

function getSelectedMonth() {
  return parseInt(document.getElementById('month-select').value);
}

function getCalendarYear() {
  const month = getSelectedMonth();
  return month <= 3 ? getSelectedFiscalYear() + 1 : getSelectedFiscalYear();
}

// Initialize
initDateSelectors();
loadMembers();
