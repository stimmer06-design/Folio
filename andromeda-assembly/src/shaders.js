import * as THREE from 'three';

export const U = { time: { value: 0 } }; // shared animated uniform

const NOISE = /* glsl */ `
  float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<6;i++){ v+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return v; }
`;

// --------------------------------------------------------------------------
// Deep-space backdrop: nebulae, star field and the Andromeda Galaxy (M31)
// --------------------------------------------------------------------------
export function skyMaterial(galaxyDir = new THREE.Vector3(0.32, 0.28, -0.9)) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uBoost: { value: 0 }, uG: { value: galaxyDir.clone().normalize() } },
    fog: false,
    depthWrite: false,
    side: THREE.BackSide,
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      varying vec3 vDir; uniform float uTime; uniform float uBoost; uniform vec3 uG;
      ${NOISE}
      float h3(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      vec3 stars(vec3 d, float scale, float thresh){
        vec3 g = d*scale; vec3 id = floor(g); vec3 f = fract(g)-0.5;
        float h = h3(id); if(h < thresh) return vec3(0.0);
        vec3 o = vec3(h3(id+3.1), h3(id+7.7), h3(id+1.9))-0.5; float dd = length(f-o*0.6);
        float tw = 0.6 + 0.4*sin(uTime*(1.0+h*3.0) + h*40.0);
        float b = smoothstep(0.12, 0.0, dd) * tw * (h-thresh)/(1.0-thresh) * 3.0;
        vec3 c = mix(vec3(0.7,0.8,1.0), vec3(1.0,0.85,0.7), h3(id+1.3));
        return c*b;
      }
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = mix(vec3(0.003,0.005,0.015), vec3(0.016,0.01,0.035), d.y*0.5+0.5);
        vec2 np = d.xz/(1.2+d.y) + d.y*0.7;
        float n1 = fbm(np*2.4 + vec2(0.0, uTime*0.004));
        float n2 = fbm(np*4.2 - vec2(uTime*0.003, 0.0) + n1);
        col += vec3(0.34,0.12,0.58) * pow(n1, 3.0) * 0.6;
        col += vec3(0.05,0.32,0.52) * pow(n2, 4.0) * 0.65;
        col += vec3(0.6,0.15,0.32) * pow(fbm(np*1.4+7.0), 5.0) * 0.45;
        col += stars(d, 220.0, 0.95);
        col += stars(d, 70.0, 0.975) * 1.6;
        // Andromeda galaxy (gnomonic projection around uG)
        vec3 g = normalize(uG);
        vec3 u = normalize(cross(g, vec3(0.0,1.0,0.0))); vec3 v = cross(u, g);
        float dg = dot(d, g);
        if (dg > 0.25) {
          vec2 q = vec2(dot(d,u), dot(d,v)) / dg;
          float ang = -0.5; mat2 R = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
          q = R*q; q.y /= 0.32; q *= 6.0;
          float r = length(q) + 1e-4; float th = atan(q.y, q.x);
          float arms = pow(0.5 + 0.5*cos(2.0*(th - 2.6*log(r)) + uTime*0.01), 3.0);
          float disc = exp(-r*1.15);
          float dust = smoothstep(0.35, 0.75, fbm(q*3.0 + 4.0)) * smoothstep(0.15, 0.9, r) * (1.0-arms);
          float gl = disc*(0.35 + arms*0.9) - dust*disc*0.55 + fbm(q*6.0)*disc*0.25;
          float core = exp(-r*7.0)*1.6 + exp(-r*22.0)*2.5;
          vec3 gcol = mix(vec3(0.55,0.65,1.0), vec3(0.85,0.7,1.0), smoothstep(0.0,1.0,r));
          col += (gcol * max(gl, 0.0) * 1.2 + vec3(1.0,0.9,0.75)*core) * smoothstep(0.25, 0.45, dg);
        }
        col *= 1.0 + uBoost;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// --------------------------------------------------------------------------
// Ringed gas giant with a cinematic terminator (own sun direction)
// --------------------------------------------------------------------------
export function planetMaterial(bandTex) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: bandTex }, uSun: { value: new THREE.Vector3(0.7, 0.35, 0.6).normalize() }, uTime: U.time },
    fog: false,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 wp=modelMatrix*vec4(position,1.0); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform sampler2D uMap; uniform vec3 uSun; uniform float uTime;
      void main(){
        vec3 band = texture2D(uMap, vec2(vUv.x + uTime*0.002, vUv.y)).rgb;
        float l = dot(normalize(vN), uSun);
        float lit = smoothstep(-0.15, 0.6, l);
        float rim = pow(1.0 - max(dot(normalize(vN), vV), 0.0), 3.0);
        vec3 col = band * lit * 1.25 + vec3(0.9,0.75,0.5) * rim * smoothstep(-0.3, 0.3, l) * 0.6;
        col += band * 0.02;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function ringMaterial(ringTex) {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: ringTex } },
    fog: false, transparent: true, side: THREE.DoubleSide, depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `varying vec3 vP; uniform sampler2D uMap;
      void main(){ float r = length(vP.xy); float t = clamp((r-1.25)/(2.35-1.25), 0.0, 1.0);
        vec4 c = texture2D(uMap, vec2(t, 0.5));
        // planet shadow across the far side of the ring
        float sh = smoothstep(0.85, 1.1, length(vP.xy + vec2(-0.75, 0.0)));
        gl_FragColor = vec4(c.rgb * (0.35 + 0.65*sh), c.a); }`,
  });
}

