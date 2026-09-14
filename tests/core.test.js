import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DT,makeSeeds,target,localInputs,nextLocal,cpuStep,influenceColor,LearnedDynamics,inTrainingRange,pickParticleDepth} from '../web/core.js';

test('same seed reproduces exactly; changing seed changes the formation',()=>{
 assert.deepEqual(makeSeeds(100,731),makeSeeds(100,731));
 assert.notDeepEqual(makeSeeds(100,731),makeSeeds(100,732));
});
test('sphere paths stay on their surface and actually move',()=>{
 const seeds=makeSeeds(100);for(let i=0;i<100;i++)for(const t of [0,1,10,100,1000])assert.ok(Math.abs(Math.hypot(...target(seeds.subarray(i*4,i*4+4),0,t))-.88)<1e-6);
 assert.notDeepEqual(target(seeds.subarray(0,4),0,0),target(seeds.subarray(0,4),0,1));
});
test('ring stays within torus thickness; helix remains bounded and continuous at turns',()=>{
 const seeds=makeSeeds(80);for(let i=0;i<80;i++)for(const t of [0,.1,5,12,20,100]){const s=seeds.subarray(i*4,i*4+4),ring=target(s,2,t),helix=target(s,3,t);assert.ok(Math.abs(Math.hypot(ring[0],ring[2])-.73)<=.045001);assert.ok(Math.abs(ring[1])<=.045001);assert.ok(Math.abs(helix[1])<=.91);assert.ok(Math.abs(Math.hypot(helix[0],helix[2])-.6)<=.011);const next=target(s,3,t+.001);assert.ok(Math.hypot(...next.map((v,k)=>v-helix[k]))<.002);}
});
test('cube trajectories stay inside their boundaries',()=>{
 const seeds=makeSeeds(100);for(let t=0;t<100;t+=.37)for(let i=0;i<100;i++)assert.ok(target(seeds.subarray(i*4,i*4+4),1,t).every(v=>Math.abs(v)<=.800001));
});
test('push points away from the tool and fades to zero at its edge',()=>{
 const v=[0,0,0],o=[0,0,0];const near=nextLocal({offset:o,velocity:v,relative:[.2,0,0],strength:18,spring:0}),far=nextLocal({offset:o,velocity:v,relative:[.9,0,0],strength:18,spring:0});assert.ok(near.velocity[0]>far.velocity[0]);assert.ok(far.velocity[0]>0);assert.equal(near.velocity[1],0);const edge=nextLocal({offset:o,velocity:v,relative:[1,0,0],strength:18,spring:0});assert.deepEqual(edge.velocity,[0,0,0]);
});
test('recovery only acts outside the pusher while shape motion is enabled',()=>{
 const common={push:[0,0,0],radius:.5,recovery:8,moving:true,pushing:false,toolVisible:true,strength:9};const off=[.2,0,0],vel=[0,0,0];assert.equal(localInputs([0,0,0],off,vel,common).spring,0);assert.equal(localInputs([1,0,0],off,vel,common).spring,8);assert.equal(localInputs([1,0,0],off,vel,{...common,moving:false}).spring,0);let state={offset:[.5,-.3,.2],velocity:[0,0,0],relative:[0,0,0],strength:0,spring:8};for(let i=0;i<600;i++)state={...state,...nextLocal(state)};assert.ok(Math.hypot(...state.offset)<1e-6);
});
test('extreme controls remain finite during a 60 second scripted run',()=>{
 const n=48,seeds=makeSeeds(n),state=new Float32Array(n*6);for(let i=0;i<3600;i++){const p={shape:Math.floor(i/900),phase:i*DT*2,push:[Math.sin(i*.1)*.5,0,0],radius:.2,strength:18,recovery:14,toolVisible:i%300<180,pushing:i%300<150,moving:true};cpuStep(seeds,state,n,p);}assert.ok(state.every(Number.isFinite));for(let i=0;i<n;i++){assert.ok(state.subarray(i*6,i*6+3).every(v=>Math.abs(v)<=1.20001));assert.ok(state.subarray(i*6+3,i*6+6).every(v=>Math.abs(v)<=3.00001));}
});
test('distance palette orders blue, green, yellow, red',()=>{
 assert.deepEqual(influenceColor(0),[.55,.83,1]);assert.deepEqual(influenceColor(1/3),[.4,1,.59]);assert.deepEqual(influenceColor(2/3),[1,.94,.35]);const near=influenceColor(1);assert.ok(near[0]>.99&&near[1]<.5&&near[2]<.5);
});
test('bundled model passes independent quality gates and rejects out of range state',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../web/models/dynamics.json',import.meta.url)));const model=new LearnedDynamics(data);assert.ok(data.quality_gate_passed);assert.ok(data.held_out_test.velocity_rmse<data.held_out_test.unchanged_velocity_rmse*.5);assert.ok(data.recovery_rollout.max_position_rmse<.08);
 const state={offset:[.1,-.1,.15],velocity:[.2,0,-.1],relative:[.2,.2,0],strength:9,spring:0};assert.ok(inTrainingRange(state));assert.ok(!inTrainingRange({...state,offset:[9,0,0]}));const predicted=model.predict(state),actual=nextLocal(state);assert.ok(predicted.offset.every(Number.isFinite));assert.ok(Math.hypot(...predicted.velocity.map((v,i)=>v-actual.velocity[i]))<.05);
});
test('JavaScript inference agrees with Python fixtures',()=>{
 const model=new LearnedDynamics(JSON.parse(fs.readFileSync(new URL('../web/models/dynamics.json',import.meta.url))));const cases=JSON.parse(fs.readFileSync(new URL('./model_fixtures.json',import.meta.url)));for(const c of cases){const got=model.predict(c.input);for(let i=0;i<3;i++)assert.ok(Math.abs(got.velocity[i]-c.predicted_velocity[i])<1e-9);}
});

test('auto depth picks the front surface, displaced positions, and empty space',()=>{
 const seeds=new Float32Array([0,.5,0,0,.5,.5,0,0]);
 const state=new Float32Array(12),identity=[1,0,0,0,1,0,0,0,1];
 // Move the two known sphere particles onto the same view ray at opposite depths.
 for(let i=0;i<2;i++){const p=target(seeds.subarray(i*4,i*4+4),0,0);state[i*6]=-p[0];state[i*6+2]=(i===0?.5:-.5)-p[2];}
 assert.ok(Math.abs(pickParticleDepth(seeds,state,2,0,0,identity,0,0,.02)+.5)<1e-6);
 assert.equal(pickParticleDepth(seeds,state,2,0,0,identity,2,2,.02),null);
 // A half-turn flips which particle is nearest.
 state[2]=.8;
 assert.ok(Math.abs(pickParticleDepth(seeds,state,2,0,0,[-1,0,0,0,1,0,0,0,-1],0,0,.02)+.8)<1e-6);
});
