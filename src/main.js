import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const canvas = document.querySelector('#game-canvas');
const app = document.querySelector('#app');
const miniMap = document.querySelector('#mini-map');
const mapCtx = miniMap.getContext('2d');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const randomFrom = (seed) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const roadAxes = [-66, -22, 22, 66];
const WORLD_LIMIT = 116;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x091522);
scene.fog = new THREE.FogExp2(0x0c1a24, 0.0072);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 420);
camera.position.set(0, 6, -12);

const ambient = new THREE.HemisphereLight(0x93b3c0, 0x122019, 1.65);
scene.add(ambient);
const moon = new THREE.DirectionalLight(0xb9d2ff, 2.0);
moon.position.set(-55, 90, -42);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -120;
moon.shadow.camera.right = 120;
moon.shadow.camera.top = 120;
moon.shadow.camera.bottom = -120;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 260;
scene.add(moon);
const sunsetFill = new THREE.DirectionalLight(0xff8f6b, 0.52);
sunsetFill.position.set(70, 28, 80);
scene.add(sunsetFill);

const world = new THREE.Group();
world.name = 'Aurora Bay — Blender Environment';
scene.add(world);
const city = new THREE.Group();
city.name = 'Procedural Fallback Environment';
world.add(city);
const actors = new THREE.Group();
actors.name = 'Player and Traffic';
world.add(actors);
const fallbackBase = new THREE.Group();
fallbackBase.name = 'Procedural Fallback Ground and Water';
world.add(fallbackBase);

const mats = {
  ground: new THREE.MeshStandardMaterial({ color: 0x132a29, roughness: 1 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x1a3a31, roughness: 1 }),
  asphalt: new THREE.MeshStandardMaterial({ color: 0x17212a, roughness: 0.92, metalness: 0.08 }),
  asphaltEdge: new THREE.MeshStandardMaterial({ color: 0x202c34, roughness: 1 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0x5b6567, roughness: .96 }),
  sidewalkDark: new THREE.MeshStandardMaterial({ color: 0x3b484c, roughness: .96 }),
  lane: new THREE.MeshBasicMaterial({ color: 0xb9c49d }),
  laneYellow: new THREE.MeshBasicMaterial({ color: 0xd69654 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x152b3a, metalness: .65, roughness: .18, emissive: 0x081d2b, emissiveIntensity: .7 }),
  windowCyan: new THREE.MeshStandardMaterial({ color: 0x75e3e0, emissive: 0x2c8c92, emissiveIntensity: 2.3, roughness: .22 }),
  windowPurple: new THREE.MeshStandardMaterial({ color: 0xe18bca, emissive: 0x6a255f, emissiveIntensity: 2.1, roughness: .28 }),
  windowAmber: new THREE.MeshStandardMaterial({ color: 0xffc773, emissive: 0x925128, emissiveIntensity: 1.7, roughness: .3 }),
  windowBlue: new THREE.MeshStandardMaterial({ color: 0x83a8ff, emissive: 0x284c9f, emissiveIntensity: 1.85, roughness: .3 }),
  treeTrunk: new THREE.MeshStandardMaterial({ color: 0x3a2d2a, roughness: 1 }),
  treeLeaf: new THREE.MeshStandardMaterial({ color: 0x276354, roughness: .92, flatShading: true }),
  treeLeafDark: new THREE.MeshStandardMaterial({ color: 0x173f3b, roughness: .94, flatShading: true }),
  water: new THREE.MeshStandardMaterial({ color: 0x0b3946, roughness: .28, metalness: .42, emissive: 0x031a24, emissiveIntensity: .55 }),
  waterLine: new THREE.MeshBasicMaterial({ color: 0x35a8ae, transparent: true, opacity: .33 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffd7a4, emissive: 0xff723e, emissiveIntensity: 5 }),
  beacon: new THREE.MeshStandardMaterial({ color: 0xd6fa6a, emissive: 0x8abf30, emissiveIntensity: 3.5, transparent: true, opacity: .94 }),
  event: new THREE.MeshStandardMaterial({ color: 0xff9d50, emissive: 0xa64618, emissiveIntensity: 3.3, transparent: true, opacity: .94 }),
  cache: new THREE.MeshStandardMaterial({ color: 0x5ce3d1, emissive: 0x198f91, emissiveIntensity: 3.8, transparent: true, opacity: .95 }),
};

// Collision volumes are kept separate from render geometry so the imported GLB
// environment and the procedural fallback share the same driving physics.
const staticObstacles = [];

function addObstacle(x, z, halfX, halfZ, type = 'building') {
  staticObstacles.push({ x, z, halfX, halfZ, type });
}

function addMesh(parent, geometry, material, position = [0, 0, 0], options = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (options.rotation) mesh.rotation.set(...options.rotation);
  if (options.scale) mesh.scale.set(...options.scale);
  mesh.castShadow = options.castShadow ?? false;
  mesh.receiveShadow = options.receiveShadow ?? false;
  parent.add(mesh);
  return mesh;
}

function makeLabel(text, color = '#d6fa6a', scale = 1) {
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 96;
  const ctx = labelCanvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = 'rgba(6, 14, 20, .82)';
  ctx.beginPath();
  ctx.roundRect(10, 17, 492, 52, 8);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.globalAlpha = .55;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.font = '500 24px DM Mono, monospace';
  ctx.letterSpacing = '2px';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 44);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(7.3 * scale, 1.37 * scale, 1);
  return sprite;
}

function buildSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(210, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x102b3b, side: THREE.BackSide, fog: false })
  );
  world.add(sky);
  const starsGeometry = new THREE.BufferGeometry();
  const starPositions = [];
  for (let i = 0; i < 520; i += 1) {
    const theta = randomFrom(i + 3) * Math.PI * 2;
    const phi = Math.acos(0.12 + randomFrom(i * 2.1 + 8) * 0.77);
    const radius = 150 + randomFrom(i * 5.3) * 50;
    starPositions.push(
      Math.sin(phi) * Math.cos(theta) * radius,
      Math.cos(phi) * radius * .56 + 48,
      Math.sin(phi) * Math.sin(theta) * radius
    );
  }
  starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: 0x9bbbc7, size: .48, transparent: true, opacity: .62, sizeAttenuation: true }));
  world.add(stars);
  // A soft distant moon keeps the skyline readable without a texture dependency.
  const moonDisk = addMesh(world, new THREE.CircleGeometry(13, 32), new THREE.MeshBasicMaterial({ color: 0x90a9b1, transparent: true, opacity: .12, side: THREE.DoubleSide }), [-75, 68, -145]);
  moonDisk.lookAt(camera.position);
}

function buildGroundAndWater() {
  addMesh(fallbackBase, new THREE.PlaneGeometry(270, 270), mats.ground, [0, -.16, 0], { rotation: [-Math.PI / 2, 0, 0], receiveShadow: true });
  addMesh(fallbackBase, new THREE.PlaneGeometry(300, 44), mats.water, [0, -.08, -121], { rotation: [-Math.PI / 2, 0, 0], receiveShadow: true });
  for (let z = -139; z < -101; z += 4) {
    addMesh(fallbackBase, new THREE.BoxGeometry(280, .025, .045), mats.waterLine, [0, .01, z]);
  }
  // Promenade, seawall, and repeating mooring lights.
  addMesh(city, new THREE.BoxGeometry(270, .22, 3.5), mats.sidewalk, [0, .05, -98], { receiveShadow: true });
  addMesh(city, new THREE.BoxGeometry(270, .44, .22), mats.sidewalkDark, [0, .28, -99.8], { castShadow: true });
  for (let x = -125; x <= 125; x += 12.5) {
    addMesh(city, new THREE.BoxGeometry(.08, 1.05, .08), mats.sidewalkDark, [x, .72, -99.4]);
    addMesh(city, new THREE.BoxGeometry(2.8, .06, .05), mats.lamp, [x, 1.2, -99.4]);
  }
}

function buildRoads() {
  for (const x of roadAxes) {
    addMesh(city, new THREE.PlaneGeometry(9.6, 230), mats.asphalt, [x, -.035, 0], { rotation: [-Math.PI / 2, 0, 0], receiveShadow: true });
    addMesh(city, new THREE.BoxGeometry(.55, .035, 230), mats.asphaltEdge, [x - 5.02, -.005, 0], { receiveShadow: true });
    addMesh(city, new THREE.BoxGeometry(.55, .035, 230), mats.asphaltEdge, [x + 5.02, -.005, 0], { receiveShadow: true });
    for (let z = -106; z <= 106; z += 8) {
      addMesh(city, new THREE.BoxGeometry(.12, .025, 3.9), mats.lane, [x, .02, z]);
    }
    for (let z = -101; z <= 101; z += 22) {
      addMesh(city, new THREE.BoxGeometry(.09, .025, 2.3), mats.laneYellow, [x - 3.05, .02, z]);
    }
    // sidewalks run just outside every carriageway.
    addMesh(city, new THREE.BoxGeometry(1.8, .12, 230), mats.sidewalk, [x - 6.1, .03, 0], { receiveShadow: true });
    addMesh(city, new THREE.BoxGeometry(1.8, .12, 230), mats.sidewalk, [x + 6.1, .03, 0], { receiveShadow: true });
  }
  for (const z of roadAxes) {
    addMesh(city, new THREE.PlaneGeometry(230, 9.6), mats.asphalt, [0, -.034, z], { rotation: [-Math.PI / 2, 0, 0], receiveShadow: true });
    addMesh(city, new THREE.BoxGeometry(230, .035, .55), mats.asphaltEdge, [0, -.004, z - 5.02], { receiveShadow: true });
    addMesh(city, new THREE.BoxGeometry(230, .035, .55), mats.asphaltEdge, [0, -.004, z + 5.02], { receiveShadow: true });
    for (let x = -106; x <= 106; x += 8) {
      addMesh(city, new THREE.BoxGeometry(3.9, .025, .12), mats.lane, [x, .02, z]);
    }
    for (let x = -101; x <= 101; x += 22) {
      addMesh(city, new THREE.BoxGeometry(2.3, .025, .09), mats.laneYellow, [x, .02, z - 3.05]);
    }
    addMesh(city, new THREE.BoxGeometry(230, .12, 1.8), mats.sidewalk, [0, .03, z - 6.1], { receiveShadow: true });
    addMesh(city, new THREE.BoxGeometry(230, .12, 1.8), mats.sidewalk, [0, .03, z + 6.1], { receiveShadow: true });
  }
  // Clean crosswalks make the grid legible from the chase camera.
  for (const x of roadAxes) {
    for (const z of roadAxes) {
      for (let n = -3; n <= 3; n += 1) {
        addMesh(city, new THREE.BoxGeometry(.62, .028, 4.8), mats.lane, [x + n * .98, .025, z - 5.9]);
        addMesh(city, new THREE.BoxGeometry(.62, .028, 4.8), mats.lane, [x + n * .98, .025, z + 5.9]);
        addMesh(city, new THREE.BoxGeometry(4.8, .028, .62), mats.lane, [x - 5.9, .025, z + n * .98]);
        addMesh(city, new THREE.BoxGeometry(4.8, .028, .62), mats.lane, [x + 5.9, .025, z + n * .98]);
      }
    }
  }
}

function createWindow(parent, x, y, z, width, depth, material, rotation = [0, 0, 0]) {
  return addMesh(parent, new THREE.BoxGeometry(width, .45, depth), material, [x, y, z], { rotation });
}

