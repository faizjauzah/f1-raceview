import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { EventFeed } from '@/components/EventFeed'
import { Header } from '@/components/Header'
import { PlaybackBar } from '@/components/PlaybackBar'
import { RaceViewport } from '@/components/RaceViewport'
import { TimingTower } from '@/components/TimingTower'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { loadRace, loadRaces, statusAt } from '@/lib/data'
import { usePlayback, usePlaybackSnapshot } from '@/lib/playback'
import type { HighlightEvent, Overtake, PitStop, RaceData, RaceMeta } from '@/types'

type CameraMode = 'orbit' | 'top' | 'follow'
type FeedItem =
  | {
      kind: 'overtake'
      id: string
      time: number
      lap: number
      driver: string
      other: string
      label: string
      position: number
      raw: Overtake
    }
  | { kind: 'pit'; id: string; time: number; lap: number; driver: string; raw: PitStop }

const MemoViewport = memo(RaceViewport)
const MemoHeader = memo(Header)
const MemoFeed = memo(EventFeed)

function FullScreenLoader({ error }: { error?: string | null }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#09090b] px-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-4 flex size-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
          {error ? (
            <span className="text-lg text-red-400">!</span>
          ) : (
            <Loader2 className="size-4 animate-spin text-zinc-400" />
          )}
        </div>
        <div className="text-[11px] font-semibold tracking-[0.24em] text-zinc-200">
          RACEVIEW
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          {error ?? 'Loading static race data…'}
        </div>
        {error && (
          <pre className="mt-3 max-w-full overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2 text-[10px] text-zinc-500">
            python scripts/export_race_data.py --year 2024 --races "Bahrain,Monaco,Spa"
          </pre>
        )}
      </div>
    </div>
  )
}

export default function App() {
  const store = usePlayback()
  const snapshot = usePlaybackSnapshot()
  const [races, setRaces] = useState<RaceMeta[]>([])
  const [raceId, setRaceId] = useState('')
  const [race, setRace] = useState<RaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null)
  const [cameraMode, setCameraMode] = useState<CameraMode>('orbit')
  const [highlight, setHighlight] = useState<HighlightEvent | null>(null)

  useEffect(() => {
    let alive = true
    loadRaces()
      .then((items) => {
        if (!alive) return
        if (items.length === 0) {
          setError('No races found in public/data/races.json')
          setLoading(false)
          return
        }
        setRaces(items)
        setRaceId((current) => current || items[0].id)
      })
      .catch((reason: unknown) => {
        if (!alive) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (races.length === 0) return
    const timer = window.setTimeout(() => {
      races.forEach((item) => {
        if (item.id !== raceId) void loadRace(item.file).catch(() => undefined)
      })
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [races, raceId])

  useEffect(() => {
    const meta = races.find((item) => item.id === raceId)
    if (!meta) return
    let alive = true
    setLoading(true)
    setError(null)
    loadRace(meta.file)
      .then((data) => {
        if (!alive) return
        setRace(data)
        store.reset(data.time.duration)
        setSelectedDriver(null)
        setHighlight(null)
        setLoading(false)
        document.title = `${data.meta.name} · RaceView`
      })
      .catch((reason: unknown) => {
        if (!alive) return
        setError(reason instanceof Error ? reason.message : String(reason))
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [raceId, races, store])

  const handleSelectDriver = useCallback((code: string) => {
    setSelectedDriver((current) => (current === code ? null : code))
  }, [])

  const handleCameraChange = useCallback((mode: CameraMode) => {
    setCameraMode(mode)
  }, [])

  const handleRaceChange = useCallback((id: string) => {
    setRaceId(id)
  }, [])

  const handleSeekEvent = useCallback((item: FeedItem) => {
    store.pause()
    store.seek(Math.max(0, item.time - 3))
    setSelectedDriver(item.driver)
    setHighlight(
      item.kind === 'overtake'
        ? { kind: 'overtake', event: item.raw }
        : { kind: 'pit', event: item.raw },
    )
  }, [store])

  const status = useMemo(() => (race ? statusAt(race, snapshot.time) : 1), [race, snapshot.time])

  if (!race) {
    return <FullScreenLoader error={error} />
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[#09090b] text-zinc-100 lg:h-dvh lg:overflow-hidden">
      <MemoHeader
        races={races}
        raceId={raceId}
        status={status}
        cameraMode={cameraMode}
        onRaceChange={handleRaceChange}
        onCameraChange={handleCameraChange}
      />

      <main className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="h-[46vh] min-h-[320px] lg:h-auto lg:min-h-0">
          <MemoViewport
            race={race}
            store={store}
            selectedDriver={selectedDriver}
            cameraMode={cameraMode}
            highlight={highlight}
            status={status}
            loading={loading}
            error={error}
            onSelectDriver={handleSelectDriver}
          />
        </section>

        <aside className="flex min-h-0 flex-1 flex-col border-t bg-zinc-950/50 lg:border-l lg:border-t-0">
          <Tabs defaultValue="timing" className="flex min-h-0 flex-1 flex-col gap-0">
            <div className="shrink-0 p-2.5 pb-0">
              <TabsList className="grid w-full grid-cols-2 bg-zinc-900/60">
                <TabsTrigger value="timing" className="text-[10px] uppercase tracking-[0.14em]">
                  Live timing
                </TabsTrigger>
                <TabsTrigger value="events" className="gap-1.5 text-[10px] uppercase tracking-[0.14em]">
                  Events
                  <span className="rounded bg-zinc-800 px-1 text-[8px] text-zinc-400">
                    {race.overtakes.length + race.pits.length}
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="timing" className="mt-2 min-h-0 flex-1">
              <TimingTower
                race={race}
                time={snapshot.time}
                selectedDriver={selectedDriver}
                onSelectDriver={handleSelectDriver}
              />
            </TabsContent>
            <TabsContent value="events" className="mt-2 min-h-0 flex-1">
              <MemoFeed
                race={race}
                selectedDriver={selectedDriver}
                highlightId={highlight?.event.id ?? null}
                onSeekEvent={handleSeekEvent}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </main>

      <PlaybackBar race={race} store={store} snapshot={snapshot} />
    </div>
  )
}
