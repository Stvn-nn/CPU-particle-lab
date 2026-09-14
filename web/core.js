/* Deterministic shape paths and local dynamics shared with the CPU reference. */
export const DT=1/60;
export const SHAPES=['sphere','cube','ring','helix'];
export const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fract=x=>x-Math.floor(x);
export function makeSeeds(count,seed=731){const a=new Float32Array(count*4);let s=seed>>>0;for(let i=0;i<a.length;i++){s=(Math.imul(s,1664525)+1013904223)>>>0;a[i]=s/4294967296;}return a;}
export function target(seed,shape,phase){const [u,v,w,j]=seed;const tau=Math.PI*2;if(shape===0){let z=2*v-1,r=Math.sqrt(Math.max(0,1-z*z)),a=tau*u+phase*(.32+.15*j);return[.88*r*Math.cos(a),.88*z,.88*r*Math.sin(a)];}if(shape===1){return[u,v,w].map((s,k)=>.8*(1-4*Math.abs(fract(s+phase*(.045+.07*seed[(k+1)%4]))-.5)));}if(shape===2){let a=tau*u+phase*(.45+.12*j),r=.73+.045*Math.cos(tau*v);return[r*Math.cos(a),.045*Math.sin(tau*v),r*Math.sin(a)];}let t=1-Math.abs(2*fract(u+phase*.042)-1),a=t*6*Math.PI;return[(.6+.02*(v-.5))*Math.cos(a),(t-.5)*1.8+.018*(w-.5),(.6+.02*(v-.5))*Math.sin(a)];}
export function localInputs(base,offset,velocity,p){const rel=[base[0]+offset[0]-p.push[0],base[1]+offset[1]-p.push[1],base[2]+offset[2]-p.push[2]];const d=Math.hypot(...rel),near=p.toolVisible&&d<p.radius;const spring=p.moving&&!near?p.recovery:0;const strength=p.pushing&&near?p.strength:0;return{offset,velocity,relative:strength?rel.map(x=>x/p.radius):[0,0,0],strength,spring};}
export function nextLocal(input){const {offset,velocity,relative,strength,spring}=input;const d=Math.hypot(...relative);const f=d>1e-4?Math.max(0,1-d)**2*strength/d:0;const velocityNext=velocity.map((v,k)=>clamp((v+(relative[k]*f-spring*offset[k])*DT)*Math.exp(-4*DT),-3,3));const offsetNext=offset.map((o,k)=>clamp(o+velocityNext[k]*DT,-1.2,1.2));return{offset:offsetNext,velocity:velocityNext};}
export function cpuStep(seeds,state,count,p){for(let i=0;i<count;i++){const at=i*6,base=target(seeds.subarray(i*4,i*4+4),p.shape,p.phase);const input=localInputs(base,Array.from(state.subarray(at,at+3)),Array.from(state.subarray(at+3,at+6)),p),n=nextLocal(input);state.set(n.offset,at);state.set(n.velocity,at+3);}}
export function influenceColor(t){const stops=[[.55,.83,1],[.4,1,.59],[1,.94,.35],[1,.4,.43]],x=clamp(t,0,1)*3,i=Math.min(2,Math.floor(x)),f=x-i;return stops[i].map((v,k)=>v+(stops[i+1][k]-v)*f);}
export function modelFeatures(input){return [...input.offset.map(x=>x/.6),...input.velocity.map(x=>x/2),...input.relative.map(x=>x/1.5),input.strength/18,input.spring/14];}
export function inTrainingRange(input){return input.offset.every(x=>Math.abs(x)<=.6)&&input.velocity.every(x=>Math.abs(x)<=1.5)&&Math.hypot(...input.relative)<=1.5&&input.strength>=0&&input.strength<=18&&input.spring>=0&&input.spring<=14;}
export class LearnedDynamics{
 constructor(data){if(data.version!==1||!data.quality_gate_passed||data.weights.length!==3)throw Error('Unvalidated model file');this.data=data;}
 predict(input){let a=modelFeatures(input);for(let layer=0;layer<this.data.weights.length;layer++){const W=this.data.weights[layer],b=this.data.biases[layer];a=b.map((bias,j)=>{let z=bias;for(let i=0;i<a.length;i++)z+=a[i]*W[i][j];return layer<2?Math.tanh(z):z;});}const v=a.map((x,i)=>input.velocity[i]+.35*x);return{velocity:v,offset:v.map((x,i)=>input.offset[i]+x*DT)};}
}
export const shapeGLSL=`
vec3 target(vec4 s, int shape, float phase){
 const float TAU=6.28318530718;
 if(shape==0){float z=2.0*s.y-1.0;float r=sqrt(max(0.0,1.0-z*z));float a=TAU*s.x+phase*(.32+.15*s.w);return .88*vec3(r*cos(a),z,r*sin(a));}
 if(shape==1){vec3 t=fract(s.xyz+phase*(vec3(.045)+.07*s.yzw));return .8*(vec3(1.0)-4.0*abs(t-vec3(.5)));}
 if(shape==2){float a=TAU*s.x+phase*(.45+.12*s.w);float r=.73+.045*cos(TAU*s.y);return vec3(r*cos(a),.045*sin(TAU*s.y),r*sin(a));}
 float t=1.0-abs(2.0*fract(s.x+phase*.042)-1.0);float a=t*18.8495559215;return vec3((.6+.02*(s.y-.5))*cos(a),(t-.5)*1.8+.018*(s.z-.5),(.6+.02*(s.y-.5))*sin(a));
}`;

// Pick the frontmost displaced particle in a small screen-space cursor aperture.
// Camera-space negative Z is nearer in both renderers. Empty space has no hit.
export function pickParticleDepth(seeds,state,count,shape,phase,camera,x,y,tolerance){
 let best=null;
 for(let i=0;i<count;i++){
  const pos=target(seeds.subarray(i*4,i*4+4),shape,phase);
  for(let k=0;k<3;k++)pos[k]+=state[i*6+k];
  const cx=camera[0]*pos[0]+camera[3]*pos[1]+camera[6]*pos[2];
  const cy=camera[1]*pos[0]+camera[4]*pos[1]+camera[7]*pos[2];
  if((cx-x)**2+(cy-y)**2>tolerance*tolerance)continue;
  const z=camera[2]*pos[0]+camera[5]*pos[1]+camera[8]*pos[2];
  if(Number.isFinite(z)&&(best===null||z<best))best=z;
 }
 return best;
}