function createBuilding(x, z, width, depth, height, colorIndex, seed) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.name = `Blender building ${seed}`;
  const palette = [0x253c4a, 0x30434b, 0x3d3d4c, 0x24484b, 0x4b3f4b, 0x35455b];
  const bodyMat = new THREE.MeshStandardMaterial({ color: palette[colorIndex % palette.length], roughness: .88, metalness: .08 });
  addMesh(group, new THREE.BoxGeometry(width, height, depth), bodyMat, [0, height / 2, 0], { castShadow: true, receiveShadow: true });
  addMesh(group, new THREE.BoxGeometry(width + .16, .11, depth + .16), mats.sidewalkDark, [0, height + .07, 0], { castShadow: true });
  const windowMats = [mats.windowCyan, mats.windowPurple, mats.windowAmber, mats.windowBlue];
  const chosenWindow = windowMats[colorIndex % windowMats.length];
  const floors = Math.max(2, Math.floor(height / 3.1));
  const frontCols = Math.max(2, Math.floor(width / 2.7));
  const sideCols = Math.max(2, Math.floor(depth / 2.7));
  for (let floor = 0; floor < floors; floor += 1) {
    const y = 1.35 + floor * 3.05;
    for (let col = 0; col < frontCols; col += 1) {
      const windowX = -width / 2 + 1.35 + col * ((width - 2.2) / Math.max(1, frontCols - 1));
      const lit = randomFrom(seed * 9 + floor * 31 + col * 17) > .27;
      if (lit) {
        createWindow(group, windowX, y, depth / 2 + .025, .72, .035, chosenWindow);
        if (randomFrom(seed + floor * 8 + col) > .35) createWindow(group, windowX, y, -depth / 2 - .025, .72, .035, chosenWindow);
      }
    }
    for (let col = 0; col < sideCols; col += 1) {
      const windowZ = -depth / 2 + 1.35 + col * ((depth - 2.2) / Math.max(1, sideCols - 1));
      if (randomFrom(seed * 4 + floor * 18 + col * 5) > .34) {
        createWindow(group, width / 2 + .025, y, windowZ, .035, .72, windowMats[(colorIndex + 1) % windowMats.length], [0, Math.PI / 2, 0]);
      }
    }
  }
  if (randomFrom(seed * 1.7) > .28) {
    addMesh(group, new THREE.BoxGeometry(width * .28, .45, depth * .24), mats.sidewalkDark, [width * .17, height + .32, -depth * .12], { castShadow: true });
    addMesh(group, new THREE.CylinderGeometry(.055, .055, 1.2, 6), mats.lamp, [width * .17, height + 1.1, -depth * .12]);
  }
  if (randomFrom(seed * 2.5) > .67) {
    const sign = makeLabel(randomFrom(seed) > .5 ? 'NOVA' : '24 / 7', randomFrom(seed + 3) > .5 ? '#5ce3d1' : '#ff9d50', .53);
    sign.position.set(0, Math.min(height - 1.2, 13), depth / 2 + .13);
    group.add(sign);
  }
  addObstacle(x, z, width / 2 + .85, depth / 2 + .85, 'building');
  city.add(group);
  return group;
}

function createTree(x, z, scale = 1, seed = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  addMesh(group, new THREE.CylinderGeometry(.18, .28, 1.5, 7), mats.treeTrunk, [0, .75, 0], { castShadow: true });
  const leafMaterial = randomFrom(seed) > .5 ? mats.treeLeaf : mats.treeLeafDark;
  addMesh(group, new THREE.IcosahedronGeometry(1.18, 1), leafMaterial, [0, 2.0, 0], { castShadow: true });
  addMesh(group, new THREE.IcosahedronGeometry(.75, 1), leafMaterial, [.55, 2.55, .08], { castShadow: true });
  addMesh(group, new THREE.IcosahedronGeometry(.66, 1), leafMaterial, [-.53, 2.48, -.1], { castShadow: true });
  city.add(group);
  return group;
}

function createPark(x, z, width, depth) {
  addMesh(city, new THREE.BoxGeometry(width, .08, depth), mats.grass, [x, -.03, z], { receiveShadow: true });
  addMesh(city, new THREE.BoxGeometry(width - 2, .035, 1.0), mats.sidewalk, [x, .02, z], { receiveShadow: true });
  addMesh(city, new THREE.BoxGeometry(1.0, .035, depth - 2), mats.sidewalk, [x, .025, z], { receiveShadow: true });
  for (let i = 0; i < 9; i += 1) {
    const tx = x - width * .38 + randomFrom(i + 14) * width * .76;
    const tz = z - depth * .38 + randomFrom(i + 40) * depth * .76;
    createTree(tx, tz, .75 + randomFrom(i + 90) * .38, i + 80);
  }
}

function populateCity() {
  const blocks = [-91, -44, 0, 44, 91];
  let seed = 10;
  for (const x of blocks) {
    for (const z of blocks) {
      if (z < -77) continue;
      // Leave breathing room for the two authored landmarks in the south block.
      if ((x === 44 && z === -44) || (x === -44 && z === -44)) continue;
      if (x === 0 && z === 44) {
        createPark(x, z, 28, 23);
        continue;
      }
      const buildingCount = randomFrom(seed) > .48 ? 2 : 1;
      for (let i = 0; i < buildingCount; i += 1) {
        const width = buildingCount === 1 ? 19 + randomFrom(seed + 1) * 7 : 8.5 + randomFrom(seed + i) * 4;
        const depth = buildingCount === 1 ? 17 + randomFrom(seed + 2) * 7 : 10 + randomFrom(seed + i + 5) * 4;
        const px = x + (buildingCount === 1 ? 0 : (i === 0 ? -7 : 7));
        const pz = z + (buildingCount === 1 ? 0 : (randomFrom(seed + 6) - .5) * 7);
        const height = 7 + randomFrom(seed + i * 7) * 20 + (z > 60 ? 5 : 0);
        createBuilding(px, pz, width, depth, height, Math.floor(randomFrom(seed + i * 11) * 6), seed);
        seed += 3;
      }
      seed += 13;
    }
  }
  // Waterfront park and a few palms on the approach.
  addMesh(city, new THREE.BoxGeometry(70, .05, 11), mats.grass, [-48, -.04, -91], { receiveShadow: true });
  for (let i = 0; i < 12; i += 1) createTree(-78 + randomFrom(i * 8) * 55, -93 + randomFrom(i * 5) * 4, .8 + randomFrom(i + 3) * .3, i + 240);
}

function createStreetLight(x, z, horizontal = false, seed = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const pole = addMesh(group, new THREE.CylinderGeometry(.07, .105, 4.7, 7), mats.sidewalkDark, [0, 2.35, 0], { castShadow: true });
  pole.rotation.z = horizontal ? .03 : 0;
  addMesh(group, new THREE.BoxGeometry(horizontal ? 1.4 : .08, .08, horizontal ? .08 : 1.4), mats.sidewalkDark, [horizontal ? .54 : 0, 4.68, horizontal ? 0 : .54]);
  const lamp = addMesh(group, new THREE.SphereGeometry(.16, 8, 8), mats.lamp, [horizontal ? 1.08 : 0, 4.57, horizontal ? 0 : 1.08]);
  if (seed % 4 === 0) {
    const light = new THREE.PointLight(0xff9561, 1.3, 13, 2);
    light.position.copy(lamp.position);
    group.add(light);
  }
  city.add(group);
}

function populateStreetLights() {
  let seed = 0;
  for (const x of roadAxes) {
    for (let z = -88; z <= 88; z += 22) {
      createStreetLight(x - 7.8, z + 5.8, false, seed++);
      if (z % 44 === 0) createStreetLight(x + 7.8, z - 5.8, false, seed++);
    }
  }
  for (const z of roadAxes) {
    for (let x = -88; x <= 88; x += 22) {
      if (x % 44 === 0) createStreetLight(x - 5.8, z - 7.8, true, seed++);
    }
  }
}

function createPulseStation(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  addObstacle(x, z, 6.7, 6.7, 'landmark');
  addMesh(group, new THREE.CylinderGeometry(7, 7, .35, 32), mats.asphaltEdge, [0, .17, 0], { receiveShadow: true });
  addMesh(group, new THREE.CylinderGeometry(5.3, 5.3, .12, 32), mats.grass, [0, .39, 0]);
  for (let i = 0; i < 3; i += 1) {
    const ring = addMesh(group, new THREE.TorusGeometry(3.7 - i * .9, .065, 8, 48), mats.beacon, [0, .52 + i * .23, 0], { rotation: [Math.PI / 2, 0, 0] });
    ring.material = mats.beacon;
  }
  addMesh(group, new THREE.CylinderGeometry(.14, .14, 7, 8), mats.beacon, [0, 3.8, 0]);
  addMesh(group, new THREE.SphereGeometry(.35, 12, 12), mats.beacon, [0, 7.35, 0]);
  const light = new THREE.PointLight(0xd6fa6a, 3.3, 25, 2);
  light.position.set(0, 5, 0);
  group.add(light);
  const label = makeLabel('PULSE STATION', '#d6fa6a', .66);
  label.position.set(0, 9.2, 0);
  group.add(label);
  city.add(group);
  return group;
}

function createGasStop(x, z) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  addObstacle(x, z, 8.7, 6.4, 'landmark');
  addMesh(group, new THREE.BoxGeometry(17, .25, 12), mats.sidewalk, [0, .12, 0], { receiveShadow: true });
  for (const px of [-5, 0, 5]) {
    addMesh(group, new THREE.BoxGeometry(.35, 2.1, .35), mats.sidewalkDark, [px, 1.17, 0], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(4.7, .22, .28), mats.lamp, [px + (px < 0 ? 1.5 : -1.5), 2.18, 0]);
  }
  addMesh(group, new THREE.BoxGeometry(15, .18, 2.5), mats.sidewalkDark, [0, 2.12, 0]);
  const sign = makeLabel('OCTANE', '#ff9d50', .62);
  sign.position.set(0, 2.25, 1.3);
  group.add(sign);
  city.add(group);
}

function buildLandmarks() {
  createPulseStation(44, -44);
  createGasStop(-44, -44);
  const neonDistrict = makeLabel('NEON DISTRICT', '#ff5b9c', .78);
  neonDistrict.position.set(66, 18, -77);
  city.add(neonDistrict);
}

const CAR_PROFILES = {
  sport: { label: 'MIDNIGHT GT', scale: [1, 1, 1] },
  hatch: { label: 'METRO HATCH', scale: [.91, .94, .84] },
  supercar: { label: 'VELOCE R', scale: [.96, .82, 1.02] },
  suv: { label: 'TRAIL SCOUT', scale: [1.08, 1.22, 1.02] },
  pickup: { label: 'HARBOR UTILITY', scale: [1.1, 1.07, 1.06] },
  wagon: { label: 'GRAND TOURER', scale: [1.04, 1.03, 1.1] },
  classic: { label: 'CINDER CLASSIC', scale: [1.1, 1.02, 1.05] },
  ev: { label: 'PULSE EV', scale: [1.02, .98, 1] },
};

