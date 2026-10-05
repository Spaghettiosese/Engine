// 1142 Alder Lane — the Zhong house (a big ranch-style single story), built with the ShapeForge
// Kit. Used by HOME (day), STATIC (evening), LIGHTS OUT (dark) and THE TRUTH (final).
//
//  z=0  ┌ GARAGE ─────┬ FOYER ──┬ LIVING ROOM ─────────┬ DEN (PC, arcade) ─┐
//       ├─────────────┴─────────┴─── HALL A ────────────┴───────────────────┤ z=-9..-12
//       │ KITCHEN     │ DINING  │LAUNDRY│conn│BATH│ ERIC'S ROOM          │
//       │             ├─────────┴─── HALL B ─────────────────────────────┤ z=-20..-23
//       │ MOM'S ROOM  │ FAMILY ROOM (yard) │ GUEST ROOM │ HARRY'S ROOM   │
//  z=-30└─────────────┴────────────────────┴────────────┴────────────────┘
//      x=-20        -9        1    5   7  10                           20
import * as E from '../../src/engine/index.js';
import { Stage, Obj3 } from './stage.js';
import { Actor } from './actor.js';
import { person } from './cast.js';
import { houseMats, plastic, emissive } from './mats.js';
import * as P from './props.js';
import { liveTexture, signTexture, photoTexture, portraitTexture, paintTexture, drawVerityOnCanvas } from './textures.js';

const PI = Math.PI;
const FAMILY = [
  { skin: '#d8a880', hair: '#141010', shirt: '#3a4a6a', h: 26 },
  { skin: '#dcb08a', hair: '#141010', shirt: '#b03040', h: 22 },
  { skin: '#d8a880', hair: '#141010', shirt: '#4a4e56', h: 21 },
  { skin: '#e2b48c', hair: '#121010', shirt: '#4f9a3f', h: 15 },
];

// Monster waypoints (room centres, doorways, both halls).
const N = {};
const NODE_LIST = [
  ['a0', -17, -10.5], ['a1', -13.5, -10.5], ['a2', -8, -10.5], ['a3', -5, -10.5], ['a4', -0.5, -10.5], ['a5', 2.5, -10.5], ['a6', 6, -10.5], ['a7', 8.5, -10.5], ['a8', 12.5, -10.5], ['a9', 14.5, -10.5], ['a10', 18, -10.5],
  ['b0', -8, -21.5], ['b1', -5, -21.5], ['b2', -1, -21.5], ['b3', 3, -21.5], ['b4', 6, -21.5], ['b5', 10, -21.5], ['b6', 14.5, -21.5], ['b7', 18, -21.5],
  ['gar0', -13.5, -7.6], ['gar1', -12.5, -4], ['foy', -8, -5], ['liv0', 2.5, -7.6], ['liv1', 1, -4.5], ['liv2', -2.5, -4.5],
  ['den0', 14.5, -7.6], ['den1', 15, -4.5], ['kit0', -14.5, -13.2], ['kit1', -14.5, -16.5], ['kit2', -10.2, -16],
  ['din0', -5, -13.2], ['din1', -4, -16], ['din2', -5, -18.8], ['lau0', 3, -13.2], ['lau1', 3, -16.5],
  ['con0', 6, -13.2], ['con1', 6, -18.8], ['bath0', 8.5, -13.2], ['bath1', 8.5, -16],
  ['eric0', 12.5, -13.2], ['eric1', 15, -16], ['mom0', -10.2, -21.5], ['mom1', -14.5, -24.5],
  ['fam0', -2.5, -24.2], ['fam1', -2.5, -27.2], ['gue0', 6.5, -24.2], ['gue1', 7.5, -25.8], ['har0', 14.5, -24.2], ['har1', 15, -26.8],
];
export const HOUSE_NODES = NODE_LIST.map(([id, x, z], i) => { N[id] = i; return { id, x, z }; });
const Ed = (a, b) => [N[a], N[b]];
export const HOUSE_EDGES = [
  ...['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'].slice(1).map((id, i, arr) => Ed(i === 0 ? 'a0' : arr[i - 1], id)),
  ...['b0', 'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7'].slice(1).map((id, i, arr) => Ed(i === 0 ? 'b0' : arr[i - 1], id)),
  Ed('a1', 'gar0'), Ed('gar0', 'gar1'), Ed('a2', 'foy'), Ed('a3', 'foy'), Ed('foy', 'liv2'), Ed('liv2', 'liv1'), Ed('liv1', 'liv0'), Ed('liv0', 'a5'),
  Ed('a9', 'den0'), Ed('den0', 'den1'), Ed('a1', 'kit0'), Ed('kit0', 'kit1'), Ed('kit1', 'kit2'), Ed('kit2', 'din1'),
  Ed('a3', 'din0'), Ed('din0', 'din1'), Ed('din1', 'din2'), Ed('din2', 'b1'), Ed('a5', 'lau0'), Ed('lau0', 'lau1'),
  Ed('a6', 'con0'), Ed('con0', 'con1'), Ed('con1', 'b4'), Ed('a7', 'bath0'), Ed('bath0', 'bath1'), Ed('a8', 'eric0'), Ed('eric0', 'eric1'),
  Ed('b0', 'mom0'), Ed('mom0', 'mom1'), Ed('b1', 'fam0'), Ed('b2', 'fam0'), Ed('fam0', 'fam1'), Ed('b4', 'gue0'), Ed('gue0', 'gue1'), Ed('b6', 'har0'), Ed('har0', 'har1'),
];

const ericDrawing = () => paintTexture('ericDrawing', 96, 72, (g, w, h) => {
  g.fillStyle = '#f6f2e8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffd21e'; g.beginPath(); g.arc(28, 32, 16, 0, 7); g.fill();
  g.fillStyle = '#111'; g.fillRect(22, 26, 2, 6); g.fillRect(32, 26, 2, 6); g.fillRect(22, 38, 12, 2);
  g.fillStyle = '#4f9a3f'; g.fillRect(60, 24, 12, 20); g.fillStyle = '#e2b48c'; g.fillRect(62, 14, 8, 10);
  g.fillStyle = '#d02020'; g.font = 'bold 10px Arial'; g.fillText('VERITY + ERIC', 12, 60); g.fillText('BFF 4 EVER', 20, 69);
});
const clockFace = () => signTexture('gcface', 64, 64, '#f0e8d0', [{ t: 'XII', y: 12, size: 10, color: '#222' }, { t: 'VI', y: 54, size: 10, color: '#222' }, { t: 'III', x: 54, y: 32, size: 9, color: '#222' }, { t: 'IX', x: 10, y: 32, size: 9, color: '#222' }, { rect: [31, 16, 2, 18], color: '#222' }, { rect: [31, 31, 14, 2], color: '#222' }]);

