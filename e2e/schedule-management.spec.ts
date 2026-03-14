import { test, expect } from '@playwright/test';
import { resetDatabase, seedStandardMembers } from './helpers/test-data';

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
  await seedStandardMembers(request);
});

test('E2.1 generate schedule via UI', async ({ page }) => {
  await page.goto('/');

  // Navigate to schedules tab
  await page.click('[data-page="schedules"]');
  await expect(page.locator('#page-schedules')).toBeVisible();

  // Select a future month (April of the current fiscal year)
  await page.selectOption('#month-select', '4');

  // Generate schedule
  await page.click('#btn-generate-schedule');
  await page.waitForTimeout(500);

  // Should have schedule cards
  const cards = page.locator('.schedule-card');
  await expect(cards).toHaveCount(await cards.count()); // At least rendered
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

  // Exclude first card
  const firstCard = page.locator('.schedule-card').first();
  await firstCard.locator('button:has-text("除外")').click();

  // Should have excluded class after re-render
  await expect(page.locator('.schedule-card.excluded').first()).toBeVisible({ timeout: 5000 });

  // Include it back
  await page.locator('.schedule-card.excluded').first().locator('button:has-text("含める")').click();

  // First card should no longer be excluded
  await expect(page.locator('.schedule-card.excluded')).toHaveCount(0, { timeout: 5000 });
});

test('E2.4-E2.5 toggle event', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-page="schedules"]');
  await page.selectOption('#month-select', '4');
  await page.click('#btn-generate-schedule');
  await page.waitForTimeout(500);

  // Click event button on first card
  const firstCard = page.locator('.schedule-card').first();
  await firstCard.locator('.btn-event').click();

  // Should have event-day class after re-render
  await expect(page.locator('.schedule-card.event-day').first()).toBeVisible({ timeout: 5000 });

  // Toggle off
  await page.locator('.schedule-card.event-day').first().locator('.btn-event').click();

  // Should have no event-day cards
  await expect(page.locator('.schedule-card.event-day')).toHaveCount(0, { timeout: 5000 });
});