function createCar(color = 0x7a9bff, accent = 0xd6fa6a, playerCar = false, style = 'sport') {
  const profile = CAR_PROFILES[style] || CAR_PROFILES.sport;
  const root = new THREE.Group();
  root.name = playerCar ? 'Blender Midnight GT — Player' : `${profile.label} — Fictional Traffic Vehicle`;
  root.userData.wheels = [];
  root.userData.style = style;
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color, metalness: .75, roughness: .23, clearcoat: 1, clearcoatRoughness: .13 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x101720, metalness: .65, roughness: .23 });
  const accentMaterial = new THREE.MeshStandardMaterial({ color: accent, metalness: .4, roughness: .22, emissive: accent, emissiveIntensity: playerCar ? .32 : .08 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xf3fbff, emissive: 0xa8dcff, emissiveIntensity: 4.5, transparent: true, opacity: .98 });
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xff465e, emissive: 0xff1835, emissiveIntensity: 3.4 });
  addMesh(root, new THREE.BoxGeometry(2.25, .48, 4.35), bodyMaterial, [0, .62, 0], { castShadow: true, receiveShadow: true });
  addMesh(root, new THREE.BoxGeometry(2.08, .24, 1.4), bodyMaterial, [0, .86, 1.35], { castShadow: true });
  addMesh(root, new THREE.BoxGeometry(2.05, .23, 1.05), bodyMaterial, [0, .84, -1.48], { castShadow: true });
  // A faceted cabin is intentionally close to the Blender low-poly asset script in blender/create_assets.py.
  const cabinGeometry = new THREE.BufferGeometry();
  const cabinVertices = new Float32Array([
    -.86, .87, -.9, .86, .87, -.9, -.72, 1.74, -.34, .72, 1.74, -.34,
    -.72, 1.74, .72, .72, 1.74, .72, -.86, .87, .9, .86, .87, .9,
  ]);
  const cabinIndices = [0, 1, 3, 0, 3, 2, 2, 3, 5, 2, 5, 4, 4, 5, 7, 4, 7, 6, 0, 2, 4, 0, 4, 6, 1, 7, 5, 1, 5, 3];
  cabinGeometry.setAttribute('position', new THREE.BufferAttribute(cabinVertices, 3));
  cabinGeometry.setIndex(cabinIndices);
  cabinGeometry.computeVertexNormals();
  addMesh(root, cabinGeometry, darkMaterial, [0, 0, 0], { castShadow: true });
  addMesh(root, new THREE.BoxGeometry(1.74, .05, 2.18), mats.glass, [0, 1.47, .05], { rotation: [Math.PI * .5, 0, 0] });
  addMesh(root, new THREE.BoxGeometry(1.64, .04, .58), mats.glass, [0, 1.46, .58], { rotation: [Math.PI * .5, 0, 0] });
  // Continuous side skirts and a rear diffuser sell the custom body kit.
  addMesh(root, new THREE.BoxGeometry(.11, .2, 3.65), accentMaterial, [-1.1, .47, 0], { castShadow: true });
  addMesh(root, new THREE.BoxGeometry(.11, .2, 3.65), accentMaterial, [1.1, .47, 0], { castShadow: true });
  addMesh(root, new THREE.BoxGeometry(1.76, .12, .14), accentMaterial, [0, .48, -2.16], { castShadow: true });
  for (const x of [-.71, .71]) {
    addMesh(root, new THREE.BoxGeometry(.28, .15, .08), headMaterial, [x, .78, 2.16]);
    addMesh(root, new THREE.BoxGeometry(.3, .14, .08), tailMaterial, [x, .76, -2.16]);
  }
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x080d12, metalness: .15, roughness: .8 });
  const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xaeb8bf, metalness: .87, roughness: .2 });
  for (const [x, z, isFront] of [[-1.14, 1.35, true], [1.14, 1.35, true], [-1.14, -1.35, false], [1.14, -1.35, false]]) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(x, .46, z);
    wheelGroup.rotation.z = Math.PI / 2;
    const tire = addMesh(wheelGroup, new THREE.CylinderGeometry(.46, .46, .3, 12), wheelMaterial, [0, 0, 0], { rotation: [0, 0, 0], castShadow: true });
    addMesh(wheelGroup, new THREE.CylinderGeometry(.24, .24, .315, 10), rimMaterial, [0, 0, 0]);
    addMesh(wheelGroup, new THREE.CylinderGeometry(.09, .09, .325, 10), accentMaterial, [0, 0, 0]);
    wheelGroup.userData.isFront = isFront;
    wheelGroup.userData.baseX = x;
    root.userData.wheels.push(wheelGroup);
    root.add(wheelGroup);
  }
  if (playerCar) {
    addMesh(root, new THREE.BoxGeometry(1.7, .09, .13), accentMaterial, [0, 1.2, -2.03], { castShadow: true });
    addMesh(root, new THREE.BoxGeometry(.08, .25, .08), darkMaterial, [-.73, 1.09, -2.03]);
    addMesh(root, new THREE.BoxGeometry(.08, .25, .08), darkMaterial, [.73, 1.09, -2.03]);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 3.45), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: .19, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = .12;
    root.add(glow);
  }
  // Distinct, fictional silhouettes inspired by familiar road-car categories.
  // No brand badges, logos, or exact licensed trim are used in the traffic fleet.
  if (style === 'hatch') {
    addMesh(root, new THREE.BoxGeometry(1.75, .28, .92), bodyMaterial, [0, 1.12, -.95], { castShadow: true });
    addMesh(root, new THREE.BoxGeometry(1.55, .09, .14), accentMaterial, [0, 1.4, -1.7]);
    addMesh(root, new THREE.BoxGeometry(1.85, .16, .16), darkMaterial, [0, .5, -2.15]);
  } else if (style === 'supercar') {
    addMesh(root, new THREE.BoxGeometry(2.0, .09, 1.22), accentMaterial, [0, .48, 2.08], { castShadow: true });
    addMesh(root, new THREE.BoxGeometry(.16, .32, 2.5), accentMaterial, [-1.02, .62, .05]);
    addMesh(root, new THREE.BoxGeometry(.16, .32, 2.5), accentMaterial, [1.02, .62, .05]);
    addMesh(root, new THREE.BoxGeometry(1.35, .1, .1), darkMaterial, [0, 1.04, -2.12]);
  } else if (style === 'suv') {
    addMesh(root, new THREE.BoxGeometry(1.85, .12, 2.25), darkMaterial, [-.68, 1.92, 0], { castShadow: true });
    addMesh(root, new THREE.BoxGeometry(1.85, .12, 2.25), darkMaterial, [.68, 1.92, 0], { castShadow: true });
    addMesh(root, new THREE.BoxGeometry(2.2, .18, .22), accentMaterial, [0, .48, -2.18]);
    addMesh(root, new THREE.BoxGeometry(2.2, .18, .22), accentMaterial, [0, .48, 2.18]);
  } else if (style === 'pickup') {
    addMesh(root, new THREE.BoxGeometry(.17, .45, 1.42), bodyMaterial, [-.92, 1.04, -1.2], { castShadow: true });
    addMesh(root, new THREE.BoxGeometry(.17, .45, 1.42), bodyMaterial, [.92, 1.04, -1.2], { castShadow: true });
    addMesh(root, new THREE.BoxGeometry(1.95, .12, .12), accentMaterial, [0, 1.27, -1.92]);
    addMesh(root, new THREE.BoxGeometry(2.18, .18, .18), darkMaterial, [0, .48, -2.2]);
  } else if (style === 'wagon') {
    addMesh(root, new THREE.BoxGeometry(1.8, .32, 1.7), bodyMaterial, [0, 1.17, -.65], { castShadow: true });
    addMesh(root, new THREE.BoxGeometry(1.55, .06, 1.45), mats.glass, [0, 1.5, -.65], { rotation: [Math.PI * .5, 0, 0] });
    addMesh(root, new THREE.BoxGeometry(1.55, .1, .12), accentMaterial, [0, 1.48, -1.55]);
  } else if (style === 'classic') {
    addMesh(root, new THREE.BoxGeometry(.7, .18, .5), bodyMaterial, [0, 1.08, 1.12], { castShadow: true });
    addMesh(root, new THREE.BoxGeometry(2.35, .16, .18), rimMaterial, [0, .6, 2.2]);
    addMesh(root, new THREE.BoxGeometry(2.35, .16, .18), rimMaterial, [0, .6, -2.2]);
    addMesh(root, new THREE.BoxGeometry(.12, .14, 2.2), accentMaterial, [-1.16, .54, 0]);
    addMesh(root, new THREE.BoxGeometry(.12, .14, 2.2), accentMaterial, [1.16, .54, 0]);
  } else if (style === 'ev') {
    addMesh(root, new THREE.BoxGeometry(1.5, .16, 1.75), mats.glass, [0, 1.32, -.18], { rotation: [Math.PI * .5, 0, 0] });
    addMesh(root, new THREE.BoxGeometry(1.72, .05, 3.2), accentMaterial, [0, .87, -.05]);
    addMesh(root, new THREE.BoxGeometry(.07, .13, .75), accentMaterial, [1.13, .74, .4]);
  }
  root.scale.set(...profile.scale);
  return root;
}

function createTraffic() {
  const colors = [0xe25d63, 0xf2a260, 0x62a4bd, 0x8d72bd, 0xd8d9c4, 0x3e8f88, 0xc6cf5f, 0x7c6bf2, 0xc44966];
  const styles = ['hatch', 'supercar', 'pickup', 'suv', 'wagon', 'classic', 'ev', 'sport', 'hatch', 'pickup', 'suv', 'wagon', 'classic', 'ev', 'supercar', 'sport', 'hatch', 'suv'];
  for (let i = 0; i < styles.length; i += 1) {
    const vertical = i % 2 === 0;
    const axis = roadAxes[(i * 3 + 1) % roadAxes.length];
    const lane = i % 4 < 2 ? -2.05 : 2.05;
    const car = createCar(colors[i % colors.length], i % 2 ? 0x5ce3d1 : 0xff9d50, false, styles[i]);
    car.scale.multiplyScalar(.78);
    car.position.set(vertical ? axis + lane : -104 + randomFrom(i + 2) * 208, .02, vertical ? -104 + randomFrom(i + 7) * 208 : axis + lane);
    const direction = i % 2 === 0 ? 1 : -1;
    const heading = vertical ? (direction > 0 ? 0 : Math.PI) : (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.rotation.y = heading;
    actors.add(car);
    traffic.push({ mesh: car, vertical, axis, lane, speed: 7 + randomFrom(i + 40) * 7, direction, heading });
  }
}

const traffic = [];
const gltfLoader = new GLTFLoader();

function prepareImportedModel(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (object.material) {
      object.material.needsUpdate = true;
    }
  });
  return root;
}

function replaceVehicleVisual(vehicleRoot, sourceScene, scale = 1) {
  // Keep the physics wrapper and replace only its visible geometry with the
  // authored asset. This lets the driving code remain the same for fallback and GLB cars.
  vehicleRoot.children.forEach((child) => { child.visible = false; });
  const importedCar = prepareImportedModel(sourceScene.clone(true));
  importedCar.scale.setScalar(scale);
  vehicleRoot.add(importedCar);
  vehicleRoot.userData.loadedModel = importedCar;
  vehicleRoot.userData.loadedWheels = [];
  importedCar.traverse((object) => {
    if (object.isMesh && /(wheel|tire|hub)/i.test(object.name)) vehicleRoot.userData.loadedWheels.push(object);
  });
}

function loadOneAsset(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject);
  });
}

async function loadBlenderAssets() {
  const [environmentResult, carResult] = await Promise.allSettled([
    loadOneAsset('./assets/aurora_bay_environment.glb'),
    loadOneAsset('./assets/midnight_gt.glb'),
  ]);
  if (environmentResult.status === 'fulfilled') {
    const importedEnvironment = prepareImportedModel(environmentResult.value.scene);
    importedEnvironment.name = 'Aurora Bay Environment — Blender GLB';
    city.visible = false;
    fallbackBase.visible = false;
    world.add(importedEnvironment);
  } else {
    console.warn('Blender environment unavailable; using procedural fallback.', environmentResult.reason);
  }
  if (carResult.status === 'fulfilled') {
    const importedCar = carResult.value.scene;
    replaceVehicleVisual(player.mesh, importedCar, 1);
    // Traffic keeps its authored fictional silhouettes so the streets do not fill with clones.
    replaceVehicleVisual(policeVehicle, importedCar, .82);
  } else {
    console.warn('Blender car unavailable; using procedural fallback.', carResult.reason);
  }
}

