import { test, expect } from '@playwright/test'

test.describe('Flow 1 — first use / new program', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('app loads with empty program and default layout', async ({ page }) => {
    await expect(page.getByText('MoveMatter')).toBeVisible()
    // MoveList renders this exact text when steps array is empty
    await expect(page.getByText('No steps yet — add a move or delay.')).toBeVisible()
    await expect(page.getByText('+ Add Move')).toBeVisible()
    await expect(page.getByText('+ Add Delay')).toBeVisible()
  })

  test('can add a move and see its fields', async ({ page }) => {
    await page.getByText('+ Add Move').click()
    // Use exact match to avoid matching "MoveMatter" or "+ Add Move"
    await expect(page.getByText('MOVE', { exact: true })).toBeVisible()
    await expect(page.getByText('Displacement (mm)')).toBeVisible()
    await expect(page.getByText('Max Velocity (mm/s)')).toBeVisible()
  })

  test('Run button is visible with no steps', async ({ page }) => {
    // Empty program has no blocking errors, so Run is enabled
    const runBtn = page.getByRole('button', { name: 'Run' })
    await expect(runBtn).toBeVisible()
    await expect(runBtn).toBeEnabled()
  })

  test('Run button starts playback after adding a move', async ({ page }) => {
    await page.getByText('+ Add Move').click()
    const runBtn = page.getByRole('button', { name: 'Run' })
    await expect(runBtn).toBeVisible()
    await expect(runBtn).toBeEnabled()
    await runBtn.click()
    // After clicking Run, ProgramEditorPanel button changes to "Stop" (exact text)
    // Use getByText with exact match to distinguish from PlaybackBar's aria-label="Stop" icon
    await expect(page.getByText('Stop', { exact: true })).toBeVisible({ timeout: 3000 })
  })

  test('Stop button returns to idle', async ({ page }) => {
    await page.getByText('+ Add Move').click()
    await page.getByRole('button', { name: 'Run' }).click()
    // Click the "Stop" text button in ProgramEditorPanel (not the PlaybackBar icon)
    await page.getByText('Stop', { exact: true }).click()
    await expect(page.getByRole('button', { name: 'Run' })).toBeVisible({ timeout: 3000 })
  })
})

test.describe('Flow 2 — save and load', () => {
  test('Save As downloads a json file', async ({ page }) => {
    await page.goto('/')
    await page.getByText('+ Add Move').click()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.waitForEvent('dialog').then((dialog) => dialog.accept('test-program')),
      page.getByRole('button', { name: 'Save As' }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(/\.json$/)
  })
})

test.describe('Flow 3 — presentation mode', () => {
  test('Presentation toggle switches layout and hides editor', async ({ page }) => {
    await page.goto('/')
    // The header button shows "Presentation" when not in presentation mode
    await page.getByRole('button', { name: 'Presentation' }).click()
    // Program editor (sidebar) should not be visible
    await expect(page.getByText('+ Add Move')).not.toBeVisible()
  })

  test('Exit Presentation restores default layout', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Presentation' }).click()
    // Button now shows "Exit Presentation"
    await page.getByRole('button', { name: 'Exit Presentation' }).click()
    await expect(page.getByText('+ Add Move')).toBeVisible()
  })
})

test.describe('Validation', () => {
  test('Run is disabled when maxVelocity is 0', async ({ page }) => {
    await page.goto('/')
    await page.getByText('+ Add Move').click()
    // Max Velocity (mm/s) is the second NumInput label; its input is the second number input in the move row
    // We target by label text to be more robust
    const velInput = page.getByLabel('Max Velocity (mm/s)')
    await velInput.fill('0')
    await velInput.blur()
    const runBtn = page.getByRole('button', { name: 'Run' })
    await expect(runBtn).toBeDisabled()
  })

  test('theme toggle changes button label', async ({ page }) => {
    await page.goto('/')
    // The theme button has aria-label="Toggle theme" and shows "☾ Dark" or "☀ Light"
    const themeBtn = page.getByRole('button', { name: 'Toggle theme' })
    await expect(themeBtn).toBeVisible()
    const initialText = await themeBtn.textContent()
    await themeBtn.click()
    const updatedText = await themeBtn.textContent()
    expect(updatedText).not.toBe(initialText)
  })

  test('theme toggle persists across reload', async ({ page }) => {
    await page.goto('/')
    const themeBtn = page.getByRole('button', { name: 'Toggle theme' })
    const initialText = await themeBtn.textContent()
    await themeBtn.click()
    const textAfterToggle = await themeBtn.textContent()
    await page.reload()
    // After reload, theme state may or may not persist depending on localStorage
    // At minimum the button should still be visible
    await expect(page.getByRole('button', { name: 'Toggle theme' })).toBeVisible()
    // The toggled text should still be visible after reload if theme is persisted
    const textAfterReload = await page.getByRole('button', { name: 'Toggle theme' }).textContent()
    // Theme persists via localStorage (movematter-theme key), so reload should preserve the toggled state
    expect(textAfterReload).toBe(textAfterToggle)
  })
})
