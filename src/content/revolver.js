// The Sheriff's Colt Single Action Army (4 3/4" barrel), built from shapes: a blued barrel
// and ejector housing, a case-hardened frame, a fluted six-shot cylinder that turns as it
// fires, a hammer that cocks, a brass trigger guard and one-piece walnut grips.
// Frame: origin at the centre of the grip where the hand holds it, barrel along +Z, +Y up.
import { Kit, Node, Material, cylinder, tube, torus, sphere } from '../engine/index.js';

export const REVOLVER_MATERIALS = () => ({
  blued: new Material({ name: 'Blued steel', color: '#1c2230', metallic: 1, roughness: 0.28, pattern: 'metal', patternScale: 3 }),
  frame: new Material({ name: 'Case-hardened frame', color: '#6a5a4c', metallic: 1, roughness: 0.32, pattern: 'metal', patternScale: 2 }),
  walnut: new Material({ name: 'Walnut grips', color: '#6a3a1e', roughness: 0.38, pattern: 'walnut', patternScale: 14, patternColor: '#2e170a' }),
  brass: new Material({ name: 'Brass', color: '#c9a045', metallic: 1, roughness: 0.3 }),
  bore: new Material({ name: 'Bore', color: '#050505', roughness: 0.9 }),
});

export function createRevolver() {
  const M = REVOLVER_MATERIALS();
  const kit = new Kit({});
  const boreY = 0.036;
  // barrel, muzzle crown, front sight
  kit.cyl(M.blued, [0, boreY, 0.107], 0.0085, 0.121, [90, 0, 0], 20);
  kit.cyl(M.bore, [0, boreY, 0.1685], 0.0042, 0.003, [90, 0, 0], 12);
  kit.box(M.blued, [0, boreY + 0.0105, 0.163], [0.0025, 0.005, 0.008]);
  // ejector rod housing along the right side of the barrel
  kit.cyl(M.blued, [-0.0075, boreY - 0.0115, 0.092], 0.0048, 0.088, [90, 0, 0], 12);
  kit.cyl(M.blued, [-0.0075, boreY - 0.0115, 0.14], 0.0038, 0.012, [90, 0, 0], 10); // ejector head
  // frame: top strap, cylinder window sides, recoil shield, and the grip frame
  kit.box(M.frame, [0, boreY + 0.013, 0.022], [0.016, 0.006, 0.056], [0, 0, 0], 0.002);
  kit.box(M.frame, [0, boreY - 0.019, 0.022], [0.02, 0.008, 0.052], [0, 0, 0], 0.002);
  kit.box(M.frame, [0, boreY, -0.004], [0.026, 0.042, 0.012], [0, 0, 0], 0.003);
  kit.box(M.frame, [0, boreY, 0.049], [0.024, 0.036, 0.008], [0, 0, 0], 0.003);
  kit.box(M.blued, [0, 0.004, -0.012], [0.018, 0.03, 0.018], [-20, 0, 0], 0.003); // backstrap top
  // trigger guard (brass) and trigger
  kit.add(M.brass, torus({ radius: 0.0135, tube: 0.0022, radialSegments: 8, tubularSegments: 24, arc: 200 }), [0, 0.006, 0.02], [0, 90, 105]);
  kit.box(M.blued, [0, 0.004, 0.016], [0.004, 0.018, 0.004], [18, 0, 0]);
  // one-piece walnut grip, curved back like a plow handle, with a brass butt
  kit.add(M.walnut, tube({ path: [[0, 0.02, -0.008], [0, -0.012, -0.014], [0, -0.045, -0.024], [0, -0.07, -0.036]], radii: [0.0135, 0.0152, 0.0165, 0.0158], radialSegments: 16, samples: 10, flatten: 0.72 }), [0, 0, 0]);
  kit.add(M.blued, sphere({ radius: 0.0165, widthSegments: 12, heightSegments: 6, thetaStart: 90, thetaLength: 90 }), [0, -0.071, -0.037], [0, 0, 0], [0.72, 0.45, 1]);
  const body = kit.toNode('Revolver body');
  // cylinder: turns one chamber (60 degrees) per shot
  const cyl = new Node('Cylinder'); cyl.position.set([0, boreY, 0.022]);
  const ck = new Kit({});
  ck.cyl(M.blued, [0, 0, 0], 0.0185, 0.04, [90, 0, 0], 24);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    ck.box(M.bore, [c * 0.0182, s * 0.0182, 0.001], [0.004, 0.004, 0.028], [0, 0, (a * 180) / Math.PI], 0.001); // flutes
    ck.cyl(M.brass, [c * 0.0112, s * 0.0112, -0.0195], 0.0048, 0.002, [90, 0, 0], 10); // cartridge rims (rear)
    ck.cyl(M.bore, [c * 0.0112, s * 0.0112, 0.0201], 0.0036, 0.002, [90, 0, 0], 10); // chamber mouths (front)
  }
  cyl.add(ck.toNode('Cylinder mesh'));
  // hammer: pivots at the back of the frame; cock() pulls it back
  const hammer = new Node('Hammer'); hammer.position.set([0, boreY + 0.004, -0.012]);
  const hk = new Kit({});
  hk.box(M.blued, [0, 0.008, -0.004], [0.006, 0.02, 0.008], [-25, 0, 0], 0.002);
  hk.box(M.blued, [0, 0.018, -0.011], [0.009, 0.004, 0.009], [-35, 0, 0], 0.0015); // spur
  hammer.add(hk.toNode('Hammer mesh'));
  const gun = new Node('Colt SAA');
  gun.add(body, cyl, hammer);
  gun.userData = {
    cylinder: cyl, hammer, materials: M,
    muzzle: [0, boreY, 0.17],   // gun space
    rounds: 6, chamber: 0, cocked: 0,
  };
  return gun;
}

// Visual state: the cylinder advances as it fires; the hammer falls, then is re-cocked.
export function revolverFired(gun) { const u = gun.userData; u.chamber = (u.chamber + 1) % 6; u.cocked = 1; u.spinTarget = (u.spinTarget || 0) + 60; }
export function updateRevolver(gun, dt) {
  const u = gun.userData;
  u.spin = u.spin ?? 0; u.spinTarget = u.spinTarget ?? 0;
  u.spin += (u.spinTarget - u.spin) * Math.min(1, dt * 18);
  u.cylinder.setEuler(0, 0, u.spin);
  // hammer snaps forward on the shot, then is thumbed back over ~0.25 s
  u.cocked = Math.max(0, u.cocked - dt * 4);
  const back = u.cocked > 0.75 ? 0 : 1 - u.cocked / 0.75;
  u.hammer.setEuler(-back * 38, 0, 0);
}
// Where the sheriff wears it and how it sits in the hand (bone-local offsets for Character.attach).
export const HOLSTER_SOCKET = { position: [-0.004, 0.035, -0.022], rotation: [90, 0, 0] };
export const HAND_SOCKET = { position: [0.013, -0.058, 0.004], rotation: [90, 0, 0] };