function buildWorld() {
  buildSky();
  buildGroundAndWater();
  buildRoads();
  populateCity();
  populateStreetLights();
  buildLandmarks();
  createTraffic();
}

const player = {
  mesh: createCar(0x303fca, 0xd6fa6a, true),
  position: new THREE.Vector3(0, .02, 0),
  speed: 0,
  heading: 0,
  nitro: 76,
  distance: 0,
  rep: 1280,
  cash: 420,
  upgrades: { engine: 0, nitro: 0, grip: 0 },
  collectedCaches: [],
};
player.mesh.position.copy(player.position);
actors.add(player.mesh);

const beaconPositions = [
  new THREE.Vector3(66, .05, 22),
  new THREE.Vector3(66, .05, -66),
  new THREE.Vector3(-66, .05, -66),
  new THREE.Vector3(-66, .05, 66),
];
const beaconNames = ['NORTHSTAR OVERLOOK', 'PULSE STATION', 'OCTANE ROW', 'SOUTH MARKET'];
const beacons = [];
beaconPositions.forEach((position, index) => {
  const group = new THREE.Group();
  group.position.copy(position);
  const ring = addMesh(group, new THREE.TorusGeometry(2.25, .11, 8, 32), mats.beacon, [0, .14, 0], { rotation: [Math.PI / 2, 0, 0] });
  const ring2 = addMesh(group, new THREE.TorusGeometry(1.15, .045, 8, 24), mats.beacon, [0, .3, 0], { rotation: [Math.PI / 2, 0, 0] });
  const beam = addMesh(group, new THREE.CylinderGeometry(.035, .035, 5.4, 6), mats.beacon, [0, 2.8, 0]);
  const beaconLight = new THREE.PointLight(0xd6fa6a, index === 0 ? 2.3 : .7, 14, 2);
  beaconLight.position.y = 2.4;
  group.add(beaconLight);
  const label = makeLabel(index === 0 ? 'NEXT BEACON' : beaconNames[index], index === 0 ? '#d6fa6a' : '#7c9a84', .48);
  label.position.y = 5.3;
  group.add(label);
  group.userData = { ring, ring2, beam, light: beaconLight, label, baseOpacity: index === 0 ? 1 : .45 };
  world.add(group);
  beacons.push(group);
});

const raceRoute = [
  new THREE.Vector3(22, .08, 22),
  new THREE.Vector3(22, .08, 66),
  new THREE.Vector3(-22, .08, 66),
  new THREE.Vector3(-22, .08, -22),
  new THREE.Vector3(66, .08, -22),
  new THREE.Vector3(66, .08, 66),
];
const raceMarkers = [];
const raceGate = new THREE.Group();
raceGate.position.copy(raceRoute[0]);
addMesh(raceGate, new THREE.BoxGeometry(.42, 4.7, .42), mats.event, [-4.2, 2.35, 0], { castShadow: true });
addMesh(raceGate, new THREE.BoxGeometry(.42, 4.7, .42), mats.event, [4.2, 2.35, 0], { castShadow: true });
addMesh(raceGate, new THREE.BoxGeometry(8.8, .34, .42), mats.event, [0, 4.6, 0], { castShadow: true });
const gateRing = addMesh(raceGate, new THREE.TorusGeometry(3.25, .09, 8, 36), mats.event, [0, 2.15, 0], { rotation: [Math.PI / 2, 0, 0] });
const gateLabel = makeLabel('MIDNIGHT SPRINT', '#ff9d50', .62);
gateLabel.position.set(0, 5.55, 0);
raceGate.add(gateLabel);
world.add(raceGate);
for (let index = 1; index < raceRoute.length; index += 1) {
  const marker = new THREE.Group();
  marker.position.copy(raceRoute[index]);
  const ring = addMesh(marker, new THREE.TorusGeometry(2.45, .08, 8, 32), mats.event, [0, .2, 0], { rotation: [Math.PI / 2, 0, 0] });
  const beam = addMesh(marker, new THREE.CylinderGeometry(.028, .028, 4.6, 6), mats.event, [0, 2.3, 0]);
  const label = makeLabel(index === raceRoute.length - 1 ? 'FINISH' : `CHECKPOINT 0${index}`, '#ff9d50', .42);
  label.position.y = 4.8;
  marker.add(label);
  marker.userData = { ring, beam, label };
  world.add(marker);
  raceMarkers.push(marker);
}
let raceState = 'idle';
let raceIndex = 1;
let raceTime = 0;
let raceCountdown = 0;
let raceCountdownLast = 0;
let raceBest = 102.8;
let raceNear = false;
let garageOpen = false;
let gamePaused = false;
let qualityMode = 'HIGH';
const upgradeConfig = {
  engine: { costs: [240, 420, 700] },
  nitro: { costs: [220, 380, 620] },
  grip: { costs: [180, 320, 540] },
};

function saveProgress() {
  try {
    localStorage.setItem('neonline-aurora-save', JSON.stringify({
      cash: player.cash,
      rep: player.rep,
      upgrades: player.upgrades,
      raceBest,
      cacheIds: player.collectedCaches,
    }));
  } catch (error) {
    console.warn('Progress save unavailable.', error);
  }
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem('neonline-aurora-save') || 'null');
    if (!saved) return;
    if (Number.isFinite(saved.cash)) player.cash = saved.cash;
    if (Number.isFinite(saved.rep)) player.rep = saved.rep;
    if (Number.isFinite(saved.raceBest)) raceBest = saved.raceBest;
    if (Array.isArray(saved.cacheIds)) player.collectedCaches = saved.cacheIds.map((id) => Number(id)).filter((id) => Number.isInteger(id));
    if (saved.upgrades) Object.keys(player.upgrades).forEach((key) => {
      player.upgrades[key] = clamp(Number(saved.upgrades[key]) || 0, 0, 3);
    });
    player.nitro = Math.min(player.nitro, 100 + player.upgrades.nitro * 12);
  } catch (error) {
    console.warn('Progress load unavailable.', error);
  }
}
loadProgress();

function formatRaceTime(seconds) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const remainder = (safeSeconds % 60).toFixed(2).padStart(5, '0');
  return `${minutes}:${remainder}`;
}

function raceAction() {
  if (!raceNear && raceState === 'idle') return;
  if (raceState === 'idle') {
    raceState = 'countdown';
    raceCountdown = 3.4;
    raceCountdownLast = 4;
    raceTime = 0;
    raceIndex = 1;
    player.speed = 0;
    playTone(240, .22, .08, 'square', 20);
    showToast('EVENT READY', 'Hold the line — the sprint starts now', 'MIDNIGHT SPRINT');
  } else if (raceState === 'finished' && raceNear) {
    raceState = 'countdown';
    raceCountdown = 3.4;
    raceCountdownLast = 4;
    raceTime = 0;
    raceIndex = 1;
    player.speed = 0;
    showToast('REMATCH', 'Beat your last line through Aurora Bay', 'MIDNIGHT SPRINT');
  }
}

function updateRace(time, dt) {
  const distanceToStart = player.position.distanceTo(raceRoute[0]);
  raceNear = distanceToStart < 11;
  if (raceState === 'countdown') {
    raceCountdown -= dt;
    const count = Math.ceil(raceCountdown);
    if (count > 0 && count !== raceCountdownLast) {
      raceCountdownLast = count;
      playTone(250 + (4 - count) * 55, .16, .07, 'square', 20);
    }
    if (raceCountdown <= 0) {
      raceState = 'active';
      raceTime = 0;
      playTone(620, .24, .1, 'sine', 240);
    }
  } else if (raceState === 'active') {
    raceTime += dt;
    const checkpointDistance = player.position.distanceTo(raceRoute[raceIndex]);
    if (checkpointDistance < 7.4) {
      playTone(480 + raceIndex * 34, .13, .06, 'sine', 90);
      raceIndex += 1;
      if (raceIndex >= raceRoute.length) {
        raceState = 'finished';
        const newBest = raceTime < raceBest;
        if (newBest) raceBest = raceTime;
        player.rep += newBest ? 300 : 120;
        player.cash += newBest ? 180 : 80;
        saveProgress();
        playBeacon();
        showToast(newBest ? 'NEW PERSONAL BEST' : 'SPRINT COMPLETE', `${formatRaceTime(raceTime)} through the city grid`, newBest ? '+300 REP' : '+120 REP');
      }
    }
  }

  gateRing.rotation.z += dt * 1.1;
  const gatePulse = (Math.sin(time * .004) + 1) / 2;
  gateRing.scale.setScalar(1 + gatePulse * .12);
  raceMarkers.forEach((marker, markerIndex) => {
    const routeIndex = markerIndex + 1;
    const active = raceState === 'active' && raceIndex === routeIndex;
    const visible = active || (raceState === 'countdown' && routeIndex === 1);
    const data = marker.userData;
    marker.visible = visible;
    if (visible) {
      data.ring.rotation.z -= dt * 1.4;
      data.ring.scale.setScalar(1 + gatePulse * .14);
      data.beam.scale.y = 1 + gatePulse * .2;
      data.label.material.opacity = 1;
    }
  });

  const panel = document.querySelector('#event-panel');
  const panelVisible = raceNear || raceState === 'countdown' || raceState === 'active' || raceState === 'finished';
  panel.classList.toggle('visible', panelVisible);
  panel.classList.toggle('active', raceState === 'countdown' || raceState === 'active');
  panel.classList.toggle('finished', raceState === 'finished');
  const status = document.querySelector('#event-status');
  const title = document.querySelector('#event-title');
  const copy = document.querySelector('#event-copy');
  const timeReadout = document.querySelector('#event-time');
  const action = document.querySelector('#event-action');
  document.querySelector('#event-best').textContent = formatRaceTime(raceBest);
  if (raceState === 'idle') {
    status.textContent = raceNear ? 'READY' : 'OPEN WORLD';
    title.textContent = 'MIDNIGHT SPRINT';
    copy.textContent = raceNear ? 'Hit E to launch a five-checkpoint time trial.' : 'Find the orange start gate on the map and chase a clean line.';
    timeReadout.textContent = raceNear ? 'PRESS E' : 'ROUTE EVENT';
    action.innerHTML = raceNear ? '<span class="keycap">E</span><span>START EVENT</span>' : '<span>ORANGE GATE // 5 CHECKPOINTS</span>';
  } else if (raceState === 'countdown') {
    status.textContent = raceCountdown > 0 ? `START ${Math.max(1, Math.ceil(raceCountdown))}` : 'GO';
    title.textContent = 'MIDNIGHT SPRINT';
    copy.textContent = 'Stay on the asphalt. Missed gates do not count.';
    timeReadout.textContent = '00:00.00';
    action.innerHTML = '<span class="keycap">W</span><span>LAUNCH</span>';
  } else if (raceState === 'active') {
    status.textContent = `CHECKPOINT ${String(raceIndex).padStart(2, '0')} / 05`;
    title.textContent = 'MIDNIGHT SPRINT';
    copy.textContent = 'Thread the next orange gate before the clock catches you.';
    timeReadout.textContent = formatRaceTime(raceTime);
    action.innerHTML = '<span class="event-live-dot"></span><span>EVENT LIVE</span>';
  } else {
    status.textContent = 'FINISHED';
    title.textContent = 'SPRINT COMPLETE';
    copy.textContent = `Run time ${formatRaceTime(raceTime)}. Return to the gate for a rematch.`;
    timeReadout.textContent = formatRaceTime(raceTime);
    action.innerHTML = raceNear ? '<span class="keycap">E</span><span>REMATCH</span>' : '<span>ROUTE CLEARED</span>';
  }
}

