import type { DriverData, FeedItem, RaceData, RaceMeta } from '@/types'

const BASE = import.meta.env.BASE_URL
const raceCache = new Map<string, Promise<RaceData>>()

export async function loadRaces(): Promise<RaceMeta[]> {
  const response = await fetch(`${BASE}data/races.json`)
  if (!response.ok) throw new Error(`Could not load races.json (${response.status})`)
  return response.json()
}

export function loadRace(file: string): Promise<RaceData> {
  const cached = raceCache.get(file)
  if (cached) return cached
  const request = fetch(`${BASE}data/${file}`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`)
      return (await response.json()) as RaceData
    })
    .catch((reason: unknown) => {
      raceCache.delete(file)
      throw reason
    })
  raceCache.set(file, request)
  return request
}

export function sampleDriver(driver: DriverData, time: number, step: number) {
  const last = driver.x.length - 1
  const raw = time / step
  const index = Math.max(0, Math.min(last, Math.floor(raw)))
  const next = Math.min(last, index + 1)
  const fraction = Math.max(0, Math.min(1, raw - index))
  const mix = (a: number, b: number) => a + (b - a) * fraction
  return {
    index,
    x: mix(driver.x[index], driver.x[next]),
    y: mix(driver.y[index], driver.y[next]),
    z: mix(driver.z[index], driver.z[next]),
  }
}

export function indexAt(time: number, step: number, count: number) {
  return Math.max(0, Math.min(count - 1, Math.floor(time / step)))
}

export function statusAt(race: RaceData, time: number) {
  for (const interval of race.status) {
    if (time >= interval.start && time < interval.end) return interval.status
  }
  return 1
}

export function raceEvents(race: RaceData): FeedItem[] {
  return [
    ...race.overtakes.map((event) => ({
      kind: 'overtake' as const,
      id: event.id,
      time: event.raceTime,
      lap: event.lap,
      driver: event.overtakingDriver,
      other: event.overtakenDriver,
      label: event.locationLabel,
      position: event.newPosition,
      raw: event,
    })),
    ...race.pits.map((event) => ({
      kind: 'pit' as const,
      id: event.id,
      time: event.raceTime,
      lap: event.lap,
      driver: event.driver,
      raw: event,
    })),
  ].sort((a, b) => a.time - b.time)
}

export function isActive(driver: DriverData, time: number) {
  return time >= driver.first && time <= driver.last
}

export function isRetired(driver: DriverData, race: RaceData) {
  return driver.dnf || driver.last < race.time.duration - 10
}

export function formatClock(seconds: number) {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  return [hours, minutes, secs].map((part) => String(part).padStart(2, '0')).join(':')
}

export function formatEventTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export const TYRES: Record<number, { short: string; label: string; className: string }> = {
  0: { short: '?', label: 'Unknown', className: 'border-zinc-700 text-zinc-500' },
  1: { short: 'S', label: 'Soft', className: 'border-red-500/50 text-red-400' },
  2: { short: 'M', label: 'Medium', className: 'border-yellow-500/50 text-yellow-300' },
  3: { short: 'H', label: 'Hard', className: 'border-zinc-200/50 text-zinc-100' },
  4: { short: 'I', label: 'Intermediate', className: 'border-emerald-500/50 text-emerald-400' },
  5: { short: 'W', label: 'Wet', className: 'border-sky-500/50 text-sky-400' },
}

export const STATUSES: Record<
  number,
  { label: string; short: string; dot: string; className: string; band: string }
> = {
  1: {
    label: 'GREEN FLAG',
    short: 'GREEN',
    dot: 'bg-emerald-400',
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    band: 'bg-emerald-500/40',
  },
  2: {
    label: 'YELLOW FLAG',
    short: 'YELLOW',
    dot: 'bg-yellow-400',
    className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    band: 'bg-yellow-500/50',
  },
  4: {
    label: 'SAFETY CAR',
    short: 'SC',
    dot: 'bg-amber-400',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    band: 'bg-amber-400/50',
  },
  5: {
    label: 'RED FLAG',
    short: 'RED',
    dot: 'bg-red-500',
    className: 'border-red-500/30 bg-red-500/10 text-red-300',
    band: 'bg-red-500/60',
  },
  6: {
    label: 'VIRTUAL SAFETY CAR',
    short: 'VSC',
    dot: 'bg-purple-400',
    className: 'border-purple-500/30 bg-purple-500/10 text-purple-300',
    band: 'bg-purple-500/50',
  },
}