export class HouseLevel extends Stage {
  constructor(game, mode = 'day') {
    super(game);
    this.mode = mode;
    const M = houseMats(), env = this.env;
    const dark = mode === 'dark';
    this.M = M;
    this.wallMat = M.paper;
    this.doorMat = M.door;
    // window panes: dark at night, glowing with the sky at dusk
    this.pal.glass = this.glassMat = new E.Material({ name: 'Window', color: '#0d1218', roughness: 0.04, metallic: 0.3, emissive: '#e8a070', emissiveStrength: 0 });
    const paper = M.paper, cinder = M.cinder, cream = M.cream, tileW = M.tileWall, blue = M.blue, green = M.green;

    // ------------------------------------------------------------ floors & ceilings
    this.floor(-11, -12, 20, 0, M.woodFloor);
    this.floor(-9, -23, 20, -12, M.woodFloor);
    this.floor(-20, -12, -11, 0, M.concrete);
    this.floor(-20, -20, -9, -12, M.tileKitchen);
    this.floor(1, -20, 10, -12, M.tileKitchen);
    this.floor(10, -20, 20, -12, M.carpetEric);
    this.floor(-20, -30, -9, -20, M.carpetMom);
    this.floor(-9, -30, 4, -23, M.woodFloor);
    this.floor(4, -30, 11, -23, M.carpetGuest);
    this.floor(11, -30, 20, -23, M.carpetHarry);
    this.ceiling(-11, -12, 20, 0, M.ceilingWood);
    this.ceiling(-9, -30, 20, -12, M.ceiling);
    this.ceiling(-20, -30, -9, -12, M.ceiling);
    this.ceiling(-20, -12, -11, 0, M.concrete);
    this.ceiling(-9, -20, 1, -12, M.ceilingWood);

    // ------------------------------------------------------------ outer walls
    const win = (a, b, y0 = 0.9, y1 = 2.1) => ({ a, b, y0, y1 });
    this.wallX(0, -20, 20, [win(-19, -12, 0, 2.3), { a: -8.5, b: -7.5 }, win(-2, 1), win(3, 6), win(13, 17)]);
    this.wallX(-30, -20, 20, [win(-16, -13), win(-5, -1, 0, 2.25), win(6, 9), win(14, 17)]);
    this.wallZ(-20, -30, 0, [win(-17, -15, 1.2, 2.1), win(-27, -25)], { mat: cream });
    this.wallZ(20, -30, 0, [win(-6, -3), win(-11.2, -9.8), win(-17, -14), win(-22.2, -20.8), win(-28, -25)]);
    this.addCollider(-5, -30.1, -1, -29.9, 'wall');
    this.addCollider(-19, -0.1, -12, 0.1, 'wall');
    // ------------------------------------------------------------ interior walls
    this.wall2('z', -11, -9, 0, [], cinder, paper);
    this.wall2('x', -9, -20, -11, [{ a: -14, b: -13 }], paper, cinder);
    this.wallX(-9, -11, -5, [{ a: -10.2, b: -5.8 }]);
    this.wallZ(-5, -9, 0, [{ a: -7, b: -3 }]);
    this.wallX(-9, -5, 9, [{ a: 1, b: 4 }]);
    this.wallZ(9, -9, 0);
    this.wallX(-9, 9, 20, [{ a: 14, b: 15 }]);
    this.wall2('x', -12, -20, -9, [{ a: -15, b: -14 }], cream, paper);
    this.wallX(-12, -9, 1, [{ a: -7, b: -3 }]);
    this.wall2('x', -12, 1, 10, [{ a: 2.5, b: 3.5 }, { a: 5, b: 7 }, { a: 8, b: 9 }], tileW, paper);
    this.wall2('x', -12, 10, 20, [{ a: 12, b: 13 }], blue, paper);
    this.wall2('z', -9, -20, -12, [{ a: -18, b: -14 }], cream, paper);
    this.wall2('z', 1, -20, -12, [], paper, tileW);
    this.wallZ(5, -20, -12, [], { mat: tileW });
    this.wallZ(7, -20, -12, [], { mat: tileW });
    this.wall2('z', 10, -20, -12, [], tileW, blue);
    this.wall2('x', -20, -20, -9, [], paper, cream);
    this.wallX(-20, -9, 1, [{ a: -7, b: -3 }]);
    this.wall2('x', -20, 1, 10, [{ a: 5, b: 7 }], paper, tileW);
    this.wall2('x', -20, 10, 20, [], paper, blue);
    this.wallZ(-9, -30, -20, [{ a: -22.1, b: -21 }]);
    this.wallX(-23, -9, 20, [{ a: -6, b: 1 }, { a: 6, b: 7 }, { a: 14, b: 15 }]);
    this.wallZ(4, -30, -23);
    this.wall2('z', 11, -30, -23, [], paper, green);
    // garage roll-up door; glass doors to the yard
    this.kit.span(new E.Material({ name: 'Garage door', color: '#b8b4a8', roughness: 0.6, pattern: 'corrugated', patternScale: 14, patternColor: '#6a665c' }), [-19, 0, -0.05], [-12, 2.3, 0.05]);
    // baseboards along the big walls
    const bb = this.pal.trim;
    this.kit.span(bb, [-20, 0, -0.1], [20, 0.12, 0.0]); this.kit.span(bb, [-20, 0, -30], [20, 0.12, -29.9]);

    // ------------------------------------------------------------ outside
    this.buildOutside(mode);

    // ------------------------------------------------------------ garage
    { // the car and its tarp are separate nodes: LIGHTS OUT swaps the outside of the car for the inside
      const ck = this.newKit(); P.carProp(this, 0, 0, 0, '#4a4e56', ck, false); this.carNode = ck.toNode('Dad car'); this.carNode.position.set([-15.5, 0, -4.5]); this.scene.add(this.carNode);
      const tk = this.newKit(); P.tarp(this, 0, 0, 0, tk); this.tarpNode = tk.toNode('Tarp'); this.tarpNode.position.set([-15.5, 0, -5.6]); this.scene.add(this.tarpNode);
      this.solid(-15.5, -4.5, 1.9, 4.3);
    }
    P.breakerBox(this, -19.9, 1.05, -7, PI / 2);
    this.boxes = [];
    for (const [label, x, z, y] of [['DAD - BOOKS', -12.2, -8.2, 0], ['DAD - WINTER', -12.8, -8.1, 0], ['DAD - MISC', -12.5, -8.15, 0.36]]) { P.cardboardBox(this, x, y, z, 0, label); }
    this.addCollider(-13.1, -8.45, -11.9, -7.85);
    P.workbench(this, -11.45, -3.2, 0);
    this.kit.cyl(this.M.steel, [-19.4, 0.75, -8.4], 0.3, 1.5, [0, 0, 0], 12); this.addCollider(-19.7, -8.7, -19.1, -8.1);
    P.wardrobe(this, -19.55, -1.5, PI / 2, '#6a6e72');
    this.kit.box(new E.Material({ name: 'Shelf', color: '#6a6e72', metallic: 0.6, roughness: 0.5, pattern: 'metal', patternScale: 2 }), [-19.75, 0.9, -4.2], [0.4, 1.8, 1.4]); this.addCollider(-19.95, -4.9, -19.55, -3.5);
    // ------------------------------------------------------------ foyer
    P.shoeRack(this, -6.3, -0.35, PI);
    P.wardrobe(this, -10.55, -3.5, PI / 2, '#3a2a1c');
    P.plant(this, -10.5, -0.6, 1.1);
    P.pictureFrame(this, -9.2, 1.5, -0.12, PI, 0.3, 0.12, signTexture('keys', 32, 12, '#6a4a2a', [{ t: 'KEYS', y: 6, size: 7, color: '#d8c8a0' }]));
    this.clockObj = P.grandfatherClock(this, -5.6, -8.6, 0, clockFace());
    // ------------------------------------------------------------ living room
    this.tvScreen = liveTexture(128, 72);
    P.tv(this, 8.6, -4.5, -PI / 2, P.screenMaterial(this.tvScreen, 0.95));
    P.couch(this, 5.0, -4.5, PI / 2, 2.2, '#5a3a34');
    P.coffeeTable(this, 6.9, -4.5, PI / 2, 1.0, 0.55);
    P.couch(this, 4.8, -7.6, PI - 0.5, 1.0, '#6a2a2a');
    P.piano(this, -3.6, -0.55, PI);
    P.bookshelf(this, -4.6, -8.2, PI / 2, 1.0, 1.9, 3);
    P.floorLamp(this, 8.4, -8.4, mode === 'day');
    P.rug(this, 4.5, -4.5, 4.4, 3.2, '#7b1f1e');
    P.pictureFrame(this, 8.88, 1.9, -1.8, -PI / 2, 0.5, 0.38, photoTexture('family', FAMILY));
    // ------------------------------------------------------------ den
    this.pcScreen = liveTexture(256, 160);
    P.pcSetup(this, 19.35, -4.5, -PI / 2, P.screenMaterial(this.pcScreen, 1.0));
    P.officeChair(this, 18.55, -4.5, PI / 2);
    P.bookshelf(this, 11, -0.35, PI, 1.0, 1.9, 7);
    P.wardrobe(this, 9.42, -3, PI / 2, '#4a3020');
    this.kit.box(this.M.steel, [19.6, 0.55, -8.2], [0.5, 1.1, 0.6]); this.addCollider(19.35, -8.5, 19.85, -7.9);
    this.arcadeScreen = liveTexture(128, 100);
    P.arcadeCabinet(this, 11.5, -8.5, 0, P.screenMaterial(this.arcadeScreen, 1.0), signTexture('arcadeMarquee', 128, 36, '#ffd21e', [{ t: 'ZHONG ARCADE', y: 18, size: 20, color: '#1a1a2a' }], { noise: false }));
    this.drawArcade();
    // ------------------------------------------------------------ halls
    this.kit.box(this.M.runner, [4, 0.008, -10.5], [26, 0.016, 1.4]); this.kit.box(this.M.runner, [5.5, 0.008, -21.5], [24.7, 0.016, 1.4]);
    P.wardrobe(this, 19.45, -10.5, -PI / 2, '#4a3020'); P.wardrobe(this, 19.45, -21.5, -PI / 2, '#4a3020');
    for (let i = 0; i < 4; i++) P.pictureFrame(this, -2 + i * 5, 1.75, -11.88, 0, 0.4, 0.3, photoTexture('hall' + i, FAMILY.slice(0, 2 + (i % 3)), ['#7a8a6a', '#8a7a9a', '#6a8aa0', '#a08a6a'][i]));
    // ------------------------------------------------------------ kitchen
    P.fridge(this, -19.62, -12.75, PI / 2);
    P.counter(this, -19.7, -14.4, PI / 2, 2.0, true);
    P.stove(this, -19.68, -16.0, PI / 2);
    P.counter(this, -19.7, -17.7, PI / 2, 1.9);
    P.wallCabinet(this, -19.82, 1.55, -14.4, PI / 2, 2.0); P.wallCabinet(this, -19.82, 1.55, -17.7, PI / 2, 1.9);
    P.potProp(this, -19.6, 0.9, -15.85); P.riceCooker(this, -19.7, 0.9, -17.2);
    this.kevinRing = P.kevinSpeaker(this, -19.72, 0.9, -18.3);
    P.counter(this, -14.5, -16.2, 0, 2.4);
    for (const x of [-15.3, -14.5, -13.7]) P.stool(this, x, -15.55);
    P.wardrobe(this, -11.2, -19.62, 0, '#6a4a2c');
    this.kit.box(plastic('#fff8b0'), [-19.27, 1.35, -13.0], [0.01, 0.22, 0.18]);
    P.posterPanel(this, -19.28, 1.05, -12.5, PI / 2, 0.22, 0.17, ericDrawing());
    // ------------------------------------------------------------ dining
    this.chand = P.chandelier(this, -4, this.H, -16);
    P.rug(this, -4, -16, 6.0, 4.4, '#7b1f1e', PI / 2);
    P.table(this, -4, -16, 0, 2.2, 1.0, 0.76, '#4a2c18');
    for (const [x, z, r] of [[-4.7, -15.25, PI], [-3.3, -15.25, PI], [-4.7, -16.75, 0], [-3.3, -16.75, 0], [-5.4, -16, PI / 2], [-2.6, -16, -PI / 2]]) P.chair(this, x, z, r);
    P.bookshelf(this, 0.6, -16, -PI / 2, 1.2, 1.6, 11);
    // ------------------------------------------------------------ laundry, bath
    P.washer(this, 1.5, -13.2, PI / 2, 'WASH'); P.washer(this, 1.5, -14.1, PI / 2, 'DRY');
    P.wardrobe(this, 3.6, -19.62, 0, '#8a8a80');
    P.bathtub(this, 8.5, -19.45, 0);
    P.toilet(this, 9.5, -13.0, PI);
    P.bathSink(this, 7.4, -15.5, PI / 2);
    this.kit.box(new E.Material({ name: 'Mirror', color: '#8a9aa8', metallic: 1, roughness: 0.05 }), [7.06, 1.55, -15.5], [0.02, 0.7, 0.5]);
    // ------------------------------------------------------------ Eric's room
    P.bed(this, 18.9, -17.5, -PI / 2, '#3a6ab8');
    P.wardrobe(this, 16, -12.4, PI, '#6a4a2a');
    P.desk(this, 11.6, -19.6, 0, 1.2, '#8a6a4a');
    this.tabletScreen = liveTexture(64, 48);
    P.tabletProp(this, 18.5, 0.57, -17.0, 0.3, P.screenMaterial(this.tabletScreen, 0.9));
    P.pandaToy(this, 19.4, 0.55, -17.8, -1.2);
    P.posterPanel(this, 19.94, 1.5, -17.5, -PI / 2, 0.5, 0.38, ericDrawing());
    P.posterPanel(this, 13.5, 1.6, -19.9, PI, 0.5, 0.7, signTexture('mcposter', 64, 88, '#2a6a2a', [{ t: 'MINE', y: 20, size: 16, color: '#fff' }, { t: 'CRAFT', y: 40, size: 16, color: '#fff' }, { rect: [16, 52, 32, 28], color: '#866043' }, { rect: [16, 52, 32, 8], color: '#5f9f35' }]));
    P.toyChest(this, 14.5, -19.6, 0);
    // ------------------------------------------------------------ Mom's room
    P.bed(this, -15, -28.8, 0, '#8a4a5a', 1.6);
    P.dresser(this, -19.7, -23.5, PI / 2, '#4a2c1a');
    this.kit.box(plastic('#6a1a2a'), [-19.7, 0.9, -23.2], [0.22, 0.1, 0.14], 0.01);
    this.kit.box(plastic('#2a1a10'), [-19.7, 0.9, -23.8], [0.2, 0.015, 0.26]);
    P.wardrobe(this, -10.5, -29.62, 0, '#4a3020');
    // ------------------------------------------------------------ family room
    P.altar(this, -7.6, -29.72, 0, portraitTexture('nainai', { skin: '#d8b090', hair: '#c8c8c8', shirt: '#3a1a2a', gray: true }));
    P.couch(this, -3, -25.2, PI, 2.4, '#4a4a5a');
    this.vhsScreen = liveTexture(96, 72);
    P.crtTV(this, 2.9, -26.5, -PI / 2, P.screenMaterial(this.vhsScreen, 0.9));
    P.plant(this, 3.3, -29.4, 1.2); P.plant(this, -8.4, -23.6, 0.9);
    P.wardrobe(this, -8.4, -27, PI / 2, '#3a2a1c');
    P.rug(this, -3, -27.3, 3.6, 3.0, '#7b1f1e');
    // ------------------------------------------------------------ guest room
    P.bed(this, 7.5, -28.8, 0, '#6a6a4a');
    P.wardrobe(this, 10.42, -25.5, -PI / 2, '#4a3020');
    for (let i = 0; i < 3; i++) P.cardboardBox(this, 4.6 + i * 0.6, 0, -23.6, 0, 'XMAS');
    // ------------------------------------------------------------ Harry's room
    P.bed(this, 18.9, -27, -PI / 2, '#4a4e56');
    P.wardrobe(this, 16.5, -23.38, PI, '#3a2a1c');
    P.desk(this, 12.3, -29.6, 0, 1.3);
    P.trophy(this, 11.9, 0.76, -29.7);
    this.kit.box(plastic('#2050a0'), [12.5, 0.79, -29.6], [0.25, 0.05, 0.32]);
    P.posterPanel(this, 19.94, 1.6, -24.5, -PI / 2, 0.6, 0.8, signTexture('robotics2', 96, 128, '#1a3a6a', [{ t: 'REGIONALS', y: 24, size: 14, color: '#fff' }, { t: '2025', y: 48, size: 18, color: '#ffe060' }, { t: 'SIR BEEPS', y: 84, size: 12, color: '#fff' }, { t: 'A-LOT', y: 100, size: 12, color: '#fff' }]));
    P.officeChair(this, 12.3, -28.7, PI);

    this.build('Zhong house');

    // ------------------------------------------------------------ hit boxes for everything you can use
    const hb = (cx, cz, w, d, h, y0 = 0) => this.hitbox(w, h, d, cx, y0, cz);
    this.hit = {
      shoeRack: hb(-6.3, -0.35, 0.9, 0.4, 0.55), coatCloset: hb(-10.55, -3.5, 0.55, 1.0, 1.95), clock: hb(-5.6, -8.6, 0.55, 0.4, 2.1), tv: hb(8.6, -4.5, 0.55, 1.4, 1.3),
      couch: hb(5.0, -4.5, 1.0, 2.2, 0.9), piano: hb(-3.6, -0.55, 1.6, 0.9, 1.25), pc: hb(19.35, -4.5, 0.75, 1.4, 1.25), arcade: hb(11.5, -8.5, 0.8, 0.75, 1.95),
      fridge: hb(-19.62, -12.75, 0.75, 0.8, 1.8), stove: hb(-19.68, -16.0, 0.7, 0.8, 0.95), pot: hb(-19.6, -15.85, 0.36, 0.36, 0.3, 0.9), rice: hb(-19.7, -17.2, 0.34, 0.34, 0.3, 0.9),
      kevin: hb(-19.72, -18.3, 0.24, 0.24, 0.3, 0.9), pantry: hb(-11.2, -19.62, 1.0, 0.55, 1.95), momNote: hb(-19.2, -13.0, 0.12, 0.3, 0.3, 1.2), drawing: hb(-19.2, -12.5, 0.12, 0.3, 0.26, 0.92),
      drawer: hb(-19.4, -17.7, 0.5, 0.6, 0.35, 0.5), altar: hb(-7.6, -29.72, 1.2, 0.6, 1.6), vhs: hb(2.9, -26.5, 0.6, 0.9, 1.1), guestBed: hb(7.5, -28.8, 1.15, 2.1, 0.7),
      tub: hb(8.5, -19.45, 1.85, 0.85, 0.6), toyChest: hb(14.5, -19.6, 0.95, 0.55, 0.55), ericBed: hb(18.9, -17.5, 2.1, 1.15, 0.7), ericCloset: hb(16, -12.4, 1.0, 0.55, 1.95),
      momBed: hb(-15, -28.8, 1.75, 2.1, 0.7), momCloset: hb(-10.5, -29.62, 1.0, 0.55, 1.95), jewelry: hb(-19.7, -23.2, 0.3, 0.24, 0.3, 0.85), facedown: hb(-19.7, -23.8, 0.28, 0.34, 0.2, 0.85),
      familyCab: hb(-8.4, -27, 0.55, 1.0, 1.95), guestCloset: hb(10.42, -25.5, 0.55, 1.0, 1.95), harryBed: hb(18.9, -27, 2.1, 1.15, 0.7), harryCloset: hb(16.5, -23.38, 1.0, 0.55, 1.95),
      harryDesk: hb(12.3, -29.6, 1.3, 0.8, 0.5, 0.45), tablet: hb(18.5, -17.0, 0.34, 0.26, 0.2, 0.55), panda: hb(19.4, -17.8, 0.34, 0.34, 0.5, 0.5), drawing2: hb(19.9, -17.5, 0.15, 0.6, 0.45, 1.3),
      sticker3: hb(18.4, -17.5, 0.2, 0.2, 0.15), sticker7: hb(-19.85, -23.5, 0.15, 0.2, 0.2, 1.15), garageCab: hb(-19.55, -1.5, 0.55, 1.0, 1.95), car: hb(-15.5, -4.5, 2.0, 4.3, 1.5), tarp: hb(-15.5, -5.6, 2.0, 2.6, 1.55),
      breaker: hb(-19.85, -7, 0.3, 0.45, 0.65, 1.05), boxes: hb(-12.5, -8.15, 1.4, 0.5, 0.8), hallCloset: hb(19.45, -10.5, 0.55, 1.0, 1.95), hallCloset2: hb(19.45, -21.5, 0.55, 1.0, 1.95),
      denCloset: hb(9.42, -3, 0.55, 1.0, 1.95), laundryCab: hb(3.6, -19.62, 1.0, 0.55, 1.95), garageCabDoor: hb(-19.55, -1.5, 0.55, 1.0, 1.95), dresser: hb(-19.7, -23.5, 0.55, 1.25, 0.95),
      bookshelfLiving: hb(-4.6, -8.2, 0.4, 1.0, 1.9), frontDoorView: hb(-8, 0, 1.2, 0.4, 2.2),
    };
    // names the story scripts use
    this.tvObj = this.hit.tv; this.vhsTV = this.hit.vhs; this.arcade = this.hit.arcade; this.pc = this.hit.pc; this.pianoObj = this.hit.piano; this.clock = this.hit.clock;
    this.fridgeObj = this.hit.fridge; this.stoveObj = this.hit.stove; this.potObj = this.hit.pot; this.riceObj = this.hit.rice; this.kevinObj = this.hit.kevin; this.pantry = this.hit.pantry;
    this.momNote = this.hit.momNote; this.drawing = this.hit.drawing; this.drawer = this.hit.drawer; this.altarObj = this.hit.altar; this.guestBed = this.hit.guestBed; this.tub = this.hit.tub;
    this.toyChest = this.hit.toyChest; this.ericBed = this.hit.ericBed; this.jewelry = this.hit.jewelry; this.facedown = this.hit.facedown; this.tablet = this.hit.tablet; this.panda = this.hit.panda;
    this.drawing2 = this.hit.drawing2; this.sticker3 = this.hit.sticker3; this.sticker7 = this.hit.sticker7; this.dadCar = new Obj3(this.carNode); this.tarp = new Obj3(this.tarpNode); this.tarpBox = this.hit.tarp; this.garageCab = this.hit.garageCab;
    this.coatCloset = this.hit.coatCloset; this.shoeRackObj = this.hit.shoeRack; this.couchObj = this.hit.couch; this.boxes0 = this.hit.boxes; this.tarpBox = this.hit.tarp;
    this.breaker = this.hit.breaker; this.harryDesk = this.hit.harryDesk; this.sticker7Node = null;

    // ------------------------------------------------------------ doors
    this.addDoor({ id: 'front', x: -8, z: 0, axis: 'x', hinge: 1, swing: -1, name: 'front door', mat: this.M.frontDoor });
    this.addDoor({ id: 'garageDoor', x: -13.5, z: -9, axis: 'x', hinge: 1, swing: 1, name: 'garage door' });
    this.addDoor({ id: 'denDoor', x: 14.5, z: -9, axis: 'x', hinge: 1, swing: 1, name: 'den door' });
    this.addDoor({ id: 'laundryDoor', x: 3, z: -12, axis: 'x', hinge: 1, swing: -1, name: 'laundry door' });
    this.addDoor({ id: 'bathDoor', x: 8.5, z: -12, axis: 'x', hinge: 1, swing: -1, name: 'bathroom door' });
    this.addDoor({ id: 'ericDoor', x: 12.5, z: -12, axis: 'x', hinge: 1, swing: -1, name: "Eric's door" });
    this.addDoor({ id: 'momDoor', x: -9, z: -21.55, axis: 'z', hinge: 1, swing: 1, name: "Mom's door" });
    this.addDoor({ id: 'guestDoor', x: 6.5, z: -23, axis: 'x', hinge: 1, swing: -1, name: 'guest room door' });
    this.addDoor({ id: 'harryDoor', x: 14.5, z: -23, axis: 'x', hinge: 1, swing: -1, name: 'your door' });
    this.door('front').def.enabled = false;
    for (const d of this.doors) if (d.id !== 'front' && d.id !== 'garageDoor') { d.setOpen(true, true); d.k = 1; d.pivot.setEuler(0, 92 * d.swing, 0); }

    // ------------------------------------------------------------ hiding spots
    const Hd = (id, box, type, inside, exit, range) => this.addHide({ id, box, type, inside, exit, range });
    Hd('hCoat', this.hit.coatCloset, 'closet', { x: -10.6, z: -3.5, y: 1.5, yaw: -PI / 2 }, { x: -9.6, z: -3.5, yaw: -PI / 2 });
    Hd('hDen', this.hit.denCloset, 'closet', { x: 9.45, z: -3, y: 1.5, yaw: -PI / 2 }, { x: 10.5, z: -3, yaw: -PI / 2 });
    Hd('hHallA', this.hit.hallCloset, 'closet', { x: 19.5, z: -10.5, y: 1.5, yaw: PI / 2 }, { x: 18.4, z: -10.5, yaw: PI / 2 });
    Hd('hHallB', this.hit.hallCloset2, 'closet', { x: 19.5, z: -21.5, y: 1.5, yaw: PI / 2 }, { x: 18.4, z: -21.5, yaw: PI / 2 });
    Hd('hPantry', this.hit.pantry, 'closet', { x: -11.2, z: -19.7, y: 1.5, yaw: PI }, { x: -11.2, z: -18.6, yaw: PI });
    Hd('hLaundry', this.hit.laundryCab, 'closet', { x: 3.6, z: -19.7, y: 1.5, yaw: PI }, { x: 3.6, z: -18.6, yaw: PI });
    Hd('hTub', this.hit.tub, 'closet', { x: 8.5, z: -19.45, y: 1.2, yaw: PI }, { x: 8.5, z: -18.3, yaw: PI }, 1.0);
    Hd('hEricBed', this.hit.ericBed, 'bed', { x: 18.9, z: -17.5, y: 0.2, yaw: PI }, { x: 18.9, z: -16.3, yaw: PI }, 0.9);
    Hd('hEricCloset', this.hit.ericCloset, 'closet', { x: 16, z: -12.35, y: 1.5, yaw: 0 }, { x: 16, z: -13.4, yaw: 0 });
    Hd('hMomCloset', this.hit.momCloset, 'closet', { x: -10.5, z: -29.7, y: 1.5, yaw: PI }, { x: -10.5, z: -28.6, yaw: PI });
    Hd('hMomBed', this.hit.momBed, 'bed', { x: -15, z: -28.8, y: 0.2, yaw: PI }, { x: -15, z: -27.3, yaw: PI }, 0.9);
    Hd('hFamily', this.hit.familyCab, 'closet', { x: -8.45, z: -27, y: 1.5, yaw: -PI / 2 }, { x: -7.4, z: -27, yaw: -PI / 2 });
    Hd('hGuestBed', this.hit.guestBed, 'bed', { x: 7.5, z: -28.8, y: 0.2, yaw: PI }, { x: 7.5, z: -27.3, yaw: PI }, 0.9);
    Hd('hGuestCloset', this.hit.guestCloset, 'closet', { x: 10.45, z: -25.5, y: 1.5, yaw: PI / 2 }, { x: 9.4, z: -25.5, yaw: PI / 2 });
    Hd('hHarryCloset', this.hit.harryCloset, 'closet', { x: 16.5, z: -23.35, y: 1.5, yaw: 0 }, { x: 16.5, z: -24.4, yaw: 0 });
    Hd('hHarryBed', this.hit.harryBed, 'bed', { x: 18.9, z: -27, y: 0.2, yaw: PI }, { x: 18.9, z: -25.8, yaw: PI }, 0.9);
    Hd('hGarage', this.hit.garageCab, 'closet', { x: -19.6, z: -1.5, y: 1.5, yaw: -PI / 2 }, { x: -18.5, z: -1.5, yaw: -PI / 2 });
    this.setHidesEnabled(dark);

    // ------------------------------------------------------------ anchors used by the scripts
    this.spots = {
      entry: { x: -8, z: -0.8, yaw: 0 },
      pcSeat: [18.6, 1.22, -4.55], pcLook: [19.47, 1.1, -4.6], pcStand: { x: 17.9, z: -4.5 },
      tableSeat: { x: -3.3, z: -16.95, yaw: PI }, ericSeat: { x: -4.7, z: -15.1, yaw: PI },
      arcadeView: [11.5, 1.45, -7.55], arcadeLook: [11.5, 1.3, -8.3],
    };

    // ------------------------------------------------------------ lights
    const LT = (id, color, intensity, range, x, y, z) => { const l = this.addLamp(x, y, z, { color, intensity, range, bulb: false }); this.lamps[id] = l; return l; };
    this.lamps = {};
    const k = 2.4; // engine light units are small: a lamp of 10 reads as a bright room lamp
    LT('chandelier', '#ffd9a0', 7 * k, 11, -4, 2.05, -16);
    LT('living', '#ffe0b0', 6 * k, 10, 3, 2.4, -4.5);
    LT('foyer', '#ffe0b0', 3.5 * k, 7, -8, 2.4, -4);
    LT('kitchen', '#fff0d0', 6.5 * k, 10, -15, 2.45, -16);
    LT('den', '#ffe0b0', 4.5 * k, 9, 14.5, 2.4, -4.5);
    LT('hallA', '#ffe8c8', 4 * k, 13, 4, 2.5, -10.5);
    LT('hallB', '#ffe8c8', 3.5 * k, 12, 6, 2.5, -21.5);
    LT('eric', '#e0e8ff', 3.5 * k, 8, 15, 2.4, -16);
    LT('harry', '#ffe8c0', 3 * k, 8, 15.5, 2.4, -26.5);
    LT('mom', '#ffd8b0', 3 * k, 8, -14.5, 2.4, -25);
    LT('family', '#ffe0b0', 3.5 * k, 9, -2.5, 2.4, -26.5);
    LT('garage', '#f0f0e0', 3.5 * k, 9, -15.5, 2.5, -4.5);
    this.monitorLight = this.addLamp(18.8, 1.2, -4.5, { color: '#8ab0ff', intensity: 0, range: 3.5, bulb: false });
    this.monitorLight.base = 0;
    this.hemi = { get intensity() { return env.ambient / 1.3; }, set intensity(v) { env.ambient = v * 1.3; }, color: { set() {} } };
    this.powered = mode !== 'dark';
    this.setPower(this.powered, true);
    this.applyEnvironment(mode);
    this.kevinColor('#2a4a6a');
    this.drawTV('off'); this.drawPC('off'); this.drawTablet('off'); this.drawVHS('off');
    this.eric = null;
    this.t = 0;
    this.thunderT = 6;
    this.lightning = 0;
    this.flicker = 0;
    this.surfaceAt = (x, z) => {
      if (x < -11 && z > -9) return 'concrete';
      if ((x < -9 && z > -20 && z < -12) || (x > 1 && x < 10 && z < -12 && z > -20)) return 'tile';
      if ((x > 10 && z < -12 && z > -20) || (x < -9 && z < -20) || (x > 4 && z < -23)) return 'carpet';
      return 'wood';
    };
    this.rainK = 0;
    this.initRain();
  }

