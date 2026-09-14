import {DT,makeSeeds,target,cpuStep,influenceColor,shapeGLSL} from './core.js';
const vertexHeader=`#version 300 es
precision highp float;
layout(location=0) in vec4 seed;
layout(location=1) in vec3 offset;
layout(location=2) in vec3 velocity;
uniform int shape;uniform float phase;uniform vec3 push;uniform float radius;uniform bool toolVisible;
${shapeGLSL}\n`;
const updateShader=vertexHeader+`
uniform bool pushing;uniform bool moving;uniform float strength;uniform float recovery;
out vec3 nextOffset;out vec3 nextVelocity;
void main(){vec3 pos=target(seed,shape,phase)+offset;vec3 relative=pos-push;float d=length(relative);bool nearTool=toolVisible&&d<radius;vec3 force=vec3(0);
 if(pushing&&nearTool&&d>radius*.0001){force=(relative/d)*pow(1.0-d/radius,2.0)*strength;}
 float spring=moving&&!nearTool?recovery:0.0;
 nextVelocity=clamp((velocity+(force-spring*offset)*${DT})*${Math.exp(-4*DT)},vec3(-3),vec3(3));
 nextOffset=clamp(offset+nextVelocity*${DT},vec3(-1.2),vec3(1.2));gl_Position=vec4(0,0,0,1);}`;
