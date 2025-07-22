/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test, expect } from '@playwright/test';

test.describe('signin page', () => {
  test('should include Guest', async ({ page }) => {
    await page.goto('/');

    const enterButton = page.getByRole('button', { name: 'Enter' });
    await expect(enterButton).toBeVisible();
  });

  test('should include Vault', async ({ page }) => {
    await page.goto('/');

    const signInButton = page.getByRole('button', { name: 'Sign In' });
    await expect(signInButton).toBeVisible();
  });
});

test.describe('home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    const enterButton = page.getByRole('button', { name: 'Enter' });
    await expect(enterButton).toBeVisible();
    await enterButton.click();
  });

  test('should render with title', async ({ page }) => {
    await expect(page.getByText('Home-K8s Catalog')).toBeVisible();
  });

  for (let item of ['Home', 'Graph', 'Docs', 'Create...']) {
    test('should include menu item ' + item, async ({ page }) => {
      let sidebarItem = page.getByTestId('sidebar-root').locator('div > a > span', {hasText: item});
      await expect(sidebarItem).toBeVisible();
    });
  };

});

test.describe('doc page', () => {
  test('should have more than one document', async({ page }) => {
    await page.goto('/');

    const enterButton = page.getByRole('button', { name: 'Enter' });
    await expect(enterButton).toBeVisible();
    await enterButton.click();

    const docButton = page.getByText('Docs');
    await expect(docButton).toBeVisible();
    await docButton.click();

    let owned = page.getByText('Owned', {exact: false});
    await expect(owned).not.toContainText('Owned (0)');
  })
});

test.describe('create page', () => {
  test('should have at least one component', async({ page }) => {
    await page.goto('/');

    const enterButton = page.getByRole('button', { name: 'Enter' });
    await expect(enterButton).toBeVisible();
    await enterButton.click();

    const docButton = page.getByText('Create...');
    await expect(docButton).toBeVisible();
    await docButton.click();

    const templateCard = page.getByText('home.lan Application Template');
    await expect(templateCard).toBeVisible();
  })
});