const collectiblePositions = [
  new THREE.Vector3(-66, .42, 22),
  new THREE.Vector3(-22, .42, 66),
  new THREE.Vector3(22, .42, -66),
  new THREE.Vector3(66, .42, -22),
  new THREE.Vector3(-66, .42, -22),
  new THREE.Vector3(22, .42, 22),
  new THREE.Vector3(-22, .42, -22),
  new THREE.Vector3(66, .42, 66),
  new THREE.Vector3(-66, .42, 66),
  new THREE.Vector3(66, .42, -66),
  new THREE.Vector3(0, .42, 66),
  new THREE.Vector3(0, .42, -66),
];
const collectibles = [];

function createCollectibles() {
  collectiblePositions.forEach((position, index) => {
    const group = new THREE.Group();
    group.position.copy(position);
    const ring = addMesh(group, new THREE.TorusGeometry(.72, .065, 8, 24), mats.cache, [0, 0, 0], { rotation: [Math.PI / 2, 0, 0] });
    const core = addMesh(group, new THREE.OctahedronGeometry(.33, 0), mats.cache, [0, 0, 0]);
    const light = new THREE.PointLight(0x5ce3d1, .7, 7, 2);
    group.add(light);
    group.userData = { ring, core, light, baseY: position.y, id: index };
    group.visible = !player.collectedCaches.includes(index);
    world.add(group);
    collectibles.push(group);
  });
}

function resetCollectibles() {
  player.collectedCaches = [];
  collectibles.forEach((cache) => { cache.visible = true; });
  document.querySelector('#cache-count').textContent = `00 / ${String(collectibles.length).padStart(2, '0')}`;
  saveProgress();
}

function updateCollectibles(time, dt) {
  let found = player.collectedCaches.length;
  collectibles.forEach((cache) => {
    if (!cache.visible) return;
    const { ring, core, light, baseY, id } = cache.userData;
    const pulse = (Math.sin(time * .004 + id) + 1) / 2;
    ring.rotation.z += dt * 1.4;
    core.rotation.y += dt * 2.2;
    cache.position.y = baseY + pulse * .3;
    ring.scale.setScalar(1 + pulse * .13);
    light.intensity = .55 + pulse * .85;
    if (player.position.distanceTo(cache.position) < 3.3) {
      cache.visible = false;
      if (!player.collectedCaches.includes(id)) {
        player.collectedCaches.push(id);
        found += 1;
        player.rep += 40;
        player.cash += 25;
        saveProgress();
        playTone(520 + found * 16, .15, .055, 'sine', 120);
        showToast('DATA CACHE RECOVERED', `${found} of ${collectibles.length} caches in the city`, '+40 REP');
      }
    }
  });
  document.querySelector('#cache-count').textContent = `${String(found).padStart(2, '0')} / ${String(collectibles.length).padStart(2, '0')}`;
}

const deliveryStart = new THREE.Vector3(-66, .08, 22);
const deliveryTarget = new THREE.Vector3(-22, .08, -66);
const deliveryStartMarker = new THREE.Group();
deliveryStartMarker.position.copy(deliveryStart);
const deliveryStartRing = addMesh(deliveryStartMarker, new THREE.TorusGeometry(2.2, .08, 8, 32), mats.cache, [0, .18, 0], { rotation: [Math.PI / 2, 0, 0] });
const deliveryStartBeam = addMesh(deliveryStartMarker, new THREE.CylinderGeometry(.035, .035, 4.5, 6), mats.cache, [0, 2.25, 0]);
const deliveryStartLabel = makeLabel('COURIER DEPOT', '#5ce3d1', .5);
deliveryStartLabel.position.y = 4.8;
deliveryStartMarker.add(deliveryStartLabel);
world.add(deliveryStartMarker);
const deliveryTargetMarker = new THREE.Group();
deliveryTargetMarker.position.copy(deliveryTarget);
const deliveryTargetRing = addMesh(deliveryTargetMarker, new THREE.TorusGeometry(2.5, .09, 8, 32), mats.event, [0, .18, 0], { rotation: [Math.PI / 2, 0, 0] });
const deliveryTargetBeam = addMesh(deliveryTargetMarker, new THREE.CylinderGeometry(.035, .035, 4.8, 6), mats.event, [0, 2.4, 0]);
const deliveryTargetLabel = makeLabel('DROP POINT', '#ff9d50', .48);
deliveryTargetLabel.position.y = 5.1;
deliveryTargetMarker.add(deliveryTargetLabel);
world.add(deliveryTargetMarker);
let deliveryState = 'idle';
let deliveryTime = 0;
let deliveryNear = false;

function deliveryAction() {
  if (deliveryState === 'idle' && deliveryNear) {
    deliveryState = 'active';
    deliveryTime = 0;
    playTone(320, .2, .08, 'sine', 90);
    showToast('DELIVERY ACCEPTED', 'Blue depot to the orange drop point', '+180 REP');
  } else if (deliveryState === 'finished' && deliveryNear) {
    deliveryState = 'active';
    deliveryTime = 0;
    showToast('NEW PACKAGE', 'Another night, another line', 'COURIER RUN');
  }
}

function updateDelivery(time, dt) {
  const startDistance = player.position.distanceTo(deliveryStart);
  deliveryNear = startDistance < 11;
  if (deliveryState === 'active') {
    deliveryTime += dt;
    if (player.position.distanceTo(deliveryTarget) < 7.4) {
      deliveryState = 'finished';
      player.rep += 180;
      player.cash += 120;
      saveProgress();
      playBeacon();
      showToast('PACKAGE DELIVERED', `${deliveryTime.toFixed(1)} seconds, no questions asked`, '+180 REP');
    }
  }
  const pulse = (Math.sin(time * .004) + 1) / 2;
  deliveryStartRing.rotation.z += dt * 1.1;
  deliveryStartRing.scale.setScalar(1 + pulse * .12);
  deliveryStartBeam.scale.y = 1 + pulse * .2;
  deliveryStartMarker.visible = deliveryState !== 'active';
  deliveryTargetMarker.visible = deliveryState === 'active';
  if (deliveryState === 'active') {
    deliveryTargetRing.rotation.z -= dt * 1.4;
    deliveryTargetRing.scale.setScalar(1 + pulse * .16);
    deliveryTargetBeam.scale.y = 1 + pulse * .2;
  }
  const panel = document.querySelector('#delivery-panel');
  const visible = deliveryNear || deliveryState === 'active' || deliveryState === 'finished';
  panel.classList.toggle('visible', visible);
  panel.classList.toggle('active', deliveryState === 'active');
  const status = document.querySelector('#delivery-status');
  const title = document.querySelector('#delivery-title');
  const copy = document.querySelector('#delivery-copy');
  const timeReadout = document.querySelector('#delivery-time');
  const action = document.querySelector('#delivery-action');
  if (deliveryState === 'idle') {
    status.textContent = deliveryNear ? 'READY' : 'OPEN WORLD';
    title.textContent = 'NIGHT SHIFT DELIVERY';
    copy.textContent = deliveryNear ? 'Hit V to take the parcel across town.' : 'Find the blue depot and make a clean delivery.';
    timeReadout.textContent = deliveryNear ? 'PRESS V' : 'COURIER RUN';
    action.innerHTML = deliveryNear ? '<span class="keycap">V</span><span>ACCEPT DELIVERY</span>' : '<span>BLUE DEPOT // DROP POINT</span>';
  } else if (deliveryState === 'active') {
    status.textContent = 'PACKAGE LIVE';
    title.textContent = 'NIGHT SHIFT DELIVERY';
    copy.textContent = 'Orange drop point marked. Protect the cargo and keep moving.';
    timeReadout.textContent = `${deliveryTime.toFixed(1)} SEC`;
    action.innerHTML = '<span class="event-live-dot"></span><span>DELIVERY LIVE</span>';
  } else {
    status.textContent = 'DELIVERED';
    title.textContent = 'RUN COMPLETE';
    copy.textContent = `Last run: ${deliveryTime.toFixed(1)} seconds. Return to the depot for another job.`;
    timeReadout.textContent = 'COMPLETE';
    action.innerHTML = deliveryNear ? '<span class="keycap">V</span><span>ACCEPT ANOTHER</span>' : '<span>ROUTE CLEARED</span>';
  }
}

const policeVehicle = createCar(0x171b33, 0xff5b9c, false);
policeVehicle.scale.setScalar(.82);
policeVehicle.visible = false;
actors.add(policeVehicle);
const policeSiren = new THREE.Group();
const policeRed = addMesh(policeSiren, new THREE.BoxGeometry(.34, .14, .34), mats.tail, [-.23, 1.82, 0]);
const policeBlue = addMesh(policeSiren, new THREE.BoxGeometry(.34, .14, .34), mats.windowBlue, [.23, 1.82, 0]);
policeSiren.visible = false;
actors.add(policeSiren);
let policeState = 'idle';
let policeTime = 0;
let wantedLevel = 0;

function startPoliceChase() {
  if (policeState === 'active' || garageOpen || gamePaused) return;
  const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const side = new THREE.Vector3(Math.cos(player.heading), 0, -Math.sin(player.heading));
  policeVehicle.position.copy(player.position).addScaledVector(forward, -18).addScaledVector(side, 3.5);
  policeVehicle.position.y = .02;
  policeVehicle.rotation.y = player.heading;
  policeVehicle.visible = true;
  policeSiren.visible = true;
  policeState = 'active';
  policeTime = 0;
  wantedLevel = 3;
  playTone(110, .35, .09, 'sawtooth', 140);
  showToast('NIGHT PATROL', 'Break line of sight for 30 seconds', 'HEAT 03');
}

function updatePolice(time, dt) {
  if (policeState === 'active') {
    policeTime += dt;
    const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    const side = new THREE.Vector3(Math.cos(player.heading), 0, -Math.sin(player.heading));
    const target = player.position.clone().addScaledVector(forward, -6).addScaledVector(side, Math.sin(time * .0015) * 2.2);
    policeVehicle.position.lerp(target, 1 - Math.exp(-2.6 * dt));
    const toPlayer = player.position.clone().sub(policeVehicle.position);
    policeVehicle.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    policeSiren.position.copy(policeVehicle.position);
    policeSiren.rotation.y = policeVehicle.rotation.y;
    policeRed.visible = Math.sin(time * .025) > 0;
    policeBlue.visible = !policeRed.visible;
    wantedLevel = Math.max(1, Math.ceil((30 - policeTime) / 10));
    if (policeVehicle.position.distanceTo(player.position) < 4.1) player.speed = damp(player.speed, 0, 2.2, dt);
    if (policeTime >= 30) {
      policeState = 'finished';
      policeVehicle.visible = false;
      policeSiren.visible = false;
      wantedLevel = 0;
      player.rep += 260;
      player.cash += 160;
      saveProgress();
      playBeacon();
      showToast('LINE BROKEN', 'You shook the patrol clean', '+260 REP');
    }
  } else if (policeState === 'finished') {
    policeState = 'idle';
  } else {
    policeSiren.visible = false;
  }
  const heat = document.querySelector('#heat-readout');
  heat.classList.toggle('hot', policeState === 'active');
  document.querySelector('#heat-level').textContent = String(wantedLevel).padStart(2, '0');
}

createCollectibles();

function updateGarageUi() {
  document.querySelector('#garage-cash').textContent = `$${player.cash.toLocaleString('en-US')}`;
  document.querySelectorAll('.upgrade-card').forEach((card) => {
    const key = card.dataset.upgrade;
    const level = player.upgrades[key];
    const cost = upgradeConfig[key].costs[level];
    card.querySelector('.upgrade-level').textContent = `LV ${level} / 3`;
    card.querySelector('.upgrade-cost').textContent = cost ? `$${cost}` : 'MAXED';
    card.disabled = !cost || player.cash < cost;
    card.classList.toggle('maxed', !cost);
  });
}

