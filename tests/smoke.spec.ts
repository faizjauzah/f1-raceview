import { expect, test } from '@playwright/test'

test('loads, plays, and seeks to an event without runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByText('RACEVIEW')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()
  await expect(page.getByText('VER', { exact: true }).first()).toBeVisible()

  await page.getByRole('button', { name: 'Play replay' }).click()
  await page.waitForTimeout(1200)
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause replay' }).click()

  await page.getByRole('button', { name: 'Top-down map' }).click()
  await page.getByRole('button', { name: 'Free orbit' }).click()

  await page.getByRole('tab', { name: /Events/ }).click()
  const firstEvent = page.locator('button').filter({ hasText: / passed / }).first()
  await expect(firstEvent).toBeVisible()
  await firstEvent.click()
  await expect(page.getByRole('button', { name: 'Play replay' })).toBeVisible()
  await expect(page.getByText(/LAP \d+ ·/).first()).toBeVisible()

  const selectedOnly = page.getByRole('switch')
  await selectedOnly.click()
  await expect(page.getByText(/PER passed RUS/)).toHaveCount(0)
  await selectedOnly.click()

  const sliderTrack = page.locator('[data-slot="slider-track"]')
  const box = await sliderTrack.boundingBox()
  if (box) {
    await sliderTrack.click({ position: { x: box.width * 0.42, y: box.height / 2 } })
  }
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Follow selected driver' }).click()
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Free orbit' }).click()

  await page.screenshot({ path: 'test-results/raceview.png', fullPage: true })
  await page.getByRole('tab', { name: /Live timing/ }).click()
  await expect(page.getByText('Live timing')).toBeVisible()
  await page.screenshot({ path: 'test-results/raceview-timing.png', fullPage: true })
  expect(errors).toEqual([])
})

test('switches race and loads Monaco', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByText('2024 · Bahrain Grand Prix')).toBeVisible()
  await page.locator('[aria-label="Select race"]').click()
  await page.getByRole('option', { name: /Monaco Grand Prix/ }).click()
  await expect(page.getByRole('combobox', { name: 'Select race' })).toHaveText(
    /2024 · Monaco Grand Prix/,
  )
  await expect(page.getByText('Monte Carlo')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/monaco.png', fullPage: true })

  await page.locator('[aria-label="Select race"]').click()
  await page.getByRole('option', { name: /Belgian Grand Prix/ }).click()
  await expect(page.getByRole('combobox', { name: 'Select race' })).toHaveText(
    /2024 · Belgian Grand Prix/,
  )
  await expect(page.getByText('Spa-Francorchamps')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/spa.png', fullPage: true })
  expect(errors).toEqual([])
})
