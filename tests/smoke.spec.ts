import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

async function selectRace(page: Page, name: RegExp) {
  await page.locator('[aria-label="Select race"]').click()
  await page.getByRole('option', { name }).click()
}

test('loads, plays, and seeks to an event without runtime errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByText('RACEVIEW')).toBeVisible()
  await expect(page.getByText('2025 · Australian Grand Prix')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible()

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to content' })
  await expect(skipLink).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()

  await page.locator('[data-driver-marker="NOR"]').dispatchEvent('click')
  await expect(page.getByTestId('a11y-status')).toContainText('Driver NOR selected')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('a11y-status')).toContainText('No driver selected')

  await selectRace(page, /2024 · Bahrain Grand Prix/)
  await expect(page.getByRole('combobox', { name: 'Select race' })).toHaveText(
    /2024 · Bahrain Grand Prix/,
  )
  await expect(page.getByText('Sakhir')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('VER', { exact: true }).first()).toBeVisible()

  const playBox = await page.getByRole('button', { name: 'Play replay' }).boundingBox()
  expect(playBox?.height ?? 0).toBeGreaterThanOrEqual(44)
  const trackBox = await page.locator('[data-slot="slider-track"]').boundingBox()
  expect(trackBox?.height ?? 0).toBeGreaterThanOrEqual(8)

  const viewport = page.getByRole('region', { name: /3D race track/ })
  await viewport.focus()
  await expect(viewport).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Play replay' })).toBeVisible()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('a11y-status')).toContainText('Driver VER selected')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('a11y-status')).toContainText('Overtake on lap')
  await expect(page.getByText('Selected driver only')).toBeVisible()
  const timing = page.getByRole('complementary', { name: 'Live timing' })
  await expect(timing.getByRole('button', { name: /SAR/ })).toBeInViewport()

  await page.getByRole('button', { name: 'Play replay' }).click()
  await page.waitForTimeout(600)
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Play replay' })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Pause replay' })).toBeVisible()
  await page.getByRole('button', { name: 'Pause replay' }).click()

  await page.getByRole('button', { name: 'Top-down map' }).click()
  await page.getByRole('button', { name: 'Free orbit' }).click()

  const firstEvent = page.locator('button').filter({ hasText: / passed / }).first()
  await expect(firstEvent).toBeVisible()
  await firstEvent.click()
  await expect(page.getByRole('button', { name: 'Play replay' })).toBeVisible()
  await expect(page.getByText(/LAP \d+ ·/).first()).toBeVisible()

  const search = page.getByRole('searchbox', { name: 'Search events by driver' })
  await search.fill('Leclerc')
  await expect(page.getByRole('button', { name: /PER passed LEC/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /PER passed RUS/ })).toHaveCount(0)
  await search.fill('')

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
  await expect(page.getByTestId('car-telemetry')).toBeVisible()
  await expect(page.getByTestId('car-telemetry')).toContainText('km/h')
  await expect(page.getByTestId('car-speed')).toHaveText(/^\d+$/)
  await expect(page.getByTestId('car-gear')).toHaveText(/^(\d|N)$/)
  await page.screenshot({ path: 'test-results/follow-telemetry.png', fullPage: true })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: 'Free orbit' }).click()
  await expect(page.getByTestId('car-telemetry')).toHaveCount(0)

  await page.getByRole('button', { name: 'Collapse live timing' }).click()
  const expandTiming = page.getByRole('button', { name: 'Expand live timing' })
  await expect(expandTiming).toBeVisible()
  await expect(expandTiming).toBeFocused()
  await expandTiming.click()
  await expect(page.getByRole('button', { name: 'Collapse live timing' })).toBeFocused()

  await page.getByRole('button', { name: 'Collapse events' }).click()
  const expandEvents = page.getByRole('button', { name: 'Expand events' })
  await expect(expandEvents).toBeVisible()
  await expect(expandEvents).toBeFocused()
  await expandEvents.click()
  await expect(page.getByRole('button', { name: 'Collapse events' })).toBeFocused()

  await page.screenshot({ path: 'test-results/raceview.png', fullPage: true })
  expect(errors).toEqual([])
})

test('driver and event lists support arrow keys', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('2025 · Australian Grand Prix')).toBeVisible()
  await selectRace(page, /2024 · Bahrain Grand Prix/)
  await expect(page.getByText('VER', { exact: true }).first()).toBeVisible()

  const verRow = page.getByRole('button', { name: /VER/ }).first()
  await verRow.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('a11y-status')).toContainText('Driver LEC selected')

  const firstEvent = page.locator('button').filter({ hasText: / passed / }).first()
  await firstEvent.focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('a11y-status')).toContainText('Driver PER selected')
})

test('switches race and loads Monaco', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/')
  await expect(page.getByText('2025 · Australian Grand Prix')).toBeVisible()
  await selectRace(page, /2024 · Monaco Grand Prix/)
  await expect(page.getByRole('combobox', { name: 'Select race' })).toHaveText(
    /2024 · Monaco Grand Prix/,
  )
  await expect(page.getByText('Monte Carlo')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('canvas')).toBeVisible()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/monaco.png', fullPage: true })

  await selectRace(page, /2024 · Belgian Grand Prix/)
  await expect(page.getByRole('combobox', { name: 'Select race' })).toHaveText(
    /2024 · Belgian Grand Prix/,
  )
  await expect(page.getByText('Spa-Francorchamps')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/spa.png', fullPage: true })
  expect(errors).toEqual([])
})
