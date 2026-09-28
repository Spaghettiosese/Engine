# ShapeForge Engine

A zero-dependency WebGL2 engine for building 3D characters out of parametric shapes, rigging them to skeletons and animating them. It comes with three front ends:

| Page | What it is |
| --- | --- |
| `index.html` | Landing page with a live render of the Cowboy cycling through his clips |
| `editor.html` | **ShapeForge Studio**, a Blender-style editor (layout, hotkeys, modes, dope sheet) |
| `viewer.html` | **Animation Viewer**: crossfades, root motion, WASD play mode, onion skins, exports |

Everything is plain ES modules. No build step, no npm dependencies.

```bash
npm start          # serves the folder on http://localhost:8080 (any static server works)
npm test           # geometry, animation and export checks (Node 18+)
```

ES modules don't load from `file://`, so open the pages through a local server.

---

## The Cowboy

`src/content/cowboy.js` builds the Cowboy from primitives and modifiers only:

- **Hat**: lathed crown with a cattleman crease, lathed brim curled with two Bend modifiers, a hat band and a silver gear concho
- **Face**: superquadric head shaped with a Sculpt Profile, square jaw, tapered nose, eyes with a procedural iris and pupil, eyelids, brows, and a handlebar mustache swept along a spline
- **Torso**: superquadric plaid shirt, open leather vest (partial superquadric + Solidify), sheriff star badge, pearl snap buttons made with an Array modifier, collar points, bandana with a spring-bone flap
- **Belt line**: belt, rodeo buckle with a gold star, holster and revolver on a spring bone, a coiled lasso (Array of tori)
- **Arms and legs**: tube-swept sleeves and jeans with automatic weights for smooth elbows and knees, gauntlet gloves with fingers, leather chaps with fringe, boots with stacked heels and spurs with star rowels

54 part definitions (81 meshes once the mirrored left/right twins are generated), 44 bones including two-joint fingers and thumbs on both hands, about 73k triangles, 22 materials.

**Fingers** are animated in every clip: relaxed fingers that trail the arm swing in the walk, loose fists in the run, flat spread palms that curl as each hand lifts in the crawl, and in the idle the left thumb hooks the belt while the right hand drums its fingers beside the holster.

### Clips

| Clip | Length | Root motion | How it was made |
| --- | --- | --- | --- |
| Idle | 4.00 s | in place | Feet planted with IK, breathing, weight shift, left thumb hooked in the belt, head glances |
| Walk | 1.06 s | 1.15 m/s | Gait synthesizer: heel strike → flat foot → heel-off → toe-off, pelvis sway and counter-rotating shoulders |
| Run | 0.68 s | 2.90 m/s | Gait synthesizer: 36% stance with a flight phase, forward lean, bent elbows, high heel kick |
| Crawl | 1.60 s | 0.30 m/s | Hands and knees, diagonal limb pairs, palms and knees planted with IK |

Walk and Run share the `locomotion` sync group, so crossfading between them keeps the feet in step. `tools/test-animation.mjs` checks that every clip loops without a seam and that a planted foot slides less than 10 cm/s (it measures about 3 cm/s against a 115 cm/s walk).

## The Grinner (monster)

`src/content/monster.js` models the creature from your reference image: a 2.5 m, emaciated yellow humanoid with an egg-shaped skull, sunken eye sockets, an ear-to-ear grin (a half row of teeth built with **Array**, completed with **Mirror**, then wrapped around the face and curled into a smile with two **Bend** modifiers over a matching gum band), a long tendon-lined neck, collarbones, a ribcage with five arrayed rib hoops, a hollow belly, bony elbows, knees and hips, and very long arms ending in clawed fingers. 38 part definitions, 43 bones, about 56k triangles. It uses the same humanoid bone names as the Cowboy, so the gait synthesizer and hand poses work on it unchanged.

