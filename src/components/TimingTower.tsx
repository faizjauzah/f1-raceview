import { useEffect, useRef } from 'react'
import { Crosshair } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { indexAt, isActive, isRetired, TYRES } from '@/lib/data'
import type { RaceData } from '@/types'

type TimingTowerProps = {
  race: RaceData
  time: number
  selectedDriver: string | null
  onSelectDriver: (code: string) => void
}

export function TimingTower({ race, time, selectedDriver, onSelectDriver }: TimingTowerProps) {
  const index = indexAt(time, race.time.step, race.time.count)
  const previous = indexAt(Math.max(0, time - 10), race.time.step, race.time.count)
  const rowRefs = useRef(new Map<string, HTMLButtonElement>())

  useEffect(() => {
    if (selectedDriver) rowRefs.current.get(selectedDriver)?.scrollIntoView({ block: 'nearest' })
  }, [selectedDriver])

  const rows = race.drivers
    .map((driver) => ({
      driver,
      position: driver.pos[index],
      lap: driver.lap[index],
      tyre: driver.tyre[index],
      delta: driver.pos[previous] - driver.pos[index],
      active: isActive(driver, time),
      retired: isRetired(driver, race),
      stops: race.pits.filter((pit) => pit.driver === driver.code && pit.raceTime <= time + 1)
        .length,
    }))
    .sort((a, b) => a.position - b.position)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-[34px_1fr_44px_38px_52px] items-center gap-1 border-b px-3 py-2 text-[9px] font-medium uppercase tracking-[0.18em] text-zinc-500">
        <span>Pos</span>
        <span>Driver</span>
        <span className="text-center">Tyre</span>
        <span className="text-center">Lap</span>
        <span className="text-right">Delta</span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 p-2 pr-3">
          {rows.map(({ driver, position, lap, tyre, delta, active, retired, stops }) => {
            const selected = driver.code === selectedDriver
            const tyreMeta = TYRES[tyre] ?? TYRES[0]
            return (
              <button
                key={driver.code}
                ref={(node) => {
                  if (node) rowRefs.current.set(driver.code, node)
                  else rowRefs.current.delete(driver.code)
                }}
                type="button"
                onClick={() => onSelectDriver(driver.code)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                  event.preventDefault()
                  event.stopPropagation()
                  const current = rows.findIndex((row) => row.driver.code === driver.code)
                  const direction = event.key === 'ArrowDown' ? 1 : -1
                  const next =
                    current < 0
                      ? direction > 0
                        ? 0
                        : rows.length - 1
                      : (current + direction + rows.length) % rows.length
                  const target = rows[next]
                  if (!target) return
                  onSelectDriver(target.driver.code)
                  rowRefs.current.get(target.driver.code)?.focus()
                }}
                aria-pressed={selected}
                className={`group relative grid w-full grid-cols-[34px_1fr_44px_38px_52px] items-center gap-1 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset ${
                  selected
                    ? 'bg-zinc-800/70 ring-1 ring-zinc-700'
                    : 'hover:bg-zinc-900/80'
                } ${active ? '' : 'opacity-45'}`}
              >
                <span
                  className="absolute inset-y-1 left-0 w-[2px] rounded-full"
                  style={{ backgroundColor: `#${driver.color}` }}
                />
                <span className="telemetry text-[11px] text-zinc-500">
                  {String(position).padStart(2, '0')}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="telemetry text-xs font-semibold tracking-wide text-zinc-100">
                      {driver.code}
                    </span>
                    {selected && <Crosshair className="size-3 text-zinc-400" />}
                    {retired && (
                      <span className="rounded border border-zinc-700 px-1 text-[8px] uppercase tracking-wider text-zinc-500">
                        Out
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[9px] leading-tight text-zinc-500">
                    {driver.team}
                  </span>
                </span>
                <span className="flex justify-center">
                  <span
                    title={tyreMeta.label}
                    className={`flex size-5 items-center justify-center rounded-full border text-[9px] font-bold ${tyreMeta.className}`}
                  >
                    {tyreMeta.short}
                  </span>
                </span>
                <span className="telemetry text-center text-[10px] text-zinc-400">L{lap}</span>
                <span className="text-right">
                  <span
                    className={`telemetry block text-[10px] ${
                      delta > 0
                        ? 'text-emerald-400'
                        : delta < 0
                          ? 'text-red-400'
                          : 'text-zinc-600'
                    }`}
                  >
                    {delta === 0 ? '—' : delta > 0 ? `+${delta}` : String(delta)}
                  </span>
                  <span className="block text-[8px] text-zinc-500">
                    {stops === 0 ? 'no pit' : `${stops} pit${stops > 1 ? 's' : ''}`}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
