import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('searches only collected law, shows missing coverage and exports formalization', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#document-count')).toHaveText('5 source records');
  await expect(page.locator('.result').first()).toBeVisible();
  await expect(page.locator('#coverage')).toContainText('Not collected');
  const corpusDownload = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download collected data' }).click();
  const corpusPath = await (await corpusDownload).path();
  expect(JSON.parse(await readFile(corpusPath, 'utf8'))).toEqual(
    JSON.parse(await readFile('data/demo/corpus.json', 'utf8'))
  );
  await page.getByRole('button', { name: '法律', exact: true }).click();
  await expect(page.locator('.result').first()).toContainText('CN / zh');
  const citation = page.locator('.result').first();
  await expect(
    citation.getByRole('link', { name: 'Official source' })
  ).toHaveAttribute('href', /gov\.cn/);
  await page.getByLabel('What are you looking for?').fill('zzzzunmatchedzzzz');
  await page.getByRole('button', { name: 'Find sources' }).click();
  await expect(page.locator('#results')).toContainText('insufficient evidence');
  const downloaded = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export formalization' })
    .first()
    .click();
  expect((await downloaded).suggestedFilename()).toMatch(/\.lino$/);
  await page.getByLabel('What are you looking for?').fill('data minimisation');
  await page.getByRole('button', { name: 'Find sources' }).click();
  await expect(page.locator('.result').first()).toContainText('EU / en');
  await expect(page.locator('.result').first()).toContainText('accountability');
  await expect(
    page
      .locator('.result')
      .first()
      .getByRole('link', { name: 'Official source' })
  ).toHaveAttribute(
    'href',
    'https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng'
  );
  await page
    .getByLabel('What are you looking for?')
    .fill('equal before the law');
  await page.getByRole('button', { name: 'Find sources' }).click();
  await page.screenshot({
    path: 'docs/screenshots/legal-demo.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test('remains usable on a phone and rejects corrupted imported data', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#document-count')).toContainText('5');
  await page.locator('#corpus-file').setInputFiles({
    name: 'corrupt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, laws: [{}] })),
  });
  await expect(page.locator('#upload-status')).not.toHaveText(
    'Corpus loaded and checksums verified.'
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
});
