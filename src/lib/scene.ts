import type { RaceData, TrackPoint } from '@/types'

export type SceneTransform = {
  scale: number
  halfWidth: number
  point: (point: TrackPoint) => [number, number, number]
}

const ELEVATION = 4

export function makeTransform(track: RaceData['track']): SceneTransform {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  for (const [x, y, z] of track.points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    minZ = Math.min(minZ, z)
  }
  const width = maxX - minX
  const depth = maxY - minY
  const scale = 100 / Math.max(width, depth, 1)
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return {
    scale,
    halfWidth: Math.max(0.9, 110 * scale),
    point: ([x, y, z]) => [
      (x - centerX) * scale,
      (z - minZ) * scale * ELEVATION,
      (y - centerY) * scale,
    ],
  }
}
