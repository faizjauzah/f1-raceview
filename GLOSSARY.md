# RaceView

The shared language for a static Formula 1 race replay. A race is a pre-baked sequence of positions and events; the browser only plays it back.

## Replay

**Race window**: The interval from the winner's start to the winner's chequered flag. Every race clock value is relative to the start of this window.

**Frame**: One second of race time containing every driver's position, lap, race position, tyre, and car telemetry. The client interpolates between frames; a frame is not a rendered video frame.

**Playback time**: The current offset from the start of the race window, in seconds. It is independent of wall-clock time.

**Playback speed**: How fast race time advances relative to wall-clock time, from 1× to 20×.
_Avoid_: speed

**Track status**: The marshalling state at a point in the race window: green, yellow, safety car, virtual safety car, or red flag.

**Race position**: A driver's official place in the running order, from 1 to 20. The replay uses the timing feed, not a recomputation from geometry.

## Telemetry

**Car telemetry**: The followed car's one-second engine and control samples: car speed, gear, throttle, brake, and DRS state.

**Car speed**: The car's velocity in km/h at the current playback time, as reported by the car feed; not the playback rate.
_Avoid_: speed (alone), velocity

## Events

**Overtake event**: A change of race position where the gaining driver takes one place from another driver while both are on track, on the same lap, and outside a pit window.

**Pit stop**: A driver's visit to the pit lane, with the lap, time, duration, and the tyre compounds before and after where known. A lane duration is not the same as a stationary stop duration.

**DNF**: A driver who did not finish. Their car is removed from the replay at the end of their last completed lap.

## Geometry

**Corner marker**: A numbered point supplied by the circuit metadata, used to label turns and to locate an overtake.

**Sector straight**: A location label used when an overtake is not close enough to a corner marker. The sector is an approximation from thirds of the lap, not the official timing sector.

**Elevation exaggeration**: The vertical scale applied to the track's real elevation. It makes gradients visible at the scale of a whole circuit.

_Avoid_: "track model" for the 3D ribbon; "lap time" for race clock time; "pass" for any position change.