| Clip | Length | Root motion | How it was made |
| --- | --- | --- | --- |
| Idle | 5.00 s | in place | Planted feet, a slow head tilt with a sharp twitch, claws flexing in sequence |
| Walk | 1.70 s | 0.90 m/s | Bent-knee stalk with a lolling head and dangling arms that lag the stride |
| Chase | 0.74 s | 5.00 m/s | Sprint with a 28° lean, arms reaching forward with spread claws, jittering head |
| Crawl | 1.40 s | 0.95 m/s | New all-fours synthesizer: palms and soles planted with IK, elbows and knees splayed, head tipped sideways |

Walk and Chase share the `grinner` sync group. The character file declares `roles` (`idle`, `walk`, `run: 'Chase'`, `crawl`), which the Viewer's WASD blend tree reads, so Shift makes it chase.

## M1 Garand, first person

`src/content/garand.js` is a first-person rig: the camera sits at the rig origin looking down +Z. It holds a US soldier's arms (M1941 field jacket, cuffs with buttons, an A-11 field watch on the left wrist, two-joint fingers and thumbs) and an M1 Garand made from shapes. The rifle has a walnut buttstock, wrist and forestock with handguards, a parkerized receiver, rear sight with aperture and drums, barrel, gas cylinder, front sight, bands, trigger guard and a leather sling. The **operating rod**, **bolt**, **en-bloc clip** (two steel plates and eight brass .30-06 rounds with copper bullets) and **muzzle flash** each have their own bone.

| Action | Length | What happens |
| --- | --- | --- |
| Fire | 1.00 s | The last round: muzzle flash (bloom), recoil, the action cycles and locks open, and the empty clip pings out |
| Reload | 3.00 s | The rifle cants toward you, the right hand fetches a clip from the belt, thumbs it into the receiver, the bolt slams home, the hand snaps clear (no "M1 thumb"), then the heel of the hand slaps the op rod forward |
| Inspect | 4.40 s | The rifle turns to show its right side, the op rod is pulled back to check the chamber and released, then the rifle turns to show its left side and top |
| Idle | 3.00 s | Breathing sway; the support hand resettles its grip |

The actions are authored with the new **choreography layer** (`src/engine/choreo.js`). Each channel has a few key poses: the weapon transform, wrist targets attached to the rifle or free in space, finger poses, the clip's attachment, bolt and op-rod travel, and the flash. Attached keys are blended in world space, so the clip passes from belt to hand to receiver without popping. The arms are solved with two-bone IK every frame, and the result is baked into ordinary editable clips at 30–60 fps. `tools/test-weapon.mjs` checks the rifle's state after each action (loaded, bolt locked open, clip ejected or seated) and that the support hand never leaves the handguard.

In the **Viewer**, choose *M1 Garand (first person)*. Drag to look around; press **F** to fire (it chains into the reload), **R** to reload and **I** to inspect. The rig's `firstPerson` block in its JSON (field of view, eye height, action names, what plays next) is all a game needs to drive it the same way.

---

## Engine API (`src/engine`)

```js
import { Renderer, Scene, Camera, OrbitControls, Character, runLoop } from './src/engine/index.js';

const renderer = new Renderer(canvas);                 // WebGL2, HDR + MSAA, shadows, bloom
const scene = new Scene();
const camera = new Camera();
const controls = new OrbitControls(camera, canvas, { leftButtonOrbit: true });

const cowboy = await Character.fromURL('assets/cowboy.json');
scene.add(cowboy);
cowboy.play('Walk');                                   // crossfade (default 0.35 s)
cowboy.mixer.on((event) => { if (event.name === 'footstep') { /* dust, audio… */ } });

runLoop((dt) => {
  cowboy.update(dt);                                   // mixer + spring bones
  renderer.render(scene, camera, { background: 'sky' });
});
```

