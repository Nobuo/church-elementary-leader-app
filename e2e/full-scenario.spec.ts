import { test, expect } from '@playwright/test';
import { resetDatabase } from './helpers/test-data';

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
});

test('full scenario: register → schedule → assign → replace → export → i18n', async ({ page }) => {
  await page.goto('/');

  // 現在の年度を取得する
  const fiscalYear = await page.locator('#fiscal-year').inputValue();
  const year = parseInt(fiscalYear);

  // --- 手順1-2: 10名のメンバーを登録（UPPER 5名 + LOWER 5名）---
  const members = [
    { name: '田中太郎', gender: 'MALE', language: 'JAPANESE', grade: 'UPPER', type: 'PARENT_SINGLE' },
    { name: 'John Smith', gender: 'MALE', language: 'ENGLISH', grade: 'UPPER', type: 'PARENT_SINGLE' },
    { name: '佐藤花子', gender: 'FEMALE', language: 'BOTH', grade: 'UPPER', type: 'PARENT_SINGLE' },
    { name: 'Jane Doe', gender: 'FEMALE', language: 'ENGLISH', grade: 'UPPER', type: 'PARENT_SINGLE' },
    { name: '山田一郎', gender: 'MALE', language: 'JAPANESE', grade: 'UPPER', type: 'PARENT_SINGLE' },
    { name: '鈴木二郎', gender: 'MALE', language: 'JAPANESE', grade: 'LOWER', type: 'PARENT_SINGLE' },
    { name: 'Emily Brown', gender: 'FEMALE', language: 'ENGLISH', grade: 'LOWER', type: 'PARENT_SINGLE' },
    { name: '高橋三郎', gender: 'MALE', language: 'BOTH', grade: 'LOWER', type: 'PARENT_SINGLE' },
    { name: 'Bob Wilson', gender: 'MALE', language: 'ENGLISH', grade: 'LOWER', type: 'PARENT_SINGLE' },
    { name: '伊藤美咲', gender: 'FEMALE', language: 'JAPANESE', grade: 'LOWER', type: 'PARENT_SINGLE' },
  ];

  for (const m of members) {
    await page.click('#btn-add-member');
    await expect(page.locator('#member-dialog')).toBeVisible();
    await page.fill('#form-name', m.name);
    await page.selectOption('#form-gender', m.gender);
    await page.selectOption('#form-language', m.language);
    await page.selectOption('#form-grade', m.grade);
    await page.selectOption('#form-type', m.type);
    await page.click('#member-form button[type="submit"]');
    await expect(page.locator('#member-dialog')).not.toBeVisible();
  }

  // 表に10名のメンバーが表示されていることを確認する
  const rows = page.locator('#members-body tr');
  await expect(rows).toHaveCount(10);

  // --- 手順4-5: スケジュール生成 ---
  await page.click('[data-page="schedules"]');
  await page.selectOption('#month-select', '4');
  await page.click('#btn-generate-schedule');
  await page.waitForTimeout(500);

  const cards = page.locator('.schedule-card');
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThanOrEqual(4);

  // --- 手順6: 1日目を除外し、2日目をイベントに設定 ---
  await cards.nth(0).locator('button:has-text("除外")').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.schedule-card.excluded')).toHaveCount(1);

  await cards.nth(1).locator('.btn-event').click();
  await page.waitForTimeout(300);
  await expect(page.locator('.schedule-card.event-day')).toHaveCount(1);

  // --- 手順7-8: 割り当て生成 ---
  await page.click('[data-page="assignments"]');
  await page.selectOption('#month-select', '4');
  await page.click('#btn-generate-assignments');
  await page.waitForTimeout(1000);

  // 割り当て日が存在するはず（除外日を除く）
  const assignmentDays = page.locator('.assignment-day');
  const dayCount = await assignmentDays.count();
  expect(dayCount).toBe(cardCount - 1); // 除外分を差し引く

  // --- 手順10: メンバー置き換え ---
  const replaceBtn = page.locator('.replace-btn').first();
  if (await replaceBtn.isVisible()) {
    await replaceBtn.click();
    await page.waitForTimeout(500);

    const select = page.locator('.replace-select').first();
    if (await select.isVisible()) {
      const firstOption = await select.locator('option:not([value=""])').first().getAttribute('value');
      if (firstOption) {
        await select.selectOption(firstOption);
        await page.locator('.replace-inline button:has-text("確定")').first().click();
        await page.waitForTimeout(500);
      }
    }
  }

  // --- 手順11: 割り当て回数が表示される ---
  await expect(page.locator('#assignment-counts-section')).toBeVisible();

  // --- 手順12: LINE文面 ---
  await page.click('#btn-export-line');
  await page.waitForTimeout(500);
  await expect(page.locator('#line-dialog')).toBeVisible();
  const lineText = await page.locator('#line-text').inputValue();
  expect(lineText).toContain('リーダー担当表');
  await page.click('#btn-close-line');

  // --- 手順13-14: 英語へ切り替え ---
  await page.selectOption('#lang-select', 'en');
  await expect(page.locator('#app-title')).toHaveText('Leader Management');
  await expect(page.locator('#assignments-title')).toHaveText('Assignment Results');
});