const renderShader=vertexHeader+`
uniform mat3 camera;uniform vec2 viewport;uniform float zoom;uniform vec2 pan;uniform float pointSize;
out vec4 particleColor;
vec3 heat(float t){t=clamp(t,0.0,1.0)*3.0;if(t<1.0)return mix(vec3(.55,.83,1),vec3(.4,1,.59),t);if(t<2.0)return mix(vec3(.4,1,.59),vec3(1,.94,.35),t-1.0);return mix(vec3(1,.94,.35),vec3(1,.4,.43),t-2.0);}
void main(){vec3 pos=target(seed,shape,phase)+offset;vec3 c=camera*pos;float unit=min(viewport.x,viewport.y)*.36*zoom;vec2 xy=c.xy*unit+pan;gl_Position=vec4(2.0*xy/viewport,clamp(c.z/8.0,-.99,.99),1);gl_PointSize=max(1.0,pointSize*(1.0-c.z*.12));float d=distance(pos,push);vec3 col=vec3(1);if(toolVisible&&d<radius)col=heat(1.0-d/radius);particleColor=vec4(col,clamp(.82-c.z*.12,.45,.95));}`;
const fragment=`#version 300 es
precision highp float;in vec4 particleColor;out vec4 color;void main(){float d=length(gl_PointCoord-vec2(.5));if(d>.5)discard;float edge=1.0-smoothstep(.32,.5,d);color=vec4(particleColor.rgb,particleColor.a*edge);}`;
const emptyFragment=`#version 300 es
precision highp float;out vec4 color;void main(){color=vec4(0);}`;
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(log);}return s;}
function program(gl,v,f,feedback=false){const vs=shader(gl,gl.VERTEX_SHADER,v),fs=shader(gl,gl.FRAGMENT_SHADER,f),p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);if(feedback)gl.transformFeedbackVaryings(p,['nextOffset','nextVelocity'],gl.INTERLEAVED_ATTRIBS);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
export class ParticleEngine{
 constructor(canvas,{forceCPU=false}={}){this.canvas=canvas;this.count=0;this.current=0;this.gpuMs=null;this.lastGpuAt=0;this.timerPending=[];this.timerCounter=0;this.isCPU=forceCPU;this.gl=null;
 if(!forceCPU)this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,preserveDrawingBuffer:true});
 if(this.gl){const gl=this.gl;this.updateProgram=program(gl,updateShader,emptyFragment,true);this.renderProgram=program(gl,renderShader,fragment);this.tf=gl.createTransformFeedback();this.timer=gl.getExtension('EXT_disjoint_timer_query_webgl2');this.uniforms=new Map();this.buffers=[];this.vaos=[];this.seedBuffer=null;this.label='WebGL compute';}
 else{this.isCPU=true;this.ctx=canvas.getContext('2d');if(!this.ctx)throw Error('No available graphics context');this.label='CPU reference';}
 }
 resize(){const rect=this.canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);this.dpr=dpr;this.w=Math.max(1,Math.round(rect.width*dpr));this.h=Math.max(1,Math.round(rect.height*dpr));if(this.canvas.width!==this.w||this.canvas.height!==this.h){this.canvas.width=this.w;this.canvas.height=this.h;}if(this.gl)this.gl.viewport(0,0,this.w,this.h);}
 configure(count,seed=731){this.count=count;this.seeds=makeSeeds(count,seed);this.state=new Float32Array(count*6);this.current=0;if(!this.gl)return;const gl=this.gl;this.buffers.forEach(b=>gl.deleteBuffer(b));this.vaos.forEach(v=>gl.deleteVertexArray(v));if(this.seedBuffer)gl.deleteBuffer(this.seedBuffer);this.seedBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.seedBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.seeds,gl.STATIC_DRAW);this.buffers=[];this.vaos=[];for(let i=0;i<2;i++){let buf=gl.createBuffer();this.buffers.push(buf);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.bufferData(gl.ARRAY_BUFFER,this.state,gl.DYNAMIC_COPY);const vao=gl.createVertexArray();this.vaos.push(vao);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.seedBuffer);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,4,gl.FLOAT,false,16,0);gl.bindBuffer(gl.ARRAY_BUFFER,buf);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,3,gl.FLOAT,false,24,12);}gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);}
 uniform(pr,name,fn,value){const gl=this.gl;let key=pr===this.updateProgram?'u:':'r:';key+=name;let loc=this.uniforms.get(key);if(loc===undefined){loc=gl.getUniformLocation(pr,name);this.uniforms.set(key,loc);}if(loc!==null)gl[fn](loc,value);}
 common(pr,p){const gl=this.gl;gl.useProgram(pr);this.uniform(pr,'shape','uniform1i',p.shape);this.uniform(pr,'phase','uniform1f',p.phase);this.uniform(pr,'push','uniform3fv',p.push);this.uniform(pr,'radius','uniform1f',p.radius);this.uniform(pr,'toolVisible','uniform1i',p.toolVisible?1:0);}
 beginTimer(){if(!this.gl||!this.timer||this.timerPending.length>=4||++this.timerCounter%6)return;this.activeTimer=this.gl.createQuery();this.gl.beginQuery(this.timer.TIME_ELAPSED_EXT,this.activeTimer);}
 endTimer(){if(this.activeTimer){this.gl.endQuery(this.timer.TIME_ELAPSED_EXT);this.timerPending.push(this.activeTimer);this.activeTimer=null;}}
 pollTimer(){if(!this.gl||!this.timer)return;const gl=this.gl;if(gl.getParameter(this.timer.GPU_DISJOINT_EXT)){this.timerPending.forEach(q=>gl.deleteQuery(q));this.timerPending=[];this.gpuMs=null;return;}while(this.timerPending.length&&gl.getQueryParameter(this.timerPending[0],gl.QUERY_RESULT_AVAILABLE)){const q=this.timerPending.shift();this.gpuMs=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;this.lastGpuAt=performance.now();gl.deleteQuery(q);}}
 step(p){if(!this.gl){cpuStep(this.seeds,this.state,this.count,p);return;}const gl=this.gl,pr=this.updateProgram;this.common(pr,p);this.uniform(pr,'pushing','uniform1i',p.pushing?1:0);this.uniform(pr,'moving','uniform1i',p.moving?1:0);this.uniform(pr,'strength','uniform1f',p.strength);this.uniform(pr,'recovery','uniform1f',p.recovery);gl.bindVertexArray(this.vaos[this.current]);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,this.tf);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,this.buffers[1-this.current]);gl.enable(gl.RASTERIZER_DISCARD);gl.beginTransformFeedback(gl.POINTS);gl.drawArrays(gl.POINTS,0,this.count);gl.endTransformFeedback();gl.disable(gl.RASTERIZER_DISCARD);gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER,0,null);gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK,null);gl.bindVertexArray(null);this.current=1-this.current;}
 draw(p){if(!this.gl){this.drawCPU(p);return;}const gl=this.gl,pr=this.renderProgram;gl.clearColor(.0235,.0235,.0235,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);this.common(pr,p);this.uniform(pr,'viewport','uniform2fv',[this.w,this.h]);this.uniform(pr,'zoom','uniform1f',p.zoom);this.uniform(pr,'pan','uniform2fv',p.pan.map(x=>x*this.dpr));this.uniform(pr,'pointSize','uniform1f',p.pointSize*this.dpr);const loc=gl.getUniformLocation(pr,'camera');gl.uniformMatrix3fv(loc,false,p.camera);gl.bindVertexArray(this.vaos[this.current]);gl.drawArrays(gl.POINTS,0,this.count);gl.bindVertexArray(null);}
 drawCPU(p){const ctx=this.ctx,w=this.w,h=this.h,unit=Math.min(w,h)*.36*p.zoom,m=p.camera;ctx.fillStyle='#060606';ctx.fillRect(0,0,w,h);for(let i=0;i<this.count;i++){let pos=target(this.seeds.subarray(i*4,i*4+4),p.shape,p.phase);for(let k=0;k<3;k++)pos[k]+=this.state[i*6+k];let c=[0,1,2].map(k=>m[k]*pos[0]+m[k+3]*pos[1]+m[k+6]*pos[2]);let col=[1,1,1],d=Math.hypot(...pos.map((v,k)=>v-p.push[k]));if(p.toolVisible&&d<p.radius)col=influenceColor(1-d/p.radius);ctx.fillStyle=`rgba(${col.map(v=>Math.round(v*255)).join(',')},${Math.max(.45,Math.min(.95,.82-c[2]*.12))})`;ctx.beginPath();ctx.arc(w/2+c[0]*unit+p.pan[0]*this.dpr,h/2-c[1]*unit-p.pan[1]*this.dpr,Math.max(.5,p.pointSize*this.dpr*.4*(1-c[2]*.12)),0,Math.PI*2);ctx.fill();}}
 sample(n=64){n=Math.min(n,this.count);if(!this.gl)return this.state.slice(0,n*6);const out=new Float32Array(n*6),gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[this.current]);gl.getBufferSubData(gl.ARRAY_BUFFER,0,out);gl.bindBuffer(gl.ARRAY_BUFFER,null);return out;}
 allocatedBytes(){return this.count*(this.gl?16+24*2:16+24);}
 dispose(){if(!this.gl)return;const gl=this.gl;this.buffers.forEach(b=>gl.deleteBuffer(b));this.vaos.forEach(v=>gl.deleteVertexArray(v));this.timerPending.forEach(q=>gl.deleteQuery(q));gl.deleteBuffer(this.seedBuffer);gl.deleteTransformFeedback(this.tf);gl.deleteProgram(this.updateProgram);gl.deleteProgram(this.renderProgram);}
}
