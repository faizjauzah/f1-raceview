import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('mobile layout stacks panels without horizontal overflow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('RACEVIEW')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('complementary', { name: 'Live timing' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Events' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true })
})
