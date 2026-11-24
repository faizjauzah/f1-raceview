import { Crosshair, Map, Orbit, Radio } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { STATUSES } from '@/lib/data'
import type { RaceMeta } from '@/types'

type CameraMode = 'orbit' | 'top' | 'follow'

type HeaderProps = {
  races: RaceMeta[]
  raceId: string
  status: number
  cameraMode: CameraMode
  onRaceChange: (id: string) => void
  onCameraChange: (mode: CameraMode) => void
}

const CAMERAS: { id: CameraMode; label: string; icon: typeof Orbit }[] = [
  { id: 'orbit', label: 'Free orbit', icon: Orbit },
  { id: 'top', label: 'Top-down map', icon: Map },
  { id: 'follow', label: 'Follow selected driver', icon: Crosshair },
]

export function Header({
  races,
  raceId,
  status,
  cameraMode,
  onRaceChange,
  onCameraChange,
}: HeaderProps) {
  const statusMeta = STATUSES[status] ?? STATUSES[1]
  const selectedRace = races.find((race) => race.id === raceId)
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-md border border-zinc-700/70 bg-zinc-900">
          <Radio className="size-3.5 text-zinc-300" />
        </div>
        <div className="min-w-0 leading-none">
          <div className="flex items-center gap-2">
            <h1 className="text-[13px] font-semibold tracking-[0.22em] text-zinc-100">
              RACEVIEW
            </h1>
            <span className="hidden rounded border border-zinc-800 px-1 py-0.5 text-[8px] tracking-widest text-zinc-500 sm:inline">
              REPLAY
            </span>
          </div>
          <div className="mt-1 hidden text-[10px] tracking-wide text-zinc-500 sm:block">
            Formula 1 telemetry replay
          </div>
        </div>
      </div>

      <div className="mx-1 hidden h-6 w-px bg-zinc-800 sm:block" />

      <Select
        value={raceId}
        onValueChange={(value) => {
          if (value) onRaceChange(value)
        }}
      >
        <SelectTrigger
          className="h-8 w-[190px] border-zinc-800 bg-zinc-950 text-xs sm:w-[250px]"
          aria-label="Select race"
        >
          <span className="truncate">
            {selectedRace ? `${selectedRace.year} · ${selectedRace.name}` : 'Select race'}
          </span>
        </SelectTrigger>
        <SelectContent>
          {races.map((race) => (
            <SelectItem key={race.id} value={race.id} className="text-xs">
              {race.year} · {race.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2">
        <Badge
          variant="outline"
          className={`h-7 gap-1.5 rounded-full px-2.5 text-[10px] font-semibold tracking-wider ${statusMeta.className}`}
        >
          <span className={`size-1.5 rounded-full ${statusMeta.dot} animate-pulse`} />
          <span className="hidden sm:inline">{statusMeta.label}</span>
          <span className="sm:hidden">{statusMeta.short}</span>
        </Badge>

        <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-950 p-0.5">
          {CAMERAS.map(({ id, label, icon: Icon }) => (
            <Tooltip key={id}>
              <TooltipTrigger
                type="button"
                onClick={() => onCameraChange(id)}
                aria-label={label}
                aria-pressed={cameraMode === id}
                className={`flex size-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset ${
                  cameraMode === id
                    ? 'bg-zinc-800 text-zinc-100'
                    : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300'
                }`}
              >
                <Icon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="bottom">{label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>
    </header>
  )
}
