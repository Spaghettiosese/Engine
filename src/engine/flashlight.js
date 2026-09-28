// Flashlight: a hand-held spot light with a real beam pattern (hot centre, reflector ring,
// spill), photometric output in lumens, a volumetric beam (through the renderer's
// volumetric pass), a battery that drains, and the flicker of a dying battery. aim() points
// the beam; attach the node to a hand with character.attach() or place it anywhere.
import { Node, Light, Material } from './scene.js';
import { Kit } from './architecture.js';
import { quat, vec3, mat4 } from './math.js';

export class Flashlight extends Node {
  constructor({ lumens = 650, angle = 20, range = 30, color = '#fff1d8', battery = 1, drain = 1 / 300, model = true } = {}) {
    super('Flashlight');
    this.beam = new Light('spot', { color, angle, innerAngle: angle * 0.3, range, profile: 'flashlight', physical: true, lumens });
    this.beam.name = 'Flashlight beam';
    this.beamPivot = new Node('Beam pivot'); this.beamPivot.add(this.beam);
    this.add(this.beamPivot);
    this.lumens = lumens; this.on = false; this.battery = battery; this.drain = drain;
    this._flick = 0; this._dead = 0;
    if (model) {
      // barrel along +Z, lens at the front (like the revolver, +Z forward)
      const k = new Kit({});
      const body = new Material({ name: 'Flashlight body', color: '#262a30', metallic: 0.8, roughness: 0.35, pattern: 'metal', patternScale: 3 });
      this.lensMat = new Material({ name: 'Flashlight lens', color: '#fff4dc', emissive: '#fff1d8', emissiveStrength: 0, roughness: 0.1 });
      k.cyl(body, [0, 0, 0.02], 0.016, 0.16, [90, 0, 0], 16);
      k.cyl(body, [0, 0, 0.115], 0.024, 0.04, [90, 0, 0], 16, 0.017);
      k.cyl(this.lensMat, [0, 0, 0.1355], 0.021, 0.002, [90, 0, 0], 16);
      k.box(body, [0, 0.017, 0.03], [0.008, 0.006, 0.02]); // switch
      this.add(k.toNode('Flashlight model'));
    }
    // the light shines down its local -Y, so turn the pivot to shine along +Z
    this.beamPivot.position.set([0, 0, 0.14]);
    quat.fromEuler(this.beamPivot.rotation, -90, 0, 0); // light's -Y -> +Z
    this.beam.intensity = 0;
  }
  toggle(on = !this.on) { this.on = on && this.battery > 0; return this.on; }
  recharge(amount = 1) { this.battery = Math.min(1, this.battery + amount); }
  // Point the beam at a world position (the node's world transform is re-derived from its parent).
  aim(target) {
    this.updateWorld(this.parent ? this.parent.world : null);
    const p = this.worldPosition(), d = vec3.normalize([0, 0, 0], vec3.sub([0, 0, 0], target, p));
    const inv = quat.invert(quat.create(), this.parent ? this._parentRot() : quat.create());
    const local = vec3.transformQuat([0, 0, 0], d, inv);
    quat.rotationTo(this.rotation, [0, 0, 1], local);
  }
  _parentRot() { return quat.normalize(quat.create(), mat4.getRotation(quat.create(), this.parent.world)); }
  update(dt) {
    if (this.on) this.battery = Math.max(0, this.battery - dt * this.drain);
    if (this.on && this.battery <= 0) this.on = false;
    let k = this.on ? 1 : 0;
    // a weak battery dims the beam and makes it stutter
    if (this.on && this.battery < 0.25) {
      k *= 0.35 + 0.65 * (this.battery / 0.25);
      this._flick -= dt;
      if (this._flick <= 0) { this._flick = 0.05 + Math.random() * (this.battery * 3); this._dead = Math.random() < 0.35 * (1 - this.battery / 0.25) ? 0.04 + Math.random() * 0.12 : 0; }
      if (this._dead > 0) { this._dead -= dt; k *= 0.08; }
    }
    this.beam.setLumens(this.lumens * k);
    if (this.lensMat) this.lensMat.emissiveStrength = 8 * k;
    return k;
  }
}
