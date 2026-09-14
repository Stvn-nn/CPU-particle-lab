# Particle Lab

An interactive 3D particle simulator built with Python, JavaScript, and WebGL. Users can explore moving formations, push particles in real time, and observe performance measurements alongside predictions from a trained neural network.

## Project Overview

Particle Lab explores graphics programming, simulation, and machine learning through an interactive application.

The project combines a graphics-based particle engine, a CPU reference implementation, and a learned model that compares its predictions against actual simulation results.

## Features

- **Four 3D formations:** Sphere, cube, ring, and helix, each with its own motion pattern.
- **Interactive pusher:** Adjust push strength and radius to displace nearby particles.
- **Manual and automatic depth:** Set depth with a slider or automatically target particles beneath the cursor.
- **Distance-based colors:** Nearby particles transition from baby blue through green and yellow to light red. Unaffected particles remain white.
- **Gradual recovery:** Displaced particles return to their moving paths when outside the pusher’s range and formation motion is enabled.
- **Camera controls:** Orbit, pan, and zoom to explore each formation.
- **Adjustable layout:** Resize the control menu and simulation area. Scroll through performance information while keeping the simulation visible.
- **Live measurements:** View frame rate, simulation timing, particle-buffer allocation, and GPU timing when supported.
- **Experiment tools:** Save and load setups, export performance data as CSV, capture screenshots, and record local experiment snapshots.

## Machine Learning Component

A small neural network was trained using a dataset of 100,000 synthetic particle transitions.

The model predicts the next local displacement step for sampled particles. The application compares those predictions with the simulation and displays the resulting error.

The deterministic engine controls the visible particles. The model provides a measurable approximation for comparison, rather than controlling the animation.

## Technologies

| Technology | Purpose |
| --- | --- |
| Python | Local application server and model training |
| JavaScript | Interface, CPU simulation, and model inference |
| WebGL 2 / GLSL | Particle updates and rendering |
| HTML / CSS | Application layout and controls |
| NumPy / scikit-learn | Training data generation and neural network training |

## Getting Started

### Requirements

- Python 3.10 or newer
- A modern desktop browser

The trained model is included. No API key, account, or additional Python packages are required to run the application.

### Windows

1. Download and extract the project ZIP.
2. Open the `particle_lab` folder.
3. Double-click `START_WINDOWS.bat`.
4. Keep the terminal open while using the application.

### Terminal

From the project folder, run:

```bash
python app.py
```
Or
```bash
py -3 app.py
```
Press **Ctrl+C** in the terminal to stop the application.

## Testing and Scope

The project includes numerical and browser interaction tests covering particle motion, pushing, recovery, depth selection, saved setups, and interface behavior.

Graphics tests used a software renderer. Performance on a physical GPU depends on the computer and browser configuration.

The simulation uses shape paths and damped displacement dynamics. It does not implement particle collisions or a scientific fluid solver.

## In Development

These changes are implemented in the working version but still need final validation and packaging:

- An adjustable slowdown field that remains active while using the pusher.
- Thicker helix formations.
- An expanded zoom range of up to 400%.
