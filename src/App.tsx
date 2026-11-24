import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react'
import { EventFeed } from '@/components/EventFeed'
import { Header } from '@/components/Header'
import { PlaybackBar } from '@/components/PlaybackBar'
import { RaceViewport } from '@/components/RaceViewport'
import { TimingTower } from '@/components/TimingTower'
import { loadRace, loadRaces, raceEvents, STATUSES, statusAt } from '@/lib/data'
import { usePlayback, usePlaybackSnapshot } from '@/lib/playback'
import type { FeedItem, HighlightEvent, RaceData, RaceMeta } from '@/types'
import type { RefObject } from 'react'

type CameraMode = 'orbit' | 'top' | 'follow'

function isDesktop() {
  return window.matchMedia('(min-width: 1024px)').matches
}

const SHORTCUT_IGNORE =
  'input, textarea, select, a[href], [contenteditable="true"], [role="combobox"], [role="listbox"], [role="slider"], [role="switch"], [role="tab"], [role="menu"], [role="dialog"]'

function ignoresShortcuts(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true
  return Boolean(target.closest(SHORTCUT_IGNORE))
}

function ignoresEnter(target: EventTarget | null) {
  if (ignoresShortcuts(target)) return true
  return target instanceof Element && Boolean(target.closest('button, summary'))
}

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

type CollapsedSidebarProps = {
  label: string
  side: 'left' | 'right'
  onExpand: () => void
  buttonRef: RefObject<HTMLButtonElement | null>
}