  // ------------------------------------------------------------ environment
  buildOutside(mode) {
    const M = this.M, k = this.kit, E_ = this.pal;
    k.span(M.grass, [-70, -0.3, -70], [70, -0.02, 45]);
    k.span(M.asphalt, [-70, -0.28, 10], [70, -0.01, 16]);
    k.span(this.pal.stone, [-40, -0.25, 9], [40, -0.02, 10]);
    const hs = ['#8a98a8', '#a89a80', '#98a888', '#b8a8a0', '#a0a0b0'];
    for (let i = 0; i < 5; i++) P.houseFacade(this, -32 + i * 16, 26, PI, hs[i], mode === 'day');
    for (let i = 0; i < 12; i++) P.tree(this, -22 + i * 4 + (i % 2), -38 - (i % 3) * 2, 1.1);
    k.span(M.fence, [-25, 0, -44.05], [25, 1.7, -43.95]);
    P.lampPost(this, -6, 9, mode === 'day');
    // back-yard swing set (for lightning scares)
    const sm = new E.Material({ name: 'Swing frame', color: '#6a6a70', metallic: 0.6, roughness: 0.5 });
    for (const x of [-1.2, 1.2]) { k.cyl(sm, [-3 + x, 1.1, -36.5], 0.04, 2.4, [20, 0, 0], 6); k.cyl(sm, [-3 + x, 1.1, -37.5], 0.04, 2.4, [-20, 0, 0], 6); }
    k.cyl(sm, [-3, 2.2, -37], 0.04, 2.5, [0, 0, 90], 6); k.box(plastic('#b03030'), [-3.5, 0.55, -37], [0.4, 0.04, 0.2]);
    void E_;
  }
  applyEnvironment(mode) {
    const env = this.env;
    const hours = mode === 'day' ? 17.9 : mode === 'evening' ? 20.4 : mode === 'dark' ? 23.4 : 23.0;
    E.applyTimeOfDay(env, hours, { rays: false });
    env.shadowRadius = 26; env.shadowCenter = [0, 1, -12]; env.shadowFar = 60;
    env.fogDensity = mode === 'day' ? 0.004 : 0.012; env.fogHeight = 0;
    env.clouds = true;
    env.volumetric = 0.5; env.volumeDensity = mode === 'day' ? 0.02 : 0.04; env.sunShafts = 0.5; env.lampGlow = 1.2;
    env.ao = true; env.aoRadius = 0.6; env.aoIntensity = 1.2;
    this.baseSun = env.sunIntensity; this.baseExposure = env.exposure;
    // interior ambient: warm-neutral so wallpaper keeps its colour; the dark chapters drop it right down
    env.skyColor = [0.55, 0.52, 0.5]; env.groundColor = [0.5, 0.44, 0.38];
    this.glassMat.emissiveStrength = mode === 'day' ? 1.6 : 0.05; this.glassMat.emissive = mode === 'day' ? '#e8946a' : '#3a4a78';
    if (mode === 'day') { env.ambient = 0.7; env.sunIntensity *= 0.55; }
    else if (mode === 'evening') { env.ambient = 0.55; env.sunIntensity = 0.6; }
    else { env.ambient = 0.14; env.sunIntensity = 0.35; env.skyColor = [0.3, 0.34, 0.5]; env.groundColor = [0.3, 0.3, 0.34]; }
    this.envAmbient = env.ambient; this.baseSun = env.sunIntensity;
    this.stormK = 0;
  }
  initRain() {
    const N_ = 900;
    this.drops = new Float32Array(N_ * 3); this.rainData = new Float32Array(N_ * 14); this.nDrops = N_;
    for (let i = 0; i < N_; i++) this.drops.set([(Math.random() - 0.5) * 36, Math.random() * 14, (Math.random() - 0.5) * 36], i * 3);
  }
  updateRain(dt) {
    const amount = this.rainK;
    if (amount <= 0.01) { this.lines = null; return; }
    const c = this.game.camera.position, fall = 11, wind = 1.5, N_ = this.nDrops, d = this.drops, out = this.rainData;
    for (let i = 0; i < N_; i++) {
      const o = i * 3;
      d[o] += wind * dt; d[o + 1] -= fall * dt;
      if (d[o + 1] < 0) d[o + 1] += 14;
      if (d[o] > 18) d[o] -= 36;
      const x = c[0] + d[o], y = d[o + 1], z = c[2] + d[o + 2], a = 0.3 * amount;
      out.set([x, y, z, 0.72, 0.76, 0.82, a, x - wind * 0.035, y + fall * 0.035, z, 0.72, 0.76, 0.82, 0], i * 14);
    }
    this.lines = [{ data: out }];
  }

