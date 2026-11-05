// Cinematic post-processing: GTAO (ultra) → bloom → tone map → grade/grain/aberration
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FinalShader } from './shaders.js';

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    const w = innerWidth, h = innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, w, h);
    this.gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.gtao.blendIntensity = 0.85;
    // transparent / additive meshes must not occlude ambient occlusion
    const origRender = this.gtao.render.bind(this.gtao);
    const hidden = [];
    this.gtao.render = (...args) => {
      scene.traverseVisible((o) => {
        if ((o.isMesh || o.isSprite) && o.material && (o.material.transparent || o.userData.noAO)) {
          hidden.push(o);
        }
      });
      for (const o of hidden) o.visible = false;
      origRender(...args);
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
    };
    // the beauty pass must still contain the hidden transparents: GTAO renders its own
    // normal/depth pass internally, so we only hide them during that call (above).
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.6, 0.82);
    this.output = new OutputPass();
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.gtao);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.final);
    this.U = this.final.uniforms;
    this.flash = 0;
    this.edge = 0;
    this.edgeTarget = 0;
    this.baseBloom = 0.6;
  }

  setQuality(q) {
    this.quality = q;
    this.gtao.enabled = q === 'ultra';
    this.bloom.enabled = q !== 'low';
    this.U.uGrain.value = q === 'low' ? 0 : 0.035;
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  pulse(color = '#ffffff', amt = 0.35) {
    this.U.uFlashColor.value.set(color);
    this.flash = Math.max(this.flash, amt);
  }

  setEdge(amt, color) {
    this.edgeTarget = amt;
    if (color) this.U.uEdgeColor.value.set(color);
  }

  render(dt, t) {
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.edge += (this.edgeTarget - this.edge) * Math.min(1, dt * 3);
    this.U.uFlash.value = this.flash;
    this.U.uEdge.value = this.edge;
    this.U.uTime.value = t;
    this.bloom.strength = this.baseBloom + this.edge * 0.5 + this.flash * 0.8;
    if (this.quality === 'low') this.renderer.render(this.scene, this.camera);
    else this.composer.render(dt);
  }
}
