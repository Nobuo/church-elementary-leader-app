import { test, expect } from '@playwright/test';
import { resetDatabase, seedStandardMembers } from './helpers/test-data';

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

test('E1.1 register a member via UI', async ({ page }) => {
  await page.goto('/');

  // 追加ボタンをクリックする
  await page.click('#btn-add-member');
  await expect(page.locator('#member-dialog')).toBeVisible();

  // フォームに入力する
  await page.fill('#form-name', 'テスト太郎');
  await page.selectOption('#form-gender', 'MALE');
  await page.selectOption('#form-language', 'JAPANESE');
  await page.selectOption('#form-grade', 'UPPER');
  await page.selectOption('#form-type', 'PARENT_SINGLE');

  // 送信する
  await page.click('#member-form button[type="submit"]');
  await expect(page.locator('#member-dialog')).not.toBeVisible();

  // 表に表示されていることを確認する
  await expect(page.locator('#members-body')).toContainText('テスト太郎');
});

test('E1.3 edit a member via UI', async ({ page, request }) => {
  await seedStandardMembers(request);
  await page.goto('/');
  await page.waitForSelector('#members-body tr');

  // 先頭の編集ボタンをクリックする
  await page.click('#members-body tr:first-child button:has-text("編集")');
  await expect(page.locator('#member-dialog')).toBeVisible();

  // 名前を変更する
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

  // 確認ダイアログを承認する
  page.on('dialog', dialog => dialog.accept());

  // 先頭の無効化ボタンをクリックする
  await page.click('#members-body tr:first-child button:has-text("無効化")');
  await page.waitForTimeout(500);

  const afterRows = await page.locator('#members-body tr').count();
  expect(afterRows).toBe(initialRows - 1);
});

test('E1.5 show inactive members', async ({ page, request }) => {
  await seedStandardMembers(request);
  await page.goto('/');
  await page.waitForSelector('#members-body tr');

  // 確認ダイアログを承認する
  page.on('dialog', dialog => dialog.accept());

  // 1件を無効化する
  await page.click('#members-body tr:first-child button:has-text("無効化")');
  await page.waitForTimeout(500);

  // 無効メンバー表示を確認する
  await page.check('#show-inactive');
  await page.waitForTimeout(500);

  // 「無効」ステータスが表示されるはず
  await expect(page.locator('#members-body')).toContainText('無効');
});

test('E1.7 language switch to English', async ({ page }) => {
  await page.goto('/');

  await page.selectOption('#lang-select', 'en');

  await expect(page.locator('#app-title')).toHaveText('Leader Management');
  await expect(page.locator('#th-name')).toHaveText('Name');
  await expect(page.locator('#th-gender')).toHaveText('Gender');
});