function CollapsedSidebar({ label, side, onExpand, buttonRef }: CollapsedSidebarProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onExpand}
      aria-label={`Expand ${label.toLowerCase()}`}
      aria-expanded={false}
      title={`Expand ${label.toLowerCase()}`}
      className="flex h-10 w-full items-center justify-between gap-2 px-3 text-[9px] font-medium uppercase tracking-[0.16em] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset lg:h-full lg:flex-col lg:justify-between lg:px-0 lg:py-3"
    >
      <span className="lg:[writing-mode:vertical-rl]">{label}</span>
      {side === 'left' ? (
        <ChevronsRight className="size-4 shrink-0" />
      ) : (
        <ChevronsLeft className="size-4 shrink-0" />
      )}
    </button>
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
  const [timingOpen, setTimingOpen] = useState(true)
  const [eventsOpen, setEventsOpen] = useState(isDesktop)
  const previousCamera = useRef<CameraMode>('orbit')
  const timingToggleRef = useRef<HTMLButtonElement>(null)
  const eventsToggleRef = useRef<HTMLButtonElement>(null)

  const toggleTiming = useCallback(() => {
    const next = !timingOpen
    setTimingOpen(next)
    if (next && !isDesktop()) setEventsOpen(false)
    requestAnimationFrame(() => timingToggleRef.current?.focus())
  }, [timingOpen])

  const toggleEvents = useCallback(() => {
    const next = !eventsOpen
    setEventsOpen(next)
    if (next && !isDesktop()) setTimingOpen(false)
    requestAnimationFrame(() => eventsToggleRef.current?.focus())
  }, [eventsOpen])

  const toggleFollow = useCallback(() => {
    if (cameraMode === 'follow') {
      setCameraMode(previousCamera.current)
      return
    }
    previousCamera.current = cameraMode
    setCameraMode('follow')
  }, [cameraMode])

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

  const handleCameraChange = useCallback(
    (mode: CameraMode) => {
      if (mode === 'follow' && cameraMode !== 'follow') previousCamera.current = cameraMode
      setCameraMode(mode)
    },
    [cameraMode],
  )

  const handleRaceChange = useCallback((id: string) => {
    setRaceId(id)
  }, [])

  const handleSeekEvent = useCallback(
    (item: FeedItem) => {
      store.pause()
      store.seek(Math.max(0, item.time - 3))
      setSelectedDriver(item.driver)
      setHighlight(
        item.kind === 'overtake'
          ? { kind: 'overtake', event: item.raw }
          : { kind: 'pit', event: item.raw },
      )
    },
    [store],
  )

  const events = useMemo(() => (race ? raceEvents(race) : []), [race])

  useEffect(() => {
    if (!race) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (ignoresShortcuts(event.target)) return

      if (event.key === 'Enter') {
        if (!ignoresEnter(event.target) && !event.repeat) {
          event.preventDefault()
          toggleFollow()
        }
        return
      }

      if (event.key === ' ') {
        event.preventDefault()
        if (!event.repeat) store.toggle()
        return
      }

      if (
        event.key !== 'ArrowUp' &&
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowLeft' &&
        event.key !== 'ArrowRight'
      ) {
        if (event.key === 'Escape') {
          setSelectedDriver(null)
          setHighlight(null)
        }
        return
      }

      event.preventDefault()

      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        const index = Math.max(
          0,
          Math.min(race.time.count - 1, Math.floor(store.time / race.time.step)),
        )
        const order = [...race.drivers].sort((a, b) => a.pos[index] - b.pos[index])
        const current = order.findIndex((driver) => driver.code === selectedDriver)
        const direction = event.key === 'ArrowDown' ? 1 : -1
        const next =
          current < 0
            ? direction > 0
              ? 0
              : order.length - 1
            : (current + direction + order.length) % order.length
        setSelectedDriver(order[next].code)
        return
      }

      if (events.length === 0) return
      const direction = event.key === 'ArrowRight' ? 1 : -1
      const current = highlight
        ? events.findIndex(
            (item) => item.kind === highlight.kind && item.id === highlight.event.id,
          )
        : -1
      let next = -1
      if (current >= 0) {
        next = (current + direction + events.length) % events.length
      } else if (direction > 0) {
        next = events.findIndex((item) => item.time >= store.time)
        if (next < 0) next = 0
      } else {
        for (let index = events.length - 1; index >= 0; index -= 1) {
          if (events[index].time <= store.time) {
            next = index
            break
          }
        }
        if (next < 0) next = events.length - 1
      }
      const item = events[next]
      if (item) handleSeekEvent(item)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [race, store, selectedDriver, highlight, events, handleSeekEvent, toggleFollow])

  const status = useMemo(() => (race ? statusAt(race, snapshot.time) : 1), [race, snapshot.time])
  const highlightKey = highlight ? `${highlight.kind}:${highlight.event.id}` : null

  if (!race) {
    return <FullScreenLoader error={error} />
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#09090b] text-zinc-100">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-zinc-700 focus:bg-zinc-100 focus:px-3 focus:py-2 focus:text-xs focus:font-medium focus:text-zinc-950"
      >
        Skip to content
      </a>
      <div
        data-testid="a11y-status"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {`${(STATUSES[status] ?? STATUSES[1]).label}. `}
        {selectedDriver ? `Driver ${selectedDriver} selected. ` : 'No driver selected. '}
        {highlight
          ? highlight.kind === 'overtake'
            ? `Overtake on lap ${highlight.event.lap} at ${highlight.event.locationLabel}.`
            : `Pit stop on lap ${highlight.event.lap}.`
          : ''}
      </div>

      <MemoHeader
        races={races}
        raceId={raceId}
        status={status}
        cameraMode={cameraMode}
        onRaceChange={handleRaceChange}
        onCameraChange={handleCameraChange}
      />

      <main
        id="main"
        tabIndex={-1}
        aria-label="Race replay"
        style={{
          gridTemplateColumns: `${
            timingOpen ? 'clamp(280px, 22vw, 320px)' : '44px'
          } minmax(0, 1fr) ${eventsOpen ? 'clamp(320px, 26vw, 380px)' : '44px'}`,
        }}
        className="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-inset lg:grid lg:grid-rows-[minmax(0,1fr)]"
      >
        <section className="order-1 min-h-[30dvh] flex-1 lg:col-start-2 lg:row-start-1 lg:min-h-0">
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

        <aside
          aria-label="Live timing"
          className={`order-2 flex min-h-0 flex-col border-t bg-zinc-950/50 lg:col-start-1 lg:row-start-1 lg:border-r lg:border-t-0 ${
            timingOpen ? 'h-[45dvh] lg:h-auto' : 'h-auto shrink-0'
          }`}
        >
          {timingOpen ? (
            <TimingTower
              race={race}
              time={snapshot.time}
              selectedDriver={selectedDriver}
              onSelectDriver={handleSelectDriver}
              onCollapse={toggleTiming}
              collapseButtonRef={timingToggleRef}
            />
          ) : (
            <CollapsedSidebar
              label="Live timing"
              side="left"
              onExpand={toggleTiming}
              buttonRef={timingToggleRef}
            />
          )}
        </aside>

        <aside
          aria-label="Events"
          className={`order-3 flex min-h-0 flex-col border-t bg-zinc-950/50 lg:col-start-3 lg:row-start-1 lg:border-l lg:border-t-0 ${
            eventsOpen ? 'h-[45dvh] lg:h-auto' : 'h-auto shrink-0'
          }`}
        >
          {eventsOpen ? (
            <MemoFeed
              key={race.meta.id}
              race={race}
              selectedDriver={selectedDriver}
              highlightKey={highlightKey}
              onSeekEvent={handleSeekEvent}
              onCollapse={toggleEvents}
              collapseButtonRef={eventsToggleRef}
            />
          ) : (
            <CollapsedSidebar
              label="Events"
              side="right"
              onExpand={toggleEvents}
              buttonRef={eventsToggleRef}
            />
          )}
        </aside>
      </main>

      <PlaybackBar race={race} store={store} snapshot={snapshot} />
    </div>
  )
}
