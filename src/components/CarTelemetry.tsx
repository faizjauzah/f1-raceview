import { indexAt, isActive, TYRES } from '@/lib/data'
import { usePlaybackSnapshot } from '@/lib/playback'
import type { RaceData } from '@/types'

type CarTelemetryProps = {
  race: RaceData
  selectedDriver: string | null
}

function valueAt(values: (number | null)[] | undefined, index: number) {
  if (!values) return null
  return values[Math.max(0, Math.min(values.length - 1, index))] ?? null
}

function lastKnown(values: (number | null)[] | undefined, index: number) {
  if (!values) return null
  for (let cursor = Math.max(0, Math.min(values.length - 1, index)); cursor >= 0; cursor -= 1) {
    if (values[cursor] !== null) return values[cursor]
  }
  return null
}

function lerp(current: number | null, next: number | null, fraction: number) {
  if (current === null) return next
  if (next === null) return current
  return Math.round(current + (next - current) * fraction)
}

function drsState(drs: number | null) {
  if (drs === 8) return { label: 'READY', className: 'text-amber-300' }
  if (drs === 10 || drs === 12 || drs === 14) {
    return { label: 'OPEN', className: 'text-emerald-400' }
  }
  if (drs === 0 || drs === 1) return { label: 'OFF', className: 'text-zinc-500' }
  return { label: '—', className: 'text-zinc-600' }
}

function Pedal({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[9px] uppercase tracking-[0.16em] text-zinc-600 sm:text-[10px]">
        <span>{label}</span>
        <span className="telemetry text-zinc-400">{value ?? '—'}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  )
}

export function CarTelemetry({ race, selectedDriver }: CarTelemetryProps) {
  const snapshot = usePlaybackSnapshot()
  const raw = snapshot.time / race.time.step
  const index = indexAt(snapshot.time, race.time.step, race.time.count)
  const fraction = Math.max(0, Math.min(1, raw - index))
  const driver =
    race.drivers.find((item) => item.code === selectedDriver) ??
    race.drivers.find((item) => item.pos[index] === 1) ??
    [...race.drivers].sort((a, b) => a.pos[index] - b.pos[index])[0]
  if (!driver) return null

  const leaderFallback = !race.drivers.some((item) => item.code === selectedDriver)
  const active = isActive(driver, snapshot.time)
  const sampleIndex = active
    ? index
    : Math.min(index, Math.floor(driver.last / race.time.step))
  const hasTelemetry = Array.isArray(driver.speed)
  const speed = hasTelemetry
    ? active
      ? lerp(valueAt(driver.speed, index), valueAt(driver.speed, index + 1), fraction)
      : lastKnown(driver.speed, sampleIndex)
    : null
  const throttle = hasTelemetry
    ? active
      ? lerp(
          valueAt(driver.throttle, index),
          valueAt(driver.throttle, index + 1),
          fraction,
        )
      : lastKnown(driver.throttle, sampleIndex)
    : null
  const brake = hasTelemetry
    ? active
      ? lerp(valueAt(driver.brake, index), valueAt(driver.brake, index + 1), fraction)
      : lastKnown(driver.brake, sampleIndex)
    : null
  const gear = hasTelemetry
    ? active
      ? valueAt(driver.gear, index)
      : lastKnown(driver.gear, sampleIndex)
    : null
  const drs = hasTelemetry
    ? active
      ? valueAt(driver.drs, index)
      : lastKnown(driver.drs, sampleIndex)
    : null

  const position = driver.pos[index]
  const lap = driver.lap[index]
  const tyreMeta = TYRES[driver.tyre[index]] ?? TYRES[0]
  const pitCount = race.pits.filter(
    (pit) => pit.driver === driver.code && pit.raceTime <= snapshot.time + 1,
  ).length
  const drsMeta = drsState(drs)
  const speedPercent = speed === null ? 0 : Math.min(100, (speed / 360) * 100)
  const color = `#${driver.color}`

  return (
    <div
      data-testid="car-telemetry"
      aria-hidden="true"
      className="pointer-events-none w-[210px] max-w-[calc(100vw-2rem)] rounded-md border border-zinc-800/70 bg-zinc-950/85 px-2 py-2 backdrop-blur sm:w-[340px] sm:px-3 sm:py-2.5"
    >
      <div className="flex items-center gap-1.5">
        <span className="h-3 w-[2px] rounded-full" style={{ backgroundColor: color }} />
        <span className="telemetry text-xs font-semibold tracking-wide text-zinc-100 sm:text-[14px]">
          {driver.code}
        </span>
        <span className="telemetry text-[10px] text-zinc-500 sm:text-[11px]">#{driver.number}</span>
        <span className="hidden min-w-0 truncate text-[10px] text-zinc-400 sm:inline sm:text-[11px]">
          {driver.name}
        </span>
        <span
          className={`ml-auto shrink-0 rounded border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] sm:text-[10px] ${
            leaderFallback
              ? 'border-amber-500/40 text-amber-300'
              : active
                ? 'border-zinc-700 text-zinc-400'
                : 'border-red-500/40 text-red-400'
          }`}
        >
          {leaderFallback ? 'Leader' : active ? `P${position}` : 'Out'}
        </span>
      </div>

      <div className={`mt-2 ${active ? '' : 'opacity-45'}`}>
        <div className="flex items-end gap-2">
          <div className="flex items-baseline gap-1">
            <span
              data-testid="car-speed"
              className="telemetry text-2xl font-semibold leading-none text-zinc-100 sm:text-3xl"
            >
              {speed ?? '–'}
            </span>
            <span className="text-[9px] uppercase tracking-[0.18em] text-zinc-500 sm:text-[10px]">km/h</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[9px] uppercase tracking-[0.16em] text-zinc-600 sm:text-[10px]">Gear</span>
            <span
              data-testid="car-gear"
              className="telemetry flex size-6 items-center justify-center rounded border border-zinc-700 bg-zinc-900 text-xs font-semibold text-zinc-100 sm:size-7 sm:text-sm"
            >
              {gear === null ? '–' : gear === 0 ? 'N' : gear}
            </span>
          </div>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full"
            style={{ width: `${speedPercent}%`, backgroundColor: color }}
          />
        </div>
        {!hasTelemetry && active && (
          <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-amber-300/80 sm:text-[10px]">
            No telemetry
          </div>
        )}

        <div className="mt-2 grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <Pedal label="Thr" value={throttle} color="bg-emerald-400" />
          <Pedal label="Brk" value={brake} color="bg-red-400" />
          <div className="text-right">
            <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-600 sm:text-[10px]">DRS</div>
            <div className={`text-[10px] font-semibold tracking-wider sm:text-[11px] ${drsMeta.className}`}>
              {drsMeta.label}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2 border-t border-zinc-800/70 pt-1.5 text-[10px] text-zinc-500 sm:text-[11px]">
        <span className="telemetry">L{lap}</span>
        <span
          title={tyreMeta.label}
          className={`flex size-4 items-center justify-center rounded-full border text-[8px] font-bold sm:size-5 sm:text-[9px] ${tyreMeta.className}`}
        >
          {tyreMeta.short}
        </span>
        <span>{pitCount === 0 ? 'no pit' : `${pitCount} pit${pitCount > 1 ? 's' : ''}`}</span>
        <span className="ml-auto hidden max-w-[120px] truncate text-[10px] text-zinc-600 sm:inline">
          {driver.team}
        </span>
      </div>
    </div>
  )
}