// --------------------------------------------------------------------------
// Hologram: fresnel rim + moving scanlines (ghost outlines, pads, UI panels)
// --------------------------------------------------------------------------
export function holoMaterial(color = '#67e8f9', opacity = 0.6, { scan = 1, map = null } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uTime: U.time, uScan: { value: scan }, uMap: { value: map }, uHasMap: { value: map ? 1 : 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec2 vUv;
      void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying vec2 vUv;
      uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform float uScan; uniform sampler2D uMap; uniform float uHasMap;
      void main(){
        float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        float scan = 0.75 + 0.25*sin(vW.y*90.0 - uTime*8.0);
        float band = smoothstep(0.0, 0.04, abs(fract(vW.y*1.6 - uTime*0.6) - 0.5) - 0.42);
        float a = (pow(rim, 1.6)*0.9 + 0.12) * mix(1.0, scan, uScan) + band*0.25*uScan;
        vec3 col = uColor;
        if (uHasMap > 0.5) { vec4 t = texture2D(uMap, vUv); col = mix(uColor, t.rgb, 0.85); a = t.a * (0.85 + 0.15*scan); }
        float flick = 0.94 + 0.06*sin(uTime*37.0 + vW.x*3.0);
        gl_FragColor = vec4(col * a * uOpacity * flick, a * uOpacity);
      }`,
  });
}

// --------------------------------------------------------------------------
// Volumetric light shaft (open cone, additive)
// --------------------------------------------------------------------------
export function beamMaterial(color = '#fff1d6', intensity = 0.22) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uTime: U.time, uFlip: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){ vUv=uv; vec4 wp=modelMatrix*vec4(position,1.0); vW=wp.xyz; vN=normalize(mat3(modelMatrix)*normal); vV=normalize(cameraPosition-wp.xyz); gl_Position=projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW; uniform vec3 uColor; uniform float uI; uniform float uTime; uniform float uFlip;
      ${NOISE}
      void main(){
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float edge = pow(facing, 2.2);
        float h = mix(vUv.y, 1.0 - vUv.y, uFlip); // 1 at the light source
        float fall = pow(h, 1.4) * smoothstep(0.0, 0.25, h);
        float dust = 0.75 + 0.25*noise(vW.xz*1.6 + vec2(0.0, uTime*0.1) + vW.y*0.6);
        float a = edge * fall * dust * uI;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
}

// --------------------------------------------------------------------------
// Final cinematic pass: chromatic aberration, vignette, grain, flash, edge glow
// --------------------------------------------------------------------------
export const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0012 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color('#ffffff') },
    uEdge: { value: 0 },
    uEdgeColor: { value: new THREE.Color('#22d3ee') },
    uSat: { value: 1.08 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uAberration; uniform float uVignette; uniform float uGrain;
    uniform float uFlash; uniform vec3 uFlashColor; uniform float uEdge; uniform vec3 uEdgeColor; uniform float uSat;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = length(c);
      vec2 off = c * uAberration * (1.0 + d*2.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float l = dot(col, vec3(0.299,0.587,0.114));
      col = mix(vec3(l), col, uSat);
      // filmic toe lift for the shadows (slightly cool), warm highlights
      col = mix(col, col*vec3(0.95,0.98,1.06), 1.0 - smoothstep(0.0, 0.35, l));
      col *= 1.0 - uVignette * smoothstep(0.35, 0.95, d);
      float g = (h(vUv*vec2(1920.0,1080.0) + fract(uTime*7.0)) - 0.5) * uGrain;
      col += g;
      float edge = smoothstep(0.38, 0.75, d) * uEdge * (0.75 + 0.25*sin(uTime*6.0 + atan(c.y, c.x + 1e-5)*3.0));
      col += uEdgeColor * edge;
      col = mix(col, uFlashColor, uFlash);
      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }`,
};
