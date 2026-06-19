import { expect, test } from '@playwright/test';

test('loads the seeded profile, toggles activity view, and looks up a new username', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Turn a GitHub handle into a crisp, shareable profile snapshot.' })).toBeVisible();
  await expect(page.getByLabel('GitHub username')).toHaveValue('sjyang18');
  await expect(page.getByText('Contribution activity')).toBeVisible();
  await expect(page.locator('.day-cell').first()).toBeVisible();

  await page.getByRole('tab', { name: 'Activity focus' }).click();
  await expect(page).toHaveURL(/view=activity/);
  await expect(page.getByRole('tab', { name: 'Activity focus' })).toHaveAttribute('aria-selected', 'true');

  const usernameInput = page.getByLabel('GitHub username');
  await usernameInput.fill('octocat');
  await page.getByRole('button', { name: 'Build card' }).click();

  await expect(page).toHaveURL(/username=octocat/);
  await expect(page.getByText('@octocat')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent repositories' })).toBeVisible();
  await expect(page.locator('.day-cell').first()).toBeVisible();
});

test('shows clear error states for invalid and missing GitHub users', async ({ page }) => {
  await page.goto('/');

  const usernameInput = page.getByLabel('GitHub username');
  await usernameInput.fill('bad user');
  await page.getByRole('button', { name: 'Build card' }).click();

    await expect(page).toHaveURL(/username=bad(?:\+|%20)user/);
  await expect(page.getByRole('heading', { name: 'Profile card unavailable' })).toBeVisible();
  await expect(page.getByText('That does not look like a valid GitHub username.')).toBeVisible();

  await usernameInput.fill('this-user-should-not-exist-123456789');
  await page.getByRole('button', { name: 'Build card' }).click();

  await expect(page).toHaveURL(/username=this-user-should-not-exist-123456789/);
  await expect(page.getByRole('heading', { name: 'Profile card unavailable' })).toBeVisible();
  await expect(page.getByText('GitHub user was not found.')).toBeVisible();
});

test('works without JavaScript by submitting the server-rendered form', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();

  await page.goto('/');
  await expect(page.getByLabel('GitHub username')).toHaveValue('sjyang18');

    await page.getByRole('tab', { name: 'Activity focus' }).click();
  await expect(page).toHaveURL(/view=activity/);
  await expect(page.getByRole('tab', { name: 'Activity focus' })).toHaveAttribute('aria-selected', 'true');

  await page.getByLabel('GitHub username').fill('octocat');
  await page.getByRole('button', { name: 'Build card' }).click();

  await expect(page).toHaveURL(/username=octocat/);
  await expect(page.getByText('@octocat')).toBeVisible();
  await expect(page.getByText('Contribution activity')).toBeVisible();

  await context.close();
});