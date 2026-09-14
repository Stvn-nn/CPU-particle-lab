# Release validation

Validated on 14 September 2026 in a Linux environment using Python, Node.js,
and headless Chromium. See `browser_validation.json` for the executable
integration-check results and `web/models/training_report.json` for training
metrics. The README screenshot was captured from the running application.

## Numerical tests

All 11 tests in `tests/core.test.js` passed. They cover reproducible seeding,
shape geometry and motion, pusher direction and falloff, recovery conditions,
a 60-second scripted extreme-control run, color ordering, model quality gates,
out-of-range rejection, and JavaScript agreement with Python inference fixtures.

## Browser integration

All 38 browser integration checks passed. The suite exercises real controls, particle state readback, all four
shapes, motion and pause, pushing and recovery, maximum indicator radius,
resizable dividers, independent lower-panel scrolling, desktop feed placement,
CSV/JSON/PNG downloads, setup import and invalid-input rejection, experiment
history, CPU fallback, and small-screen document overflow.

A one-step graphics update is compared with the CPU reference for 128 particles
in each of the four shapes, with nonzero displacement and velocity. The maximum
observed state difference was 0.00003310. The acceptance tolerance is 0.0001
because shader arithmetic and transcendental approximations differ from
JavaScript double-precision math. This is a one-step consistency check, not a
claim of identical long-term trajectories on all devices.

## What remains device-dependent

The test browser used software graphics. This validates shader compilation,
buffer updates, rendering, and integration, but **does not measure performance
on a physical GPU**. Timings shown in the screenshot are test-environment
measurements. Browser GPU timer support varies; the app leaves unavailable
measurements blank. Test your actual particle count on the intended computer.

The Windows batch launcher is provided but has not been executed on Windows
in this environment. Its underlying Python server was exercised by the browser
suite. Manual terminal instructions are included as an alternative.

The model passed the documented synthetic-data quality gates. Those results
are separate from application tests and do not guarantee bug-free behavior.
The deterministic engine remains in control even if comparison is disabled
or the model file cannot load.

## Depth-mode update

Manual and automatic depth passed tests in both graphics and CPU modes. Checks
cover front-surface targeting, real displacement when pushing, no target in
empty space, slider restoration, saved depth mode, and older setup compatibility.
A numerical test also verifies displaced positions and camera rotation. Auto
picking adds a periodic state readback and screen-space search; its cost is
recorded in CSV and included in frame time, outside GPU timing queries.