| Module | Contents |
| --- | --- |
| `math.js` | vec3 / quat / mat4, Euler (XYZ, degrees), seeded RNG, value noise |
| `geometry.js` | `Geometry`, and 12 shapes: cube, rounded cube, UV sphere, superquadric, cylinder, cone, torus, capsule, plane, lathe, tube sweep, extruded outline (star, gear, heart, polygon, arrow, circle) |
| `modifiers.js` | Taper, Twist, Bend, Displace (noise), Inflate, Flatten, Sculpt Profile, Wave, Smooth, Solidify, Mirror, Array; `buildShape(shape, modifiers)` |
| `scene.js` | `Node`, `Mesh`, `Camera`, `Scene` (sun, sky, fog, exposure), `Material` with 13 procedural patterns |
| `skeleton.js` | `Skeleton` (pose, joint matrices, spring bones), `computeSkinWeights` (rigid or automatic) |
| `animation.js` | `Clip` (smooth / linear / constant keys, events, root motion, sync groups), `Mixer` (crossfades, blend weights, phase sync) |
| `character.js` | `Character`: skeleton + parts + materials + clips, JSON round-trip, automatic left/right mirroring |
| `ik.js` | Two-bone IK, aim constraints, world-space rotation helpers |
| `gait.js` | Procedural gait synthesizer (`synthesizeLocomotion`, `synthesizeCrawl`, `synthesizeAllFours`, `synthesizeIdle`, each with an `overlay` hook for per-creature quirks) and hand posing (`applyHandPose`, `HAND_POSES`: relaxed, fist, flat, point, gun grip, thumbs up, spread, claw) |
| `renderer.js` / `shaders.js` | Forward renderer: GGX PBR, 12-tap PCF shadows, procedural sky with mesas and clouds, derivative bump mapping, bloom, ACES, FXAA fallback, selection outlines, onion-skin ghosts, particles, GPU picking |
| `controls.js` | Orbit / pan / zoom with Blender bindings and touch support |
| `particles.js` | Soft point-sprite particles (footstep dust) |
| `io.js` | Export binary glTF 2.0 (skin, PBR factors, every clip) and OBJ (posed) |
| `debug.js` | Skeleton lines, octahedral bone meshes, ghost posing |
| `choreo.js` | Choreography: key-pose channels with attachments, world-space blending, baking to clips |

### Blending locomotion from a speed value

```js
const s = speed;                                    // 0 … 3 m/s
cowboy.mixer.setWeights(s < 1.15
  ? { Idle: 1 - s / 1.15, Walk: s / 1.15 }
  : { Walk: 1 - (s - 1.15) / 1.85, Run: (s - 1.15) / 1.85 });
const v = cowboy.mixer.rootVelocity()[2];            // move the character by this
```

### Character file format

```jsonc
{
  "format": "shapeforge-character", "version": 1, "name": "Cowboy",
  "skeleton": [{ "name": "thigh.L", "parent": "hips", "head": [0.095, 0.95, 0], "tail": [0.105, 0.53, 0.01], "mirror": true }],
  "materials": { "jeans": { "color": "#27405f", "roughness": 0.92, "pattern": "denim", "patternScale": 260 } },
  "parts": [{
    "name": "Jeans Leg", "material": "jeans", "mirror": true,
    "shape": { "type": "tube", "path": [[0.092, 1.0, 0], [0.105, 0.53, 0.02], [0.11, 0.17, -0.012]], "radii": [0.082, 0.055, 0.062] },
    "modifiers": [{ "type": "solidify", "thickness": 0.004 }],
    "bind": { "bones": ["hips", "thigh.L", "shin.L"], "falloff": 7 },
    "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1]
  }],
  "clips": [{ "name": "Walk", "duration": 1.06, "loop": true, "rootMotion": [0, 0, 1.15], "syncGroup": "locomotion",
              "events": [{ "t": 0, "name": "footstep", "side": "L" }],
              "tracks": [{ "bone": "hips", "type": "rotation", "interp": "smooth", "keys": [{ "t": 0, "v": [3, -6, 0] }] }] }]
}
```

Conventions: +Y up, characters face +Z, the character's left is +X, rotations are XYZ Euler in degrees. Bones and parts marked `mirror` get a `.R` twin automatically.

---

## ShapeForge Studio (`editor.html`)

