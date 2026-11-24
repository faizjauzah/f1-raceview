import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { formatClock, indexAt, STATUSES } from '@/lib/data'
import type { PlaybackSnapshot, PlaybackStore } from '@/lib/playback'
import type { RaceData } from '@/types'

type PlaybackBarProps = {
  race: RaceData
  store: PlaybackStore
  snapshot: PlaybackSnapshot
}

export function PlaybackBar({ race, store, snapshot }: PlaybackBarProps) {
  const duration = race.time.duration
  const index = indexAt(snapshot.time, race.time.step, race.time.count)
  const leader =
    race.drivers.find((driver) => driver.pos[index] === 1) ??
    [...race.drivers].sort((a, b) => a.pos[index] - b.pos[index])[0]
  const lap = leader?.lap[index] ?? 1
  const percent = (value: number) => `${Math.max(0, Math.min(100, (value / duration) * 100))}%`

  return (
    <div className="shrink-0 border-t bg-zinc-950/80 px-3 py-2.5 backdrop-blur sm:px-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <div className="w-[104px]">
            <div className="text-[8px] uppercase tracking-[0.18em] text-zinc-600">Lap</div>
            <div className="telemetry text-xs text-zinc-200">
              {lap}
              <span className="text-zinc-600"> / {race.meta.totalLaps}</span>
            </div>
          </div>
          <div className="w-[104px]">
            <div className="text-[8px] uppercase tracking-[0.18em] text-zinc-600">Race time</div>
            <div className="telemetry text-xs text-zinc-200">{formatClock(snapshot.time)}</div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8 border-zinc-800 bg-zinc-950"
            onClick={() => store.step(-5)}
            aria-label="Step backward 5 seconds"
          >
            <SkipBack className="size-3.5" />
          </Button>
          <Button
            size="icon"
            className="size-9 rounded-full"
            onClick={() => store.toggle()}
            aria-label={snapshot.playing ? 'Pause replay' : 'Play replay'}
            aria-keyshortcuts="Space"
          >
            {snapshot.playing ? <Pause className="size-4" /> : <Play className="size-4 pl-0.5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 border-zinc-800 bg-zinc-950"
            onClick={() => store.step(5)}
            aria-label="Step forward 5 seconds"
          >
            <SkipForward className="size-3.5" />
          </Button>
        </div>

        <div className="relative min-w-[220px] flex-1 pt-1">
          <div className="pointer-events-none absolute inset-x-1 top-0 h-2.5 overflow-hidden rounded-sm">
            {race.status
              .filter((interval) => interval.status !== 1)
              .map((interval, position) => (
                <div
                  key={`status-${position}`}
                  className={`absolute inset-y-0 ${(STATUSES[interval.status] ?? STATUSES[1]).band}`}
                  style={{
                    left: percent(interval.start),
                    width: `${((interval.end - interval.start) / duration) * 100}%`,
                  }}
                />
              ))}
            {race.overtakes.map((event) => (
              <div
                key={`overtake-${event.id}`}
                className="absolute bottom-0 h-1.5 w-px bg-zinc-500/80"
                style={{ left: percent(event.raceTime) }}
              />
            ))}
            {race.pits.map((event) => (
              <div
                key={`pit-${event.id}`}
                className="absolute top-0 h-1.5 w-px bg-amber-500/80"
                style={{ left: percent(event.raceTime) }}
              />
            ))}
          </div>
          <Slider
            value={[snapshot.time]}
            min={0}
            max={duration}
            step={0.5}
            onValueChange={(value) => {
              if (Array.isArray(value)) store.seek(value[0])
              else if (typeof value === 'number') store.seek(value)
            }}
            aria-label="Race timeline"
            className="py-1"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden text-[8px] uppercase tracking-[0.18em] text-zinc-600 sm:block">
            Speed
          </span>
          <Select
            value={String(snapshot.speed)}
            onValueChange={(value) => {
              if (value) store.setSpeed(Number(value))
            }}
          >
            <SelectTrigger
              className="h-8 w-[76px] border-zinc-800 bg-zinc-950 text-xs"
              aria-label="Playback speed"
            >
              <span className="telemetry">{snapshot.speed}×</span>
            </SelectTrigger>
            <SelectContent>
              {[1, 2, 5, 10, 20].map((speed) => (
                <SelectItem key={speed} value={String(speed)} className="text-xs">
                  {speed}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
