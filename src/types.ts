export type RaceMeta = {
  id: string
  year: number
  round: number
  name: string
  circuitName: string
  country: string
  totalLaps: number
  file: string
}

export type TrackPoint = [number, number, number]

export type Corner = {
  n: string
  x: number
  y: number
  z: number
  at: number
}

export type DriverData = {
  code: string
  number: number
  name: string
  team: string
  color: string
  dnf: boolean
  first: number
  last: number
  x: number[]
  y: number[]
  z: number[]
  lap: number[]
  pos: number[]
  tyre: number[]
}

export type PitStop = {
  id: string
  driver: string
  lap: number
  raceTime: number
  duration: number
  durationKind: 'stop' | 'lane'
  compoundFrom: string | null
  compoundTo: string | null
  x: number
  y: number
  z: number
}

export type Overtake = {
  id: string
  raceTime: number
  lap: number
  overtakingDriver: string
  overtakenDriver: string
  newPosition: number
  locationLabel: string
  x: number
  y: number
  z: number
}

export type StatusInterval = {
  start: number
  end: number
  status: number
}

export type RaceData = {
  version: number
  meta: RaceMeta
  time: {
    start: string
    step: number
    duration: number
    count: number
  }
  track: {
    points: TrackPoint[]
    corners: Corner[]
    start: TrackPoint
    length: number
  }
  drivers: DriverData[]
  pits: PitStop[]
  overtakes: Overtake[]
  status: StatusInterval[]
}

export type HighlightEvent =
  | { kind: 'overtake'; event: Overtake }
  | { kind: 'pit'; event: PitStop }
