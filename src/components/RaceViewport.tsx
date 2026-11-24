import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { sampleDriver, STATUSES } from '@/lib/data'
import type { PlaybackStore } from '@/lib/playback'
import type { SceneTransform } from '@/lib/scene'
import { makeTransform } from '@/lib/scene'
import type { DriverData, HighlightEvent, RaceData } from '@/types'

type CameraMode = 'orbit' | 'top' | 'follow'

type RaceViewportProps = {
  race: RaceData
  store: PlaybackStore
  selectedDriver: string | null
  cameraMode: CameraMode
  highlight: HighlightEvent | null
  status: number
  loading: boolean
  error: string | null
  onSelectDriver: (code: string) => void
}

export function RaceViewport({
  race,
  store,
  selectedDriver,
  cameraMode,
  highlight,
  status,
  loading,
  error,
  onSelectDriver,
}: RaceViewportProps) {
  const transform = useMemo(() => makeTransform(race.track), [race.track])
  const statusMeta = STATUSES[status] ?? STATUSES[1]

  return (
    <div className="relative h-full min-h-[320px] w-full overflow-hidden bg-[#09090b]">
      <Canvas
        camera={{ position: [0, 72, 108], fov: 42, near: 0.1, far: 700 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <color attach="background" args={['#09090b']} />
        <fog attach="fog" args={['#09090b', 150, 330]} />
        <ambientLight intensity={0.85} />
        <hemisphereLight args={['#d4d4d8', '#18181b', 0.55]} />
        <directionalLight position={[60, 120, 40]} intensity={1.1} />
        <pointLight position={[0, 70, 0]} intensity={0.5} color="#e4e4e7" />

        <gridHelper args={[260, 26, '#18181b', '#111114']} position={[0, -0.35, 0]} />
        <Track track={race.track} transform={transform} />
        <StartFinish track={race.track} transform={transform} />
        <CornerLabels track={race.track} transform={transform} />
        <DriverMarkers
          race={race}
          store={store}
          transform={transform}
          selectedDriver={selectedDriver}
          onSelectDriver={onSelectDriver}
        />
        {highlight && <EventBeacon highlight={highlight} transform={transform} />}
        <CameraRig
          race={race}
          store={store}
          transform={transform}
          cameraMode={cameraMode}
          selectedDriver={selectedDriver}
        />
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={8}
          maxDistance={300}
          maxPolarAngle={Math.PI / 2 - 0.02}
          enabled={cameraMode !== 'follow'}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-3 sm:p-4">
        <div className="rounded-md border border-zinc-800/70 bg-zinc-950/70 px-2.5 py-1.5 backdrop-blur">
          <div className="text-[8px] uppercase tracking-[0.2em] text-zinc-600">Track</div>
          <div className="text-[11px] font-medium text-zinc-200">
            {race.meta.circuitName}
            <span className="text-zinc-600"> · {race.meta.year}</span>
          </div>
          <div className="telemetry mt-0.5 text-[8px] text-zinc-500">
            {(race.track.length / 1000).toFixed(2)} km · 4× elevation
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-zinc-800/70 bg-zinc-950/70 px-2 py-1 text-[8px] uppercase tracking-[0.16em] text-zinc-500 backdrop-blur">
          <span className={`size-1 rounded-full ${statusMeta.dot}`} />
          {statusMeta.short}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3 sm:p-4">
        <div className="rounded border border-zinc-800/60 bg-zinc-950/60 px-2 py-1 text-[9px] text-zinc-500 backdrop-blur">
          Drag to orbit · scroll to zoom
        </div>
        <div className="hidden items-center gap-3 text-[9px] text-zinc-500 sm:flex">
          {race.track.corners.length} turns · {race.drivers.length} drivers
        </div>
      </div>

      {(loading || error) && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#09090b]/75 backdrop-blur-sm">
          <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-5 py-4 text-center">
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              {error ? 'Race data' : 'Loading race'}
            </div>
            <div className="mt-1 max-w-[320px] text-xs text-zinc-300">
              {error ?? 'Fetching telemetry frames…'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Track({
  track,
  transform,
}: {
  track: RaceData['track']
  transform: SceneTransform
}) {
  const curve = useMemo(() => {
    const points = track.points.map((point) => new THREE.Vector3(...transform.point(point)))
    if (points.length > 2 && points[0].distanceToSquared(points[points.length - 1]) < 0.001) {
      points.pop()
    }
    return new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5)
  }, [track.points, transform])

  const geometry = useMemo(() => {
    const segments = 900
    const vertices: number[] = []
    const indices: number[] = []
    for (let index = 0; index < segments; index += 1) {
      const point = curve.getPointAt(index / segments)
      const tangent = curve.getTangentAt(index / segments)
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
      if (normal.lengthSq() < 0.001) normal.set(1, 0, 0)
      const left = point.clone().addScaledVector(normal, transform.halfWidth)
      const right = point.clone().addScaledVector(normal, -transform.halfWidth)
      vertices.push(left.x, left.y + 0.015, left.z, right.x, right.y + 0.015, right.z)
    }
    for (let index = 0; index < segments; index += 1) {
      const a = index * 2
      const b = a + 1
      const c = ((index + 1) % segments) * 2
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
    const buffer = new THREE.BufferGeometry()
    buffer.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
    buffer.setIndex(indices)
    buffer.computeVertexNormals()
    return buffer
  }, [curve, transform.halfWidth])

  const edges = useMemo(() => {
    const left: THREE.Vector3[] = []
    const right: THREE.Vector3[] = []
    for (let index = 0; index < 900; index += 1) {
      const point = curve.getPointAt(index / 900)
      const tangent = curve.getTangentAt(index / 900)
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize()
      left.push(point.clone().addScaledVector(normal, transform.halfWidth))
      right.push(point.clone().addScaledVector(normal, -transform.halfWidth))
    }
    return {
      left: new THREE.BufferGeometry().setFromPoints(left),
      right: new THREE.BufferGeometry().setFromPoints(right),
    }
  }, [curve, transform.halfWidth])

  useEffect(() => {
    return () => {
      geometry.dispose()
      edges.left.dispose()
      edges.right.dispose()
    }
  }, [geometry, edges])

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial
          color="#2a2a31"
          emissive="#0b0b0e"
          roughness={0.85}
          metalness={0.15}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineLoop geometry={edges.left}>
        <lineBasicMaterial color="#52525b" transparent opacity={0.7} />
      </lineLoop>
      <lineLoop geometry={edges.right}>
        <lineBasicMaterial color="#52525b" transparent opacity={0.7} />
      </lineLoop>
    </group>
  )
}

function checkerTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 32
  const context = canvas.getContext('2d')
  if (context) {
    const size = 16
    for (let x = 0; x < canvas.width / size; x += 1) {
      for (let y = 0; y < canvas.height / size; y += 1) {
        context.fillStyle = (x + y) % 2 === 0 ? '#e4e4e7' : '#18181b'
        context.fillRect(x * size, y * size, size, size)
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
}

function StartFinish({
  track,
  transform,
}: {
  track: RaceData['track']
  transform: SceneTransform
}) {
  const start = transform.point(track.start)
  const points = useMemo(
    () => track.points.map((point) => new THREE.Vector3(...transform.point(point))),
    [track.points, transform],
  )
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.5),
    [points],
  )
  const tangent = curve.getTangentAt(0)
  const rotation = Math.atan2(tangent.x, tangent.z)
  const texture = useMemo(() => checkerTexture(), [])

  return (
    <group position={[start[0], start[1], start[2]]} rotation={[0, rotation, 0]}>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[transform.halfWidth * 2.4, 2.4]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[-transform.halfWidth * 1.7, 2.4, 0]}>
        <boxGeometry args={[0.12, 4.8, 0.12]} />
        <meshStandardMaterial color="#71717a" />
      </mesh>
      <mesh position={[transform.halfWidth * 1.7, 2.4, 0]}>
        <boxGeometry args={[0.12, 4.8, 0.12]} />
        <meshStandardMaterial color="#71717a" />
      </mesh>
      <mesh position={[0, 4.8, 0]}>
        <boxGeometry args={[transform.halfWidth * 3.6, 0.28, 0.18]} />
        <meshStandardMaterial color="#a1a1aa" />
      </mesh>
      <mesh position={[0, 4.8, 0]}>
        <planeGeometry args={[transform.halfWidth * 2.2, 0.55]} />
        <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function CornerLabels({
  track,
  transform,
}: {
  track: RaceData['track']
  transform: SceneTransform
}) {
  return (
    <>
      {track.corners.map((corner) => {
        const [x, y, z] = transform.point([corner.x, corner.y, corner.z])
        return (
          <group key={corner.n} position={[x, y, z]}>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.08, 0.14, 16]} />
              <meshBasicMaterial color="#52525b" transparent opacity={0.7} />
            </mesh>
            <Html position={[0, 0.6, 0]} center zIndexRange={[8, 0]}>
              <span className="pointer-events-none select-none rounded border border-zinc-700/60 bg-zinc-950/80 px-1 py-0.5 text-[8px] font-medium text-zinc-400">
                T{corner.n}
              </span>
            </Html>
          </group>
        )
      })}
    </>
  )
}

function DriverMarkers({
  race,
  store,
  transform,
  selectedDriver,
  onSelectDriver,
}: {
  race: RaceData
  store: PlaybackStore
  transform: SceneTransform
  selectedDriver: string | null
  onSelectDriver: (code: string) => void
}) {
  return (
    <>
      {race.drivers.map((driver) => (
        <DriverMarker
          key={driver.code}
          driver={driver}
          race={race}
          store={store}
          transform={transform}
          selected={selectedDriver === driver.code}
          dimmed={Boolean(selectedDriver) && selectedDriver !== driver.code}
          onSelect={() => onSelectDriver(driver.code)}
        />
      ))}
    </>
  )
}

function DriverMarker({
  driver,
  race,
  store,
  transform,
  selected,
  dimmed,
  onSelect,
}: {
  driver: DriverData
  race: RaceData
  store: PlaybackStore
  transform: SceneTransform
  selected: boolean
  dimmed: boolean
  onSelect: () => void
}) {
  const group = useRef<THREE.Group>(null)
  const label = useRef<HTMLDivElement>(null)
  const color = `#${driver.color}`

  useFrame(() => {
    if (!group.current) return
    const time = store.time
    const active = time >= driver.first && time <= driver.last
    group.current.visible = active
    if (label.current) label.current.style.opacity = active ? (dimmed ? '0.45' : '1') : '0'
    if (!active) return
    const sample = sampleDriver(driver, time, race.time.step)
    const [x, y, z] = transform.point([sample.x, sample.y, sample.z])
    group.current.position.set(x, y + 0.35, z)
    group.current.scale.setScalar(selected ? 1.45 : dimmed ? 0.82 : 1)
  })

  return (
    <group ref={group}>
      <mesh
        onClick={(event) => {
          event.stopPropagation()
          onSelect()
        }}
        onPointerOver={() => {
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto'
        }}
      >
        <sphereGeometry args={[0.23, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={dimmed ? 0.5 : 1}
          depthWrite
        />
      </mesh>
      <mesh scale={[1.9, 1.9, 1.9]}>
        <sphereGeometry args={[0.23, 12, 12]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={selected ? 0.32 : dimmed ? 0.05 : 0.14}
          depthWrite={false}
        />
      </mesh>
      {selected && (
        <mesh position={[0, -0.32, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.42, 0.6, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.7} depthWrite={false} />
        </mesh>
      )}
      <Html position={[0, 0.95, 0]} center zIndexRange={[20, 0]}>
        <div
          ref={label}
          className="pointer-events-none select-none whitespace-nowrap rounded border bg-zinc-950/85 px-1 py-0.5 text-[9px] font-semibold leading-none tracking-wide text-zinc-100 backdrop-blur-sm"
          style={{ borderColor: color }}
        >
          {driver.code}
        </div>
      </Html>
    </group>
  )
}

type OrbitLike = {
  target: THREE.Vector3
  update: () => void
}

function CameraRig({
  race,
  store,
  transform,
  cameraMode,
  selectedDriver,
}: {
  race: RaceData
  store: PlaybackStore
  transform: SceneTransform
  cameraMode: CameraMode
  selectedDriver: string | null
}) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as OrbitLike | null

  useEffect(() => {
    if (!controls) return
    if (cameraMode === 'top') {
      camera.position.set(0, 180, 0.01)
      controls.target.set(0, 1.5, 0)
      controls.update()
    } else if (cameraMode === 'orbit') {
      camera.position.set(0, 72, 108)
      controls.target.set(0, 2, 0)
      controls.update()
    }
  }, [cameraMode, camera, controls])

  useFrame(() => {
    if (cameraMode !== 'follow') return
    const index = Math.max(
      0,
      Math.min(race.time.count - 1, Math.floor(store.time / race.time.step)),
    )
    const driver =
      race.drivers.find((item) => item.code === selectedDriver) ??
      race.drivers.find((item) => item.pos[index] === 1)
    if (!driver) return
    const time = store.time
    const sample = sampleDriver(driver, time, race.time.step)
    const ahead = sampleDriver(driver, time + 0.35, race.time.step)
    const [x, y, z] = transform.point([sample.x, sample.y, sample.z])
    const [ax, , az] = transform.point([ahead.x, ahead.y, ahead.z])
    const forward = new THREE.Vector3(ax - x, 0, az - z)
    if (forward.lengthSq() < 0.0001) forward.set(0, 0, -1)
    forward.normalize()
    const desired = new THREE.Vector3(x, y + 5.5, z).addScaledVector(forward, -16)
    camera.position.lerp(desired, 0.1)
    const target = new THREE.Vector3(x, y + 0.7, z).addScaledVector(forward, 4)
    if (controls) {
      controls.target.lerp(target, 0.18)
      controls.update()
    } else {
      camera.lookAt(target)
    }
  })

  return null
}

function EventBeacon({
  highlight,
  transform,
}: {
  highlight: HighlightEvent
  transform: SceneTransform
}) {
  const ring = useRef<THREE.Mesh>(null)
  const material = useRef<THREE.MeshBasicMaterial>(null)
  const point = highlight.event
  const [x, y, z] = transform.point([point.x, point.y, point.z])
  const label =
    highlight.kind === 'overtake'
      ? `LAP ${highlight.event.lap} · ${highlight.event.locationLabel}`
      : `LAP ${highlight.event.lap} · PIT`

  useFrame((state) => {
    if (!ring.current || !material.current) return
    const pulse = (Math.sin(state.clock.elapsedTime * 4.2) + 1) / 2
    ring.current.scale.setScalar(1 + pulse * 0.8)
    material.current.opacity = 0.8 - pulse * 0.45
  })

  return (
    <group position={[x, y, z]}>
      <mesh ref={ring} position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.85, 48]} />
        <meshBasicMaterial
          ref={material}
          color="#f59e0b"
          transparent
          opacity={0.8}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, 2.4, 0]}>
        <cylinderGeometry args={[0.035, 0.035, 4.8, 8]} />
        <meshBasicMaterial color="#f59e0b" transparent opacity={0.25} depthWrite={false} />
      </mesh>
      <Html position={[0, 2.2, 0]} center zIndexRange={[30, 0]}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded border border-amber-500/40 bg-zinc-950/90 px-1.5 py-0.5 text-[8px] font-medium tracking-wide text-amber-300 backdrop-blur">
          {label}
        </div>
      </Html>
    </group>
  )
}
