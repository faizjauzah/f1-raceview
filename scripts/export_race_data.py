#!/usr/bin/env python3
"""Export pre-baked race replay data for the static RaceView frontend.

Telemetry comes from OpenF1 (no credentials, 2023+). Circuit markers and the
gear-shift reference metadata come from FastF1's MultiViewer source, which is
anonymous. FastF1 telemetry itself now requires an F1TV login, so it is not used
for the data feed.

Usage:
    python scripts/export_race_data.py --year 2024 --races "Bahrain,Monaco,Spa"
    python scripts/export_race_data.py --year 2025 --races all
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import fastf1
import numpy as np
import requests
from fastf1.mvapi.data import get_circuit_info

ROOT = Path(__file__).resolve().parent.parent
CACHE_DIR = ROOT / ".cache"
OUT_DIR = ROOT / "public" / "data"
OPENF1 = "https://api.openf1.org"
DEFAULT_RACES = "Bahrain,Monaco,Spa"
STEP = 1.0
COMPOUNDS = {
    "SOFT": 1,
    "MEDIUM": 2,
    "HARD": 3,
    "INTERMEDIATE": 4,
    "WET": 5,
}
STATUS_GREEN, STATUS_YELLOW, STATUS_SC, STATUS_RED, STATUS_VSC = 1, 2, 4, 5, 6


def log(message: str) -> None:
    print(message, flush=True)


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def seconds_between(value: str, start: datetime) -> float:
    return (parse_iso(value) - start).total_seconds()


class OpenF1Client:
    """Tiny disk-cached OpenF1 client. The API allows ~3 requests/second."""

    def __init__(self) -> None:
        self.cache = CACHE_DIR / "openf1"
        self.cache.mkdir(parents=True, exist_ok=True)
        self.session = requests.Session()
        self.last_request = 0.0

    def get(self, path: str, params: dict[str, Any]) -> Any:
        key = hashlib.sha1(
            (path + json.dumps(params, sort_keys=True, default=str)).encode()
        ).hexdigest()[:16]
        cache_file = self.cache / f"{path.strip('/').replace('/', '_')}-{key}.json"
        if cache_file.exists():
            return json.loads(cache_file.read_text())

        url = f"{OPENF1}{path}"
        for attempt in range(5):
            wait = 0.34 - (time.monotonic() - self.last_request)
            if wait > 0:
                time.sleep(wait)
            self.last_request = time.monotonic()
            response = self.session.get(url, params=params, timeout=120)
            if response.status_code == 429:
                time.sleep(5 * (attempt + 1))
                continue
            if response.status_code >= 500:
                time.sleep(2 * (attempt + 1))
                continue
            response.raise_for_status()
            data = response.json()
            cache_file.write_text(json.dumps(data, separators=(",", ":")))
            return data
        raise RuntimeError(f"OpenF1 request failed after retries: {url} {params}")


@dataclass
class RaceInfo:
    session: dict[str, Any]
    meeting: dict[str, Any]
    round_number: int
    id: str
    name: str


def normalise(value: str) -> str:
    return " ".join(value.lower().replace("-", " ").split())


def pick_race(
    sessions: list[dict[str, Any]],
    meetings: dict[int, dict[str, Any]],
    query: str,
) -> RaceInfo:
    wanted = normalise(query)

    def match_score(session: dict[str, Any]) -> int:
        meeting = meetings.get(session["meeting_key"], {})
        values = [
            normalise(str(part or ""))
            for part in (
                session.get("circuit_short_name"),
                session.get("location"),
                session.get("country_name"),
                meeting.get("meeting_name"),
                meeting.get("meeting_official_name"),
            )
        ]
        score = 0
        for value in values:
            if not value:
                continue
            if value == wanted:
                score = max(score, 100)
            elif value.startswith(f"{wanted} "):
                score = max(score, 90)
            elif re.search(rf"\b{re.escape(wanted)}\b", value):
                score = max(score, 80)
            elif wanted in value:
                score = max(score, 30)
        return score

    ranked = sorted(
        ((match_score(session), session) for session in sessions),
        key=lambda item: (-item[0], item[1]["date_start"]),
    )
    matches = [session for score, session in ranked if score > 0]
    if not matches:
        available = ", ".join(s["circuit_short_name"] for s in sessions)
        raise SystemExit(f"No {sessions[0]['year']} race matched {query!r}. Available: {available}")

    session = matches[0]
    meeting = meetings.get(session["meeting_key"], {})
    ordered = sorted(sessions, key=lambda s: s["date_start"])
    round_number = next(
        i + 1 for i, s in enumerate(ordered) if s["session_key"] == session["session_key"]
    )
    name = meeting.get("meeting_name") or f"{session.get('country_name')} Grand Prix"
    slug = f"{normalise(query).replace(' ', '-')}-{session['year']}"
    return RaceInfo(session=session, meeting=meeting, round_number=round_number, id=slug, name=name)


def build_lap_arrays(
    lap_rows: list[dict[str, Any]], t0: datetime, duration: int, drivers: list[int]
) -> dict[int, list[int]]:
    result: dict[int, list[int]] = {}
    times = np.arange(duration + 1, dtype=float)
    for driver in drivers:
        rows = sorted(
            (lap for lap in lap_rows if lap["driver_number"] == driver and lap.get("date_start")),
            key=lambda lap: lap["date_start"],
        )
        starts = np.array([seconds_between(lap["date_start"], t0) for lap in rows])
        numbers = np.array([lap["lap_number"] for lap in rows])
        if len(starts) == 0:
            result[driver] = [1] * (duration + 1)
            continue
        idx = np.searchsorted(starts, times, side="right") - 1
        lap_values = np.where(idx >= 0, numbers[np.clip(idx, 0, None)], numbers[0])
        if starts[0] > 10 and numbers[0] > 1:
            # shortcut: OpenF1 can omit early lap rows (2025 Miami begins at lap
            # 26); ramp the lap counter across the gap. Upgrade if the feed
            # publishes the missing laps.
            before = times < starts[0]
            ramp = 1 + (times[before] / starts[0]) * (numbers[0] - 1)
            lap_values[before] = np.clip(np.floor(ramp), 1, numbers[0] - 1)
        result[driver] = lap_values.astype(int).tolist()
    return result


def build_tyre_arrays(
    stints: list[dict[str, Any]], lap_arrays: dict[int, list[int]], drivers: list[int]
) -> dict[int, list[int]]:
    result: dict[int, list[int]] = {}
    for driver in drivers:
        driver_stints = sorted(
            (s for s in stints if s["driver_number"] == driver), key=lambda s: s["stint_number"]
        )
        by_lap: dict[int, int] = {}
        for stint in driver_stints:
            code = COMPOUNDS.get(str(stint.get("compound", "")).upper(), 0)
            for lap in range(stint["lap_start"], stint["lap_end"] + 1):
                by_lap[lap] = code
        values: list[int] = []
        current = next(iter(by_lap.values()), 0)
        for lap in lap_arrays[driver]:
            if lap in by_lap:
                current = by_lap[lap]
            values.append(current)
        result[driver] = values
    return result


def initial_positions(
    position_rows: list[dict[str, Any]], t0: datetime
) -> dict[int, int]:
    """Use the last complete classification snapshot before the start.

    Partial timing updates during an aborted start can otherwise leave a driver
    on a nonsensical grid slot (Monaco 2024 is the motivating case).
    """
    before = [row for row in position_rows if seconds_between(row["date"], t0) < 0]
    by_time: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in before:
        by_time[row["date"]].append(row)
    if not by_time:
        return {}
    stamp = max(by_time, key=lambda value: (len(by_time[value]), value))
    initial = {row["driver_number"]: row["position"] for row in by_time[stamp]}
    for row in sorted(before, key=lambda item: item["date"]):
        initial.setdefault(row["driver_number"], row["position"])

    used: set[int] = set()
    duplicates: list[int] = []
    for driver, position in initial.items():
        if position in used:
            duplicates.append(driver)
        else:
            used.add(position)
    free = (position for position in range(1, len(initial) + 1) if position not in used)
    for driver in duplicates:
        initial[driver] = next(free, len(initial))
    return initial


def position_arrays(
    position_rows: list[dict[str, Any]],
    t0: datetime,
    duration: int,
    drivers: list[int],
) -> dict[int, list[int]]:
    events: list[tuple[float, int, int]] = []
    initial = initial_positions(position_rows, t0)
    for row in sorted(position_rows, key=lambda r: r["date"]):
        t = seconds_between(row["date"], t0)
        if t >= 0:
            events.append((t, row["driver_number"], row["position"]))

    if len(initial) < len(drivers):
        for driver in drivers:
            initial.setdefault(driver, len(initial) + 1)

    result: dict[int, list[int]] = {driver: [initial[driver]] * (duration + 1) for driver in drivers}
    current = dict(initial)
    cursor = 0
    for t, driver, position in events:
        index = min(duration, max(0, int(round(t / STEP))))
        for each in drivers:
            result[each][cursor:index] = [current[each]] * (index - cursor)
        current[driver] = position
        cursor = index
    for each in drivers:
        result[each][cursor:] = [current[each]] * (duration + 1 - cursor)
    return result


def interpolate_location(
    rows: list[dict[str, Any]], t0: datetime, times: np.ndarray
) -> tuple[list[int], list[int], list[int], float, float]:
    window_start = -10.0
    window_end = float(times[-1]) + 10.0
    all_samples = sorted(
        (
            (seconds_between(row["date"], t0), row["x"], row["y"], row["z"])
            for row in rows
            if not (row["x"] == 0 and row["y"] == 0 and row["z"] == 0)
        ),
        key=lambda sample: sample[0],
    )
    samples = [
        sample for sample in all_samples if window_start <= sample[0] <= window_end
    ]
    if not samples:
        # Drivers who retired before the start (DNS or a formation-lap crash)
        # have no in-window samples. Hold their last known position so the
        # driver still appears in the payload and disappears via `last`.
        before = [sample for sample in all_samples if sample[0] < window_start]
        after = [sample for sample in all_samples if sample[0] > window_end]
        anchor = (
            max(before, key=lambda sample: sample[0])
            if before
            else (min(after, key=lambda sample: sample[0]) if after else None)
        )
        if anchor is None:
            raise RuntimeError("Driver has no valid location samples")
        samples = [anchor]
    ts = np.array([sample[0] for sample in samples])
    xs = np.array([sample[1] for sample in samples])
    ys = np.array([sample[2] for sample in samples])
    zs = np.array([sample[3] for sample in samples])
    x = np.interp(times, ts, xs)
    y = np.interp(times, ts, ys)
    z = np.interp(times, ts, zs)
    return (
        np.rint(x).astype(int).tolist(),
        np.rint(y).astype(int).tolist(),
        np.rint(z).astype(int).tolist(),
        float(ts[0]),
        float(ts[-1]),
    )


CAR_MAX_GAP = 2.0
CAR_FIELDS = {
    "speed": ("speed", 0, 400),
    "gear": ("n_gear", 0, 8),
    "throttle": ("throttle", 0, 100),
    "brake": ("brake", 0, 100),
    "drs": ("drs", 0, 14),
}
CAR_LINEAR = {"speed", "throttle", "brake"}


def resample_car_field(
    samples: list[tuple[float, int]], times: np.ndarray, linear: bool
) -> list[int | None]:
    if not samples:
        return [None] * len(times)
    ts = np.array([sample[0] for sample in samples])
    values = np.array([sample[1] for sample in samples])
    result: list[int | None] = []
    for t in times:
        if t < ts[0] or t > ts[-1]:
            result.append(None)
            continue
        index = int(np.searchsorted(ts, t, side="right") - 1)
        index = max(0, min(len(ts) - 1, index))
        if linear and index + 1 < len(ts):
            gap = float(ts[index + 1] - ts[index])
            if 0 < gap <= CAR_MAX_GAP:
                fraction = float((t - ts[index]) / gap)
                value = values[index] + (values[index + 1] - values[index]) * fraction
                result.append(int(round(float(value))))
                continue
        result.append(int(values[index]))
    return result


def build_car_arrays(
    rows: list[dict[str, Any]], t0: datetime, duration: int
) -> dict[str, list[int | None]] | None:
    """Resample the car feed onto the replay frames.

    OpenF1 uses 104 as a no-data sentinel for throttle/brake, and occasionally
    emits corrupt gear values. Those samples become null rather than fake data.
    A driver with no usable running telemetry gets no car arrays at all.
    """
    if not rows:
        return None
    prepared = sorted(
        ((seconds_between(row["date"], t0), row) for row in rows),
        key=lambda item: item[0],
    )
    times = np.arange(duration + 1, dtype=float)
    arrays: dict[str, list[int | None]] = {}
    for field, (source, low, high) in CAR_FIELDS.items():
        samples = [
            (t, int(row[source]))
            for t, row in prepared
            if row.get(source) is not None and low <= int(row[source]) <= high
        ]
        arrays[field] = resample_car_field(samples, times, field in CAR_LINEAR)
    if not any(value is not None for value in arrays["speed"]):
        return None
    if not any(value is not None for value in arrays["throttle"] + arrays["brake"]):
        return None
    return arrays


def track_from_lap(rows: list[dict[str, Any]], lap_start: str, lap_duration: float) -> list[list[int]]:
    start = parse_iso(lap_start)
    end = start + timedelta(seconds=lap_duration)
    points: list[list[int]] = []
    for row in rows:
        stamp = parse_iso(row["date"])
        if not (start <= stamp <= end):
            continue
        if row["x"] == 0 and row["y"] == 0 and row["z"] == 0:
            continue
        points.append([int(row["x"]), int(row["y"]), int(row["z"])])
    if len(points) < 20:
        raise RuntimeError("Reference lap has too few position samples")
    # Close the loop at start/finish.
    if points[0] != points[-1]:
        points.append(points[0])
    return points


def smooth_elevation(points: list[list[int]], window: int = 5) -> list[list[int]]:
    if len(points) < window:
        return points
    z = np.array([p[2] for p in points], dtype=float)
    pad = window // 2
    z = np.convolve(np.pad(z, pad, mode="wrap"), np.ones(window) / window, mode="valid")
    for index, value in enumerate(z):
        points[index][2] = int(round(value))
    points[-1][2] = points[0][2]
    return points


def cumulative_distances(points: list[list[int]]) -> np.ndarray:
    xy = np.array([[p[0], p[1]] for p in points], dtype=float)
    segment = np.linalg.norm(np.diff(xy, axis=0), axis=1)
    return np.concatenate([[0.0], np.cumsum(segment)])


def build_track(
    points: list[list[int]], circuit: Any
) -> tuple[dict[str, Any], np.ndarray]:
    points = smooth_elevation(points)
    distances = cumulative_distances(points)
    xy = np.array([[p[0], p[1]] for p in points], dtype=float)

    corners: list[dict[str, Any]] = []
    if circuit is not None:
        for _, corner in circuit.corners.iterrows():
            cx, cy = float(corner["X"]), float(corner["Y"])
            index = int(np.argmin((xy[:, 0] - cx) ** 2 + (xy[:, 1] - cy) ** 2))
            number = str(int(corner["Number"]))
            raw_letter = corner.get("Letter")
            letter = "" if raw_letter is None or (isinstance(raw_letter, float) and math.isnan(raw_letter)) else str(raw_letter).strip()
            corners.append(
                {
                    "n": f"{number}{letter}",
                    "x": points[index][0],
                    "y": points[index][1],
                    "z": points[index][2],
                    "at": round(float(distances[index] / distances[-1]), 5),
                }
            )

    track = {
        "points": points,
        "corners": corners,
        "start": points[0],
        "length": round(float(distances[-1]) / 10.0, 1),
    }
    return track, distances


def build_status_intervals(
    race_control: list[dict[str, Any]], t0: datetime, duration: int
) -> list[dict[str, Any]]:
    events = sorted(race_control, key=lambda row: row["date"])
    sc = False
    vsc = False
    red = False
    yellow_sectors: set[Any] = set()
    current = STATUS_GREEN
    intervals: list[dict[str, Any]] = [{"start": 0.0, "status": STATUS_GREEN}]

    def status_now() -> int:
        if red:
            return STATUS_RED
        if vsc:
            return STATUS_VSC
        if sc:
            return STATUS_SC
        if yellow_sectors:
            return STATUS_YELLOW
        return STATUS_GREEN

    for row in events:
        t = seconds_between(row["date"], t0)
        if t < 0 or t > duration:
            continue
        message = str(row.get("message") or "").upper()
        flag = str(row.get("flag") or "").upper()
        category = str(row.get("category") or "")
        scope = str(row.get("scope") or "")
        sector = row.get("sector")

        if re.search(r"\bRED FLAG\b", message) or flag == "RED":
            red = True
        if "SAFETY CAR DEPLOYED" in message:
            sc = True
        if "VIRTUAL SAFETY CAR DEPLOYED" in message or message.startswith("VSC DEPLOYED"):
            vsc = True
        if "VIRTUAL SAFETY CAR ENDING" in message or "VSC ENDING" in message:
            vsc = False
        if "SAFETY CAR IN THIS LAP" in message or "SAFETY CAR ENDING" in message:
            sc = False
        if category == "Flag":
            if flag in {"YELLOW", "DOUBLE YELLOW"}:
                yellow_sectors.add(sector if scope == "Sector" else "TRACK")
            elif flag == "CLEAR":
                if scope == "Track":
                    yellow_sectors.clear()
                else:
                    yellow_sectors.discard(sector)
            elif flag == "GREEN" and scope == "Track":
                yellow_sectors.clear()
                sc = False
                vsc = False
                red = False
        if "CLEAR" in message and scope == "Track":
            sc = False
            vsc = False
            red = False
        if category == "SessionStatus" and "STARTED" in message:
            red = False

        status = status_now()
        if status != current:
            intervals.append({"start": round(t, 2), "status": status})
            current = status

    # Close every interval and merge adjacent identical statuses.
    for index, interval in enumerate(intervals):
        end = intervals[index + 1]["start"] if index + 1 < len(intervals) else duration
        interval["end"] = round(float(end), 2)

    merged: list[dict[str, Any]] = []
    for interval in intervals:
        if merged and merged[-1]["status"] == interval["status"]:
            merged[-1]["end"] = interval["end"]
        else:
            merged.append(interval)
    return merged


def status_at(intervals: list[dict[str, Any]], t: float) -> int:
    for interval in intervals:
        if interval["start"] <= t < interval["end"]:
            return interval["status"]
    return STATUS_GREEN


def pit_windows(
    pits: list[dict[str, Any]], t0: datetime
) -> list[tuple[int, float, float]]:
    windows: list[tuple[int, float, float]] = []
    for pit in pits:
        start = seconds_between(pit["date"], t0)
        duration = pit.get("lane_duration") or pit.get("pit_duration") or 30
        windows.append((pit["driver_number"], start - 4, start + float(duration) + 10))
    return windows


def in_pit(windows: list[tuple[int, float, float]], driver: int, t: float) -> bool:
    return any(d == driver and start <= t <= end for d, start, end in windows)


def nearest_corner(
    track: dict[str, Any], x: int, y: int, distances: np.ndarray
) -> tuple[str, float]:
    corners = track["corners"]
    if corners:
        nearest = min(corners, key=lambda c: (c["x"] - x) ** 2 + (c["y"] - y) ** 2)
        distance = math.hypot(nearest["x"] - x, nearest["y"] - y) / 10.0
        if distance < 120:
            return f"Turn {nearest['n']}", distance

    points = np.array([[p[0], p[1]] for p in track["points"]], dtype=float)
    index = int(np.argmin((points[:, 0] - x) ** 2 + (points[:, 1] - y) ** 2))
    progress = float(distances[index] / distances[-1])
    sector = min(3, int(progress * 3) + 1)
    return f"Sector {sector} Straight", 999.0


def detect_overtakes(
    position_rows: list[dict[str, Any]],
    t0: datetime,
    duration: int,
    lap_arrays: dict[int, list[int]],
    location: dict[int, dict[str, list[int]]],
    pits: list[dict[str, Any]],
    status_intervals: list[dict[str, Any]],
    track: dict[str, Any],
    distances: np.ndarray,
    codes: dict[int, str],
) -> list[dict[str, Any]]:
    events = sorted(
        (
            (seconds_between(row["date"], t0), row["driver_number"], row["position"])
            for row in position_rows
            if 0 <= seconds_between(row["date"], t0) <= duration
        )
    )
    initial = initial_positions(position_rows, t0)

    next_changes: dict[int, list[tuple[float, int]]] = defaultdict(list)
    for t, driver, position in events:
        next_changes[driver].append((t, position))

    windows = pit_windows(pits, t0)
    current = dict(initial)
    overtakes: list[dict[str, Any]] = []
    recent: list[tuple[float, int, int]] = []

    for t, driver, new_position in events:
        old_position = current.get(driver)
        if (
            old_position is not None
            and new_position == old_position - 1
            and t > 8
            and status_at(status_intervals, t) == STATUS_GREEN
        ):
            candidates = [
                other
                for other, position in current.items()
                if position == new_position and other != driver
            ]
            if len(candidates) == 1:
                other = candidates[0]
                lost_place = any(
                    abs(time - t) <= 6 and position == old_position
                    for time, position in next_changes.get(other, [])
                    if time >= t - 1.5
                )
                lap = lap_arrays[driver][min(duration, int(t))]
                same_lap = lap_arrays[other][min(duration, int(t))] == lap
                clean = not in_pit(windows, driver, t) and not in_pit(windows, other, t)
                duplicate = any(
                    abs(time - t) < 12 and driver == d and other == o
                    for time, d, o in recent
                )
                if lost_place and same_lap and clean and not duplicate:
                    x = location[driver]["x"][min(duration, int(round(t)))]
                    y = location[driver]["y"][min(duration, int(round(t)))]
                    z = location[driver]["z"][min(duration, int(round(t)))]
                    label, _ = nearest_corner(track, x, y, distances)
                    overtakes.append(
                        {
                            "id": f"{codes.get(driver, driver)}-{int(t)}",
                            "raceTime": round(t, 2),
                            "lap": int(lap),
                            "overtakingDriver": codes.get(driver, str(driver)),
                            "overtakenDriver": codes.get(other, str(other)),
                            "newPosition": int(new_position),
                            "locationLabel": label,
                            "x": x,
                            "y": y,
                            "z": z,
                        }
                    )
                    recent.append((t, driver, other))
                    recent = [item for item in recent if t - item[0] < 60]
        current[driver] = new_position

    return overtakes


def build_pit_stops(
    pits: list[dict[str, Any]],
    t0: datetime,
    stints: list[dict[str, Any]],
    codes: dict[int, str],
    location: dict[int, dict[str, list[int]]],
    duration: int,
) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for pit in pits:
        driver = pit["driver_number"]
        t = seconds_between(pit["date"], t0)
        if t < 0 or t > duration:
            continue
        driver_stints = sorted(
            (s for s in stints if s["driver_number"] == driver), key=lambda s: s["stint_number"]
        )
        lap = int(pit["lap_number"])
        compound_from = None
        compound_to = None
        for index, stint in enumerate(driver_stints):
            if stint["lap_start"] <= lap <= stint["lap_end"]:
                compound_from = str(stint.get("compound") or "").upper() or None
                if index + 1 < len(driver_stints):
                    compound_to = str(driver_stints[index + 1].get("compound") or "").upper() or None
                break
        index = min(duration, int(round(t)))
        stop = pit.get("stop_duration")
        lane = pit.get("lane_duration") or pit.get("pit_duration")
        result.append(
            {
                "id": f"{driver}-{int(t)}",
                "driver": codes.get(driver, str(driver)),
                "lap": lap,
                "raceTime": round(t, 2),
                "duration": round(float(stop or lane or 0), 1),
                "durationKind": "stop" if stop is not None else "lane",
                "compoundFrom": compound_from,
                "compoundTo": compound_to,
                "x": location[driver]["x"][index],
                "y": location[driver]["y"][index],
                "z": location[driver]["z"][index],
            }
        )
    return sorted(result, key=lambda item: item["raceTime"])


def export_race(
    client: OpenF1Client,
    sessions: list[dict[str, Any]],
    meetings: dict[int, dict[str, Any]],
    query: str,
    year: int,
) -> dict[str, Any]:
    info = pick_race(sessions, meetings, query)
    session = info.session
    session_key = session["session_key"]
    log(f"\n== {info.name} ({info.id}) ==")
    log(f"session_key={session_key} circuit={session.get('circuit_short_name')}")

    drivers_rows = client.get("/v1/drivers", {"session_key": session_key})
    laps = client.get("/v1/laps", {"session_key": session_key})
    positions = client.get("/v1/position", {"session_key": session_key})
    pits = client.get("/v1/pit", {"session_key": session_key})
    stints = client.get("/v1/stints", {"session_key": session_key})
    race_control = client.get("/v1/race_control", {"session_key": session_key})
    results = client.get("/v1/session_result", {"session_key": session_key})
    result_info = {row["driver_number"]: row for row in results}
    dnf = {
        row["driver_number"]: bool(row.get("dnf") or row.get("dns"))
        for row in results
    }

    driver_numbers = sorted(
        {row["driver_number"] for row in drivers_rows},
    )
    for driver in driver_numbers:
        dnf.setdefault(driver, True)
    codes = {row["driver_number"]: row.get("name_acronym") or str(row["driver_number"]) for row in drivers_rows}
    teams = {
        row["driver_number"]: {
            "team": row.get("team_name") or "",
            "color": (row.get("team_colour") or "888888").lstrip("#").lower(),
            "name": row.get("full_name") or codes[row["driver_number"]],
        }
        for row in drivers_rows
    }

    start_times = [parse_iso(lap["date_start"]) for lap in laps if lap.get("date_start")]
    if not start_times:
        raise RuntimeError(f"No lap timings for {info.id}")
    lap_start = min(start_times)
    total_laps = max(
        (lap["lap_number"] for lap in laps if lap.get("lap_duration") is not None),
        default=0,
    )
    finishers = [
        parse_iso(lap["date_start"]) + timedelta(seconds=lap["lap_duration"])
        for lap in laps
        if lap.get("date_start")
        and lap.get("lap_duration") is not None
        and lap.get("lap_number") == total_laps
    ]
    if not finishers:
        raise RuntimeError(f"No finishing lap for {info.id}")
    t_end = min(finishers)
    winner = next((row for row in results if row.get("position") == 1), None)
    winner_duration = winner.get("duration") if winner else None
    t0 = lap_start
    if isinstance(winner_duration, (int, float)) and winner_duration > 0:
        # OpenF1 occasionally omits the early lap rows (2025 Miami starts at
        # lap 26), so the earliest lap start is not the race start. The winner's
        # official duration recovers the real start.
        candidate = t_end - timedelta(seconds=float(winner_duration))
        if candidate < t0 - timedelta(seconds=30):
            t0 = candidate
    duration = int(math.ceil((t_end - t0).total_seconds()))
    log(f"window {t0.isoformat()} + {duration}s, {len(driver_numbers)} drivers")

    lap_arrays = build_lap_arrays(
        [lap for lap in laps if (lap.get("lap_number") or 0) <= total_laps],
        t0,
        duration,
        driver_numbers,
    )
    tyre_arrays = build_tyre_arrays(stints, lap_arrays, driver_numbers)
    pos_arrays = position_arrays(positions, t0, duration, driver_numbers)

    times = np.arange(duration + 1, dtype=float)
    location: dict[int, dict[str, Any]] = {}
    for index, driver in enumerate(driver_numbers, start=1):
        log(f"  location {index:02d}/{len(driver_numbers)}: {codes[driver]}")
        try:
            rows = client.get(
                "/v1/location",
                {
                    "session_key": session_key,
                    "driver_number": driver,
                },
            )
            x, y, z, first, last = interpolate_location(rows, t0, times)
        except (requests.HTTPError, RuntimeError) as reason:
            log(f"  no location for {codes[driver]}: {reason}")
            dnf[driver] = True
            x = [0] * (duration + 1)
            y = [0] * (duration + 1)
            z = [0] * (duration + 1)
            first, last = 0.0, -1.0
        location[driver] = {"x": x, "y": y, "z": z, "first": first, "last": last}

    car_arrays: dict[int, dict[str, list[int | None]] | None] = {}
    for index, driver in enumerate(driver_numbers, start=1):
        log(f"  car data {index:02d}/{len(driver_numbers)}: {codes[driver]}")
        try:
            rows = client.get(
                "/v1/car_data",
                {"session_key": session_key, "driver_number": driver},
            )
            car_arrays[driver] = build_car_arrays(rows, t0, duration)
        except requests.HTTPError as reason:
            log(f"  car data unavailable for {codes[driver]}: {reason}")
            car_arrays[driver] = None

    fastest = min(
        (lap for lap in laps if lap.get("lap_duration") and lap["driver_number"] in location),
        key=lambda lap: lap["lap_duration"],
    )
    log(
        f"reference lap: {codes[fastest['driver_number']]} lap {fastest['lap_number']} "
        f"{fastest['lap_duration']}s"
    )
    circuit_key = session.get("circuit_key")
    circuit = get_circuit_info(year=year, circuit_key=circuit_key) if circuit_key else None
    fastest_rows = client.get(
        "/v1/location",
        {"session_key": session_key, "driver_number": fastest["driver_number"]},
    )
    points = track_from_lap(
        fastest_rows,
        fastest["date_start"],
        fastest["lap_duration"],
    )
    track, distances = build_track(points, circuit)

    status_intervals = build_status_intervals(race_control, t0, duration)
    overtakes = detect_overtakes(
        positions,
        t0,
        duration,
        lap_arrays,
        location,
        pits,
        status_intervals,
        track,
        distances,
        codes,
    )
    pit_stops = build_pit_stops(pits, t0, stints, codes, location, duration)

    driver_payload = []
    last_lap_end: dict[int, datetime] = {}
    for lap in laps:
        if lap.get("date_start") and lap.get("lap_duration") is not None:
            end = parse_iso(lap["date_start"]) + timedelta(seconds=lap["lap_duration"])
            driver = lap["driver_number"]
            if driver not in last_lap_end or end > last_lap_end[driver]:
                last_lap_end[driver] = end
    for driver in driver_numbers:
        meta = teams[driver]
        first = max(0.0, location[driver]["first"])
        if dnf.get(driver):
            completed = int(result_info.get(driver, {}).get("number_of_laps") or 0)
            ending = last_lap_end.get(driver)
            if completed <= 0 or ending is None:
                last = 0.0
            else:
                last = min(float(duration), max(0.0, (ending - t0).total_seconds()))
        else:
            last = float(duration)
        payload = {
            "code": codes[driver],
            "number": driver,
            "name": meta["name"],
            "team": meta["team"],
            "color": meta["color"],
            "dnf": dnf.get(driver, False),
            "first": round(first, 2),
            "last": round(last, 2),
            "x": location[driver]["x"],
            "y": location[driver]["y"],
            "z": location[driver]["z"],
            "lap": lap_arrays[driver],
            "pos": pos_arrays[driver],
            "tyre": tyre_arrays[driver],
        }
        car = car_arrays.get(driver)
        if car:
            payload.update(car)
        driver_payload.append(payload)

    meta = {
        "id": info.id,
        "year": year,
        "round": info.round_number,
        "name": info.name,
        "circuitName": session.get("circuit_short_name") or "",
        "country": session.get("country_name") or "",
        "totalLaps": total_laps,
        "file": f"{info.id}.json",
    }

    return {
        "version": 2,
        "meta": meta,
        "time": {
            "start": t0.isoformat(),
            "step": STEP,
            "duration": duration,
            "count": duration + 1,
        },
        "track": track,
        "drivers": driver_payload,
        "pits": pit_stops,
        "overtakes": overtakes,
        "status": status_intervals,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2024)
    parser.add_argument(
        "--races",
        default=DEFAULT_RACES,
        help="Comma-separated race names, or 'all' for every race session",
    )
    parser.add_argument("--out", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    CACHE_DIR.mkdir(exist_ok=True)
    (CACHE_DIR / "fastf1").mkdir(exist_ok=True)
    fastf1.Cache.configure(cache_dir=str(CACHE_DIR / "fastf1"))
    client = OpenF1Client()

    sessions = client.get("/v1/sessions", {"year": args.year, "session_name": "Race"})
    meeting_rows = client.get("/v1/meetings", {"year": args.year})
    meetings = {row["meeting_key"]: row for row in meeting_rows}

    if args.races.strip().lower() == "all":
        queries = [
            session["circuit_short_name"]
            for session in sorted(sessions, key=lambda row: row["date_start"])
            if session.get("circuit_short_name")
        ]
        queries = list(dict.fromkeys(queries))
    else:
        queries = [part.strip() for part in args.races.split(",") if part.strip()]

    args.out.mkdir(parents=True, exist_ok=True)
    races: list[dict[str, Any]] = []
    for query in queries:
        payload = export_race(client, sessions, meetings, query, args.year)
        race_file = args.out / payload["meta"]["file"]
        race_file.write_text(json.dumps(payload, separators=(",", ":")))
        size_mb = race_file.stat().st_size / 1_000_000
        log(
            f"wrote {race_file.relative_to(ROOT)} ({size_mb:.2f} MB), "
            f"{len(payload['overtakes'])} overtakes, {len(payload['pits'])} pits"
        )
        races.append(payload["meta"])

    races.sort(key=lambda race: (-race["year"], race["round"]))
    races_path = args.out / "races.json"
    existing: list[dict[str, Any]] = []
    if races_path.exists():
        try:
            existing = json.loads(races_path.read_text())
        except json.JSONDecodeError:
            existing = []
    merged = {race["id"]: race for race in existing if isinstance(race, dict) and "id" in race}
    for race in races:
        merged[race["id"]] = race
    races = sorted(
        (race for race in merged.values() if (args.out / race["file"]).exists()),
        key=lambda race: (-race["year"], race["round"]),
    )
    races_path.write_text(json.dumps(races, indent=2) + "\n")
    log(f"\nwrote {races_path} with {len(races)} races")


if __name__ == "__main__":
    main()
