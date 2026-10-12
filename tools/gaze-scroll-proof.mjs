/**
 * Prove scroll does not make eyes wander:
 * 1) calm idle at hero
 * 2) mouse gaze (no scroll) — eyes follow
 * 3) during scroll + synthetic pointer jitter — eyes stay calm / lock on
 * 4) after scroll settles — calm idle restored
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const base = process.argv[2] ?? 'http://127.0.0.1:4180'
const outDir = path.resolve('.preview-out/gaze-scroll')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--hide-scrollbars', '--force-device-scale-factor=1'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${base}/?nointro=1`, { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForFunction(() => document.documentElement.dataset.character, null, { timeout: 30000 })
await page.waitForTimeout(1200)

const faceClip = { x: 520, y: 80, width: 700, height: 520 }

await page.screenshot({ path: `${outDir}/01-idle-calm.png`, clip: faceClip })
await page.screenshot({ path: `${outDir}/01-idle-full.png`, fullPage: false })

// Mouse gaze without scroll
await page.mouse.move(120, 200)
await page.waitForTimeout(700)
await page.screenshot({ path: `${outDir}/02-gaze-left.png`, clip: faceClip })
await page.mouse.move(1320, 200)
await page.waitForTimeout(700)
await page.screenshot({ path: `${outDir}/03-gaze-right.png`, clip: faceClip })

// Center mouse, then scroll while firing pointer jitter (scroll-driven mouse simulation)
await page.mouse.move(720, 450)
await page.waitForTimeout(400)

const samples = []
for (let i = 0; i < 18; i++) {
  // wheel scroll
  await page.mouse.wheel(0, 650)
  // synthetic jitter while scrolling (would previously yank eyeballs)
  const jx = 200 + (i % 6) * 180
  const jy = 120 + (i % 4) * 140
  await page.mouse.move(jx, jy)
  const lock = await page.evaluate(() => document.documentElement.dataset.gazeScroll || '0')
  samples.push(lock)
  if (i === 3 || i === 9 || i === 15) {
    await page.screenshot({ path: `${outDir}/04-scroll-jitter-${i}.png`, clip: faceClip })
  }
  await page.waitForTimeout(90)
}

await page.screenshot({ path: `${outDir}/05-scroll-mid-full.png`, fullPage: false })

// Wait for lock to clear
await page.waitForFunction(() => document.documentElement.dataset.gazeScroll !== '1', null, { timeout: 5000 }).catch(() => {})
await page.waitForTimeout(900)
await page.screenshot({ path: `${outDir}/06-after-scroll-idle.png`, clip: faceClip })

// Real mouse follow still works after unlock
await page.mouse.move(200, 250)
await page.waitForTimeout(800)
await page.screenshot({ path: `${outDir}/07-post-scroll-gaze-left.png`, clip: faceClip })

const lockHits = samples.filter((s) => s === '1').length
const report = {
  base,
  character: await page.evaluate(() => document.documentElement.dataset.character),
  scrollLockSamples: samples,
  scrollLockActiveCount: lockHits,
  scrollLockRatio: lockHits / samples.length,
  ok: lockHits >= samples.length * 0.6,
}
console.log(JSON.stringify(report, null, 2))
await browser.close()
if (!report.ok) process.exit(2)