function setGarageOpen(open) {
  garageOpen = open;
  const overlay = document.querySelector('#garage-overlay');
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  if (open) {
    Object.keys(input).forEach((key) => { input[key] = false; });
    updateGarageUi();
    ensureAudio();
    if (audioState.master && audioState.context) audioState.master.gain.setTargetAtTime(0, audioState.context.currentTime, .08);
  } else if (soundOn) {
    ensureAudio();
  }
}

function purchaseUpgrade(key) {
  const level = player.upgrades[key];
  const cost = upgradeConfig[key].costs[level];
  if (!cost || player.cash < cost) return;
  player.cash -= cost;
  player.upgrades[key] += 1;
  if (key === 'nitro') player.nitro = 100 + player.upgrades.nitro * 12;
  saveProgress();
  updateGarageUi();
  playTone(360 + player.upgrades[key] * 80, .2, .08, 'sine', 140);
  showToast(`${key.toUpperCase()} UPGRADED`, `Module level ${player.upgrades[key]} installed`, `$${cost}`);
}

function applyQualityMode() {
  const highQuality = qualityMode === 'HIGH';
  const pixelRatio = highQuality ? Math.min(window.devicePixelRatio || 1, 2) : Math.min(window.devicePixelRatio || 1, 1);
  renderer.shadowMap.enabled = highQuality;
  moon.castShadow = highQuality;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.querySelector('#quality-label').textContent = qualityMode;
}

function setPauseOpen(open) {
  if (open && garageOpen) setGarageOpen(false);
  gamePaused = open;
  const overlay = document.querySelector('#pause-overlay');
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  if (open) {
    Object.keys(input).forEach((key) => { input[key] = false; });
    if (audioState.master && audioState.context) audioState.master.gain.setTargetAtTime(0, audioState.context.currentTime, .08);
  } else if (soundOn) {
    ensureAudio();
  }
}

function resetSavedProgress() {
  try { localStorage.removeItem('neonline-aurora-save'); } catch (error) { console.warn('Progress reset unavailable.', error); }
  player.cash = 420;
  player.rep = 1280;
  player.upgrades = { engine: 0, nitro: 0, grip: 0 };
  player.nitro = 76;
  raceBest = 102.8;
  player.collectedCaches = [];
  resetCollectibles();
  updateGarageUi();
  showToast('PROGRESS RESET', 'Fresh run, same city', 'LOCAL SAVE CLEARED');
}

const input = { forward: false, back: false, left: false, right: false, nitro: false, handbrake: false };
let touchSteer = 0;
const gamepadState = { forward: false, back: false, nitro: false, handbrake: false, steer: 0 };
let cameraMode = 0;
let soundOn = true;
let routeStep = 0;
let missionProgress = 42;
let sessionSeconds = 0;
let driftScore = 0;
let collisionCooldown = 0;
let toastTimeout;

const audioState = {
  context: null,
  master: null,
  engineOsc: null,
  engineHarmonic: null,
  engineFilter: null,
  engineGain: null,
  harmonicGain: null,
  roadNoiseGain: null,
  nitroOsc: null,
  nitroGain: null,
  initialized: false,
};

function ensureAudio() {
  if (!soundOn) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  if (!audioState.initialized) {
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = .28;
    master.connect(context.destination);

    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 720;
    engineFilter.Q.value = .8;
    const engineGain = context.createGain();
    engineGain.gain.value = .018;
    engineFilter.connect(engineGain);
    engineGain.connect(master);

    const engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 48;
    engineOsc.connect(engineFilter);
    engineOsc.start();

    const engineHarmonic = context.createOscillator();
    engineHarmonic.type = 'triangle';
    engineHarmonic.frequency.value = 96;
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = .012;
    engineHarmonic.connect(harmonicGain);
    harmonicGain.connect(master);
    engineHarmonic.start();

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseData.length; i += 1) noiseData[i] = (Math.random() * 2 - 1) * .35;
    const roadNoise = context.createBufferSource();
    roadNoise.buffer = noiseBuffer;
    roadNoise.loop = true;
    const roadFilter = context.createBiquadFilter();
    roadFilter.type = 'bandpass';
    roadFilter.frequency.value = 720;
    roadFilter.Q.value = .45;
    const roadNoiseGain = context.createGain();
    roadNoiseGain.gain.value = 0;
    roadNoise.connect(roadFilter);
    roadFilter.connect(roadNoiseGain);
    roadNoiseGain.connect(master);
    roadNoise.start();

    const nitroOsc = context.createOscillator();
    nitroOsc.type = 'square';
    nitroOsc.frequency.value = 170;
    const nitroGain = context.createGain();
    nitroGain.gain.value = 0;
    nitroOsc.connect(nitroGain);
    nitroGain.connect(master);
    nitroOsc.start();

    Object.assign(audioState, { context, master, engineOsc, engineHarmonic, engineFilter, engineGain, harmonicGain, roadNoiseGain, nitroOsc, nitroGain, initialized: true });
  }
  if (audioState.context.state === 'suspended') audioState.context.resume();
}

function updateAudio() {
  if (!audioState.initialized || !audioState.context) return;
  const now = audioState.context.currentTime;
  if (garageOpen || gamePaused) {
    audioState.engineGain.gain.setTargetAtTime(0, now, .08);
    audioState.harmonicGain.gain.setTargetAtTime(0, now, .08);
    audioState.roadNoiseGain.gain.setTargetAtTime(0, now, .08);
    audioState.nitroGain.gain.setTargetAtTime(0, now, .08);
    audioState.master.gain.setTargetAtTime(soundOn && garageOpen ? .22 : 0, now, .08);
    return;
  }
  const speedRatio = clamp(Math.abs(player.speed) / 53, 0, 1);
  const accelerating = input.forward || gamepadState.forward;
  const nitroActive = (input.nitro || gamepadState.nitro) && accelerating && player.nitro > 0 && player.speed > 4;
  audioState.engineOsc.frequency.setTargetAtTime(48 + speedRatio * 180 + (accelerating ? 15 : 0), now, .045);
  audioState.engineHarmonic.frequency.setTargetAtTime(96 + speedRatio * 360, now, .045);
  audioState.engineFilter.frequency.setTargetAtTime(520 + speedRatio * 820, now, .08);
  audioState.engineGain.gain.setTargetAtTime(.012 + speedRatio * .072 + (accelerating ? .024 : 0), now, .08);
  audioState.harmonicGain.gain.setTargetAtTime(.008 + speedRatio * .028, now, .08);
  audioState.roadNoiseGain.gain.setTargetAtTime(speedRatio * (isOnRoad(player.position.x, player.position.z) ? .045 : .075), now, .12);
  audioState.nitroOsc.frequency.setTargetAtTime(170 + speedRatio * 240, now, .04);
  audioState.nitroGain.gain.setTargetAtTime(nitroActive ? .045 : 0, now, .06);
  audioState.master.gain.setTargetAtTime(soundOn ? .28 : 0, now, .08);
}

function playTone(frequency, duration = .18, volume = .08, type = 'sine', slide = 0) {
  if (!soundOn || !audioState.initialized || !audioState.context) return;
  const context = audioState.context;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.linearRampToValueAtTime(Math.max(24, frequency + slide), now + duration);
  gain.gain.setValueAtTime(.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioState.master);
  oscillator.start(now);
  oscillator.stop(now + duration + .025);
}

function playImpact(trafficHit = false) {
  playTone(trafficHit ? 92 : 65, .22, .13, 'sawtooth', -38);
  playTone(trafficHit ? 180 : 125, .1, .07, 'square', -80);
}

function playBeacon() {
  playTone(440, .16, .07, 'sine', 150);
  window.setTimeout(() => playTone(660, .22, .055, 'sine', 180), 95);
}

function setInput(code, value) {
  if (code === 'KeyW' || code === 'ArrowUp') input.forward = value;
  if (code === 'KeyS' || code === 'ArrowDown') input.back = value;
  if (code === 'KeyA' || code === 'ArrowLeft') input.left = value;
  if (code === 'KeyD' || code === 'ArrowRight') input.right = value;
  if (code === 'ShiftLeft' || code === 'ShiftRight') input.nitro = value;
  if (code === 'Space') input.handbrake = value;
}
window.addEventListener('keydown', (event) => {
  ensureAudio();
  if (event.code === 'Escape' && !event.repeat) {
    if (garageOpen) setGarageOpen(false);
    else if (gamePaused) setPauseOpen(false);
    else setPauseOpen(true);
    return;
  }
  if (event.code === 'KeyP' && !event.repeat) {
    setPauseOpen(!gamePaused);
    return;
  }
  if (event.code === 'KeyG' && !event.repeat) {
    if (!gamePaused) setGarageOpen(!garageOpen);
    return;
  }
  if (garageOpen || gamePaused) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (event.code === 'KeyC' && !event.repeat) {
    cameraMode = (cameraMode + 1) % 2;
    showToast(cameraMode === 0 ? 'CHASE CAMERA' : 'HIGH CAMERA', 'Camera angle changed', '');
  }
  if (event.code === 'KeyE' && !event.repeat) raceAction();
  if (event.code === 'KeyV' && !event.repeat) deliveryAction();
  if (event.code === 'KeyX' && !event.repeat) startPoliceChase();
  if (event.code === 'KeyM' && !event.repeat) document.querySelector('#map-expand').click();
  if (event.code === 'KeyR' && !event.repeat) resetPlayer();
  setInput(event.code, true);
});
window.addEventListener('keyup', (event) => setInput(event.code, false));
window.addEventListener('pointerdown', () => ensureAudio(), { passive: true });
window.addEventListener('blur', () => {
  Object.keys(input).forEach((key) => { input[key] = false; });
  touchSteer = 0;
  Object.assign(gamepadState, { forward: false, back: false, nitro: false, handbrake: false, steer: 0 });
});

function updateGamepad() {
  if (!navigator.getGamepads) return;
  const gamepad = Array.from(navigator.getGamepads() || []).find(Boolean);
  if (!gamepad) {
    Object.assign(gamepadState, { forward: false, back: false, nitro: false, handbrake: false, steer: 0 });
    return;
  }
  const throttle = gamepad.buttons[7]?.value || gamepad.buttons[0]?.value || 0;
  const brake = gamepad.buttons[6]?.value || gamepad.buttons[1]?.value || 0;
  gamepadState.forward = throttle > .16;
  gamepadState.back = brake > .16;
  gamepadState.nitro = Boolean(gamepad.buttons[4]?.pressed || gamepad.buttons[2]?.pressed);
  gamepadState.handbrake = Boolean(gamepad.buttons[1]?.pressed);
  gamepadState.steer = Math.abs(gamepad.axes[0] || 0) > .12 ? gamepad.axes[0] : 0;
}

