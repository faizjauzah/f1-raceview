# Car telemetry inside the race payload

The follow camera needs car speed, gear, throttle, brake, and DRS at the current playback time. Because the app is static, the exporter fetches OpenF1's car feed and resamples it onto the same one-second frames as positions, adding five integer arrays per driver. RPM and gap are deliberately omitted: RPM adds little at this scale, and gap comes from a separate feed with a different cadence that would break the one-second frame contract. Missing and sentinel samples become null, and a driver with no usable running telemetry gets no car arrays rather than fabricated values.

The raw JSON cap rises from 4 MB to 6 MB because the five arrays add roughly 1.3–1.6 MB per race; gzip growth is about 0.3 MB. Deriving speed from positions was rejected: it cannot produce gear, throttle, brake, or DRS, and it is noisy at one-second resolution.
