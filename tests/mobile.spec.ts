import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('mobile layout docks collapsible panels above the playback bar', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('RACEVIEW')).toBeVisible()
  await expect(page.locator('canvas')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('complementary', { name: 'Live timing' })).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Events' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

  // Phone starts as an accordion: live timing open, events collapsed.
  await expect(page.getByRole('button', { name: 'Collapse live timing' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Expand events' })).toBeVisible()

  const track = await page.getByRole('region', { name: /3D race track/ }).boundingBox()
  expect(track?.height ?? 0).toBeGreaterThan(150)

  // Camera presets are available on phones too.
  const topDown = page.getByRole('button', { name: 'Top-down map' })
  await expect(topDown).toBeVisible()
  await topDown.click()
  await expect(topDown).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Free orbit' }).click()
  await expect(page.getByRole('button', { name: 'Free orbit' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.getByRole('button', { name: 'Collapse live timing' }).click()
  await expect(page.getByRole('button', { name: 'Expand live timing' })).toBeVisible()

  // With everything collapsed the rails sit on the playback bar, no black gap and no page scroll.
  const gap = await page.evaluate(() => {
    const rail = [...document.querySelectorAll('button')].find(
      (button) => button.getAttribute('aria-label') === 'Expand events',
    )
    const bar = document.querySelector('[data-testid="playback-bar"]')
    if (!rail || !bar) return null
    return Math.round(bar.getBoundingClientRect().top - rail.getBoundingClientRect().bottom)
  })
  expect(gap).not.toBeNull()
  expect(Math.abs(gap ?? 100)).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844)

  // Timeline sits above the transport buttons; play/pause is centred with race time bottom-left.
  const timeline = await page.locator('[data-slot="slider"]').boundingBox()
  const play = await page.getByRole('button', { name: 'Play replay' }).boundingBox()
  const speed = await page.getByRole('combobox', { name: 'Playback speed' }).boundingBox()
  const bar = await page.getByTestId('playback-bar').boundingBox()
  const raceTime = await page.getByText('Race time', { exact: true }).boundingBox()
  expect(timeline).not.toBeNull()
  expect(play).not.toBeNull()
  expect(speed).not.toBeNull()
  expect(bar).not.toBeNull()
  expect(raceTime).not.toBeNull()
  expect(timeline!.y + timeline!.height).toBeLessThan(play!.y)
  expect(timeline!.y + timeline!.height).toBeLessThan(speed!.y)
  expect(Math.abs(play!.x + play!.width / 2 - (bar!.x + bar!.width / 2))).toBeLessThanOrEqual(1)
  expect(raceTime!.y).toBeGreaterThan(timeline!.y + timeline!.height)
  expect(raceTime!.x + raceTime!.width).toBeLessThan(play!.x)

  // Opening one panel collapses the other.
  await page.getByRole('button', { name: 'Expand events' }).click()
  await expect(page.getByRole('button', { name: 'Collapse events' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Expand live timing' })).toBeVisible()

  // Enter from the focused 3D viewport toggles the follow view.
  await page.getByRole('region', { name: /3D race track/ }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Follow selected driver' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Free orbit' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.getByRole('button', { name: 'Collapse events' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Expand live timing' })).toBeVisible()

  // Enter also works with nothing focused, e.g. after clicking empty space.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Follow selected driver' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Free orbit' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true })
})
