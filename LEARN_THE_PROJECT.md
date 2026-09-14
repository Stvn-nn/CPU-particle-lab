# Understand Particle Lab

Start with one particle. The program gives it an identity derived from a random
seed. That identity determines its original position and the path it follows.
With the same seed and starting settings, you get the same experiment again.

## Two parts make the motion

Every visible position is a **path position plus a displacement**.

The path position describes the intended shape. A ring uses a changing angle,
so its particles go around the ring. A sphere changes each particle's longitude
while retaining its latitude. A helix uses a parameter that travels up and back
down a spiral. A cube reflects positions at its boundaries to make free motion.

The displacement records what the pusher did. Pushing moves a particle away from
its path. When it is outside the tool and formation motion is enabled, a spring
pulls its displacement toward zero. Damping reduces the extra velocity, so it
eases back rather than oscillating forever.

Turning off Animate formation stops the underlying path and disables recovery.
You can still push the stationary formation. Pause freezes all update steps;
you can still move the camera or change settings.

## How the pusher works

The mouse selects a point in the camera's view. In Manual mode, the depth slider supplies the
third coordinate. In Auto mode, the app projects current displaced particles
into the camera view and selects the frontmost one within 10 pixels of the
cursor. It refreshes that selection up to 10 times per second; empty space has
no target. The app transforms those coordinates back into the scene.
Particles inside a sphere around that point can be affected. Force points away
from the tool and smoothly decreases toward the edge.

The tool's screen circle is compact. Its radius setting maps to a small screen
size, then converts to scene units. This makes the outline manageable as you
resize or zoom. Color uses actual 3D distance, so a particle can look close in
the image but remain white if it is far in front of or behind the tool.

## What the GPU does

A small program called a shader calculates the next displacement and velocity
for each particle. WebGL transform feedback writes the results directly into
a graphics buffer. The next frame swaps which buffer is read and which is
written. This is called ping-pong buffering.

The browser also draws the particles using a shader. In CPU reference mode,
JavaScript performs the calculations and draws with a 2D canvas projection of
the same 3D points. It is useful for comparison and compatibility.

## What the neural network learned

Python generated examples of local particle states and their next-step results.
The inputs describe displacement, velocity, position relative to the pusher,
push strength, and recovery strength. Training adjusts a small network's weights
to approximate the velocity change over one fixed step.

The model's weights are saved as JSON. The app reads those weights and performs
the same matrix operations in JavaScript, so no Python training package is
needed while using the app.

Every half second, the app samples up to 64 particles, predicts their next
state, and compares that prediction with the actual engine update. RMSE means
root mean square error: a measure of the size of those differences. Smaller
is better. These numbers use arbitrary scene units, not meters.

The model is never in charge of moving the displayed particles. This separates
an imperfect learned approximation from the stable reference animation and
lets you investigate errors without breaking the main scene.

## Which file to read first

1. Read `web/core.js`, starting with `target`. It defines all four shape paths.
2. Read `localInputs` and `nextLocal` in that file to understand the pusher and
   recovery calculation.
3. Compare those functions with the update shader in `web/engine.js`.
4. Read `training/train_model.py` to see how examples, targets, and test data are
   created. Its output is documented in `docs/MODEL_CARD.md`.
5. Read the control handlers in `web/app.js`, then its `frame` function.

A useful first experiment is to use one formation and a fixed seed, push once,
and compare different return speeds. A useful engineering experiment is to
increase particle count while recording real timings, explaining exactly which
parts of the pipeline each measurement includes.
