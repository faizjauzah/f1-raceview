import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const dataDir = join(root, 'public', 'data')
const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

const races = JSON.parse(readFileSync(join(dataDir, 'races.json'), 'utf8'))
check(Array.isArray(races) && races.length > 0, 'races.json must be a non-empty array')

for (const meta of races) {
  const file = join(dataDir, meta.file)
  const size = statSync(file).size
  const race = JSON.parse(readFileSync(file, 'utf8'))
  const prefix = `${meta.file}:`
  check(size < 6_000_000, `${prefix} raw size ${size} exceeds 6 MB`)
  check(race.version === 2, `${prefix} unknown schema version`)
  check(race.meta?.id === meta.id, `${prefix} id mismatch`)
  check(race.time?.count === race.time?.duration + 1, `${prefix} frame count mismatch`)
  check(race.time?.step === 1, `${prefix} expected a 1 s step`)
  check(
    race.drivers?.length >= 19 && race.drivers?.length <= 20,
    `${prefix} expected 19 or 20 drivers`,
  )
  check(race.track?.points?.length > 100, `${prefix} track has too few points`)
  check(race.track?.corners?.length > 0, `${prefix} no corners`)
  check(race.status?.[0]?.start === 0, `${prefix} status must start at zero`)
  check(
    race.status?.at(-1)?.end === race.time.duration,
    `${prefix} status must end at race duration`,
  )

  for (const driver of race.drivers) {
    for (const field of ['x', 'y', 'z', 'lap', 'pos', 'tyre']) {
      check(driver[field]?.length === race.time.count, `${prefix} ${driver.code}.${field} length`)
    }
    check(driver.pos[0] >= 1 && driver.pos[0] <= 20, `${prefix} ${driver.code} invalid grid slot`)
    check(driver.lap.at(-1) >= 1, `${prefix} ${driver.code} invalid lap`)
    check(typeof driver.dnf === 'boolean', `${prefix} ${driver.code} missing dnf flag`)

    const carFields = ['speed', 'gear', 'throttle', 'brake', 'drs']
    const present = carFields.filter((field) => Array.isArray(driver[field]))
    check(
      present.length === 0 || present.length === carFields.length,
      `${prefix} ${driver.code} incomplete car telemetry`,
    )
    for (const field of present) {
      check(
        driver[field].length === race.time.count,
        `${prefix} ${driver.code}.${field} length`,
      )
    }
    if (present.length === carFields.length) {
      const ranges = { speed: 400, gear: 8, throttle: 100, brake: 100, drs: 14 }
      for (const [field, maximum] of Object.entries(ranges)) {
        check(
          driver[field].every(
            (value) => value === null || (Number.isInteger(value) && value >= 0 && value <= maximum),
          ),
          `${prefix} ${driver.code}.${field} out of range`,
        )
      }
    }
  }
  check(
    race.drivers.some((driver) => Array.isArray(driver.speed)),
    `${prefix} no car telemetry`,
  )

  check(Array.isArray(race.overtakes), `${prefix} missing overtakes`)
  check(Array.isArray(race.pits), `${prefix} missing pits`)
  for (const event of race.overtakes) {
    check(
      Number.isFinite(event.raceTime) && event.raceTime >= 0 && event.raceTime <= race.time.duration,
      `${prefix} overtake ${event.id} time outside race`,
    )
    check(typeof event.overtakingDriver === 'string', `${prefix} overtake ${event.id} driver code`)
  }

  console.log(
    `${meta.id}: ${(size / 1_000_000).toFixed(2)} MB, ${race.drivers.length} drivers, ` +
      `${race.overtakes.length} overtakes, ${race.pits.length} pits, ${race.status.length} status intervals`,
  )
}

if (failures.length > 0) {
  console.error(`\n${failures.length} data validation failure(s):`)
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log(`\nAll ${races.length} races valid.`)