function setupMobileControls() {
  const steerPad = document.querySelector('#mobile-steer');
  const steerKnob = document.querySelector('#steer-knob');
  let steeringPointer = null;
  const resetSteer = () => {
    steeringPointer = null;
    touchSteer = 0;
    steerKnob.style.transform = 'translate(0, 0)';
  };
  const moveSteer = (event) => {
    if (steeringPointer !== event.pointerId) return;
    const rect = steerPad.getBoundingClientRect();
    const maxX = rect.width * .33;
    const maxY = rect.height * .22;
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    touchSteer = clamp(dx / maxX, -1, 1);
    steerKnob.style.transform = `translate(${touchSteer * maxX}px, ${clamp(dy / maxY, -1, 1) * maxY}px)`;
  };
  steerPad.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    steeringPointer = event.pointerId;
    steerPad.setPointerCapture(event.pointerId);
    moveSteer(event);
  });
  steerPad.addEventListener('pointermove', moveSteer);
  steerPad.addEventListener('pointerup', resetSteer);
  steerPad.addEventListener('pointercancel', resetSteer);
  const holdButtons = [
    ['#mobile-gas', 'forward'], ['#mobile-brake', 'back'], ['#mobile-nitro', 'nitro'], ['#mobile-handbrake', 'handbrake'],
  ];
  holdButtons.forEach(([selector, key]) => {
    const button = document.querySelector(selector);
    const release = () => { input[key] = false; button.classList.remove('active'); };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      input[key] = true;
      button.classList.add('active');
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
  });
  document.querySelector('#mobile-pause').addEventListener('click', () => setPauseOpen(!gamePaused));
}
setupMobileControls();

document.querySelector('#sound-toggle').addEventListener('click', (event) => {
  soundOn = !soundOn;
  event.currentTarget.textContent = soundOn ? '◒' : '◑';
  event.currentTarget.style.color = soundOn ? '' : 'var(--orange)';
  if (soundOn) ensureAudio();
  if (audioState.master && audioState.context) {
    audioState.master.gain.setTargetAtTime(soundOn ? .28 : 0, audioState.context.currentTime, .08);
  }
});
document.querySelector('#map-expand').addEventListener('click', () => {
  const panel = document.querySelector('.map-panel');
  panel.classList.toggle('expanded');
  showToast(panel.classList.contains('expanded') ? 'MAP FOCUS' : 'MAP COLLAPSED', 'Keep your eyes on the road', '');
});
document.querySelector('#garage-open').addEventListener('click', () => setGarageOpen(true));
document.querySelector('#garage-close').addEventListener('click', () => setGarageOpen(false));
document.querySelector('#garage-overlay').addEventListener('click', (event) => {
  if (event.target.id === 'garage-overlay') setGarageOpen(false);
});
document.querySelectorAll('.upgrade-card').forEach((card) => {
  card.addEventListener('click', () => purchaseUpgrade(card.dataset.upgrade));
});
document.querySelector('#resume-button').addEventListener('click', () => setPauseOpen(false));
document.querySelector('#pause-restart').addEventListener('click', () => { resetPlayer(); setPauseOpen(false); });
document.querySelector('#quality-toggle').addEventListener('click', () => {
  qualityMode = qualityMode === 'HIGH' ? 'PERFORMANCE' : 'HIGH';
  applyQualityMode();
  showToast('RENDER MODE', `${qualityMode} quality profile applied`, '');
});
document.querySelector('#reset-save').addEventListener('click', () => resetSavedProgress());
updateGarageUi();
applyQualityMode();

function resetPlayer() {
  player.position.set(0, .02, 0);
  player.mesh.position.copy(player.position);
  player.speed = 0;
  player.heading = 0;
  showToast('VEHICLE RESET', 'Back at Northstar Avenue', '');
}

function showToast(title, copy, reward) {
  const toast = document.querySelector('#rep-toast');
  toast.querySelector('b').textContent = title;
  toast.querySelector('small').textContent = copy;
  toast.querySelector('.toast-rep').textContent = reward || '';
  toast.classList.add('visible');
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove('visible'), 3100);
}

function isOnRoad(x, z) {
  return roadAxes.some((axis) => Math.abs(x - axis) < 5.2 || Math.abs(z - axis) < 5.2);
}

function resolveStaticCollisions() {
  const radius = 1.16;
  let hit = false;
  for (const obstacle of staticObstacles) {
    const minX = obstacle.x - obstacle.halfX;
    const maxX = obstacle.x + obstacle.halfX;
    const minZ = obstacle.z - obstacle.halfZ;
    const maxZ = obstacle.z + obstacle.halfZ;
    const closestX = clamp(player.position.x, minX, maxX);
    const closestZ = clamp(player.position.z, minZ, maxZ);
    let dx = player.position.x - closestX;
    let dz = player.position.z - closestZ;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq >= radius * radius) continue;

    let normalX;
    let normalZ;
    let penetration;
    if (distanceSq < .0001) {
      const left = Math.abs(player.position.x - minX);
      const right = Math.abs(maxX - player.position.x);
      const top = Math.abs(player.position.z - minZ);
      const bottom = Math.abs(maxZ - player.position.z);
      const nearest = Math.min(left, right, top, bottom);
      if (nearest === left) { normalX = -1; normalZ = 0; penetration = radius + left; }
      else if (nearest === right) { normalX = 1; normalZ = 0; penetration = radius + right; }
      else if (nearest === top) { normalX = 0; normalZ = -1; penetration = radius + top; }
      else { normalX = 0; normalZ = 1; penetration = radius + bottom; }
    } else {
      const distance = Math.sqrt(distanceSq);
      normalX = dx / distance;
      normalZ = dz / distance;
      penetration = radius - distance;
    }
    player.position.x += normalX * penetration;
    player.position.z += normalZ * penetration;
    hit = true;
  }
  return hit;
}

function resolveTrafficCollisions() {
  const radius = 3.0;
  for (const vehicle of traffic) {
    const dx = player.position.x - vehicle.mesh.position.x;
    const dz = player.position.z - vehicle.mesh.position.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq >= radius * radius) continue;
    const distance = Math.sqrt(distanceSq) || 1;
    player.position.x += (dx / distance) * (radius - distance);
    player.position.z += (dz / distance) * (radius - distance);
    return true;
  }
  if (policeState === 'active' && policeVehicle.visible) {
    const dx = player.position.x - policeVehicle.position.x;
    const dz = player.position.z - policeVehicle.position.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < radius * radius) {
      const distance = Math.sqrt(distanceSq) || 1;
      player.position.x += (dx / distance) * (radius - distance);
      player.position.z += (dz / distance) * (radius - distance);
      return true;
    }
  }
  return false;
}

function districtAt(x, z) {
  if (z < -72) return 'WATERFRONT LOOP';
  if (x > 44 && z < 15) return 'NEON DISTRICT';
  if (x < -44 && z < 15) return 'OCTANE ROW';
  if (z > 44) return 'NORTHSTAR AVE';
  if (x > 0) return 'MIDTOWN EAST';
  return 'SOUTH MARKET';
}

function updatePlayer(dt) {
  collisionCooldown = Math.max(0, collisionCooldown - dt);
  const throttle = input.forward || gamepadState.forward ? 1 : 0;
  const braking = input.back || gamepadState.back ? 1 : 0;
  const steering = clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + touchSteer + gamepadState.steer, -1, 1);
  const onRoad = isOnRoad(player.position.x, player.position.z);
  const engineLevel = player.upgrades.engine;
  const nitroCapacity = 100 + player.upgrades.nitro * 12;
  const engineMultiplier = 1 + engineLevel * .1;
  const gripMultiplier = 1 + player.upgrades.grip * .1;
  const usingNitro = (input.nitro || gamepadState.nitro) && throttle && player.nitro > 0 && player.speed > 4;
  const handbraking = input.handbrake && Math.abs(player.speed) > 6;
  const acceleration = (onRoad ? 22 : 14) * engineMultiplier;

  if (throttle) player.speed += (acceleration + (usingNitro ? 31 + engineLevel * 3 : 0)) * dt;
  if (braking) player.speed -= (player.speed > 0 ? 34 : 12) * dt;
  if (!throttle && !braking) player.speed = damp(player.speed, 0, onRoad ? 0.78 : 1.25, dt);
  if (handbraking) player.speed = damp(player.speed, 0, .14, dt);
  if (usingNitro) player.nitro = clamp(player.nitro - (27 - player.upgrades.nitro * 2.5) * dt, 0, nitroCapacity);
  else player.nitro = clamp(player.nitro + (throttle ? .9 : 2.8 + player.upgrades.nitro * .6) * dt, 0, nitroCapacity);
  if (!onRoad) player.speed *= Math.pow(.72 + player.upgrades.grip * .02, dt);
  player.speed = clamp(player.speed, -12, usingNitro ? 53 + engineLevel * 3 : 39 + engineLevel * 2);

  if (Math.abs(player.speed) > .3) {
    const turnFactor = clamp(Math.abs(player.speed) / 18, .12, 1.28) * (handbraking ? 1.8 : 1) * gripMultiplier;
    player.heading += steering * 1.75 * turnFactor * dt * (player.speed >= 0 ? 1 : -1);
  }
  const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const movement = forward.clone().multiplyScalar(player.speed * dt);
  player.position.add(movement);
  player.distance += Math.abs(player.speed * dt);
  const staticHit = resolveStaticCollisions();
  const trafficHit = resolveTrafficCollisions();
  if (staticHit || trafficHit) {
    if (collisionCooldown <= 0) {
      player.speed *= trafficHit ? -.28 : -.22;
      playImpact(trafficHit);
      showToast(trafficHit ? 'TRAFFIC CONTACT' : 'BODYWORK CONTACT', trafficHit ? 'Give the lanes a little room' : 'Concrete wins every time', 'SLOW DOWN');
      collisionCooldown = .75;
    } else {
      player.speed = damp(player.speed, 0, 3.5, dt);
    }
  }
  if (player.position.x < -WORLD_LIMIT || player.position.x > WORLD_LIMIT) {
    player.position.x = clamp(player.position.x, -WORLD_LIMIT, WORLD_LIMIT);
    player.speed *= -.25;
  }
  if (player.position.z < -WORLD_LIMIT || player.position.z > WORLD_LIMIT) {
    player.position.z = clamp(player.position.z, -WORLD_LIMIT, WORLD_LIMIT);
    player.speed *= -.25;
  }
  player.mesh.position.copy(player.position);
  player.mesh.rotation.y = player.heading;
  player.mesh.userData.wheels.forEach((wheel) => {
    wheel.rotation.z = Math.PI / 2;
    if (wheel.userData.isFront) wheel.rotation.y = steering * .22;
  });
  player.mesh.userData.wheels.forEach((wheel) => {
    wheel.children[0].rotation.x -= player.speed * dt * 1.8;
  });
  player.mesh.userData.loadedWheels?.forEach((wheel) => {
    wheel.rotation.x -= player.speed * dt * 1.8;
  });

  if (handbraking && Math.abs(player.speed) > 10 && Math.abs(steering) > 0) {
    driftScore += Math.abs(player.speed) * Math.abs(steering) * dt * 2.4;
  } else {
    driftScore = damp(driftScore, 0, 1.8, dt);
  }
  document.querySelector('#surface-state').textContent = onRoad ? (handbraking ? 'DRIFTING' : 'ASPHALT') : 'GRASS';
  document.querySelector('#surface-state').style.color = handbraking ? 'var(--orange)' : '';
}

function updateTraffic(dt) {
  for (const vehicle of traffic) {
    const { mesh, vertical, speed, direction, axis, lane } = vehicle;
    const distance = speed * direction * dt;
    if (vertical) {
      mesh.position.z += distance;
      if (mesh.position.z > 108) mesh.position.z = -108;
      if (mesh.position.z < -108) mesh.position.z = 108;
    } else {
      mesh.position.x += distance;
      if (mesh.position.x > 108) mesh.position.x = -108;
      if (mesh.position.x < -108) mesh.position.x = 108;
    }
    mesh.position.y = .02;
    mesh.position.x = vertical ? axis + lane : mesh.position.x;
    mesh.position.z = vertical ? mesh.position.z : axis + lane;
    const wheelSpin = speed * dt * .95;
    mesh.userData.wheels.forEach((wheel) => { wheel.children[0].rotation.x -= wheelSpin; });
    mesh.userData.loadedWheels?.forEach((wheel) => { wheel.rotation.x -= wheelSpin; });
  }
}