The layout follows Blender: menu bar and workspaces (Layout, Modeling, Animation, Shading), a tool shelf, the 3D viewport with its header, navigation gizmo and info text, the Outliner, the Properties editor with tabs (World, Object, Modifiers, Shape Data, Material, Rig, Animation), the Dope Sheet and a status bar with context hints.

| Keys | Action |
| --- | --- |
| Middle drag / Alt + left drag | Orbit |
| Shift + middle drag · wheel | Pan · zoom |
| Left click · Shift click · drag | Select · extend · box select |
| G · R · S | Move · rotate · scale, then X / Y / Z to constrain, type a number, Enter or click to confirm, Esc or right click to cancel |
| Shift A | Add menu (meshes, shape presets, parts on the active armature, armatures, a new Cowboy) |
| Shift D · X · H / Alt H | Duplicate · delete · hide / reveal |
| Tab | Toggle Pose Mode |
| I · Alt I | Insert · delete keyframe |
| Space · ← → · ↑ ↓ | Play · step frames · jump between keys |
| Numpad 1 / 3 / 7 (or 1 / 3 / 7), Ctrl flips · Numpad 5 · Numpad . · Home | Views · ortho toggle · frame selected · frame all |
| Z · Alt Z | Shading menu · X-ray |
| Ctrl Z · Ctrl Shift Z | Undo · redo (Edit › Undo History lists steps) |
| F3 · F1 · N · Ctrl Space | Operator search · shortcuts · side panels · maximize viewport |

Additional features:

- **Motion Synth** (Animation tab): generates new gait actions (walk, cowboy swagger, sneak, jog, crawl, idle) from sliders for speed, cycle length, stance, hip height, lean, arm swing, bounce and step width.
- **Auto keying** (● in the Dope Sheet) records pose edits as you make them; **onion skinning** shows ghosts three and six frames either side.
- **Bind to Armature** (Rig tab) turns any mesh into a character part with rigid or automatic weights; **Unbind** turns it back.
- **Hand Pose** panel (Rig tab, Pose Mode): presets, a curl slider per finger, spread, Key hand, Mirror to other hand.
- Edit bones' rest positions, extrude child bones, and turn any bone into a spring (jiggle) bone.
- Autosaves to browser storage. File › Save downloads the scene; Copy Scene as JSON and Import from Pasted JSON work where downloads are blocked.
- Export glTF (.glb), OBJ, or the engine's character JSON. **Open Character in Viewer** hands the character to the Viewer.

## Animation Viewer (`viewer.html`)

- Click a clip (or press 1–9) to crossfade; the bar under each clip shows its live blend weight.
- **In place**, **Roam** (root motion around a loop, camera follows) and **Play** (WASD or arrows, Shift to run, C to crawl) modes.
- Camera focus: Full body, Hands (close-up on the finger animation) or Face.
- Skeleton, onion skin, wireframe and toon overlays; shadows, spring bones, footstep dust, set dressing, turntable, bloom and sun angle.
- Scrub the timeline (footstep events are marked on it), step frames with ← → while paused.
- Switch between the Cowboy and the Grinner, or load any character JSON exported by the Studio.

---

## Project layout

```
index.html  editor.html  viewer.html
assets/cowboy.json        baked Cowboy (npm run build:assets)
assets/grinner.json       baked Grinner
assets/m1-garand.json     baked first-person M1 Garand rig
src/engine/               the engine
src/content/              cowboy.js, monster.js (the Grinner), garand.js (first-person M1), scenery.js (desert set)
src/editor/               Studio: core model, viewport, panels, dope sheet, widgets
src/viewer/viewer.js      Animation Viewer
src/ui/                   page styles
tools/                    tests, asset baking, artifact packing, headless screenshot helper
```

## Known limits

- There is no vertex-level Edit Mode; shapes are edited through their parameters and modifier stacks.
- glTF export carries base colour, metallic and roughness; the procedural patterns are shader-only, so exported materials are flat colours.
- Inside sandboxed frames that block downloads, the Studio offers copy-to-clipboard dialogs instead.
