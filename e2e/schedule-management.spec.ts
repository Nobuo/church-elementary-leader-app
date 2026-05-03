import { test, expect } from '@playwright/test';
import { resetDatabase, seedStandardMembers } from './helpers/test-data';

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
  await seedStandardMembers(request);
});

test('E2.1 generate schedule via UI', async ({ page }) => {
  await page.goto('/');

  // スケジュールタブへ移動する
  await page.click('[data-page="schedules"]');
  await expect(page.locator('#page-schedules')).toBeVisible();

  // 未来の月を選択する（現在年度の4月）
  await page.selectOption('#month-select', '4');

  // スケジュールを生成する
  await page.click('#btn-generate-schedule');
  await page.waitForTimeout(500);

  // スケジュールカードがあるはず
  const cards = page.locator('.schedule-card');
  await expect(cards).toHaveCount(await cards.count()); // 少なくとも描画されている
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(4);
  expect(count).toBeLessThanOrEqual(5);
});

test('E2.2-E2.3 toggle exclusion', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-page="schedules"]');
  await page.selectOption('#month-select', '4');
  await page.click('#btn-generate-schedule');
  await page.waitForTimeout(500);

  // 先頭のカードを除外する
  const firstCard = page.locator('.schedule-card').first();
  await firstCard.locator('button:has-text("除外")').click();

  // 再描画後に `excluded` クラスが付くはず
  await expect(page.locator('.schedule-card.excluded').first()).toBeVisible({ timeout: 5000 });

  // 再び含める
  await page.locator('.schedule-card.excluded').first().locator('button:has-text("含める")').click();

  // 先頭のカードは除外状態ではなくなるはず
  await expect(page.locator('.schedule-card.excluded')).toHaveCount(0, { timeout: 5000 });
});

test('E2.4-E2.5 toggle event', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-page="schedules"]');
  await page.selectOption('#month-select', '4');
  await page.click('#btn-generate-schedule');
  await page.waitForTimeout(500);

  // 先頭カードのイベントボタンをクリックする
  const firstCard = page.locator('.schedule-card').first();
  await firstCard.locator('.btn-event').click();

  // 再描画後に `event-day` クラスが付くはず
  await expect(page.locator('.schedule-card.event-day').first()).toBeVisible({ timeout: 5000 });

  // オフに切り替える
  await page.locator('.schedule-card.event-day').first().locator('.btn-event').click();

  // イベント日のカードはなくなるはず
  await expect(page.locator('.schedule-card.event-day')).toHaveCount(0, { timeout: 5000 });
});

test('E2.x generate fiscal year schedule via UI', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-page="schedules"]');
  await page.selectOption('#fiscal-year', '2026');
  await page.selectOption('#month-select', '7');

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('新規');
    await dialog.accept();
  });

  await page.click('#btn-generate-fiscal-year-schedule');

  await expect(page.locator('.schedule-card')).toHaveCount(4, { timeout: 5000 });

  await page.selectOption('#month-select', '4');
  await expect(page.locator('.schedule-card')).toHaveCount(4, { timeout: 5000 });

  await page.selectOption('#month-select', '3');
  await expect(page.locator('.schedule-card')).toHaveCount(4, { timeout: 5000 });
});

test('E2.x fiscal year view shows the full year on one screen', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-page="schedules"]');
  await page.selectOption('#fiscal-year', '2026');

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });

  await page.click('#btn-generate-fiscal-year-schedule');
  await page.click('#btn-schedule-view-year');

  await expect(page.locator('#schedule-fiscal-year-list')).toBeVisible();
  await expect(page.locator('.schedule-month-block')).toHaveCount(12);
  await expect(page.locator('.schedule-month-block').first()).toContainText('4');
  await expect(page.locator('.schedule-month-block').last()).toContainText('3');
  await expect(page.locator('#schedule-fiscal-year-list .schedule-card')).toHaveCount(52);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
});

test('E2.x fiscal year view shows empty month blocks before generation', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-page="schedules"]');
  await page.click('#btn-schedule-view-year');

  await expect(page.locator('.schedule-month-block')).toHaveCount(12);
  await expect(page.locator('.fiscal-year-empty-banner')).toContainText('この年度のスケジュール');
  await expect(page.locator('#schedule-fiscal-year-list .schedule-empty')).toHaveCount(13);
});

test('E2.x fiscal year view shows API load errors', async ({ page }) => {
  await page.route('**/api/schedules/fiscal-year?fiscalYear=*', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'forced failure' }),
    });
  });

  await page.goto('/');
  await page.click('[data-page="schedules"]');
  await page.click('#btn-schedule-view-year');

  await expect(page.locator('#schedule-fiscal-year-list .schedule-error')).toContainText('forced failure');
});
