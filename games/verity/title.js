// Title screen: Verity floats over a rug in a dark room. Sometimes she isn't smiling.
import * as E from '../../src/engine/index.js';
import { Stage } from './stage.js';
import { houseMats } from './mats.js';
import * as P from './props.js';
import { makeVeritySphere, grinner } from './cast.js';

export class TitleLevel extends Stage {
  constructor(game) {
    super(game, { height: 4.2 });
    const M = houseMats(), env = this.env;
    this.wallMat = new E.Material({ name: 'Title wall', color: '#1a1214', roughness: 0.95, pattern: 'stripes', patternScale: 30, patternColor: '#120c0e' });
    this.floor(-9, -9, 9, 9, M.woodFloorDark); this.ceiling(-9, -9, 9, 9, M.ceiling, 4.2);
    this.wallX(-9, -9, 9, []); this.wallX(9, -9, 9, []); this.wallZ(-9, -9, 9, []); this.wallZ(9, -9, 9, []);
    P.rug(this, 0, 0, 3.4, 2.5, '#7b1f1e');
    this.chand = P.chandelier(this, 0, 4.2, 0);
    this.build('Title room');
    this.addLamp(0, 3.1, 0, { color: '#ffe0a0', intensity: 9, range: 9, bulb: false }); this.bulb = this.lampList[0];
    this.addLamp(0.6, 1.7, 2.4, { color: '#ffd070', intensity: 3.5, range: 6, bulb: false });
    this.v = makeVeritySphere(0.5); this.v.position.set([0, 1.5, 0]); this.scene.add(this.v);
    this.mon = grinner(); this.mon.position.set([2.8, 0, -4.2]); this.mon.setEuler(0, 200, 0); this.mon.visible = false; this.scene.add(this.mon);
    this.mon.play('Idle', { fade: 0 });
    E.applyTimeOfDay(env, 0.5);
    env.ambient = 0.08; env.sunIntensity = 0; env.fogDensity = 0.02; env.fogColor = [0, 0, 0]; env.volumetric = 0.3; env.clouds = false;
    env.shadowCenter = [0, 1, 0]; env.shadowRadius = 8;
    this.t = 0; this.next = 6; this.flashT = 0;
    this.shadows = false;
  }
  enter() { super.enter(); this.game.control = 'none'; this.game.camera.fov = 55 * Math.PI / 180; }
  update(dt) {
    super.update(dt);
    this.t += dt;
    const cam = this.game.camera, a = Math.sin(this.t * 0.07) * 0.5 + 0.35;
    cam.position[0] = Math.sin(a) * 3.6; cam.position[1] = 1.55 + Math.sin(this.t * 0.2) * 0.1; cam.position[2] = Math.cos(a) * 3.6;
    cam.target[0] = -0.9; cam.target[1] = 1.35; cam.target[2] = 0;
    this.v.position[1] = 1.5 + Math.sin(this.t * 1.3) * 0.08;
    this.v.children[0].setEuler(0, 90 + (Math.sin(this.t * 0.5) * 0.5 + Math.atan2(cam.position[0], cam.position[2]) * 0.6) * 57.3, 0);
    this.bulb.light.intensity = 9 + Math.sin(this.t * 17) * 0.3 + (Math.random() < 0.01 ? -6 : 0);
    this.next -= dt;
    if (this.next <= 0) {
      this.next = 7 + Math.random() * 9; this.flashT = 0.18 + Math.random() * 0.2;
      this.v.userData.setFace('grin'); this.mon.visible = Math.random() < 0.6;
      this.game.fx.u.uGlitch.value = 0.6;
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) { this.v.userData.setFace('happy'); this.mon.visible = false; this.game.fx.u.uGlitch.value = 0; } }
    if (this.mon.visible) this.mon.update(dt);
    if (this.chand) this.chand.node.setEuler(0, 0, Math.sin(this.t * 0.8) * 1.2);
  }
}
