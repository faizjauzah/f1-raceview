# One-second keyframes with client interpolation

Frames are stored at 1 s cadence rather than the source 3.7 Hz. A 0.5 s payload would roughly double the file to 5–8 MB per race, while 1 s keeps each race under the 4 MB validation limit and still looks continuous because the client interpolates positions between adjacent frames. The accepted cost is that very fast direction changes are approximated by a linear segment between keyframes.
