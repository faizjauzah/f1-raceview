import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

export type PlaybackSnapshot = {
  time: number
  playing: boolean
  speed: number
  duration: number
}

export class PlaybackStore {
  time = 0
  playing = false
  speed = 1
  duration = 0

  private snapshot: PlaybackSnapshot = { time: 0, playing: false, speed: 1, duration: 0 }
  private listeners = new Set<() => void>()
  private frame = 0
  private lastFrame = 0
  private lastQuantized = -1

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  start = () => {
    if (this.frame) return () => undefined
    this.lastFrame = performance.now()
    const loop = (now: number) => {
      const delta = Math.min(0.1, (now - this.lastFrame) / 1000)
      this.lastFrame = now
      if (this.playing) {
        this.time = Math.min(this.duration, this.time + delta * this.speed)
        if (this.time >= this.duration) this.playing = false
        const quantized = Math.floor(this.time * 20)
        if (quantized !== this.lastQuantized || !this.playing) {
          this.lastQuantized = quantized
          this.publish()
        }
      }
      this.frame = requestAnimationFrame(loop)
    }
    this.frame = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(this.frame)
      this.frame = 0
    }
  }

  reset(duration: number) {
    this.duration = duration
    this.time = 0
    this.playing = false
    this.speed = 1
    this.lastQuantized = -1
    this.publish()
  }

  seek(time: number) {
    this.time = Math.max(0, Math.min(this.duration, time))
    this.lastQuantized = Math.floor(this.time * 20)
    this.publish()
  }

  step(delta: number) {
    this.seek(this.time + delta)
  }

  play() {
    if (this.time >= this.duration) this.time = 0
    this.playing = true
    this.publish()
  }

  pause() {
    this.playing = false
    this.publish()
  }

  toggle() {
    if (this.playing) this.pause()
    else this.play()
  }

  setSpeed(speed: number) {
    this.speed = speed
    this.publish()
  }

  private publish() {
    const next = {
      time: this.time,
      playing: this.playing,
      speed: this.speed,
      duration: this.duration,
    }
    const previous = this.snapshot
    if (
      next.time === previous.time &&
      next.playing === previous.playing &&
      next.speed === previous.speed &&
      next.duration === previous.duration
    ) {
      return
    }
    this.snapshot = next
    this.listeners.forEach((listener) => listener())
  }
}

const PlaybackContext = createContext<PlaybackStore | null>(null)

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new PlaybackStore())
  useEffect(() => store.start(), [store])
  return <PlaybackContext.Provider value={store}>{children}</PlaybackContext.Provider>
}

export function usePlayback() {
  const store = useContext(PlaybackContext)
  if (!store) throw new Error('usePlayback must be used inside PlaybackProvider')
  return store
}

export function usePlaybackSnapshot() {
  const store = usePlayback()
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