function updateBeacons(time, dt) {
  const target = routeStep < beaconPositions.length ? beaconPositions[routeStep] : null;
  const distance = target ? player.position.distanceTo(target) : 0;
  beacons.forEach((beacon, index) => {
    const active = index === routeStep && routeStep < beaconPositions.length;
    const pulse = (Math.sin(time * .004 + index) + 1) / 2;
    const data = beacon.userData;
    data.ring.rotation.z += dt * (active ? 1.7 : .45);
    data.ring2.rotation.z -= dt * (active ? 1.1 : .22);
    data.ring.scale.setScalar(1 + pulse * (active ? .16 : .06));
    data.beam.scale.y = active ? 1 + pulse * .22 : .7;
    data.light.intensity = active ? 2.4 + pulse * 1.8 : .45;
    data.label.material.opacity = active ? 1 : .28;
    data.beam.material.opacity = active ? .94 : .35;
    if (active && distance < 7.2) {
      playBeacon();
      routeStep += 1;
      player.rep += 120;
      player.cash += 80;
      saveProgress();
      missionProgress = routeStep >= beaconPositions.length ? 100 : 18 + routeStep * 21;
      if (routeStep < beaconPositions.length) {
        beacons[routeStep].userData.label.material.opacity = 1;
        showToast('BEACON DISCOVERED', `Route opened: ${beaconNames[routeStep]}`, '+120 REP');
      } else {
        showToast('ROUTE CLEARED', 'Aurora Bay is yours to explore', '+480 REP');
      }
    }
  });
  const missionDistance = routeStep < beaconPositions.length ? distance / 32 : 0;
  document.querySelector('#mission-distance').textContent = routeStep < beaconPositions.length ? `${missionDistance.toFixed(1)} KM TO BEACON` : 'ALL BEACONS CLEARED';
  document.querySelector('#mission-progress-fill').style.width = `${missionProgress}%`;
  document.querySelector('#mission-step').textContent = routeStep < beaconPositions.length ? `0${routeStep + 1} / 04` : '04 / 04';
  document.querySelector('#mission-title').textContent = routeStep < beaconPositions.length ? (routeStep === 0 ? 'THE LONG WAY HOME' : `NIGHT RUN // ${beaconNames[routeStep]}`) : 'FREE ROAM // ROUTE CLEARED';
  document.querySelector('#mission-description').textContent = routeStep < beaconPositions.length ? 'Cruise to the next beacon. Keep your lines clean.' : 'Every street in Aurora Bay is open. Make your own route.';
}

function updateCamera(dt) {
  const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  let offset = cameraMode === 0 ? new THREE.Vector3(0, 5.15, -10.8) : new THREE.Vector3(0, 10.8, -14.8);
  offset.applyAxisAngle(Y_AXIS, player.heading);
  const targetPosition = player.position.clone().add(offset);
  camera.position.lerp(targetPosition, 1 - Math.exp(-5.5 * dt));
  const lookTarget = player.position.clone().add(forward.multiplyScalar(cameraMode === 0 ? 3.1 : 2.2));
  lookTarget.y = cameraMode === 0 ? 1.05 : .2;
  camera.lookAt(lookTarget);
  const targetFov = 55 + clamp(Math.abs(player.speed) * .2, 0, 10) + (input.nitro ? 3 : 0);
  camera.fov = damp(camera.fov, targetFov, 4, dt);
  camera.updateProjectionMatrix();
}

function worldToMap(x, z, size) {
  return { x: (x + WORLD_LIMIT) / (WORLD_LIMIT * 2) * size, y: size - (z + WORLD_LIMIT) / (WORLD_LIMIT * 2) * size };
}

function drawMiniMap() {
  const size = miniMap.width;
  mapCtx.clearRect(0, 0, size, size);
  mapCtx.fillStyle = '#0b2028';
  mapCtx.fillRect(0, 0, size, size);
  const coastY = worldToMap(0, -98, size).y;
  mapCtx.fillStyle = 'rgba(13, 74, 84, .34)';
  mapCtx.fillRect(0, coastY, size, size - coastY);
  mapCtx.strokeStyle = 'rgba(86, 144, 142, .18)';
  mapCtx.lineWidth = 1;
  for (let x = 0; x < size; x += 13) { mapCtx.beginPath(); mapCtx.moveTo(x, coastY + 10); mapCtx.lineTo(x + 20, size); mapCtx.stroke(); }
  mapCtx.strokeStyle = '#42545b';
  mapCtx.lineWidth = 6;
  for (const axis of roadAxes) {
    const v = worldToMap(axis, 0, size);
    mapCtx.beginPath(); mapCtx.moveTo(v.x, 0); mapCtx.lineTo(v.x, size); mapCtx.stroke();
    const h = worldToMap(0, axis, size);
    mapCtx.beginPath(); mapCtx.moveTo(0, h.y); mapCtx.lineTo(size, h.y); mapCtx.stroke();
  }
  mapCtx.strokeStyle = '#6b7a7e';
  mapCtx.lineWidth = 1;
  for (const axis of roadAxes) {
    const v = worldToMap(axis, 0, size);
    mapCtx.beginPath(); mapCtx.moveTo(v.x, 0); mapCtx.lineTo(v.x, size); mapCtx.stroke();
    const h = worldToMap(0, axis, size);
    mapCtx.beginPath(); mapCtx.moveTo(0, h.y); mapCtx.lineTo(size, h.y); mapCtx.stroke();
  }
  // parks and water-side massing
  mapCtx.fillStyle = 'rgba(61, 134, 94, .44)';
  const park = worldToMap(0, 44, size); mapCtx.fillRect(park.x - 14, park.y - 12, 28, 24);
  mapCtx.fillStyle = 'rgba(115, 163, 157, .34)';
  mapCtx.fillRect(0, coastY - 2, size, 3);
  beaconPositions.forEach((position, index) => {
    const point = worldToMap(position.x, position.z, size);
    const active = index === routeStep;
    mapCtx.beginPath(); mapCtx.arc(point.x, point.y, active ? 4.4 : 2.6, 0, Math.PI * 2);
    mapCtx.fillStyle = active ? '#ff9d50' : 'rgba(214, 250, 106, .45)'; mapCtx.fill();
    if (active) { mapCtx.strokeStyle = 'rgba(255,157,80,.35)'; mapCtx.lineWidth = 2; mapCtx.stroke(); }
  });
  const eventPoint = worldToMap(raceRoute[0].x, raceRoute[0].z, size);
  mapCtx.beginPath();
  mapCtx.rect(eventPoint.x - 3, eventPoint.y - 3, 6, 6);
  mapCtx.fillStyle = '#ff5b9c';
  mapCtx.fill();
  mapCtx.strokeStyle = 'rgba(255,91,156,.48)';
  mapCtx.lineWidth = 1;
  mapCtx.stroke();
  collectiblePositions.forEach((position, index) => {
    if (player.collectedCaches.includes(index)) return;
    const cachePoint = worldToMap(position.x, position.z, size);
    mapCtx.beginPath(); mapCtx.arc(cachePoint.x, cachePoint.y, 2.1, 0, Math.PI * 2);
    mapCtx.fillStyle = '#5ce3d1'; mapCtx.fill();
  });
  const depotPoint = worldToMap(deliveryStart.x, deliveryStart.z, size);
  const dropPoint = worldToMap(deliveryTarget.x, deliveryTarget.z, size);
  mapCtx.fillStyle = '#5ce3d1'; mapCtx.fillRect(depotPoint.x - 2, depotPoint.y - 2, 4, 4);
  if (deliveryState === 'active') { mapCtx.fillStyle = '#ff9d50'; mapCtx.fillRect(dropPoint.x - 2, dropPoint.y - 2, 4, 4); }
  const current = worldToMap(player.position.x, player.position.z, size);
  mapCtx.save();
  mapCtx.translate(current.x, current.y);
  mapCtx.rotate(-player.heading);
  mapCtx.beginPath(); mapCtx.moveTo(0, -8); mapCtx.lineTo(5.5, 6); mapCtx.lineTo(0, 3.5); mapCtx.lineTo(-5.5, 6); mapCtx.closePath();
  mapCtx.fillStyle = '#d6fa6a'; mapCtx.shadowColor = '#d6fa6a'; mapCtx.shadowBlur = 10; mapCtx.fill();
  mapCtx.restore();
  mapCtx.strokeStyle = 'rgba(214,250,106,.14)'; mapCtx.lineWidth = 1;
  mapCtx.strokeRect(.5, .5, size - 1, size - 1);
}

function updateHud(dt) {
  const speed = Math.round(Math.abs(player.speed) * 3.1);
  document.querySelector('#speed-value').textContent = String(speed).padStart(3, '0');
  document.querySelector('#gear-value').textContent = player.speed < -0.5 ? 'R' : speed < 2 ? 'P' : (speed > 98 ? '5' : speed > 72 ? '4' : speed > 45 ? '3' : speed > 22 ? '2' : '1');
  const nitroCapacity = 100 + player.upgrades.nitro * 12;
  const nitroPercent = clamp(player.nitro / nitroCapacity * 100, 0, 100);
  document.querySelector('#nitro-percent').textContent = `${Math.round(nitroPercent)}%`;
  document.querySelector('#nitro-fill').style.width = `${nitroPercent}%`;
  document.querySelector('#district-name').textContent = districtAt(player.position.x, player.position.z);
  const minutes = Math.floor(sessionSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(sessionSeconds % 60).toString().padStart(2, '0');
  document.querySelector('#session-clock').textContent = `${minutes}:${seconds}`;
  // Keep the little bar alive even when a player is idling, like a running vehicle telemetry display.
  const engine = clamp(91 + Math.round(Math.abs(player.speed) / 4) - (driftScore > 1 ? 2 : 0), 0, 99);
  document.querySelector('.vehicle-bars .bar span').style.width = `${engine}%`;
  document.querySelector('.vehicle-bars .bar-label b').textContent = `${engine}%`;
  if (dt > 0) drawMiniMap();
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

buildWorld();

let assetsReady = false;
loadBlenderAssets()
  .catch((error) => console.warn('Asset boot failed; keeping procedural scene.', error))
  .finally(() => { assetsReady = true; });

let lastTime = performance.now();
let hudAccumulator = 0;
function animate(time) {
  const dt = Math.min((time - lastTime) / 1000, .05);
  lastTime = time;
  if (!garageOpen && !gamePaused) sessionSeconds += dt;
  updateGamepad();
  if (!garageOpen && !gamePaused) {
    updatePlayer(dt);
    updateTraffic(dt);
    updateCollectibles(time, dt);
    updateDelivery(time, dt);
    updatePolice(time, dt);
    updateRace(time, dt);
    updateBeacons(time, dt);
  }
  updateAudio();
  updateCamera(dt);
  hudAccumulator += dt;
  if (hudAccumulator > .08) { updateHud(hudAccumulator); hudAccumulator = 0; }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Stagger the boot copy so the environment feels like a deliberate game load instead of a blank frame.
let loading = 0;
const loadingFill = document.querySelector('#loading-fill');
const loadingPercent = document.querySelector('#loading-percent');
const loadingTimer = window.setInterval(() => {
  loading = Math.min(100, loading + 14 + Math.random() * 17);
  loadingFill.style.width = `${loading}%`;
  loadingPercent.textContent = `${Math.round(loading).toString().padStart(2, '0')}%`;
  if (loading >= 100 && assetsReady) {
    window.clearInterval(loadingTimer);
    window.setTimeout(() => document.querySelector('#loading-screen').classList.add('done'), 260);
  }
}, 105);

requestAnimationFrame(animate);
