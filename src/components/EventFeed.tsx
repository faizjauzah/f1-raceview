import { useEffect, useMemo, useRef, useState } from 'react'
import { ListFilter, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { formatEventTime, raceEvents, TYRES } from '@/lib/data'
import type { FeedItem, RaceData } from '@/types'

type Filter = 'all' | 'overtake' | 'pit'

type EventFeedProps = {
  race: RaceData
  selectedDriver: string | null
  highlightKey: string | null
  onSeekEvent: (item: FeedItem) => void
}

function DriverCode({ code, color }: { code: string; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-zinc-200">
      <span
        className="inline-block size-1.5 rounded-full"
        style={{ backgroundColor: color ? `#${color}` : '#71717a' }}
      />
      <span className="telemetry">{code}</span>
    </span>
  )
}

function Compound({ name }: { name: string | null }) {
  if (!name) return null
  const code = { SOFT: 1, MEDIUM: 2, HARD: 3, INTERMEDIATE: 4, WET: 5 }[name] ?? 0
  const tyre = TYRES[code]
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[8px] font-semibold ${tyre.className}`}
    >
      {tyre.short}
    </span>
  )
}

export function EventFeed({ race, selectedDriver, highlightKey, onSeekEvent }: EventFeedProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  const colors = useMemo(
    () => new Map(race.drivers.map((driver) => [driver.code, driver.color])),
    [race.drivers],
  )
  const all = useMemo(() => raceEvents(race), [race])

  useEffect(() => {
    if (!highlightKey) return
    const node = itemRefs.current.get(highlightKey)
    node?.scrollIntoView({ block: 'nearest' })
    node?.focus({ preventScroll: true })
  }, [highlightKey])

  const items = all.filter((item) => {
    if (filter !== 'all' && item.kind !== filter) return false
    if (selectedOnly) {
      if (!selectedDriver) return false
      if (item.driver !== selectedDriver) {
        if (item.kind === 'overtake' && item.other === selectedDriver) return true
        return false
      }
    }
    return true
  })

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-3 py-2">
        <ListFilter className="mr-0.5 size-3 text-zinc-500" />
        {(['all', 'overtake', 'pit'] as const).map((value) => (
          <Button
            key={value}
            variant={filter === value ? 'secondary' : 'ghost'}
            size="sm"
            className="h-6 px-2 text-[9px] uppercase tracking-wider"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === 'all' ? 'All' : value === 'overtake' ? 'Overtakes' : 'Pit stops'}
          </Button>
        ))}
        <span className="ml-auto text-[9px] text-zinc-600">{items.length}</span>
      </div>

      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
        <label
          htmlFor="selected-only"
          className={`text-[10px] tracking-wide ${
            selectedDriver ? 'text-zinc-400' : 'text-zinc-600'
          }`}
        >
          Selected driver only
          {selectedDriver ? ` · ${selectedDriver}` : ''}
        </label>
        <Switch
          id="selected-only"
          checked={selectedOnly}
          onCheckedChange={setSelectedOnly}
          disabled={!selectedDriver}
          className="scale-75"
        />
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1.5 p-2">
          {items.length === 0 && (
            <div className="px-3 py-10 text-center text-[10px] text-zinc-600">
              {selectedOnly && !selectedDriver
                ? 'Select a driver to filter the feed.'
                : 'No events for this filter.'}
            </div>
          )}
          {items.map((item) => {
            const key = `${item.kind}:${item.id}`
            const active = highlightKey === key
            return (
              <button
                key={key}
                ref={(node) => {
                  if (node) itemRefs.current.set(key, node)
                  else itemRefs.current.delete(key)
                }}
                type="button"
                onClick={() => onSeekEvent(item)}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                  event.preventDefault()
                  event.stopPropagation()
                  const index = items.findIndex(
                    (candidate) => candidate.kind === item.kind && candidate.id === item.id,
                  )
                  const direction = event.key === 'ArrowDown' ? 1 : -1
                  const next = items[(index + direction + items.length) % items.length]
                  if (next) onSeekEvent(next)
                }}
                aria-current={active ? 'true' : undefined}
                className={`group w-full rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset ${
                  active
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-transparent bg-zinc-900/40 hover:border-zinc-800 hover:bg-zinc-900'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="telemetry text-[10px] text-zinc-500">
                    {formatEventTime(item.time)}
                  </span>
                  <span
                    className={`rounded border px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wider ${
                      item.kind === 'overtake'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {item.kind === 'overtake' ? 'Overtake' : 'Pit'}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-[9px] text-zinc-500">
                    <MapPin className="size-2.5" />
                    {item.kind === 'overtake' ? `P${item.position}` : `L${item.lap}`}
                  </span>
                </div>

                {item.kind === 'overtake' ? (
                  <div className="mt-1 text-[11px] leading-snug text-zinc-400">
                    <DriverCode code={item.driver} color={colors.get(item.driver)} /> passed{' '}
                    <DriverCode code={item.other} color={colors.get(item.other)} /> at{' '}
                    <span className="text-zinc-300">{item.label}</span>
                    <span className="text-zinc-600"> · Lap {item.lap}</span>
                  </div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] leading-snug text-zinc-400">
                    <DriverCode code={item.driver} color={colors.get(item.driver)} />
                    <span className="telemetry text-zinc-200">{item.raw.duration.toFixed(1)}s</span>
                    <span className="text-[9px] uppercase tracking-wider text-zinc-600">
                      {item.raw.durationKind === 'lane' ? 'lane' : 'stop'}
                    </span>
                    {item.raw.compoundFrom && (
                      <>
                        <span className="text-zinc-600">·</span>
                        <Compound name={item.raw.compoundFrom} />
                        <span className="text-zinc-600">→</span>
                        <Compound name={item.raw.compoundTo} />
                      </>
                    )}
                    <span className="text-zinc-600">· Lap {item.lap}</span>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
