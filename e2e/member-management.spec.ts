import { test, expect } from '@playwright/test';
import { resetDatabase, seedStandardMembers } from './helpers/test-data';

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

test('E1.1 register a member via UI', async ({ page }) => {
  await page.goto('/');

  // Click add button
  await page.click('#btn-add-member');
  await expect(page.locator('#member-dialog')).toBeVisible();

  // Fill form
  await page.fill('#form-name', 'テスト太郎');
  await page.selectOption('#form-gender', 'MALE');
  await page.selectOption('#form-language', 'JAPANESE');
  await page.selectOption('#form-grade', 'UPPER');
  await page.selectOption('#form-type', 'PARENT_SINGLE');

  // Submit
  await page.click('#member-form button[type="submit"]');
  await expect(page.locator('#member-dialog')).not.toBeVisible();

  // Verify in table
  await expect(page.locator('#members-body')).toContainText('テスト太郎');
});

test('E1.3 edit a member via UI', async ({ page, request }) => {
  await seedStandardMembers(request);
  await page.goto('/');
  await page.waitForSelector('#members-body tr');

  // Click first edit button
  await page.click('#members-body tr:first-child button:has-text("編集")');
  await expect(page.locator('#member-dialog')).toBeVisible();

  // Change name
  await page.fill('#form-name', '変更後の名前');
  await page.click('#member-form button[type="submit"]');
  await expect(page.locator('#member-dialog')).not.toBeVisible();

  await expect(page.locator('#members-body')).toContainText('変更後の名前');
});

test('E1.4 deactivate a member', async ({ page, request }) => {
  await seedStandardMembers(request);
  await page.goto('/');
  await page.waitForSelector('#members-body tr');

  const initialRows = await page.locator('#members-body tr').count();

  // Click first deactivate button
  await page.click('#members-body tr:first-child button:has-text("無効化")');
  await page.waitForTimeout(500);

  const afterRows = await page.locator('#members-body tr').count();
  expect(afterRows).toBe(initialRows - 1);
});

test('E1.5 show inactive members', async ({ page, request }) => {
  await seedStandardMembers(request);
  await page.goto('/');
  await page.waitForSelector('#members-body tr');

  // Deactivate one
  await page.click('#members-body tr:first-child button:has-text("無効化")');
  await page.waitForTimeout(500);

  // Check show inactive
  await page.check('#show-inactive');
  await page.waitForTimeout(500);

  // Should see "無効" status
  await expect(page.locator('#members-body')).toContainText('無効');
});

test('E1.7 language switch to English', async ({ page }) => {
  await page.goto('/');

  await page.selectOption('#lang-select', 'en');

  await expect(page.locator('#app-title')).toHaveText('Leader Management');
  await expect(page.locator('#th-name')).toHaveText('Name');
  await expect(page.locator('#th-gender')).toHaveText('Gender');
});
