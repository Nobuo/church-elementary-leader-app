import { test, expect } from '@playwright/test';
import { resetDatabase, seedStandardMembers, seedSchedule, seedAssignments } from './helpers/test-data';

const BASE = 'http://localhost:3001';

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
  await seedStandardMembers(request);
});

/**
 * 合同回(3人1グループ)で割り当て済みの日を分級に切り替えたとき、
 * 画面から4人目を追加できること。2026-08-16に実際に困ったケース。
 */
test('分級に切り替えた日に、画面から担当を追加できる', async ({ page, request }) => {
  await page.goto('/');
  const year = parseInt(await page.locator('#fiscal-year').inputValue());

  const schedules = await seedSchedule(request, year, 4);
  await seedAssignments(request, year, 4);

  // 先頭の有効な日を分級に切り替える(合同日として割り当てた後の切り替え)
  const target = schedules.filter((s: { isExcluded: boolean }) => !s.isExcluded)[0];
  await request.post(`${BASE}/api/schedules/${target.id}/toggle-split-class`);

  await page.selectOption('#month-select', '4');
  await page.click('[data-page="assignments"]');
  await page.waitForTimeout(1000);

  // 対象日のブロックにグループが2つ出ているはず(片方は空き枠)
  const day = page.locator('.assignment-day').first();
  await expect(day.locator('.assignment-group')).toHaveCount(2);

  const vacantGroup = day.locator('.assignment-group').nth(1);
  await expect(vacantGroup.locator('.vacant-slot')).toHaveCount(2);

  // 空き枠から担当を追加する
  await vacantGroup.locator('button[data-action="start-assign"]').first().click();
  const select = vacantGroup.locator('select.replace-select');
  await expect(select).toBeVisible();

  const optionValue = await select.locator('option').nth(1).getAttribute('value');
  expect(optionValue).toBeTruthy();
  await select.selectOption(optionValue!);
  await vacantGroup.getByRole('button', { name: '確定' }).click();
  await page.waitForTimeout(1000);

  // 追加した担当がグループ2に入り、空き枠が1つ減っているはず
  const updatedGroup = page.locator('.assignment-day').first().locator('.assignment-group').nth(1);
  await expect(updatedGroup.locator('.member-name')).toHaveCount(1);
  await expect(updatedGroup.locator('.vacant-slot')).toHaveCount(1);
});
