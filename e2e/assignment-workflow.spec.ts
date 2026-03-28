import { test, expect } from '@playwright/test';
import { resetDatabase, seedStandardMembers, seedSchedule, seedAssignments } from './helpers/test-data';

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
  await seedStandardMembers(request);
});

test('E3.1-E3.3 generate assignments and view counts', async ({ page, request }) => {
  // Get current fiscal year from the page
  await page.goto('/');
  const fiscalYear = await page.locator('#fiscal-year').inputValue();
  const year = parseInt(fiscalYear);

  // Seed schedule for April via API
  await seedSchedule(request, year, 4);

  // Navigate to assignments
  await page.selectOption('#month-select', '4');
  await page.click('[data-page="assignments"]');

  // Generate assignments
  await page.click('#btn-generate-assignments');
  await page.waitForTimeout(1000);

  // Should have assignment days with groups
  const groups = page.locator('.assignment-group');
  const count = await groups.count();
  expect(count).toBeGreaterThanOrEqual(4); // 4 sundays * 1 group (combined day)

  // Each group should show "リーダー" (combined day label)
  await expect(page.locator('.assignment-day').first()).toContainText('リーダー');

  // Assignment counts should be visible
  await expect(page.locator('#assignment-counts-section')).toBeVisible();
  await expect(page.locator('#counts-summary')).toContainText('最大');
  await expect(page.locator('#counts-summary')).toContainText('最少');
});

test('E3.5-E3.7 member replacement with recommendations', async ({ page, request }) => {
  await page.goto('/');
  const fiscalYear = await page.locator('#fiscal-year').inputValue();
  const year = parseInt(fiscalYear);

  await seedSchedule(request, year, 4);
  await page.selectOption('#month-select', '4');
  await page.click('[data-page="assignments"]');
  await page.click('#btn-generate-assignments');
  await page.waitForTimeout(1000);

  // Accept confirm dialog for past date replacement
  page.on('dialog', async dialog => {
    await dialog.accept();
  });

  // Click first replace button
  const replaceBtn = page.locator('.replace-btn').first();
  await replaceBtn.click();

  // Dropdown should appear after candidates API call
  const select = page.locator('.replace-select').first();
  await expect(select).toBeVisible({ timeout: 10000 });

  // Check that dropdown has options with count
  const options = await select.locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(1); // More than just "--"

  // Some options should have star or count marker
  const hasStarOrCount = options.some(o => o.includes('★') || o.includes('回') || o.includes('x'));
  expect(hasStarOrCount).toBe(true);

  // Select a candidate and confirm
  const firstOption = await select.locator('option:not([value=""])').first().getAttribute('value');
  if (firstOption) {
    await select.selectOption(firstOption);
    await page.locator('.replace-inline button:has-text("確定")').first().click();
    await page.waitForTimeout(500);
  }
});

test('E3.11-E3.12 clear button on future dates', async ({ page, request }) => {
  await page.goto('/');
  const fiscalYear = await page.locator('#fiscal-year').inputValue();
  const year = parseInt(fiscalYear);

  await seedSchedule(request, year, 4);
  await page.selectOption('#month-select', '4');
  await page.click('[data-page="assignments"]');
  await page.click('#btn-generate-assignments');
  await page.waitForTimeout(1000);

  // Should have clear buttons (for future dates)
  const clearButtons = page.locator('.btn-clear-day');
  const clearCount = await clearButtons.count();

  if (clearCount > 0) {
    // Get initial assignment count
    const initialDays = await page.locator('.assignment-day').count();

    // Accept confirm dialog
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // Click last clear button
    await clearButtons.last().click();
    await page.waitForTimeout(500);

    // Should have fewer assignment days
    const afterDays = await page.locator('.assignment-day').count();
    expect(afterDays).toBeLessThan(initialDays);
  }
});

test('E3.14-E3.15 LINE text dialog', async ({ page, request }) => {
  await page.goto('/');
  const fiscalYear = await page.locator('#fiscal-year').inputValue();
  const year = parseInt(fiscalYear);

  await seedSchedule(request, year, 4);
  await page.selectOption('#month-select', '4');
  await page.click('[data-page="assignments"]');
  await page.click('#btn-generate-assignments');
  await page.waitForTimeout(1000);

  // Click LINE export button
  await page.click('#btn-export-line');
  await page.waitForTimeout(500);

  // Dialog should be open
  await expect(page.locator('#line-dialog')).toBeVisible();

  // Should have text in textarea
  const text = await page.locator('#line-text').inputValue();
  expect(text).toContain('グループ 1');

  // Click copy button
  await page.click('#btn-copy-line');
  await expect(page.locator('#btn-copy-line')).toContainText('コピーしました');

  // Close dialog
  await page.click('#btn-close-line');
  await expect(page.locator('#line-dialog')).not.toBeVisible();
});
