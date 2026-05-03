import { test, expect } from '@playwright/test';
import { resetDatabase, seedStandardMembers, seedSchedule, seedAssignments } from './helpers/test-data';

test.beforeEach(async ({ request }) => {
  await resetDatabase(request);
  await seedStandardMembers(request);
});

test('E3.1-E3.3 generate assignments and view counts', async ({ page, request }) => {
  // ページから現在の年度を取得する
  await page.goto('/');
  const fiscalYear = await page.locator('#fiscal-year').inputValue();
  const year = parseInt(fiscalYear);

  // API経由で4月のスケジュールを投入する
  await seedSchedule(request, year, 4);

  // 割り当て画面へ移動する
  await page.selectOption('#month-select', '4');
  await page.click('[data-page="assignments"]');

  // 割り当てを生成する
  await page.click('#btn-generate-assignments');
  await page.waitForTimeout(1000);

  // グループ付きの割り当て日があるはず
  const groups = page.locator('.assignment-group');
  const count = await groups.count();
  expect(count).toBeGreaterThanOrEqual(4); // 日曜日4回 × 1グループ（合同日）

  // 各グループに「リーダー」（合同日のラベル）が表示されるはず
  await expect(page.locator('.assignment-day').first()).toContainText('リーダー');

  // 割り当て回数が表示されるはず
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

  // 過去日の置き換え確認ダイアログを承認する
  page.on('dialog', async dialog => {
    await dialog.accept();
  });

  // 先頭の置き換えボタンをクリックする
  const replaceBtn = page.locator('.replace-btn').first();
  await replaceBtn.click();

  // 候補API呼び出し後にドロップダウンが表示されるはず
  const select = page.locator('.replace-select').first();
  await expect(select).toBeVisible({ timeout: 10000 });

  // ドロップダウンに回数付きの選択肢があることを確認する
  const options = await select.locator('option').allTextContents();
  expect(options.length).toBeGreaterThan(1); // 「--」だけではない

  // 一部の選択肢には星印または回数マーカーが付くはず
  const hasStarOrCount = options.some(o => o.includes('★') || o.includes('回') || o.includes('x'));
  expect(hasStarOrCount).toBe(true);

  // 候補を選択して確定する
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

  // クリアボタンがあるはず（未来日用）
  const clearButtons = page.locator('.btn-clear-day');
  const clearCount = await clearButtons.count();

  if (clearCount > 0) {
    // 初期の割り当て件数を取得する
    const initialDays = await page.locator('.assignment-day').count();

    // 確認ダイアログを承認する
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 最後のクリアボタンをクリックする
    await clearButtons.last().click();
    await page.waitForTimeout(500);

    // 割り当て日数が減るはず
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

  // LINE出力ボタンをクリックする
  await page.click('#btn-export-line');
  await page.waitForTimeout(500);

  // ダイアログが開いているはず
  await expect(page.locator('#line-dialog')).toBeVisible();

  // テキストエリアに文面が入っているはず
  const text = await page.locator('#line-text').inputValue();
  expect(text).toContain('リーダー担当表');

  // コピーボタンをクリックする
  await page.click('#btn-copy-line');
  await expect(page.locator('#btn-copy-line')).toContainText('コピーしました');

  // ダイアログを閉じる
  await page.click('#btn-close-line');
  await expect(page.locator('#line-dialog')).not.toBeVisible();
});
