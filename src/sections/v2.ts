/**
 * sections/v2.ts — 「脸是主角」改版的交互控制器。
 *
 * 职责（全部是增量，不改既有模块）：
 *  1. 首屏安全边距动效：rimlight 跟随光标（中心透明不压眼）、极光/rimlight 滚过首屏淡出。
 *  2. 漂浮能力气泡 / 底部进入 CTA → 平滑滚到 #chatStage 并灌字。
 *  3. 对话舞台分屏：chatStage 进入视口时把固定 canvas 左移（talkShift），离开还原。
 *  4. 「她边说边吐字」联动：doubao:speaking → 脸周 halo 脉动 + 卡片描边；连接状态点。
 *  5. 剧场模式：输入聚焦时柔化四周聚光对话卡（不遮脸）。
 */
import { motionPrefs } from '../lib/motionPrefs'
import { hasDifyKey } from '../lib/difyClient'
import { hasArkKey } from '../lib/doubaoClient'

interface Win extends Window {
  __askbarFill?: (text: string, autoSend?: boolean) => void
  __talkShiftX?: number
  __talkActive?: boolean
}

export function initV2(): () => void {
  const root = document.documentElement
  const destroyers: Array<() => void> = []
  const win = window as Win

  /* ---------------- 1. rimlight 跟随光标 + 首屏淡出 ---------------- */
  const rim = document.getElementById('heroRim')
  const onMove = (e: PointerEvent): void => {
    if (!rim) return
    rim.style.setProperty('--rx', `${((e.clientX / window.innerWidth) * 100).toFixed(2)}%`)
    rim.style.setProperty('--ry', `${((e.clientY / window.innerHeight) * 100).toFixed(2)}%`)
  }
  if (rim && !motionPrefs.reduced) {
    window.addEventListener('pointermove', onMove, { passive: true })
    destroyers.push(() => window.removeEventListener('pointermove', onMove))
  }

  const syncHeroLive = (): void => {
    const live = window.scrollY < window.innerHeight * 0.7
    root.dataset.heroLive = live ? '1' : '0'
    root.dataset.aurora = live ? 'on' : 'off'
  }
  syncHeroLive()
  window.addEventListener('scroll', syncHeroLive, { passive: true })
  destroyers.push(() => window.removeEventListener('scroll', syncHeroLive))

  /* ---------------- 2. 气泡 / 进入 CTA → 滚到对话舞台并灌字 ---------------- */
  const stage = document.getElementById('chatStage')
  const goToTalk = (seed?: string): void => {
    if (!stage) return
    stage.scrollIntoView({ behavior: motionPrefs.reduced ? 'auto' : 'smooth', block: 'center' })
    if (seed) {
      window.setTimeout(() => win.__askbarFill?.(seed, false), motionPrefs.reduced ? 0 : 520)
    }
  }
  document.querySelectorAll<HTMLButtonElement>('[data-talk-seed]').forEach((btn) => {
    const on = (): void => goToTalk(btn.dataset.talkSeed)
    btn.addEventListener('click', on)
    destroyers.push(() => btn.removeEventListener('click', on))
  })
  const enter = document.getElementById('heroEnter')
  const onEnter = (): void => goToTalk()
  enter?.addEventListener('click', onEnter)
  destroyers.push(() => enter?.removeEventListener('click', onEnter))

  /* ---------------- 3. 分屏 talkShift：canvas 左移 ---------------- */
  let target = 0
  let current = 0
  if (stage && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const on = en.isIntersecting && en.intersectionRatio > 0.25
          target = on ? -0.16 * window.innerWidth : 0
          win.__talkActive = on
          root.dataset.talk = on ? '1' : '0'
        }
      },
      { threshold: [0, 0.25, 0.5] },
    )
    io.observe(stage)
    destroyers.push(() => io.disconnect())
  }
  let raf = 0
  const tickShift = (): void => {
    current += (target - current) * 0.08
    if (Math.abs(target - current) < 0.5) current = target
    win.__talkShiftX = current
    raf = window.requestAnimationFrame(tickShift)
  }
  if (!motionPrefs.reduced) {
    raf = window.requestAnimationFrame(tickShift)
    destroyers.push(() => window.cancelAnimationFrame(raf))
  } else {
    // 减少动态：直接跳目标值
    const ioSync = (): void => {
      win.__talkShiftX = target
    }
    window.addEventListener('scroll', ioSync, { passive: true })
    destroyers.push(() => window.removeEventListener('scroll', ioSync))
  }

  /* ---------------- 4. 说话联动 + 连接状态 ---------------- */
  const onSpeaking = (e: Event): void => {
    const on = (e as CustomEvent<{ speaking: boolean }>).detail?.speaking
    root.dataset.speaking = on ? '1' : '0'
  }
  document.addEventListener('doubao:speaking', onSpeaking)
  destroyers.push(() => document.removeEventListener('doubao:speaking', onSpeaking))

  const dot = document.getElementById('talkDot')
  const status = document.getElementById('talkStatus')
  if (hasDifyKey()) {
    dot?.classList.add('is-live')
    if (status) status.textContent = '已连接 · Dify'
  } else if (hasArkKey()) {
    dot?.classList.add('is-live')
    if (status) status.textContent = '已连接 · 方舟'
  } else if (status) {
    status.textContent = '本地演示'
  }

  /* ---------------- 5. 剧场模式 ---------------- */
  const input = document.getElementById('askInput')
  const onFocus = (): void => {
    root.dataset.theatre = '1'
  }
  const onBlur = (): void => {
    if (root.dataset.speaking !== '1') root.dataset.theatre = '0'
  }
  input?.addEventListener('focus', onFocus)
  input?.addEventListener('blur', onBlur)
  destroyers.push(() => {
    input?.removeEventListener('focus', onFocus)
    input?.removeEventListener('blur', onBlur)
  })

  return () => {
    for (const d of destroyers.reverse()) d()
    delete root.dataset.speaking
    delete root.dataset.theatre
    win.__talkShiftX = 0
    win.__talkActive = false
  }
}