  // ------------------------------------------------------------ people
  addEric(preset = 'eric') {
    this.eric = new Actor(this, person(preset), 'Eric');
    return this.eric;
  }

  // ------------------------------------------------------------ screens
  drawArcade(mode = 'attract') {
    const { g, canvas } = this.arcadeScreen, w = canvas.width, h = canvas.height;
    g.fillStyle = '#05050a'; g.fillRect(0, 0, w, h);
    if (mode === 'off') { this.arcadeScreen.update(); return; }
    g.fillStyle = '#ffd21e'; g.font = 'bold 12px monospace'; g.textAlign = 'center';
    g.fillText(mode === 'grin' ? ':)' : 'ZHONG ARCADE', w / 2, 24);
    g.fillStyle = '#ffffff'; g.font = '9px monospace';
    ['DUMPLING DASH', 'BRICK BREAKER', 'VERITY SAYS', 'SPACE KEVIN'].forEach((t, i) => g.fillText(t, w / 2, 44 + i * 12));
    g.fillStyle = '#ff5050'; g.fillText('INSERT COIN', w / 2, 94);
    this.arcadeScreen.update();
  }
  drawVHS(mode) {
    const { g, canvas } = this.vhsScreen, w = canvas.width, h = canvas.height;
    if (mode === 'off') { g.fillStyle = '#060608'; g.fillRect(0, 0, w, h); }
    else if (mode === 'blue') { g.fillStyle = '#1a3aa8'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '10px monospace'; g.fillText('PLAY ▶', 6, 14); }
    else if (mode === 'static') { const img = g.createImageData(w, h); for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); }
    else if (mode === 'home') {
      g.fillStyle = '#3a5a3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd8a8'; g.beginPath(); g.arc(30, 36, 10, 0, 7); g.arc(62, 40, 7, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = '9px monospace'; g.fillText('PLAY ▶', 6, 12); g.fillText('JUL 04', 50, 66);
    }
    this.vhsMode = mode; this.vhsScreen.update();
  }
  drawTV(mode) {
    const { g, canvas } = this.tvScreen, w = canvas.width, h = canvas.height;
    g.textAlign = 'left';
    if (mode === 'off') { g.fillStyle = '#060608'; g.fillRect(0, 0, w, h); }
    else if (mode === 'news') {
      g.fillStyle = '#1a2a4a'; g.fillRect(0, 0, w, h); g.fillStyle = '#b01010'; g.fillRect(0, h - 18, w, 18);
      g.fillStyle = '#fff'; g.font = 'bold 9px Arial'; g.fillText('MISSING: TYLER MOSS, 11', 4, h - 6);
      g.fillStyle = '#101010'; g.fillRect(70, 8, 50, 38); drawVerityOnCanvas(g, 95, 27, 14, 'happy');
      g.fillStyle = '#e8e8e8'; g.font = '7px Arial'; g.fillText('KRSW', 4, 10); g.fillText('"last thing on screen"', 60, 54);
    } else if (mode === 'static') { const img = g.createImageData(w, h); for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; } g.putImageData(img, 0, 0); }
    else if (mode === 'verity') { g.fillStyle = '#0a0800'; g.fillRect(0, 0, w, h); drawVerityOnCanvas(g, w / 2, h / 2, 26, 'grin'); }
    else if (mode === 'weather') {
      g.fillStyle = '#1a3a6a'; g.fillRect(0, 0, w, h); g.fillStyle = '#e8e8e8'; g.font = 'bold 9px Arial'; g.fillText('SEVERE STORM WARNING', 6, 12);
      g.fillStyle = '#40a040'; g.fillRect(10, 20, 60, 40); g.fillStyle = '#e0c020'; g.beginPath(); g.arc(40, 40, 14, 0, 7); g.fill(); g.fillStyle = '#c02020'; g.beginPath(); g.arc(40, 40, 7, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.font = '7px Arial'; g.fillText('ROSEWOOD  9:00 PM', 76, 36); g.fillText('POWER OUTAGES', 76, 46); g.fillText('EXPECTED :)', 76, 56);
    } else if (mode === 'cooking') {
      g.fillStyle = '#e8d8b0'; g.fillRect(0, 0, w, h); g.fillStyle = '#8a5a2a'; g.fillRect(0, 44, w, 28); drawVerityOnCanvas(g, 64, 28, 16, 'happy');
      g.fillStyle = '#222'; g.font = 'bold 8px Arial'; g.fillText('COOKING WITH VERITY', 20, 66);
    } else if (mode === 'live') {
      g.fillStyle = '#101010'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a2a22'; g.fillRect(0, 40, w, 32); g.fillStyle = '#6a1a1a'; g.fillRect(30, 50, 60, 12);
      g.fillStyle = '#b2a340'; g.fillRect(96, 6, 6, 40); g.beginPath(); g.ellipse(99, 8, 5, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#ff3030'; g.font = 'bold 8px monospace'; g.fillText('● LIVE', 4, 10); g.fillStyle = '#fff'; g.fillText('1142 ALDER LN - LIVING RM', 4, 68);
    } else if (mode === 'dad') {
      g.fillStyle = '#3a4a3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#d8a880'; g.beginPath(); g.arc(50, 30, 12, 0, 7); g.fill(); g.fillStyle = '#161212'; g.fillRect(38, 16, 24, 6);
      g.fillStyle = '#3a4a6a'; g.fillRect(36, 42, 28, 30); g.fillStyle = '#fff'; g.font = '8px monospace'; g.fillText('PLAY ▶  JUL 14', 4, 10);
    } else if (mode === 'tell') { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd21e'; g.font = 'bold 22px monospace'; g.textAlign = 'center'; g.fillText('TELL HIM', w / 2, h / 2 + 8); g.textAlign = 'left'; }
    this.tvMode = mode; this.tvScreen.update();
  }
  drawPC(mode) {
    const { g, canvas } = this.pcScreen, w = canvas.width, h = canvas.height;
    g.textAlign = 'left';
    if (mode === 'off') { g.fillStyle = '#050507'; g.fillRect(0, 0, w, h); if (this.mode !== 'day') { g.globalAlpha = 0.08; drawVerityOnCanvas(g, w / 2, h / 2, 40, 'happy'); g.globalAlpha = 1; } }
    else if (mode === 'desktop') {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#3a6ea5'); gr.addColorStop(1, '#1e3f66'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 5; i++) { g.fillStyle = ['#5f9f35', '#fff', '#f2c94c', '#bbb', '#ffd21e'][i]; g.fillRect(10, 10 + i * 26, 16, 16); }
      g.fillStyle = '#245edb'; g.fillRect(0, h - 12, w, 12);
    } else if (mode === 'mc') {
      g.fillStyle = '#7aa8e8'; g.fillRect(0, 0, w, h * 0.55); g.fillStyle = '#5f9f35'; g.fillRect(0, h * 0.55, w, h * 0.1); g.fillStyle = '#866043'; g.fillRect(0, h * 0.65, w, h * 0.35); drawVerityOnCanvas(g, w * 0.55, h * 0.35, 18, 'happy');
    } else if (mode === 'verity' || mode === 'grin') { g.fillStyle = mode === 'grin' ? '#120800' : '#0a0a14'; g.fillRect(0, 0, w, h); drawVerityOnCanvas(g, w / 2, h / 2, 50, mode === 'grin' ? 'grin' : 'happy'); }
    else if (mode === 'blue') { g.fillStyle = '#0a2aa8'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = '10px monospace'; g.fillText(':) VERITY_HAS_LEFT_THE_GAME', 10, 40); g.fillText('0x00001142 ALDER_LANE', 10, 60); }
    this.pcMode = mode;
    this.monitorLight.base = mode === 'off' ? 0 : 1.6;
    this.monitorLight.light.intensity = this.monitorLight.base;
    this.monitorLight.light.color = mode === 'grin' ? '#ffa040' : mode === 'mc' ? '#9ac0ff' : '#8ab0ff';
    this.pcScreen.update();
  }
  drawTablet(mode) {
    const { g, canvas } = this.tabletScreen;
    g.fillStyle = mode === 'off' ? '#050505' : '#101018'; g.fillRect(0, 0, canvas.width, canvas.height);
    if (mode !== 'off') drawVerityOnCanvas(g, 32, 24, 14, mode === 'grin' ? 'grin' : 'happy');
    this.tabletScreen.update();
  }

  // ------------------------------------------------------------ house state
  setPower(on, instant = false) {
    this.powered = on;
    for (const k in this.lamps) { const l = this.lamps[k]; l.light.intensity = on ? l.base * (this.mode === 'final' ? 0.55 : 1) : 0; }
    const b = this.chand && this.chand.bulbMat;
    if (b) b.emissiveStrength = on ? 7 : 0;
    if (!instant) this.game.audio[on ? 'powerUp' : 'powerDown']();
  }
  kevinColor(c) { if (this.kevinRing) { this.kevinRing.color = c; this.kevinRing.emissive = c; } }
  kevin(text, opts = {}) {
    this.kevinColor(opts.evil ? '#ff3010' : '#ffd21e');
    this.kevinT = 3 + text.length * 0.06;
    this.game.ui.bark(opts.evil ? 'VERITY' : 'Kevin?', text, opts.dur);
  }
  // a yellow smiley drawn on a wall
  smileyDecal(x, y, z, ry, size = 0.5) {
    const t = paintTexture('decal', 64, 64, (g) => { g.clearRect(0, 0, 64, 64); g.strokeStyle = '#e8c010'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 26, 0, 7); g.stroke(); g.fillStyle = '#e8c010'; g.fillRect(22, 20, 4, 10); g.fillRect(38, 20, 4, 10); g.beginPath(); g.arc(32, 34, 14, 0.3, Math.PI - 0.3); g.stroke(); });
    const m = new E.Material({ name: 'Smiley decal', color: '#ffffff', map: t, emissive: '#e8c010', emissiveStrength: 0.4, roughness: 0.7 });
    const mesh = new E.Mesh(E.plane({ width: size, depth: size }), m, 'Smiley');
    mesh.setEuler(90, ry * 180 / PI, 0); mesh.position.set([x, y, z]); mesh.castShadow = false;
    this.scene.add(mesh);
    return { visible: true, node: mesh, mat: m };
  }
  thunder() { this.lightning = 0.35; this.game.audio.thunder(); if (this.onLightning) this.onLightning(); }

  update(dt) {
    super.update(dt);
    this.t += dt;
    const env = this.env;
    if (this.kevinT > 0) { this.kevinT -= dt; if (this.kevinT <= 0) this.kevinColor(this.mode === 'day' ? '#2a4a6a' : '#6a5a10'); }
    if (this.tvMode === 'static' && Math.random() < 0.3) this.drawTV('static');
    // storm
    const storming = (this.mode === 'dark' || this.stormOn) && this.storm !== false;
    if (storming) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) { this.thunderT = 9 + Math.random() * 14; this.thunder(); }
    }
    this.rainK += ((storming ? 1 : 0) - this.rainK) * Math.min(1, dt * 0.5);
    this.updateRain(dt);
    env.rain = this.rainK; env.wetness = this.rainK * 0.8;
    // lightning
    let flashK = 0;
    if (this.lightning > 0) {
      this.lightning -= dt;
      flashK = (this.lightning > 0.25 || (this.lightning > 0.1 && this.lightning < 0.17)) ? 1 : 0;
    }
    env.sunIntensity = this.baseSun + flashK * 4.5;
    env.exposure = this.baseExposure * (1 + flashK * 0.5);
    env.ambient = flashK ? Math.max(this.envAmbient, 0.6) : this.envAmbient;
    if (flashK) env.sunColor = [0.7, 0.8, 1.0];
    if (this.flicker > 0 && this.powered) {
      this.flicker -= dt;
      const k = Math.random() < 0.3 ? 0.1 : 1;
      for (const n in this.lamps) this.lamps[n].light.intensity = this.lamps[n].base * k * (this.mode === 'final' ? 0.55 : 1);
      if (this.flicker <= 0) this.setPower(true, true);
    }
    // sway
    if (this.chand) this.chand.node.setEuler(0, 0, Math.sin(this.t * 0.8) * (this.mode === 'day' ? 0.3 : 1.1));
    if (this.clockObj) this.clockObj.pendulum.setEuler(0, 0, Math.sin(this.t * 3.1) * 7);
    // phone battery
    const p = this.player;
    if (p.flashOn && this.phoneFlash) {
      this.game.ui.battery = Math.max(0, this.game.ui.battery - dt / 7);
      if (this.game.ui.battery < 15 && !this.batteryHint) { this.batteryHint = true; this.kevin('Your battery is low, Harry! There is a flashlight in the kitchen drawer! That\'s the truth! :)'); }
      if (this.game.ui.battery <= 0) { p.setFlash(false); p.hasFlash = false; this.game.ui.hint('Your phone died.', 3); }
    }
  }
}
