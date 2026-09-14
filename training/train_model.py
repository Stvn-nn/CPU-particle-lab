"""Train a small supervised surrogate for local particle displacement dynamics.

The learned model is evaluated beside the deterministic engine, never in control
of it. Run from any directory: python training/train_model.py
"""
import os
for key in ('OMP_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'MKL_NUM_THREADS'):
    os.environ.setdefault(key, '1')
import argparse
import json
import time
from pathlib import Path
import numpy as np
from sklearn.neural_network import MLPRegressor
from threadpoolctl import threadpool_limits

ROOT = Path(__file__).resolve().parents[1]
DT = 1 / 60
DAMPING = np.exp(-4 * DT)


def transition(offset, velocity, relative, strength, spring):
    distance = np.linalg.norm(relative, axis=1, keepdims=True)
    direction = relative / np.maximum(distance, 1e-4)
    force = direction * np.maximum(0, 1 - distance) ** 2 * strength
    force[distance[:, 0] < 1e-4] = 0
    next_velocity = (velocity + (force - spring * offset) * DT) * DAMPING
    return next_velocity


def features(offset, velocity, relative, strength, spring):
    return np.concatenate((offset / .6, velocity / 2, relative / 1.5,
                           strength / 18, spring / 14), axis=1)


def dataset(n, seed):
    rng = np.random.default_rng(seed)
    offset = rng.uniform(-.6, .6, (n, 3))
    velocity = rng.uniform(-1.5, 1.5, (n, 3))
    direction = rng.normal(size=(n, 3))
    direction /= np.maximum(np.linalg.norm(direction, axis=1, keepdims=True), 1e-8)
    relative = direction * rng.uniform(.01, 1.5, (n, 1))
    strength = rng.uniform(0, 18, (n, 1))
    spring = rng.uniform(3, 14, (n, 1))
    pushing = rng.random(n) < .65
    strength[~pushing] = 0
    relative[~pushing] = 0
    spring[pushing] = 0
    spring[rng.random(n) < .12] = 0
    # Include quiet states and small displacements typical of actual runs.
    quiet = rng.random(n) < .25
    offset[quiet] *= .05
    velocity[quiet] *= .05
    expected = transition(offset, velocity, relative, strength, spring)
    X = features(offset, velocity, relative, strength, spring)
    Y = (expected - velocity) / .35
    return X, Y, (offset, velocity, relative, strength, spring)


def predict(model, state):
    offset, velocity, relative, strength, spring = state
    return velocity + model.predict(features(*state)) * .35


def metrics(model, n, seed):
    X, Y, state = dataset(n, seed)
    expected = transition(*state)
    predicted = state[1] + model.predict(X) * .35
    error = np.linalg.norm(predicted - expected, axis=1)
    baseline = np.linalg.norm(state[1] - expected, axis=1)
    return dict(samples=n, seed=seed, velocity_rmse=float(np.sqrt(np.mean((predicted-expected)**2))),
                velocity_error_p95=float(np.percentile(error, 95)),
                one_step_position_rmse=float(np.sqrt(np.mean(((predicted-expected)*DT)**2))),
                unchanged_velocity_rmse=float(np.sqrt(np.mean((state[1]-expected)**2))),
                finite=bool(np.isfinite(predicted).all()))


def rollout_metrics(model):
    rng = np.random.default_rng(4604)
    off = rng.uniform(-.18,.18,(128,3)); vel = rng.uniform(-.2,.2,(128,3))
    learned_off=off.copy(); learned_vel=vel.copy()
    spring=np.full((128,1),8.0); strength=np.zeros((128,1)); relative=np.zeros((128,3))
    errors=[]; finite=True
    for _ in range(180):
        vel=transition(off,vel,relative,strength,spring); off+=vel*DT
        learned_vel=predict(model,(learned_off,learned_vel,relative,strength,spring))
        learned_off+=learned_vel*DT
        finite = finite and bool(np.isfinite(learned_off).all())
        errors.append(float(np.sqrt(np.mean((learned_off-off)**2))))
    return dict(scenarios=128,steps=180,seconds=3,seed=4604,
                final_position_rmse=errors[-1],max_position_rmse=max(errors),finite=finite)


def main():
    parser=argparse.ArgumentParser(); parser.add_argument('--samples',type=int,default=100000)
    parser.add_argument('--epochs',type=int,default=180); args=parser.parse_args()
    if args.samples<1000 or args.epochs<1: parser.error('Use at least 1000 samples and 1 epoch.')
    start=time.perf_counter()
    with threadpool_limits(limits=1):
        X,Y,_=dataset(args.samples,1701)
        model=MLPRegressor(hidden_layer_sizes=(48,48),activation='tanh',solver='adam',
            batch_size=512,learning_rate_init=.002,max_iter=args.epochs,early_stopping=True,
            validation_fraction=.15,n_iter_no_change=18,tol=1e-6,random_state=1701)
        print(f'Training on {args.samples:,} synthetic transitions...',flush=True)
        model.fit(X,Y)
        validation=metrics(model,12000,2402)
        test=metrics(model,16000,3503)
        rollout=rollout_metrics(model)
    passed=test['finite'] and rollout['finite'] and test['velocity_rmse']<.025 and test['velocity_rmse']<test['unchanged_velocity_rmse']*.5 and rollout['max_position_rmse']<.08
    report=dict(model='Local Dynamics MLP',version=1,architecture=[11,48,48,3],activation='tanh',
        training_samples=args.samples,internal_validation_fraction=.15,training_seed=1701,
        epochs=int(model.n_iter_),training_seconds=round(time.perf_counter()-start,2),
        validation=validation,held_out_test=test,recovery_rollout=rollout,quality_gate_passed=bool(passed),
        quality_gate=dict(max_velocity_rmse=.025,max_recovery_rollout_rmse=.08,improvement_over_unchanged_velocity='at least 50 percent'),
        limits=['Synthetic local displacement dynamics, not a general physics model.',
                'One fixed step is 1/60 second. No particle-particle collisions.',
                'Model is comparison-only. The deterministic engine controls motion.',
                'Browser hardware performance must be measured on the target machine.',
                'Predictions outside training ranges are skipped, not trusted.'])
    if not passed:
        print(json.dumps(report,indent=2)); raise SystemExit('Model did not pass the quality gate; no release model written.')
    dest=ROOT/'web'/'models';dest.mkdir(parents=True,exist_ok=True)
    payload=dict(**report,weights=[a.tolist() for a in model.coefs_],biases=[a.tolist() for a in model.intercepts_],
                 feature_order=['offset_x/.6','offset_y/.6','offset_z/.6','velocity_x/2','velocity_y/2','velocity_z/2','relative_x/1.5','relative_y/1.5','relative_z/1.5','strength/18','spring/14'],output='velocity_delta / .35')
    (dest/'dynamics.json').write_text(json.dumps(payload,separators=(',',':')))
    (dest/'training_report.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2),flush=True)

if __name__=='__main__':main()
