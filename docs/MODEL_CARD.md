# Local Dynamics MLP — model card

## Purpose

This small supervised neural network predicts one local particle displacement
step. Its predictions are compared with sampled engine results in the live
panel. The deterministic engine controls the visible particles. The model
neither controls the simulation nor generates chat messages.

## Training and evaluation

Python generated 100,000 synthetic transitions from the same damped spring and
pusher equations used by the simulation, using seed 1701. A two-hidden-layer
MLP (11 → 48 → 48 → 3, tanh activations) trained for 165 epochs with Adam.
15% of the training set was reserved for internal early stopping. Separate
12,000-example validation and 16,000-example test sets used independent seeds
2402 and 3503. These sets share the training distribution; they do not establish
accuracy on different physical systems.

| Held-out test measure | Result |
| --- | ---: |
| Velocity RMSE, per coordinate | 0.006869 scene units/second |
| Unchanged-velocity baseline RMSE | 0.060139 scene units/second |
| One-step position RMSE, per coordinate | 0.00011448 scene units |
| 95th percentile velocity vector error | 0.018372 scene units/second |
| Maximum recovery-rollout position RMSE | 0.014710 scene units |

The recovery evaluation ran 128 scenarios for 180 fixed steps (3 simulated
seconds), with seed 4604. It tests unforced recovery at spring strength 8;
it does not establish general long-term accuracy under sustained pushing.

Release gates require finite predictions, test velocity RMSE below 0.025,
at least 50% improvement over the unchanged-velocity baseline, and maximum
recovery-rollout RMSE below 0.08. This candidate passed. The unrounded report
is in `web/models/training_report.json`.

## Inputs and output

Inputs are displacement (3), velocity (3), pusher-relative position divided by
radius (3), effective pusher strength, and effective spring strength. Features
are scaled by 0.6, 2, 1.5, 18, and 14 respectively. The three output values
represent velocity change divided by 0.35. Browser inference adds that change
to the current velocity, then integrates position with a 1/60-second step.

The live comparison uses up to 64 particles every half second. It skips inputs
outside the supported range: absolute displacement at most 0.6 per axis,
absolute velocity at most 1.5 per axis, relative-distance norm at most 1.5,
pusher strength 0–18, and spring strength 0–14. The interface shows actual
sample error and inference time. Quiet states can have small approximation
errors even when the deterministic engine is stationary.

## Limits and reproducibility

This is a learned approximation of a deliberately simple equation, not a
scientific fluid or collision model. The exact equation is cheaper and more
reliable for controlling this particular simulation; the learned surrogate
exists to make approximation error observable and reproducible. No speedup
claim is made. Repeated learned predictions can accumulate drift. Training
cannot guarantee that an application is bug-free.

Training uses generated numeric data, with no personal or externally collected
data. The bundled weights run locally without accounts or API keys. Run
`python training/train_model.py` after installing the optional training
requirements to reproduce the pipeline. Package versions and CPU arithmetic
may change exact fitted weights. Failed candidates do not replace the release
model. Numerical inference fixtures in `tests/model_fixtures.json` test the
bundled weights; regenerate those fixtures if replacing the model.
