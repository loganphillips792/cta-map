import { expect, test, type Page } from '@playwright/test'

const routeButton = (page: Page, routeId: string) =>
  page.locator(`[data-testid="route-button"][data-route-id="${routeId}"]`).first()

const favoriteToggle = (page: Page, routeId: string) =>
  page.locator(`[data-testid="favorite-toggle"][data-route-id="${routeId}"]`).first()

const waitForMapPage = async (page: Page) => {
  await page.goto('/map')
  await expect(page.getByRole('heading', { name: 'Chicago - CTA Live' })).toBeVisible()
  await expect(page.getByTestId('all-routes-list')).toBeVisible()
}

test.beforeEach(async ({ context, page }) => {
  await context.addInitScript(() => {
    localStorage.setItem('cta-map-favorite-routes', JSON.stringify([]))
    localStorage.setItem('cta-map-active-routes', JSON.stringify([]))
    localStorage.setItem(
      'cta-map-display-toggles',
      JSON.stringify({ location: false, allRoutes: true, favoriteRoutes: false }),
    )
  })
  await waitForMapPage(page)
})

test('adds a single route to favorites', async ({ page }) => {
  const targetRouteId = '151'

  await favoriteToggle(page, targetRouteId).click()

  await expect(page.getByTestId('favorites-count')).toHaveText('1')
  await expect(
    page.getByTestId('favorites-list').getByText(new RegExp(`^${targetRouteId}\\b`)),
  ).toBeVisible()
})

test('adds five routes to favorites', async ({ page }) => {
  const targetRouteIds = ['3', '6', '8', '22', '29']

  for (const routeId of targetRouteIds) {
    await favoriteToggle(page, routeId).click()
  }

  await expect(page.getByTestId('favorites-count')).toHaveText('5')
  for (const routeId of targetRouteIds) {
    await expect(
      page.getByTestId('favorites-list').getByText(new RegExp(`^${routeId}\\b`)),
    ).toBeVisible()
  }
})

test('selects a route', async ({ page }) => {
  const targetRouteId = '29'
  const route = routeButton(page, targetRouteId)

  await route.click()

  await expect(page.getByTestId('selected-routes-count')).toHaveText('1')
  await expect(route).toHaveAttribute('aria-pressed', 'true')
})

test('removes a single selected route', async ({ page }) => {
  const targetRouteId = '29'
  const route = routeButton(page, targetRouteId)

  await route.click()
  await expect(page.getByTestId('selected-routes-count')).toHaveText('1')

  await route.click()

  await expect(page.getByTestId('selected-routes-count')).toHaveText('0')
  await expect(route).toHaveAttribute('aria-pressed', 'false')
})

test('clears all selected routes', async ({ page }) => {
  const activeRoutes = ['3', '49', '151']

  for (const routeId of activeRoutes) {
    await routeButton(page, routeId).click()
  }

  await expect(page.getByTestId('selected-routes-count')).toHaveText(
    activeRoutes.length.toString(),
  )

  await page.getByRole('button', { name: 'Deselect all selected routes' }).click()

  await expect(page.getByTestId('selected-routes-count')).toHaveText('0')
  for (const routeId of activeRoutes) {
    await expect(routeButton(page, routeId)).toHaveAttribute('aria-pressed', 'false')
  }
})

test('display toggles are mutually exclusive', async ({ page }) => {
  const allRoutesToggle = page.getByRole('button', { name: 'Show all routes' })
  const favoriteRoutesToggle = page.getByRole('button', { name: 'Show favorite routes' })

  await expect(allRoutesToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(favoriteRoutesToggle).toBeDisabled()

  await allRoutesToggle.click()

  await expect(allRoutesToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(favoriteRoutesToggle).toBeEnabled()

  await favoriteRoutesToggle.click()

  await expect(favoriteRoutesToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(allRoutesToggle).toBeDisabled()
  await expect(allRoutesToggle).toHaveAttribute('aria-pressed', 'false')
})

test('activating a route renders it on the map', async ({ page }) => {
  const routeId = '29'

  await routeButton(page, routeId).click()

  await expect(page.getByTestId('selected-routes-count')).toHaveText('1')

  const activeRoutePaths = page.locator(`.active-route-${routeId}`)
  await activeRoutePaths.first().waitFor({ state: 'attached' })
  expect(await activeRoutePaths.count()).toBeGreaterThan(0)
})
