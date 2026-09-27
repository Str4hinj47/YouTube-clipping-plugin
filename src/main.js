import * as THREE from '../vendor/three.module.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

const canvas = document.querySelector('#game-canvas');
const app = document.querySelector('#app');
const miniMap = document.querySelector('#mini-map');
const mapCtx = miniMap.getContext('2d');
const worldMap = document.querySelector('#world-map');
const worldMapCtx = worldMap.getContext('2d');
const worldMapOverlay = document.querySelector('#world-map-overlay');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const randomFrom = (seed) => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const roadAxes = [-66, -22, 22, 66];
const TRAFFIC_LANE_OFFSET = 2.05;
const stopControlledIntersections = [[-66, -22], [-22, -66], [22, 22], [22, 66], [-66, 22], [66, 22]];
// Only the busiest, most urban junctions have traffic cameras. Remote villages,
// mountain roads, and empty regional junctions do not generate automatic fines.
const trafficCameraIntersections = [[-66, -66], [22, -66], [-22, 22], [66, 66], [22, 22], [-66, 22]];
const urbanRoadRoutes = [
  [[-108, -84], [-74, -71], [-38, -80], [0, -68], [35, -79], [72, -68], [108, -83]],
  [[-108, -18], [-73, -8], [-42, -24], [-4, -8], [31, -19], [72, -4], [108, -16]],
  [[-105, 55], [-72, 43], [-35, 58], [3, 47], [40, 63], [74, 47], [108, 57]],
  [[-84, -108], [-75, -72], [-84, -36], [-68, 0], [-78, 36], [-60, 78], [-44, 108]],
  [[12, -108], [24, -74], [12, -38], [28, -4], [14, 32], [32, 72], [22, 108]],
  [[-108, 100], [-74, 86], [-43, 98], [-5, 83], [31, 98], [68, 84], [108, 101]],
];
const CITY_LIMIT = 116;
const WORLD_LIMIT = 5000;
const WORLD_SECTOR_SIZE = 500;
const WORLD_STREAM_RADIUS = 1;
const worldRegions = [
  { name: 'AURORA BAY', x: 0, z: 0, type: 'city', color: '#d6fa6a' },
  { name: 'PINEWATCH VILLAGE', x: 136, z: 68, type: 'mountain', color: '#ff9d50' },
  { name: 'NORTHSTAR OUTPOST', x: 400, z: 2050, type: 'highlands', color: '#d6fa6a' },
  { name: 'REDWOOD VALLEY', x: -1750, z: 1750, type: 'forest', color: '#5ce3d1' },
  { name: 'LAKE AURORA', x: -2200, z: -1450, type: 'lake', color: '#5ce3d1' },
  { name: 'CINDER FLATS', x: 2300, z: -1850, type: 'desert', color: '#ff9d50' },
  { name: 'EASTGATE', x: 2800, z: 500, type: 'industrial', color: '#ff5b9c' },
  { name: 'SOUTHERN CROSSROADS', x: 500, z: -2800, type: 'rural', color: '#d6fa6a' },
];
const regionalRoutes = [
  { name: 'NORTHSTAR HIGHWAY', speedLimit: 80, points: [[-2100, -4800], [-2100, -2500], [-1500, -1100], [0, 0], [350, 850], [400, 2050], [2050, 2050], [3500, 4800]] },
  { name: 'WESTERN LAKE ROAD', speedLimit: 70, points: [[-4800, -2100], [-3100, -1900], [-2200, -1450], [-1100, -1050], [0, -900], [1700, -1100], [4800, -1500]] },
  { name: 'EASTGATE CONNECTOR', speedLimit: 75, points: [[-4800, 2000], [-2700, 1880], [-1750, 1750], [0, 1220], [1700, 1380], [2800, 500], [4800, 0]] },
  { name: 'SOUTHERN FREIGHTWAY', speedLimit: 80, points: [[-4200, -3800], [-2300, -3200], [500, -2800], [2300, -1850], [4200, -2500]] },
];
const mountainRoadPoints = [
  new THREE.Vector3(66, .08, 108),
  new THREE.Vector3(70, .22, 125),
  new THREE.Vector3(84, .62, 139),
  new THREE.Vector3(112, 1.5, 151),
  new THREE.Vector3(138, 3.4, 147),
  new THREE.Vector3(160, 6.8, 128),
  new THREE.Vector3(170, 11.8, 102),
  new THREE.Vector3(158, 15.6, 80),
  new THREE.Vector3(136, 18.5, 68),
];
const mountainVillagePosition = new THREE.Vector3(136, 18.55, 68);
const mountainVillageDropPosition = new THREE.Vector3(151, 18.8, 54);
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
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, WORLD_LIMIT + 4000);
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
const menuGarage = new THREE.Group();
menuGarage.name = 'Neonline menu display garage';
menuGarage.visible = false;
scene.add(menuGarage);
const city = new THREE.Group();
city.name = 'Procedural Fallback Environment';
world.add(city);
const cityEnhancements = new THREE.Group();
cityEnhancements.name = 'Aurora Bay authored-environment expansion details';
world.add(cityEnhancements);
const actors = new THREE.Group();
actors.name = 'Player and Traffic';
world.add(actors);
const fallbackBase = new THREE.Group();
fallbackBase.name = 'Procedural Fallback Ground and Water';
world.add(fallbackBase);
const mountainExpansion = new THREE.Group();
mountainExpansion.name = 'Blender-authored mountain pass and village extension';
world.add(mountainExpansion);
const pinewatchExpansion = new THREE.Group();
pinewatchExpansion.name = 'Pinewatch small-town expansion details';
world.add(pinewatchExpansion);
const regionalRoadGroup = new THREE.Group();
regionalRoadGroup.name = 'Streamed 10km regional highway network';
world.add(regionalRoadGroup);
const streamedWorld = new THREE.Group();
streamedWorld.name = 'Streamed rural world sectors';
world.add(streamedWorld);
const islandBoundary = new THREE.Group();
islandBoundary.name = 'Outer island coastline and ocean';
world.add(islandBoundary);
const roadFurniture = new THREE.Group();
roadFurniture.name = 'Traffic signals and road signs';
world.add(roadFurniture);
const trafficSignals = [];

function createWaterMaterial(surfaceColor, deepColor, opacity = .94) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSurfaceColor: { value: new THREE.Color(surfaceColor) },
      uDeepColor: { value: new THREE.Color(deepColor) },
      uOpacity: { value: opacity },
      uSunDirection: { value: new THREE.Vector3(-.34, .78, .48).normalize() },
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec3 transformed = position;
        float waveA = sin(position.x * .075 + uTime * .72) * .075;
        float waveB = sin(position.y * .11 - uTime * .54 + position.x * .025) * .052;
        float waveC = sin((position.x + position.y) * .19 + uTime * .38) * .018;
        transformed.z += waveA + waveB + waveC;
        vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
        vWorldPosition = worldPosition.xyz;
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uSurfaceColor;
      uniform vec3 uDeepColor;
      uniform float uOpacity;
      uniform vec3 uSunDirection;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float facing = max(dot(normal, viewDirection), 0.0);
        float fresnel = pow(1.0 - facing, 3.0);
        float ripples = sin(vWorldPosition.x * .13 + uTime * .7) * .5 + .5;
        ripples += sin(vWorldPosition.z * .17 - uTime * .48) * .5 + .5;
        ripples *= .5;
        vec3 waterColor = mix(uDeepColor, uSurfaceColor, .42 + ripples * .2 + fresnel * .22);
        vec3 halfDirection = normalize(viewDirection + normalize(uSunDirection));
        float sunGlint = pow(max(dot(normal, halfDirection), 0.0), 92.0) * (.35 + fresnel * 1.4);
        float edgeFoam = smoothstep(.015, .13, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
        vec3 foamColor = vec3(.48, .82, .82);
        waterColor += foamColor * (1.0 - edgeFoam) * .16;
        waterColor += vec3(.68, .9, 1.0) * sunGlint;
        gl_FragColor = vec4(waterColor, uOpacity);
      }
    `,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: true,
  });
}

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
  water: createWaterMaterial(0x197f91, 0x042c42, .93),
  ocean: createWaterMaterial(0x126176, 0x031d35, .96),
  shoreline: new THREE.MeshStandardMaterial({ color: 0x6d6754, roughness: .96, metalness: .02 }),
  waterLine: new THREE.MeshBasicMaterial({ color: 0x35a8ae, transparent: true, opacity: .33 }),
  mountainGround: new THREE.MeshStandardMaterial({ color: 0x1b2929, roughness: 1 }),
  forestGround: new THREE.MeshStandardMaterial({ color: 0x18342b, roughness: 1 }),
  lakeGround: new THREE.MeshStandardMaterial({ color: 0x153039, roughness: .96 }),
  desertGround: new THREE.MeshStandardMaterial({ color: 0x4b3b2c, roughness: 1 }),
  industrialGround: new THREE.MeshStandardMaterial({ color: 0x26313a, roughness: .96 }),
  ruralGround: new THREE.MeshStandardMaterial({ color: 0x304334, roughness: 1 }),
  mountainRock: new THREE.MeshStandardMaterial({ color: 0x26353a, roughness: .96, flatShading: true }),
  mountainRockLit: new THREE.MeshStandardMaterial({ color: 0x3c4c4b, roughness: .92, flatShading: true }),
  mountainRoad: new THREE.MeshStandardMaterial({ color: 0x1a242c, roughness: .9, metalness: .08 }),
  mountainShoulder: new THREE.MeshStandardMaterial({ color: 0x68736e, roughness: .96 }),
  guardrail: new THREE.MeshStandardMaterial({ color: 0x859494, roughness: .5, metalness: .65 }),
  cabinWood: new THREE.MeshStandardMaterial({ color: 0x684d3e, roughness: .88 }),
  cabinRoof: new THREE.MeshStandardMaterial({ color: 0x252f37, roughness: .9 }),
  villageLight: new THREE.MeshStandardMaterial({ color: 0xffc477, emissive: 0xc75d24, emissiveIntensity: 3.6 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffd7a4, emissive: 0xff723e, emissiveIntensity: 5 }),
  beacon: new THREE.MeshStandardMaterial({ color: 0xd6fa6a, emissive: 0x8abf30, emissiveIntensity: 3.5, transparent: true, opacity: .94 }),
  event: new THREE.MeshStandardMaterial({ color: 0xff9d50, emissive: 0xa64618, emissiveIntensity: 3.3, transparent: true, opacity: .94 }),
  cache: new THREE.MeshStandardMaterial({ color: 0x5ce3d1, emissive: 0x198f91, emissiveIntensity: 3.8, transparent: true, opacity: .95 }),
  indicator: new THREE.MeshStandardMaterial({ color: 0xffa13a, emissive: 0xe26012, emissiveIntensity: 1.2, transparent: true, opacity: .18 }),
};

// Collision volumes are kept separate from render geometry so the imported GLB
// environment and the procedural fallback share the same driving physics.
const staticObstacles = [];

function addObstacle(x, z, halfX, halfZ, type = 'building', object = null, breakable = false) {
  const obstacle = { x, z, halfX, halfZ, type, object, breakable, broken: false };
  staticObstacles.push(obstacle);
  return obstacle;
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

let skyStars = null;
let skyMoon = null;
const skyMoonOffset = new THREE.Vector3(-75, 68, -145);

function buildSky() {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(WORLD_LIMIT + 2600, 48, 24),
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
  skyStars = stars;
  world.add(stars);
  // A soft distant moon keeps the skyline readable without a texture dependency.
  const moonDisk = addMesh(world, new THREE.CircleGeometry(13, 32), new THREE.MeshBasicMaterial({ color: 0x90a9b1, transparent: true, opacity: .12, side: THREE.DoubleSide }), [-75, 68, -145]);
  skyMoon = moonDisk;
  moonDisk.lookAt(camera.position);
}

function updateSky() {
  if (skyStars) skyStars.position.copy(camera.position);
  if (skyMoon) {
    skyMoon.position.copy(camera.position).add(skyMoonOffset);
    skyMoon.lookAt(camera.position);
  }
}

function buildGroundAndWater() {
  const islandEdge = WORLD_LIMIT;
  const oceanEdge = WORLD_LIMIT + 2200;
  const oceanY = -.08;
  addMesh(fallbackBase, new THREE.PlaneGeometry(270, 270), mats.ground, [0, -.16, 0], { rotation: [-Math.PI / 2, 0, 0], receiveShadow: true });
  // Four optimized water strips form a continuous ocean ring without putting a
  // giant transparent plane over the streamed landmass.
  addMesh(islandBoundary, new THREE.PlaneGeometry(oceanEdge * 2, oceanEdge - islandEdge, 64, 12), mats.ocean, [0, oceanY, (oceanEdge + islandEdge) / 2], { rotation: [-Math.PI / 2, 0, 0] });
  addMesh(islandBoundary, new THREE.PlaneGeometry(oceanEdge * 2, oceanEdge - islandEdge, 64, 12), mats.ocean, [0, oceanY, -(oceanEdge + islandEdge) / 2], { rotation: [-Math.PI / 2, 0, 0] });
  addMesh(islandBoundary, new THREE.PlaneGeometry(oceanEdge - islandEdge, islandEdge * 2, 12, 64), mats.ocean, [(oceanEdge + islandEdge) / 2, oceanY, 0], { rotation: [-Math.PI / 2, 0, 0] });
  addMesh(islandBoundary, new THREE.PlaneGeometry(oceanEdge - islandEdge, islandEdge * 2, 12, 64), mats.ocean, [-(oceanEdge + islandEdge) / 2, oceanY, 0], { rotation: [-Math.PI / 2, 0, 0] });
  const shoreWidth = 28;
  const shoreY = -.2;
  addMesh(islandBoundary, new THREE.BoxGeometry(islandEdge * 2, .12, shoreWidth), mats.shoreline, [0, shoreY, islandEdge - shoreWidth / 2], { receiveShadow: true });
  addMesh(islandBoundary, new THREE.BoxGeometry(islandEdge * 2, .12, shoreWidth), mats.shoreline, [0, shoreY, -islandEdge + shoreWidth / 2], { receiveShadow: true });
  addMesh(islandBoundary, new THREE.BoxGeometry(shoreWidth, .12, islandEdge * 2), mats.shoreline, [islandEdge - shoreWidth / 2, shoreY, 0], { receiveShadow: true });
  addMesh(islandBoundary, new THREE.BoxGeometry(shoreWidth, .12, islandEdge * 2), mats.shoreline, [-islandEdge + shoreWidth / 2, shoreY, 0], { receiveShadow: true });
  addMesh(islandBoundary, new THREE.BoxGeometry(islandEdge * 2, .035, .08), mats.waterLine, [0, -.02, islandEdge], { receiveShadow: true });
  addMesh(islandBoundary, new THREE.BoxGeometry(islandEdge * 2, .035, .08), mats.waterLine, [0, -.02, -islandEdge], { receiveShadow: true });
  addMesh(islandBoundary, new THREE.BoxGeometry(.08, .035, islandEdge * 2), mats.waterLine, [islandEdge, -.02, 0], { receiveShadow: true });
  addMesh(islandBoundary, new THREE.BoxGeometry(.08, .035, islandEdge * 2), mats.waterLine, [-islandEdge, -.02, 0], { receiveShadow: true });
  addMesh(fallbackBase, new THREE.PlaneGeometry(300, 44, 48, 12), mats.water, [0, -.08, -121], { rotation: [-Math.PI / 2, 0, 0], receiveShadow: true });
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

function updateWater(time) {
  const waterTime = time * .001;
  mats.water.uniforms.uTime.value = waterTime;
  mats.ocean.uniforms.uTime.value = waterTime * .72;
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
  // Clean crosswalks make the grid legible from the follow camera.
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
  addUrbanRoadNetwork();
}

function addUrbanRoadNetwork() {
  urbanRoadRoutes.forEach((route, routeIndex) => {
    const points = route.map(([x, z]) => new THREE.Vector3(x, .02, z));
    addMountainPathRibbon(points, 12.8, mats.asphaltEdge, 0, cityEnhancements);
    addMountainPathRibbon(points, 10.4, mats.asphalt, .035, cityEnhancements);
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const segment = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
      const length = segment.length();
      const heading = Math.atan2(segment.x, segment.z);
      const tangent = segment.normalize();
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
      for (let distance = 5; distance < length - 2; distance += 12) {
        const center = start.clone().lerp(end, distance / length);
        center.y = .12;
        addMesh(cityEnhancements, new THREE.BoxGeometry(.13, .03, 5.2), mats.lane, center, { rotation: [0, heading, 0] });
      }
      [-1, 1].forEach((side) => {
        const edge = start.clone().lerp(end, .5).addScaledVector(normal, 5.25);
        edge.y = .12;
        addMesh(cityEnhancements, new THREE.BoxGeometry(.08, .03, length), mats.laneYellow, edge, { rotation: [0, heading, 0] });
      });
    }
    if (routeIndex % 2 === 0) {
      const midpoint = route[Math.floor(route.length / 2)];
      addMesh(cityEnhancements, new THREE.BoxGeometry(2.2, .08, 5.8), mats.sidewalk, [midpoint[0], .12, midpoint[1]], { rotation: [0, Math.PI / 2, 0] });
    }
  });
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
  const architectureStyle = Math.abs(Math.floor(seed)) % 6;
  const trimMaterial = [mats.beacon, mats.lamp, mats.windowCyan, mats.windowAmber, mats.windowPurple, mats.windowBlue][architectureStyle];
  if (architectureStyle === 0) {
    addMesh(group, new THREE.BoxGeometry(width * .18, height + 1.1, depth * .2), trimMaterial, [-width * .28, (height + 1.1) / 2, depth * .28], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .46, .16, depth * .36), mats.sidewalkDark, [width * .19, height + .35, -depth * .2], { castShadow: true });
  } else if (architectureStyle === 1) {
    addMesh(group, new THREE.BoxGeometry(width * .82, .16, depth * .3), trimMaterial, [0, height * .72, depth / 2 + .12], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .32, .2, depth * .82), mats.sidewalkDark, [-width * .27, height + .28, 0], { castShadow: true });
  } else if (architectureStyle === 2) {
    for (let floor = 1; floor < Math.max(2, Math.floor(height / 3.2)); floor += 2) {
      addMesh(group, new THREE.BoxGeometry(width * .78, .12, .7), trimMaterial, [0, floor * 3.1, depth / 2 + .18], { castShadow: true });
    }
  } else if (architectureStyle === 3) {
    for (const side of [-1, 1]) {
      addMesh(group, new THREE.BoxGeometry(.24, height + .4, depth + .26), trimMaterial, [side * (width / 2 - .35), height / 2, 0], { castShadow: true });
    }
  } else if (architectureStyle === 4) {
    addMesh(group, new THREE.CylinderGeometry(Math.min(width, depth) * .13, Math.min(width, depth) * .18, 1.3, 10), trimMaterial, [width * .2, height + .7, -depth * .18], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .5, .12, depth * .42), mats.sidewalkDark, [-width * .2, height + .28, depth * .16], { castShadow: true });
  } else {
    addMesh(group, new THREE.BoxGeometry(width * .12, height * .86, .18), trimMaterial, [width / 2 + .09, height * .47, depth * .22], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .12, height * .58, .18), trimMaterial, [-width / 2 - .09, height * .39, -depth * .24], { castShadow: true });
  }
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

function createBuildingAccent(x, z, width, depth, height, style = 0, seed = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.name = `Aurora Bay unique building treatment ${seed}`;
  const materials = [mats.beacon, mats.windowCyan, mats.windowAmber, mats.windowPurple, mats.windowBlue, mats.lamp];
  const trim = materials[style % materials.length];
  if (style % 6 === 0) {
    addMesh(group, new THREE.BoxGeometry(.24, height + .5, depth + .3), trim, [-width / 2 + .3, (height + .5) / 2, 0], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(.24, height * .72, depth + .3), mats.sidewalkDark, [width / 2 - .3, height * .38, 0], { castShadow: true });
  } else if (style % 6 === 1) {
    for (let floor = 1; floor < Math.max(2, Math.floor(height / 3)); floor += 2) {
      addMesh(group, new THREE.BoxGeometry(width * .72, .1, .72), trim, [0, floor * 3.05, depth / 2 + .2], { castShadow: true });
    }
  } else if (style % 6 === 2) {
    addMesh(group, new THREE.CylinderGeometry(Math.min(width, depth) * .15, Math.min(width, depth) * .2, 1.4, 10), trim, [width * .2, height + .7, -depth * .18], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .46, .12, depth * .4), mats.sidewalkDark, [-width * .2, height + .3, depth * .15], { castShadow: true });
  } else if (style % 6 === 3) {
    addMesh(group, new THREE.BoxGeometry(width * .84, .14, .42), trim, [0, height * .66, depth / 2 + .2], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .34, .18, depth * .82), mats.sidewalkDark, [-width * .27, height + .25, 0], { castShadow: true });
  } else if (style % 6 === 4) {
    const crown = addMesh(group, new THREE.BoxGeometry(width * .58, .28, depth * .5), trim, [width * .16, height + .42, -depth * .08], { castShadow: true });
    crown.rotation.y = (seed % 3 - 1) * .12;
    addMesh(group, new THREE.BoxGeometry(.18, height * .82, depth + .24), trim, [width / 2 - .35, height * .42, 0], { castShadow: true });
  } else {
    addMesh(group, new THREE.BoxGeometry(width * .2, .12, depth * .9), trim, [-width * .28, height * .74, 0], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .42, .1, depth * .24), mats.sidewalkDark, [width * .18, height + .46, depth * .14], { castShadow: true });
  }
  cityEnhancements.add(group);
  return group;
}

function createTree(x, z, scale = 1, seed = 1, parent = city) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  addMesh(group, new THREE.CylinderGeometry(.18, .28, 1.5, 7), mats.treeTrunk, [0, .75, 0], { castShadow: true });
  const leafMaterial = randomFrom(seed) > .5 ? mats.treeLeaf : mats.treeLeafDark;
  addMesh(group, new THREE.IcosahedronGeometry(1.18, 1), leafMaterial, [0, 2.0, 0], { castShadow: true });
  addMesh(group, new THREE.IcosahedronGeometry(.75, 1), leafMaterial, [.55, 2.55, .08], { castShadow: true });
  addMesh(group, new THREE.IcosahedronGeometry(.66, 1), leafMaterial, [-.53, 2.48, -.1], { castShadow: true });
  parent.add(group);
  return group;
}

const CITY_STORE_NAMES = ['NORTHSTAR MARKET', 'BLUE HOUR CAFE', 'HARBOR HARDWARE', 'LANTERN BOOKS', 'TIDEWAY PHARMACY', 'SUNSET BAKERY', 'MOTION CYCLES', 'ORBIT ELECTRONICS', 'PINE & SALT', 'CRESCENT GROCER'];
const PARKED_CAR_STYLES = ['hatch', 'wagon', 'suv', 'classic', 'ev', 'pickup', 'sport'];
const PARKED_CAR_COLORS = [0xc44759, 0x477ba4, 0xd7a75a, 0x5f8f78, 0x7e6b9d, 0xc9d0c4, 0x303943, 0xa85b4f];

const PARKED_CAR_PROFILES = {
  hatch: [.9, .94, .86],
  wagon: [1.03, 1.02, 1.08],
  suv: [1.08, 1.18, 1.02],
  classic: [1.1, 1.03, 1.05],
  ev: [1.01, .98, 1],
  pickup: [1.1, 1.05, 1.08],
  sport: [.98, .9, 1.02],
};
const parkedWheelMaterial = new THREE.MeshStandardMaterial({ color: 0x080d12, metalness: .18, roughness: .82 });
const parkedTrimMaterial = new THREE.MeshStandardMaterial({ color: 0x101720, metalness: .58, roughness: .3 });

function createParkedVehicle(x, z, heading = 0, style = 'hatch', color = 0x477ba4, y = .04, seed = 1) {
  const profile = PARKED_CAR_PROFILES[style] || PARKED_CAR_PROFILES.hatch;
  const car = new THREE.Group();
  car.name = `${style.toUpperCase()} parked vehicle`;
  car.position.set(x, y, z);
  car.rotation.y = heading;
  car.scale.set(profile[0] * .72, profile[1] * .72, profile[2] * .72);
  const body = new THREE.MeshStandardMaterial({ color, metalness: .62, roughness: .28 });
  const accent = new THREE.MeshStandardMaterial({ color: seed % 2 ? 0x5ce3d1 : 0xff9d50, metalness: .35, roughness: .3 });
  addMesh(car, new THREE.BoxGeometry(2.25, .5, 4.2), body, [0, .58, 0], { castShadow: true, receiveShadow: true });
  addMesh(car, new THREE.BoxGeometry(1.85, .62, 1.85), parkedTrimMaterial, [0, .92, -.05], { castShadow: true });
  addMesh(car, new THREE.BoxGeometry(1.62, .06, 1.62), mats.glass, [0, 1.25, -.05], { castShadow: true });
  addMesh(car, new THREE.BoxGeometry(1.8, .11, .12), accent, [0, .48, 2.09], { castShadow: true });
  addMesh(car, new THREE.BoxGeometry(1.8, .1, .12), accent, [0, .47, -2.09], { castShadow: true });
  for (const [wheelX, wheelZ] of [[-1.12, 1.3], [1.12, 1.3], [-1.12, -1.3], [1.12, -1.3]]) {
    addMesh(car, new THREE.CylinderGeometry(.36, .36, .2, 8), parkedWheelMaterial, [wheelX, .42, wheelZ], { rotation: [0, 0, Math.PI / 2], castShadow: true });
  }
  car.userData.parked = true;
  actors.add(car);
  parkedVehicles.push({ mesh: car, x, z, heading, style });
  addObstacle(x, z, 1.3, 2.45, 'parked-vehicle', car);
  return car;
}

function createStorefront(x, z, width, depth, height, name, colorIndex = 0, rotation = 0, seed = 1) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.name = `Aurora Bay storefront ${name}`;
  const facadeColors = [0x384b59, 0x5a3e4a, 0x31535a, 0x514d3b, 0x3f405c, 0x4c5549];
  const facade = new THREE.MeshStandardMaterial({ color: facadeColors[colorIndex % facadeColors.length], roughness: .78, metalness: .12 });
  addMesh(group, new THREE.BoxGeometry(width, height, depth), facade, [0, height / 2, 0], { castShadow: true, receiveShadow: true });
  addMesh(group, new THREE.BoxGeometry(width + .3, .14, depth + .3), mats.sidewalkDark, [0, height + .08, 0], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(width + .2, .16, .82), mats.beacon, [0, height * .64, depth / 2 + .16], { castShadow: true });
  const windowMaterial = [mats.windowCyan, mats.windowAmber, mats.windowPurple, mats.windowBlue][colorIndex % 4];
  const windowCount = Math.max(2, Math.floor(width / 3.3));
  for (let index = 0; index < windowCount; index += 1) {
    const px = -width / 2 + 1.45 + index * ((width - 2.9) / Math.max(1, windowCount - 1));
    addMesh(group, new THREE.BoxGeometry(1.05, 1.2, .06), windowMaterial, [px, height * .35, depth / 2 + .18], { castShadow: true });
  }
  addMesh(group, new THREE.BoxGeometry(1.1, height * .42, .1), mats.sidewalkDark, [width * .27, height * .25, depth / 2 + .2], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(width * .92, .12, .62), mats.lamp, [0, height * .69, depth / 2 + .24], { castShadow: true });
  const sign = makeLabel(name, ['#5ce3d1', '#ff9d50', '#d6fa6a', '#ff5b9c'][colorIndex % 4], .46);
  sign.position.set(0, height * .7, depth / 2 + .3);
  group.add(sign);
  if (seed % 2 === 0) {
    addMesh(group, new THREE.BoxGeometry(width * .2, .1, depth * .3), mats.sidewalkDark, [-width * .28, height + .35, 0], { castShadow: true });
  } else {
    addMesh(group, new THREE.CylinderGeometry(.24, .24, 1.2, 8), mats.lamp, [width * .28, height + .55, -depth * .2], { castShadow: true });
  }
  addObstacle(x, z, width / 2 + .75, depth / 2 + .75, 'storefront');
  cityEnhancements.add(group);
  return group;
}

function createParkingLot(x, z, width, depth, rotation = 0, seed = 1, label = 'PARKING') {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  group.name = `Aurora Bay ${label.toLowerCase()} lot`;
  addMesh(group, new THREE.BoxGeometry(width, .07, depth), mats.asphaltEdge, [0, -.02, 0], { receiveShadow: true });
  addMesh(group, new THREE.BoxGeometry(width - .8, .035, depth - .8), mats.asphalt, [0, .025, 0], { receiveShadow: true });
  const spaces = Math.max(3, Math.floor((width - 2) / 4.2));
  for (let index = 0; index <= spaces; index += 1) {
    const px = -width / 2 + 1 + index * ((width - 2) / spaces);
    addMesh(group, new THREE.BoxGeometry(.075, .035, depth * .43), mats.lane, [px, .08, -depth * .27]);
    addMesh(group, new THREE.BoxGeometry(.075, .035, depth * .43), mats.lane, [px, .08, depth * .27]);
    if (index === spaces) continue;
    const centerX = -width / 2 + 1.8 + index * ((width - 2) / spaces);
    [-1, 1].forEach((side, sideIndex) => {
      const occupied = (index + sideIndex + seed) % 4 !== 0 && randomFrom(seed * 5 + index * 11 + sideIndex * 19) > .17;
      if (!occupied) return;
      const localPosition = new THREE.Vector3(centerX, 0, side * depth * .27).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
      const style = PARKED_CAR_STYLES[(seed + index + sideIndex) % PARKED_CAR_STYLES.length];
      const color = PARKED_CAR_COLORS[(seed * 3 + index + sideIndex) % PARKED_CAR_COLORS.length];
      createParkedVehicle(x + localPosition.x, z + localPosition.z, rotation + (side < 0 ? 0 : Math.PI), style, color, .04, seed + index * 3 + sideIndex);
    });
  }
  const parkingLabel = makeLabel(label, '#a9bbc0', .3);
  parkingLabel.position.set(0, .16, -depth * .46);
  group.add(parkingLabel);
  cityEnhancements.add(group);
  return group;
}

function createTreeMedian(x, z, length, width, rotation = 0, seed = 1) {
  const group = new THREE.Group();
  group.position.set(x, .02, z);
  group.rotation.y = rotation;
  group.name = 'Landscaped raised traffic median';
  addMesh(group, new THREE.BoxGeometry(width, .2, length), mats.asphaltEdge, [0, .02, 0], { receiveShadow: true });
  addMesh(group, new THREE.BoxGeometry(Math.max(.7, width - .28), .18, length - .3), mats.grass, [0, .14, 0], { receiveShadow: true });
  addMesh(group, new THREE.BoxGeometry(.12, .16, length), mats.sidewalk, [-width / 2 + .12, .2, 0]);
  addMesh(group, new THREE.BoxGeometry(.12, .16, length), mats.sidewalk, [width / 2 - .12, .2, 0]);
  const treeCount = Math.max(2, Math.floor(length / 9));
  for (let index = 0; index < treeCount; index += 1) {
    const localZ = -length / 2 + 4 + index * ((length - 8) / Math.max(1, treeCount - 1));
    createTree(0, localZ, .62 + randomFrom(seed + index) * .18, seed + index * 7, group);
  }
  addObstacle(x, z, Math.max(1, width), length / 2, 'landscaped-median');
  cityEnhancements.add(group);
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
  // Keep the authored GLB visible while adding a distinct facade treatment to every
  // base-city block, so the imported environment is not reduced to repeated cubes.
  let authoredBlockIndex = 5;
  for (const x of blocks) {
    for (const z of blocks) {
      if (z < -77) continue;
      const width = 13 + (authoredBlockIndex % 3) * 3;
      const depth = 12 + (authoredBlockIndex % 2) * 4;
      const height = 9 + (authoredBlockIndex % 5) * 3;
      createBuildingAccent(x, z, width, depth, height, authoredBlockIndex, 800 + authoredBlockIndex);
      authoredBlockIndex += 1;
    }
  }
  // A low-rise shopfront strip gives the southern approach an identifiable main street.
  [
    [-103, -81, 13, 7, 4.8], [-84, -81, 14, 7, 5.2], [-45, -81, 15, 7, 4.6], [-3, -81, 15, 7, 5.4],
    [40, -81, 14, 7, 4.9], [83, -81, 15, 7, 5.5], [103, -63, 13, 7, 4.5],
  ].forEach(([x, z, width, depth, height], index) => {
    createStorefront(x, z, width, depth, height, CITY_STORE_NAMES[index], index, index % 3 === 0 ? .03 : 0, 500 + index);
  });
  // Mixed-occupancy lots make the city blocks read as working places rather than empty geometry.
  [
    [-88, -62, 22, 12, 0], [-40, -63, 20, 11, .08], [5, -54, 24, 13, 0], [88, -53, 24, 13, -.06],
    [-91, 4, 22, 12, Math.PI / 2], [47, 4, 22, 12, Math.PI / 2], [-42, 53, 22, 12, .04], [89, 53, 25, 13, 0],
    [-4, 91, 24, 12, Math.PI / 2],
  ].forEach(([x, z, width, depth, rotation], index) => createParkingLot(x, z, width, depth, rotation, 620 + index, index % 2 ? 'PUBLIC PARKING' : 'SHOPPING PARKING'));
  // Selected boulevard stretches are divided by raised, tree-filled platforms.
  createTreeMedian(-66, -5, 34, 2.1, 0, 710);
  createTreeMedian(22, 60, 32, 2.1, 0, 720);
  createTreeMedian(8, -66, 30, 2.1, Math.PI / 2, 730);
  createTreeMedian(-58, 22, 28, 2.1, Math.PI / 2, 740);
  // Waterfront park and a few palms on the approach.
  addMesh(city, new THREE.BoxGeometry(70, .05, 11), mats.grass, [-48, -.04, -91], { receiveShadow: true });
  for (let i = 0; i < 12; i += 1) createTree(-78 + randomFrom(i * 8) * 55, -93 + randomFrom(i * 5) * 4, .8 + randomFrom(i + 3) * .3, i + 240);
}

function createStreetLight(x, z, horizontal = false, seed = 1, parent = city) {
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
  parent.add(group);
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
  urbanRoadRoutes.forEach((route, routeIndex) => {
    for (let index = 1; index < route.length - 1; index += 2) {
      const previous = route[index - 1];
      const next = route[index + 1];
      const tangent = new THREE.Vector3(next[0] - previous[0], 0, next[1] - previous[1]).normalize();
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
      const point = route[index];
      createStreetLight(point[0] + normal.x * 7.3, point[1] + normal.z * 7.3, false, seed++ + routeIndex, cityEnhancements);
      if (routeIndex % 2 === 0) createStreetLight(point[0] - normal.x * 7.3, point[1] - normal.z * 7.3, false, seed++ + routeIndex, cityEnhancements);
    }
  });
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

function createTrafficLight(x, z, offset = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const poleX = 5.6;
  const poleZ = 5.6;
  const pole = addMesh(group, new THREE.CylinderGeometry(.08, .12, 4.6, 8), mats.sidewalkDark, [poleX, 2.3, poleZ], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(.1, .1, 4.0), mats.sidewalkDark, [poleX, 4.5, poleZ - 1.75], { castShadow: true });
  const makeHead = (xOffset, zOffset) => {
    const housing = addMesh(group, new THREE.BoxGeometry(.42, 1.3, .34), mats.sidewalkDark, [poleX + xOffset, 3.8, poleZ - 3.45 + zOffset], { castShadow: true });
    const red = new THREE.MeshStandardMaterial({ color: 0x48121b, emissive: 0x100207, emissiveIntensity: .3, transparent: true, opacity: .35 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0x4e3910, emissive: 0x1b1103, emissiveIntensity: .3, transparent: true, opacity: .35 });
    const green = new THREE.MeshStandardMaterial({ color: 0x123b2f, emissive: 0x04150e, emissiveIntensity: .3, transparent: true, opacity: .35 });
    const lamps = [
      addMesh(group, new THREE.SphereGeometry(.105, 10, 10), red, [poleX + xOffset, 4.18, poleZ - 3.64 + zOffset]),
      addMesh(group, new THREE.SphereGeometry(.105, 10, 10), yellow, [poleX + xOffset, 3.82, poleZ - 3.64 + zOffset]),
      addMesh(group, new THREE.SphereGeometry(.105, 10, 10), green, [poleX + xOffset, 3.46, poleZ - 3.64 + zOffset]),
    ];
    return { housing, lamps, materials: [red, yellow, green] };
  };
  const northSouthHead = makeHead(0, 0);
  const eastWestHead = makeHead(-.74, .13);
  group.userData = {
    housing: northSouthHead.housing,
    lamps: northSouthHead.lamps,
    materials: northSouthHead.materials,
    heads: [northSouthHead, eastWestHead],
    offset,
    intersectionX: x,
    intersectionZ: z,
    state: 2,
    northSouthState: 2,
    eastWestState: 0,
  };
  roadFurniture.add(group);
  trafficSignals.push(group);
  addObstacle(x + poleX, z + poleZ, .7, .7, 'traffic-light', group, true);
}

function createStopSign(x, z, rotation = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  addMesh(group, new THREE.CylinderGeometry(.055, .075, 1.75, 8), mats.sidewalkDark, [0, .88, 0]);
  addMesh(group, new THREE.CylinderGeometry(.56, .56, .07, 8), new THREE.MeshStandardMaterial({ color: 0x8c2430, emissive: 0x2b070d, emissiveIntensity: .8 }), [0, 1.82, 0], { rotation: [Math.PI / 2, 0, rotation] });
  const label = makeLabel('STOP', '#ffb7a9', .36);
  label.position.set(0, 1.82, .08);
  group.add(label);
  roadFurniture.add(group);
  addObstacle(x, z, .72, .72, 'stop-sign', group, true);
}

function createSpeedSign(x, z, limit = 45, rotation = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  addMesh(group, new THREE.CylinderGeometry(.05, .07, 1.9, 8), mats.sidewalkDark, [0, .95, 0]);
  addMesh(group, new THREE.CylinderGeometry(.53, .53, .06, 24), new THREE.MeshStandardMaterial({ color: 0xe9eef0, roughness: .48 }), [0, 1.9, 0], { rotation: [Math.PI / 2, 0, rotation] });
  const label = makeLabel(String(limit), '#ff9d50', .36);
  label.position.set(0, 1.9, .08);
  group.add(label);
  roadFurniture.add(group);
  addObstacle(x, z, .72, .72, 'speed-sign', group, true);
}

function createTrafficCamera(x, z, rotation = 0) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const cameraX = 7.2;
  const cameraZ = 7.2;
  addMesh(group, new THREE.CylinderGeometry(.055, .08, 4.6, 7), mats.sidewalkDark, [cameraX, 2.3, cameraZ], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(.44, .32, .7), mats.asphaltEdge, [cameraX, 4.65, cameraZ], { rotation: [0, rotation, 0], castShadow: true });
  addMesh(group, new THREE.SphereGeometry(.075, 8, 6), mats.windowBlue, [cameraX, 4.62, cameraZ - .38], { castShadow: true });
  roadFurniture.add(group);
}

function buildRoadInfrastructure() {
  const signalIntersections = [[-66, -66], [22, -66], [66, -22], [-22, 22], [66, 66], [-66, 66]];
  signalIntersections.forEach(([x, z], index) => createTrafficLight(x, z, index * 1.7));
  stopControlledIntersections.forEach(([x, z], index) => createStopSign(x + (index % 2 ? 5.8 : -5.8), z + (index % 2 ? -5.8 : 5.8), index % 2 ? Math.PI / 2 : 0));
  trafficCameraIntersections.forEach(([x, z], index) => createTrafficCamera(x, z, index % 2 ? Math.PI / 2 : 0));
  [[-66, -44], [-22, 44], [22, -44], [66, 44], [44, 66], [-44, -66]].forEach(([x, z], index) => createSpeedSign(x, z, index % 2 ? 35 : 45, index % 2 ? Math.PI / 2 : 0));
}

function updateTrafficSignals(time) {
  // The groups are registered separately from the imported city GLB and easy to pause.
  trafficSignals.forEach((group) => {
    if (!group.userData.lamps) return;
    const phase = (time * .001 + group.userData.offset) % 20;
    const northSouthState = phase < 7 ? 2 : phase < 9 ? 1 : 0;
    const eastWestState = phase < 11 ? 0 : phase < 18 ? 2 : 1;
    const state = phase < 7 ? 2 : phase < 9 ? 1 : phase < 11 ? 0 : phase < 18 ? 2 : 1;
    group.userData.state = state;
    group.userData.northSouthState = northSouthState;
    group.userData.eastWestState = eastWestState;
    group.userData.phase = phase;
    const heads = group.userData.heads || [{ lamps: group.userData.lamps, materials: group.userData.materials }];
    [northSouthState, eastWestState].forEach((headState, headIndex) => {
      const head = heads[headIndex];
      head.materials.forEach((material, index) => {
        const active = index === headState;
        material.opacity = active ? .98 : .24;
        material.emissiveIntensity = active ? 5.5 : .25;
      });
    });
  });
}

const CAR_PROFILES = {
  sport: { label: 'MIDNIGHT GT', className: 'SPORT COUPE', scale: [1, 1, 1] },
  hatch: { label: 'METRO HATCH', className: 'CITY HATCH', scale: [.91, .94, .84] },
  supercar: { label: 'VELOCE R', className: 'SUPER COUPE', scale: [.96, .82, 1.02] },
  suv: { label: 'TRAIL SCOUT', className: 'ADVENTURE SUV', scale: [1.08, 1.22, 1.02] },
  pickup: { label: 'HARBOR UTILITY', className: 'UTILITY PICKUP', scale: [1.1, 1.07, 1.06] },
  wagon: { label: 'GRAND TOURER', className: 'TOURING WAGON', scale: [1.04, 1.03, 1.1] },
  classic: { label: 'CINDER CLASSIC', className: 'GRAND TOURER', scale: [1.1, 1.02, 1.05] },
  ev: { label: 'PULSE EV', className: 'ELECTRIC SPORT', scale: [1.02, .98, 1] },
};

const VEHICLE_CATALOG = [
  { style: 'sport', name: 'MIDNIGHT GT', className: 'SPORT COUPE', price: 0, paint: '#303fca', accent: '#d6fa6a', description: 'Your balanced blue-hour starter.', power: 86, grip: 72, styleScore: 94, acceleration: 22, topSpeed: 39, brakePower: 34, turnRate: 1.75, turnSpeed: 18, offRoadTraction: .72 },
  { style: 'hatch', name: 'METRO HATCH', className: 'CITY HATCH', price: 300, paint: '#d85062', accent: '#5ce3d1', description: 'Small footprint. Sharp exits.', power: 62, grip: 88, styleScore: 76, acceleration: 20, topSpeed: 34, brakePower: 37, turnRate: 2.08, turnSpeed: 16, offRoadTraction: .84 },
  { style: 'ev', name: 'PULSE EV', className: 'ELECTRIC SPORT', price: 420, paint: '#5ce3d1', accent: '#d6fa6a', description: 'Instant torque for clean lines.', power: 82, grip: 84, styleScore: 91, acceleration: 26, topSpeed: 41, brakePower: 36, turnRate: 1.92, turnSpeed: 17, offRoadTraction: .78 },
  { style: 'classic', name: 'CINDER CLASSIC', className: 'GRAND TOURER', price: 560, paint: '#f0e6cf', accent: '#ff9d50', description: 'Old soul. Long, smooth corners.', power: 74, grip: 64, styleScore: 98, acceleration: 17, topSpeed: 31, brakePower: 27, turnRate: 1.42, turnSpeed: 20, offRoadTraction: .6 },
  { style: 'wagon', name: 'GRAND TOURER', className: 'TOURING WAGON', price: 680, paint: '#496f9a', accent: '#d6fa6a', description: 'Room for the long way home.', power: 78, grip: 79, styleScore: 84, acceleration: 19, topSpeed: 35, brakePower: 32, turnRate: 1.58, turnSpeed: 18, offRoadTraction: .74 },
  { style: 'suv', name: 'TRAIL SCOUT', className: 'ADVENTURE SUV', price: 820, paint: '#6d8b75', accent: '#ff9d50', description: 'High stance. No road required.', power: 81, grip: 86, styleScore: 82, acceleration: 18, topSpeed: 33, brakePower: 39, turnRate: 1.48, turnSpeed: 19, offRoadTraction: .94 },
  { style: 'pickup', name: 'HARBOR UTILITY', className: 'UTILITY PICKUP', price: 950, paint: '#c36b48', accent: '#5ce3d1', description: 'Heavy work, neon nights.', power: 89, grip: 61, styleScore: 79, acceleration: 16, topSpeed: 30, brakePower: 38, turnRate: 1.28, turnSpeed: 21, offRoadTraction: .86 },
  { style: 'supercar', name: 'VELOCE R', className: 'SUPER COUPE', price: 1400, paint: '#8e72c9', accent: '#ff5b9c', description: 'Low, loud, and fictional.', power: 98, grip: 90, styleScore: 97, acceleration: 27, topSpeed: 48, brakePower: 35, turnRate: 1.9, turnSpeed: 16, offRoadTraction: .56 },
];
const fleetAssetScenes = {};

function createCar(color = 0x7a9bff, accent = 0xd6fa6a, playerCar = false, style = 'sport') {
  const profile = CAR_PROFILES[style] || CAR_PROFILES.sport;
  const root = new THREE.Group();
  root.name = playerCar ? 'Blender Midnight GT — Player' : `${profile.label} — Fictional Traffic Vehicle`;
  root.userData.wheels = [];
  root.userData.style = style;
  root.userData.paintColor = `#${new THREE.Color(color).getHexString()}`;
  root.userData.paintMaterials = [];
  root.userData.indicators = { left: [], right: [] };
  root.userData.headlights = [];
  root.userData.brakeLights = [];
  root.userData.loadedBrakeLights = [];
  const bodyMaterial = new THREE.MeshPhysicalMaterial({ color, metalness: .75, roughness: .23, clearcoat: 1, clearcoatRoughness: .13 });
  root.userData.paintMaterials.push(bodyMaterial);
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
    const tail = addMesh(root, new THREE.BoxGeometry(.3, .14, .08), tailMaterial.clone(), [x, .76, -2.16]);
    root.userData.brakeLights.push(tail);
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
  const lightingRig = new THREE.Group();
  lightingRig.name = 'headlights and turn signals';
  for (const [side, x] of [['left', -.78], ['right', .78]]) {
    const frontIndicator = addMesh(lightingRig, new THREE.BoxGeometry(.16, .1, .06), mats.indicator.clone(), [x, .79, 2.18]);
    const rearIndicator = addMesh(lightingRig, new THREE.BoxGeometry(.17, .1, .06), mats.indicator.clone(), [x, .77, -2.18]);
    root.userData.indicators[side].push(frontIndicator, rearIndicator);
  }
  if (playerCar) {
    for (const x of [-.7, .7]) {
      const beam = new THREE.PointLight(0xa8dcff, .72, 10, 2);
      beam.position.set(x, .86, 2.22);
      lightingRig.add(beam);
      root.userData.headlights.push(beam);
    }
  }
  root.add(lightingRig);
  root.userData.lightingRig = lightingRig;
  root.scale.set(...profile.scale);
  return root;
}

function setBrakeLights(vehicleRoot, active) {
  vehicleRoot.userData.brakeLights?.forEach((lamp) => {
    lamp.material.opacity = active ? 1 : 0.72;
    lamp.material.emissiveIntensity = active ? 7 : 3.4;
  });
  vehicleRoot.userData.loadedBrakeLights?.forEach((lamp) => {
    const materials = Array.isArray(lamp.material) ? lamp.material : [lamp.material];
    materials.forEach((material) => {
      if (!material) return;
      if (material.emissive) material.emissiveIntensity = active ? 6.5 : 2.2;
      if (material.color) material.color.set(active ? 0xff293e : 0xb91c31);
      material.needsUpdate = true;
    });
  });
}

function trafficLaneOffset(vertical, direction, laneSide) {
  // laneSide 1 is the right-hand lane relative to travel direction; -1 is the passing lane.
  return (vertical ? direction : -direction) * laneSide * TRAFFIC_LANE_OFFSET;
}

function trafficHeading(vertical, direction) {
  return vertical ? (direction > 0 ? 0 : Math.PI) : (direction > 0 ? Math.PI / 2 : -Math.PI / 2);
}

function updateTrafficVehicleIndicators(vehicle) {
  const blink = Math.sin(performance.now() * .011) > 0;
  const hazard = vehicle.hazardTimer > 0;
  let side = null;
  if (!hazard && vehicle.turning) side = vehicle.turning.turn < 0 ? 'left' : 'right';
  else if (!hazard && vehicle.laneChanging) side = vehicle.laneChanging.targetLaneSide < 0 ? 'left' : 'right';
  ['left', 'right'].forEach((key) => {
    const active = (hazard || side === key) && blink;
    vehicle.mesh.userData.indicators?.[key]?.forEach((lamp) => {
      lamp.material.opacity = active ? .98 : .15;
      lamp.material.emissiveIntensity = active ? 5.5 : .55;
    });
  });
}

function registerTrafficIncident(vehicle, impactSpeed, playerInvolved = false, impactOrigin = player.position) {
  if (!vehicle || vehicle.incidentCooldown > 0) return;
  vehicle.incidentCooldown = 1.05;
  const damage = clamp(Math.abs(impactSpeed) * (playerInvolved ? 2.1 : 1.55) + (playerInvolved ? 4 : 2), 6, 48);
  vehicle.health = clamp(vehicle.health - damage, 0, 100);
  vehicle.currentSpeed = 0;
  vehicle.laneChanging = null;
  vehicle.turning = null;
  vehicle.stopWait = 0;
  vehicle.hazardTimer = Math.max(vehicle.hazardTimer, vehicle.health < 25 ? 6.5 : 4.2);
  if (vehicle.health < 25) vehicle.disabledTimer = Math.max(vehicle.disabledTimer, 5.5);
  else vehicle.disabledTimer = Math.max(vehicle.disabledTimer, 1.35);
  const dx = vehicle.mesh.position.x - impactOrigin.x;
  const dz = vehicle.mesh.position.z - impactOrigin.z;
  const distance = Math.sqrt(dx * dx + dz * dz) || 1;
  vehicle.mesh.position.x += dx / distance * .45;
  vehicle.mesh.position.z += dz / distance * .45;
}

function respawnTrafficVehicle(vehicle) {
  vehicle.turnCount += 1;
  vehicle.vertical = vehicle.turnCount % 2 === 0 ? vehicle.vertical : !vehicle.vertical;
  vehicle.axis = roadAxes[Math.abs(Math.floor(vehicle.routeSeed + vehicle.turnCount)) % roadAxes.length];
  vehicle.direction = randomFrom(vehicle.routeSeed + vehicle.turnCount * 2.7) > .5 ? 1 : -1;
  vehicle.laneSide = randomFrom(vehicle.routeSeed + vehicle.turnCount * 3.1) > .5 ? 1 : -1;
  vehicle.lane = trafficLaneOffset(vehicle.vertical, vehicle.direction, vehicle.laneSide);
  vehicle.heading = trafficHeading(vehicle.vertical, vehicle.direction);
  const edge = vehicle.direction > 0 ? -108 : 108;
  vehicle.mesh.position.set(vehicle.vertical ? vehicle.axis + vehicle.lane : edge, .02, vehicle.vertical ? edge : vehicle.axis + vehicle.lane);
  vehicle.mesh.rotation.y = vehicle.heading;
  vehicle.currentSpeed = vehicle.cruiseSpeed;
  vehicle.health = 100;
  vehicle.disabledTimer = 0;
  vehicle.hazardTimer = 0;
  vehicle.incidentCooldown = 1.2;
  vehicle.stopKey = '';
  vehicle.stopWait = 0;
  vehicle.turning = null;
  vehicle.laneChanging = null;
}

function createTraffic() {
  const colors = [0xe25d63, 0xf2a260, 0x62a4bd, 0x8d72bd, 0xd8d9c4, 0x3e8f88, 0xc6cf5f, 0x7c6bf2, 0xc44966];
  const styles = ['hatch', 'supercar', 'pickup', 'suv', 'wagon', 'classic', 'ev', 'sport', 'hatch', 'pickup', 'suv', 'wagon', 'classic', 'ev', 'supercar', 'sport', 'hatch', 'suv', 'wagon', 'ev', 'pickup', 'classic', 'sport', 'hatch', 'suv', 'wagon', 'ev', 'pickup', 'sport', 'classic'];
  for (let i = 0; i < styles.length; i += 1) {
    const vertical = i % 2 === 0;
    const axis = roadAxes[(i * 3 + 1) % roadAxes.length];
    const direction = i % 2 === 0 ? 1 : -1;
    const laneSide = i % 4 < 2 ? 1 : -1;
    const lane = trafficLaneOffset(vertical, direction, laneSide);
    const car = createCar(colors[i % colors.length], i % 2 ? 0x5ce3d1 : 0xff9d50, false, styles[i]);
    car.scale.multiplyScalar(.78);
    car.position.set(vertical ? axis + lane : -104 + randomFrom(i + 2) * 208, .02, vertical ? -104 + randomFrom(i + 7) * 208 : axis + lane);
    const heading = trafficHeading(vertical, direction);
    car.rotation.y = heading;
    actors.add(car);
    const cruiseSpeed = 7 + randomFrom(i + 40) * 7;
    traffic.push({ mesh: car, vertical, axis, laneSide, lane, cruiseSpeed, currentSpeed: cruiseSpeed, direction, heading, stopKey: '', stopWait: 0, routeSeed: i * 19.7 + 3, turnCount: 0, turnDecisionKey: '', turnDecision: 0, turning: null, laneChanging: null, passTimer: 0, health: 100, disabledTimer: 0, hazardTimer: 0, incidentCooldown: 0 });
  }
}

function mountainTrafficPosition(vehicle) {
  const sample = sampleMountainRoad(vehicle.progress);
  return {
    sample,
    position: sample.position.clone().addScaledVector(sample.normal, vehicle.direction * vehicle.laneSide * 2.15),
    heading: Math.atan2(sample.tangent.x * vehicle.direction, sample.tangent.z * vehicle.direction),
  };
}

function respawnMountainTrafficVehicle(vehicle) {
  vehicle.turnCount += 1;
  vehicle.progress = .04 + randomFrom(vehicle.routeSeed + vehicle.turnCount * 3.2) * .9;
  vehicle.direction = randomFrom(vehicle.routeSeed + vehicle.turnCount * 4.1) > .5 ? 1 : -1;
  vehicle.currentSpeed = vehicle.cruiseSpeed;
  vehicle.health = 100;
  vehicle.disabledTimer = 0;
  vehicle.hazardTimer = 0;
  vehicle.incidentCooldown = 1.1;
  const pose = mountainTrafficPosition(vehicle);
  vehicle.mesh.position.copy(pose.position);
  vehicle.mesh.rotation.y = pose.heading;
}

function createMountainTraffic() {
  const colors = [0xb95459, 0xd89057, 0x577e9f, 0x74669c, 0x8a9b83, 0x4f8e85, 0xb2bd68, 0x886bc1];
  const styles = ['hatch', 'suv', 'pickup', 'wagon', 'classic', 'ev', 'sport', 'supercar', 'hatch', 'suv'];
  styles.forEach((style, index) => {
    const car = createCar(colors[index % colors.length], index % 2 ? 0xd6fa6a : 0xff9d50, false, style);
    car.scale.multiplyScalar(.76);
    actors.add(car);
    const vehicle = {
      mesh: car,
      progress: .08 + (index % 5) * .17,
      direction: index % 2 === 0 ? 1 : -1,
      laneSide: 1,
      cruiseSpeed: 7.5 + randomFrom(index + 430) * 4.5,
      currentSpeed: 8.5,
      health: 100,
      disabledTimer: 0,
      hazardTimer: 0,
      incidentCooldown: 0,
      laneChanging: null,
      turning: null,
      stopWait: 0,
      routeSeed: index * 13.7 + 44,
      turnCount: 0,
    };
    const pose = mountainTrafficPosition(vehicle);
    car.position.copy(pose.position);
    car.rotation.y = pose.heading;
    mountainTraffic.push(vehicle);
  });
}

function regionalTrafficPosition(vehicle) {
  const sample = sampleRegionalRoute(vehicle.routeIndex, vehicle.progress);
  return {
    sample,
    position: sample.position.clone().addScaledVector(sample.normal, vehicle.direction * vehicle.laneSide * 2.55),
    heading: Math.atan2(sample.tangent.x * vehicle.direction, sample.tangent.z * vehicle.direction),
  };
}

function respawnRegionalTrafficVehicle(vehicle) {
  vehicle.turnCount += 1;
  vehicle.progress = .03 + randomFrom(vehicle.routeSeed + vehicle.turnCount * 2.8) * .94;
  vehicle.direction = randomFrom(vehicle.routeSeed + vehicle.turnCount * 3.7) > .5 ? 1 : -1;
  vehicle.currentSpeed = vehicle.cruiseSpeed;
  vehicle.health = 100;
  vehicle.disabledTimer = 0;
  vehicle.hazardTimer = 0;
  vehicle.incidentCooldown = 1.2;
  const pose = regionalTrafficPosition(vehicle);
  vehicle.mesh.position.copy(pose.position);
  vehicle.mesh.rotation.y = pose.heading;
}

function createRegionalTraffic() {
  const colors = [0xa94d59, 0x9b7652, 0x577d96, 0x6d6b9b, 0x547c73, 0x918d57, 0x844f78, 0x6c8d99];
  const styles = ['hatch', 'suv', 'pickup', 'wagon', 'classic', 'ev', 'sport', 'supercar', 'hatch', 'suv', 'pickup', 'wagon', 'classic', 'ev', 'sport', 'hatch'];
  styles.forEach((style, index) => {
    const car = createCar(colors[index % colors.length], index % 2 ? 0x5ce3d1 : 0xff9d50, false, style);
    car.scale.multiplyScalar(.74);
    actors.add(car);
    const vehicle = {
      mesh: car,
      routeIndex: index % regionalRoutes.length,
      progress: .04 + (index % 8) * .11,
      direction: index % 2 === 0 ? 1 : -1,
      laneSide: 1,
      cruiseSpeed: 12 + randomFrom(index + 760) * 6,
      currentSpeed: 13,
      health: 100,
      disabledTimer: 0,
      hazardTimer: 0,
      incidentCooldown: 0,
      laneChanging: null,
      turning: null,
      stopWait: 0,
      routeSeed: index * 17.9 + 220,
      turnCount: 0,
    };
    const pose = regionalTrafficPosition(vehicle);
    car.position.copy(pose.position);
    car.rotation.y = pose.heading;
    regionalTraffic.push(vehicle);
  });
}

const traffic = [];
const parkedVehicles = [];
const mountainTraffic = [];
const regionalTraffic = [];
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

function applyPaintToVehicleRoot(vehicleRoot, paint) {
  if (!vehicleRoot || !paint) return;
  const normalizedPaint = paint.startsWith('#') ? paint : `#${paint}`;
  vehicleRoot.userData.paintColor = normalizedPaint;
  vehicleRoot.userData.paintMaterials?.forEach((material) => material.color.set(normalizedPaint));
  const importedModel = vehicleRoot.userData.loadedModel;
  importedModel?.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const materialNames = materials.map((material) => material?.name || '').join(' ');
    if (/(glass|window|wheel|tire|rubber|brake|disc|light|lamp|indicator|head|tail|chrome|trim|carbon|black)/i.test(`${object.name} ${materialNames}`)) return;
    materials.forEach((material) => {
      if (material?.color) {
        material.color.set(normalizedPaint);
        material.needsUpdate = true;
      }
    });
  });
}

function replaceVehicleVisual(vehicleRoot, sourceScene, scale = 1) {
  // Keep the physics wrapper and replace only its visible geometry with the
  // authored asset. This lets the driving code remain the same for fallback and GLB cars.
  const preservedLighting = vehicleRoot.userData.lightingRig;
  const previousLoaded = vehicleRoot.userData.loadedModel;
  if (previousLoaded) vehicleRoot.remove(previousLoaded);
  vehicleRoot.children.forEach((child) => { if (child !== preservedLighting) child.visible = false; });
  if (preservedLighting) preservedLighting.visible = true;
  const importedCar = prepareImportedModel(sourceScene.clone(true));
  importedCar.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
  });
  vehicleRoot.scale.setScalar(scale);
  importedCar.scale.setScalar(1);
  vehicleRoot.add(importedCar);
  vehicleRoot.userData.loadedModel = importedCar;
  vehicleRoot.userData.loadedWheels = [];
  vehicleRoot.userData.loadedBrakeLights = [];
  importedCar.traverse((object) => {
    if (!object.isMesh) return;
    if (/(wheel|tire|hub)/i.test(object.name)) vehicleRoot.userData.loadedWheels.push(object);
    if (/(brake|tail|rear.*light|light.*rear)/i.test(object.name)) vehicleRoot.userData.loadedBrakeLights.push(object);
  });
  applyPaintToVehicleRoot(vehicleRoot, vehicleRoot.userData.paintColor);
}

function loadOneAsset(url) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject);
  });
}

async function loadBlenderAssets() {
  const fleetStyles = ['hatch', 'supercar', 'suv', 'pickup', 'wagon', 'classic', 'ev', 'sport'];
  const results = await Promise.allSettled([
    loadOneAsset('./assets/aurora_bay_environment.glb'),
    loadOneAsset('./assets/midnight_gt.glb'),
    ...fleetStyles.map((style) => loadOneAsset(`./assets/fleet/${style}.glb`)),
  ]);
  const [environmentResult, carResult] = results;
  if (environmentResult.status === 'fulfilled') {
    const importedEnvironment = prepareImportedModel(environmentResult.value.scene);
    importedEnvironment.name = 'Aurora Bay Environment — Blender GLB';
    let importedMountainExtension = false;
    importedEnvironment.traverse((object) => {
      if (/mountain|pinewatch|guardrail/i.test(object.name || '')) importedMountainExtension = true;
    });
    city.visible = false;
    fallbackBase.visible = false;
    if (importedMountainExtension) mountainExpansion.visible = false;
    world.add(importedEnvironment);
  } else {
    console.warn('Blender environment unavailable; using procedural fallback.', environmentResult.reason);
  }
  if (carResult.status === 'fulfilled') {
    const importedCar = carResult.value.scene;
    fleetAssetScenes.sport = importedCar;
    replaceVehicleVisual(player.mesh, importedCar, 1);
    replaceVehicleVisual(policeVehicle, importedCar, .82);
  } else {
    console.warn('Blender hero car unavailable; using procedural fallback.', carResult.reason);
  }
  fleetStyles.forEach((style, index) => {
    const result = results[index + 2];
    if (result.status === 'fulfilled') {
      fleetAssetScenes[style] = result.value.scene;
      [...traffic, ...mountainTraffic, ...regionalTraffic].filter((vehicle) => vehicle.mesh.userData.style === style).forEach((vehicle) => {
        replaceVehicleVisual(vehicle.mesh, result.value.scene, .78);
      });
    } else {
      console.warn(`Fleet asset unavailable for ${style}; using procedural fallback.`, result.reason);
    }
  });
  applyPlayerVehicleStyle(player.selectedStyle, false);
  applyPaintToVehicleRoot(player.mesh, player.paint);
}

function buildMenuGarage() {
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x101c27, roughness: .66, metalness: .32 });
  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x101d2a, roughness: .86, metalness: .12 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x070d16, roughness: .78, metalness: .4 });
  const cyanMaterial = new THREE.MeshBasicMaterial({ color: 0x5ce3d1, transparent: true, opacity: .82 });
  const limeMaterial = new THREE.MeshBasicMaterial({ color: 0xd6fa6a, transparent: true, opacity: .86 });
  const pinkMaterial = new THREE.MeshBasicMaterial({ color: 0xff5b9c, transparent: true, opacity: .7 });
  addMesh(menuGarage, new THREE.BoxGeometry(54, .28, 38), floorMaterial, [0, -.28, 0], { receiveShadow: true });
  addMesh(menuGarage, new THREE.BoxGeometry(54, 17, .3), wallMaterial, [0, 8.2, -14.5], { receiveShadow: true });
  addMesh(menuGarage, new THREE.BoxGeometry(.3, 17, 38), wallMaterial, [-27, 8.2, 0], { receiveShadow: true });
  addMesh(menuGarage, new THREE.BoxGeometry(.3, 17, 38), wallMaterial, [27, 8.2, 0], { receiveShadow: true });
  addMesh(menuGarage, new THREE.BoxGeometry(54, .25, .25), darkMaterial, [0, 16.5, -14.2]);
  for (let x = -24; x <= 24; x += 6) {
    addMesh(menuGarage, new THREE.BoxGeometry(.035, .018, 35), cyanMaterial, [x, -.1, 0]);
  }
  for (let z = -12; z <= 14; z += 4) {
    addMesh(menuGarage, new THREE.BoxGeometry(52, .018, .035), z % 8 === 0 ? limeMaterial : darkMaterial, [0, -.1, z]);
  }
  // A raised service plinth gives the menu car a showroom silhouette instead of a floating model.
  addMesh(menuGarage, new THREE.CylinderGeometry(7.1, 7.3, .32, 48), darkMaterial, [0, -.05, 0], { receiveShadow: true });
  addMesh(menuGarage, new THREE.TorusGeometry(6.65, .06, 8, 64), limeMaterial, [0, .13, 0], { rotation: [Math.PI / 2, 0, 0] });
  addMesh(menuGarage, new THREE.TorusGeometry(5.6, .025, 8, 64), cyanMaterial, [0, .15, 0], { rotation: [Math.PI / 2, 0, 0] });
  for (const x of [-19, 19]) {
    addMesh(menuGarage, new THREE.BoxGeometry(3.8, .08, .18), pinkMaterial, [x, 8.8, -14.25]);
    addMesh(menuGarage, new THREE.BoxGeometry(.12, 10, .12), cyanMaterial, [x, 5, -14.15]);
  }
  for (const x of [-13, -7, 0, 7, 13]) {
    addMesh(menuGarage, new THREE.BoxGeometry(3.7, .08, .11), x === 0 ? limeMaterial : cyanMaterial, [x, 14.4, -13.95]);
  }
  const bayLabel = makeLabel('BAY 07 // NIGHT SERVICE', '#d6fa6a', .7);
  bayLabel.position.set(0, 9.9, -14.1);
  menuGarage.add(bayLabel);
  const subLabel = makeLabel('AURORA BAY MOTOR WORKS', '#5ce3d1', .45);
  subLabel.position.set(0, 8.9, -14.08);
  menuGarage.add(subLabel);
  const keyLight = new THREE.PointLight(0x86b9ff, 13, 28, 1.7);
  keyLight.position.set(4, 8, 7);
  menuGarage.add(keyLight);
  const fillLight = new THREE.PointLight(0xff5b9c, 8, 22, 1.8);
  fillLight.position.set(-12, 5, -7);
  menuGarage.add(fillLight);
  const rimLight = new THREE.PointLight(0x5ce3d1, 10, 25, 1.8);
  rimLight.position.set(12, 4, -10);
  menuGarage.add(rimLight);
  menuGarage.userData.lights = [keyLight, fillLight, rimLight];
}

let mountainRoadCumulative = [];
let mountainRoadLength = 0;
let regionalRouteMetrics = [];

function initializeRegionalRouteMetrics() {
  regionalRouteMetrics = regionalRoutes.map((route) => {
    const cumulative = [0];
    let length = 0;
    for (let index = 1; index < route.points.length; index += 1) {
      const [startX, startZ] = route.points[index - 1];
      const [endX, endZ] = route.points[index];
      length += Math.hypot(endX - startX, endZ - startZ);
      cumulative.push(length);
    }
    return { length, cumulative };
  });
}

function sampleRegionalRoute(routeIndex, progress) {
  const route = regionalRoutes[routeIndex];
  const metrics = regionalRouteMetrics[routeIndex];
  const distance = clamp(progress, 0, 1) * metrics.length;
  let segment = metrics.cumulative.length - 2;
  for (let index = 1; index < metrics.cumulative.length; index += 1) {
    if (distance <= metrics.cumulative[index]) {
      segment = index - 1;
      break;
    }
  }
  const [startX, startZ] = route.points[segment];
  const [endX, endZ] = route.points[segment + 1] || route.points[segment];
  const segmentLength = Math.max(.001, metrics.cumulative[segment + 1] - metrics.cumulative[segment]);
  const amount = clamp((distance - metrics.cumulative[segment]) / segmentLength, 0, 1);
  const position = new THREE.Vector3(lerp(startX, endX, amount), .04, lerp(startZ, endZ, amount));
  const tangent = new THREE.Vector3(endX - startX, 0, endZ - startZ).normalize();
  const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
  return { position, tangent, normal };
}

function initializeMountainRoadMetrics() {
  mountainRoadCumulative = [0];
  mountainRoadLength = 0;
  for (let index = 1; index < mountainRoadPoints.length; index += 1) {
    const previous = mountainRoadPoints[index - 1];
    const current = mountainRoadPoints[index];
    mountainRoadLength += Math.hypot(current.x - previous.x, current.z - previous.z);
    mountainRoadCumulative.push(mountainRoadLength);
  }
}

function sampleMountainRoad(progress) {
  const distance = clamp(progress, 0, 1) * mountainRoadLength;
  let segment = mountainRoadCumulative.length - 2;
  for (let index = 1; index < mountainRoadCumulative.length; index += 1) {
    if (distance <= mountainRoadCumulative[index]) {
      segment = index - 1;
      break;
    }
  }
  const start = mountainRoadPoints[segment];
  const end = mountainRoadPoints[segment + 1] || start;
  const segmentLength = Math.max(.001, mountainRoadCumulative[segment + 1] - mountainRoadCumulative[segment]);
  const amount = clamp((distance - mountainRoadCumulative[segment]) / segmentLength, 0, 1);
  const position = start.clone().lerp(end, amount);
  const tangent = new THREE.Vector3(end.x - start.x, 0, end.z - start.z).normalize();
  const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
  return { position, tangent, normal };
}

function nearestMountainRoadPoint(x, z) {
  let nearest = { distance: Infinity, height: .02, progress: 0 };
  for (let index = 1; index < mountainRoadPoints.length; index += 1) {
    const start = mountainRoadPoints[index - 1];
    const end = mountainRoadPoints[index];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const lengthSq = dx * dx + dz * dz || 1;
    const amount = clamp(((x - start.x) * dx + (z - start.z) * dz) / lengthSq, 0, 1);
    const pointX = start.x + dx * amount;
    const pointZ = start.z + dz * amount;
    const distance = Math.hypot(x - pointX, z - pointZ);
    if (distance < nearest.distance) {
      const segmentLength = Math.max(.001, mountainRoadCumulative[index] - mountainRoadCumulative[index - 1]);
      nearest = {
        distance,
        height: lerp(start.y, end.y, amount),
        progress: (mountainRoadCumulative[index - 1] + segmentLength * amount) / Math.max(.001, mountainRoadLength),
      };
    }
  }
  return nearest;
}

function mountainRoadHeightAt(x, z) {
  return nearestMountainRoadPoint(x, z).height;
}

function isOnMountainRoad(x, z) {
  return nearestMountainRoadPoint(x, z).distance < 6.2;
}

function addMountainPathRibbon(points, width, material, yLift = .02, parent = mountainExpansion) {
  const vertices = [];
  const indices = [];
  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const tangent = new THREE.Vector3(next.x - previous.x, 0, next.z - previous.z).normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).multiplyScalar(width / 2);
    vertices.push(point.x - normal.x, point.y + yLift, point.z - normal.z, point.x + normal.x, point.y + yLift, point.z + normal.z);
    if (index < points.length - 1) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const ribbon = new THREE.Mesh(geometry, material);
  ribbon.receiveShadow = true;
  parent.add(ribbon);
  return ribbon;
}

function addMountainRoadDetails() {
  addMountainPathRibbon(mountainRoadPoints, 10.6, mats.mountainShoulder, 0);
  addMountainPathRibbon(mountainRoadPoints, 8.8, mats.mountainRoad, .045);
  for (let index = 1; index < mountainRoadPoints.length; index += 1) {
    const start = mountainRoadPoints[index - 1];
    const end = mountainRoadPoints[index];
    const segment = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
    const length = segment.length();
    const heading = Math.atan2(segment.x, segment.z);
    const tangent = segment.normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
    for (let distance = 4; distance < length - 2; distance += 9) {
      const amount = distance / length;
      const center = start.clone().lerp(end, amount);
      center.y += .09;
      addMesh(mountainExpansion, new THREE.BoxGeometry(.16, .03, 4.1), mats.laneYellow, center, { rotation: [0, heading, 0] });
    }
    addMesh(mountainExpansion, new THREE.BoxGeometry(.09, .035, length), mats.lane, [start.x + normal.x * 4.05, lerp(start.y, end.y, .5) + .1, start.z + normal.z * 4.05], { rotation: [0, heading, 0] });
    addMesh(mountainExpansion, new THREE.BoxGeometry(.09, .035, length), mats.lane, [start.x - normal.x * 4.05, lerp(start.y, end.y, .5) + .1, start.z - normal.z * 4.05], { rotation: [0, heading, 0] });
    for (let distance = 4; distance < length; distance += 10) {
      const amount = distance / length;
      const center = start.clone().lerp(end, amount);
      center.y += .45;
      [-1, 1].forEach((side) => {
        const post = center.clone().addScaledVector(normal, side * 5.35);
        addMesh(mountainExpansion, new THREE.CylinderGeometry(.055, .07, 1.1, 6), mats.guardrail, [post.x, post.y, post.z]);
      });
    }
    [-1, 1].forEach((side) => {
      const railCenter = start.clone().lerp(end, .5).addScaledVector(normal, side * 5.35);
      railCenter.y += .78;
      addMesh(mountainExpansion, new THREE.BoxGeometry(.11, .11, length), mats.guardrail, railCenter, { rotation: [0, heading, 0] });
    });
  }
}

function createMountainRock(x, z, radius, height, material = mats.mountainRock, seed = 1) {
  const rock = addMesh(mountainExpansion, new THREE.ConeGeometry(radius, height, 7, 2), material, [x, height / 2 - .12, z], { castShadow: true, receiveShadow: true });
  rock.rotation.y = randomFrom(seed) * Math.PI;
  rock.scale.x = .72 + randomFrom(seed + 1) * .6;
  rock.scale.z = .72 + randomFrom(seed + 2) * .6;
  if (radius < 14) addObstacle(x, z, radius * .72, radius * .72, 'mountain-rock');
  return rock;
}

function createMountainCabin(x, z, width, depth, height, rotation = 0, seed = 1, parent = mountainExpansion) {
  const groundHeight = mountainRoadHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, groundHeight, z);
  group.rotation.y = rotation;
  group.name = `Mountain village cabin ${seed}`;
  addMesh(group, new THREE.BoxGeometry(width, height, depth), mats.cabinWood, [0, height / 2, 0], { castShadow: true, receiveShadow: true });
  addMesh(group, new THREE.ConeGeometry(Math.max(width, depth) * .72, height * .56, 4), mats.cabinRoof, [0, height + height * .23, 0], { rotation: [0, Math.PI / 4, 0], castShadow: true });
  const warmWindow = addMesh(group, new THREE.BoxGeometry(width * .26, height * .2, .045), mats.villageLight, [0, height * .52, depth / 2 + .025]);
  if (randomFrom(seed) > .35) addMesh(group, new THREE.BoxGeometry(.7, .08, .08), mats.villageLight, [0, height * .27, depth / 2 + .04]);
  if (seed % 3 === 0) {
    addMesh(group, new THREE.BoxGeometry(width * .68, .16, .9), mats.sidewalkDark, [0, .16, depth / 2 + .45], { castShadow: true });
    [-width * .27, width * .27].forEach((px) => addMesh(group, new THREE.CylinderGeometry(.06, .08, 1.0, 6), mats.guardrail, [px, .58, depth / 2 + .68], { castShadow: true }));
  } else if (seed % 3 === 1) {
    addMesh(group, new THREE.BoxGeometry(.28, height * .7, .28), mats.cabinRoof, [width * .3, height * .82, -depth * .25], { castShadow: true });
  } else {
    addMesh(group, new THREE.BoxGeometry(width * .24, height * .42, .055), mats.sidewalkDark, [-width * .28, height * .25, depth / 2 + .04], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .42, .1, .18), mats.villageLight, [width * .2, height + .5, -depth * .1], { castShadow: true });
  }
  addObstacle(x, z, width / 2 + .7, depth / 2 + .7, 'mountain-village-building');
  parent.add(group);
  return { group, warmWindow };
}

function createPinewatchStore(x, z, width, depth, height, name, rotation = 0, seed = 1) {
  const groundHeight = mountainRoadHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, groundHeight, z);
  group.rotation.y = rotation;
  group.name = `Pinewatch store ${name}`;
  const facade = new THREE.MeshStandardMaterial({ color: [0x66514a, 0x3f5a58, 0x5b493d, 0x4a5262][seed % 4], roughness: .9 });
  addMesh(group, new THREE.BoxGeometry(width, height, depth), facade, [0, height / 2, 0], { castShadow: true, receiveShadow: true });
  addMesh(group, new THREE.ConeGeometry(Math.max(width, depth) * .72, .95, 4), mats.cabinRoof, [0, height + .46, 0], { rotation: [0, Math.PI / 4, 0], castShadow: true });
  addMesh(group, new THREE.BoxGeometry(width * .9, .12, .48), mats.villageLight, [0, height * .67, depth / 2 + .12], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(width * .2, height * .42, .07), mats.sidewalkDark, [width * .27, height * .25, depth / 2 + .15], { castShadow: true });
  for (let index = 0; index < 3; index += 1) {
    addMesh(group, new THREE.BoxGeometry(width * .16, height * .23, .06), index === 1 ? mats.villageLight : mats.windowAmber, [(-.3 + index * .3) * width, height * .38, depth / 2 + .16]);
  }
  const sign = makeLabel(name, seed % 2 ? '#ff9d50' : '#d6fa6a', .39);
  sign.position.set(0, height * .76, depth / 2 + .2);
  group.add(sign);
  addObstacle(x, z, width / 2 + .6, depth / 2 + .6, 'pinewatch-store');
  pinewatchExpansion.add(group);
  return group;
}

function createPinewatchParkingLot(x, z, width, depth, rotation = 0, seed = 1) {
  const groundHeight = mountainRoadHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, groundHeight, z);
  group.rotation.y = rotation;
  group.name = 'Pinewatch gravel parking area';
  addMesh(group, new THREE.BoxGeometry(width, .07, depth), mats.mountainShoulder, [0, .02, 0], { receiveShadow: true });
  const spaces = Math.max(2, Math.floor((width - 1.4) / 4.1));
  for (let index = 0; index <= spaces; index += 1) {
    const px = -width / 2 + .7 + index * ((width - 1.4) / spaces);
    addMesh(group, new THREE.BoxGeometry(.07, .035, depth * .45), mats.laneYellow, [px, .08, 0]);
    if (index === spaces) continue;
    if ((index + seed) % 3 === 0) continue;
    const localPosition = new THREE.Vector3(px + (width - 1.4) / spaces / 2, 0, 0).applyAxisAngle(Y_AXIS, rotation);
    createParkedVehicle(x + localPosition.x, z + localPosition.z, rotation + (index % 2 ? Math.PI : 0), PARKED_CAR_STYLES[(seed + index) % PARKED_CAR_STYLES.length], PARKED_CAR_COLORS[(seed + index * 2) % PARKED_CAR_COLORS.length], groundHeight + .04, seed + index);
  }
  pinewatchExpansion.add(group);
  return group;
}

function createPinewatchStreetLight(x, z, seed = 1) {
  const groundHeight = mountainRoadHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, groundHeight, z);
  addMesh(group, new THREE.CylinderGeometry(.06, .09, 3.4, 7), mats.guardrail, [0, 1.7, 0], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(.9, .08, .08), mats.guardrail, [.38, 3.34, 0], { castShadow: true });
  addMesh(group, new THREE.SphereGeometry(.13, 8, 8), mats.villageLight, [.78, 3.25, 0]);
  if (seed % 2 === 0) {
    const light = new THREE.PointLight(0xffb27d, 1.1, 10, 2);
    light.position.set(.78, 3.2, 0);
    group.add(light);
  }
  pinewatchExpansion.add(group);
}

function createPinewatchTrafficLight(x, z, offset = 0) {
  const groundHeight = mountainRoadHeightAt(x, z);
  const group = new THREE.Group();
  group.position.set(x, groundHeight, z);
  const pole = addMesh(group, new THREE.CylinderGeometry(.07, .1, 3.8, 8), mats.guardrail, [4.9, 1.9, 4.9], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(.08, .08, 3.2), mats.guardrail, [4.9, 3.72, 3.5], { castShadow: true });
  const makeHead = (xOffset, zOffset) => {
    addMesh(group, new THREE.BoxGeometry(.34, 1.05, .3), mats.sidewalkDark, [4.9 + xOffset, 3.05, 1.15 + zOffset], { castShadow: true });
    const materials = [
      new THREE.MeshStandardMaterial({ color: 0x4a1018, emissive: 0x110206, transparent: true, opacity: .3 }),
      new THREE.MeshStandardMaterial({ color: 0x5b3b0d, emissive: 0x1c1002, transparent: true, opacity: .3 }),
      new THREE.MeshStandardMaterial({ color: 0x123c2c, emissive: 0x04150e, transparent: true, opacity: .3 }),
    ];
    const lamps = materials.map((material, index) => addMesh(group, new THREE.SphereGeometry(.13, 8, 8), material, [4.9 + xOffset, 3.38 - index * .36, 1.0 + zOffset]));
    return { lamps, materials };
  };
  const heads = [makeHead(0, 0), makeHead(-.7, .65)];
  group.userData.heads = heads;
  group.userData.lamps = heads[0].lamps;
  group.userData.materials = heads[0].materials;
  group.userData.offset = offset;
  group.userData.state = 2;
  trafficSignals.push(group);
  pinewatchExpansion.add(group);
  return group;
}

function addPinewatchRoad(points) {
  const route = points.map(([x, z]) => new THREE.Vector3(x, mountainRoadHeightAt(x, z), z));
  addMountainPathRibbon(route, 9.8, mats.mountainShoulder, 0, pinewatchExpansion);
  addMountainPathRibbon(route, 8.1, mats.mountainRoad, .04, pinewatchExpansion);
  for (let index = 1; index < route.length; index += 1) {
    const start = route[index - 1];
    const end = route[index];
    const segment = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
    const length = segment.length();
    const heading = Math.atan2(segment.x, segment.z);
    for (let distance = 4; distance < length - 2; distance += 8) {
      const center = start.clone().lerp(end, distance / length);
      center.y += .1;
      addMesh(pinewatchExpansion, new THREE.BoxGeometry(.12, .03, 3.5), mats.laneYellow, center, { rotation: [0, heading, 0] });
    }
  }
}

function buildMountainWorld() {
  initializeMountainRoadMetrics();
  addMesh(mountainExpansion, new THREE.PlaneGeometry(520, 520), mats.mountainGround, [0, -.24, 50], { receiveShadow: true });
  const ridges = [
    [106, 165, 45, 62], [176, 153, 52, 76], [192, 88, 42, 58], [118, 79, 36, 47],
    [57, 184, 36, 48], [214, 190, 38, 54], [82, 121, 25, 34], [170, 208, 44, 64],
  ];
  ridges.forEach(([x, z, radius, height], index) => createMountainRock(x, z, radius, height, index % 2 ? mats.mountainRockLit : mats.mountainRock, index + 40));
  for (let index = 0; index < 22; index += 1) {
    const angle = randomFrom(index + 800) * Math.PI * 2;
    const radius = 28 + randomFrom(index + 820) * 104;
    const x = 132 + Math.cos(angle) * radius;
    const z = 145 + Math.sin(angle) * radius * .72;
    if (isOnMountainRoad(x, z) || x < 45) continue;
    createMountainRock(x, z, 3 + randomFrom(index + 840) * 7, 5 + randomFrom(index + 860) * 13, mats.mountainRock, index + 100);
  }
  addMountainRoadDetails();
  const village = new THREE.Group();
  village.name = 'Pinewatch mountain village';
  mountainExpansion.add(village);
  // Two short streets branch off the pass so Pinewatch reads as a small town,
  // not a handful of cabins scattered beside the highway.
  addPinewatchRoad([[111, 79], [128, 73], [145, 72], [162, 79]]);
  addPinewatchRoad([[145, 72], [145, 60], [136, 49], [121, 45]]);
  addPinewatchRoad([[162, 79], [169, 68], [166, 56]]);
  [
    [136, 68, 7.2, 5.2, 4.8, -.25], [151, 65, 6.4, 5.0, 4.3, .5], [145, 53, 7.8, 5.4, 4.7, 1.1],
    [126, 55, 6.0, 4.6, 4.0, -.7], [159, 77, 5.8, 4.4, 4.1, .1], [119, 73, 5.5, 4.2, 3.8, .8],
    [111, 83, 6.3, 4.8, 4.2, -.45], [169, 75, 6.8, 4.6, 4.5, .8], [157, 47, 6.1, 4.5, 4.0, -.2],
    [116, 45, 5.7, 4.2, 3.7, .35],
  ].forEach((cabin, index) => createMountainCabin(...cabin, index + 200, index >= 6 ? pinewatchExpansion : mountainExpansion));
  createPinewatchStore(107, 67, 8.8, 5.8, 4.4, 'PINEWATCH MERCANTILE', 0.12, 1);
  createPinewatchStore(151, 43, 8.2, 5.4, 4.1, 'FIRESIDE CAFE', -.18, 2);
  createPinewatchStore(172, 57, 7.4, 5.2, 4.0, 'TRAIL SUPPLY', .42, 3);
  createPinewatchParkingLot(110, 58, 14, 9, .1, 11);
  createPinewatchParkingLot(156, 55, 13, 8, -.12, 14);
  [
    [106, 73, .08, 'hatch', 0xc44759], [113, 61, Math.PI, 'wagon', 0x477ba4], [123, 47, .55, 'suv', 0x5f8f78],
    [148, 39, Math.PI, 'classic', 0xc9d0c4], [164, 58, .4, 'pickup', 0xa85b4f], [170, 72, Math.PI, 'ev', 0x7e6b9d],
  ].forEach(([x, z, heading, style, color], index) => createParkedVehicle(x, z, heading, style, color, mountainRoadHeightAt(x, z) + .04, 900 + index));
  [[116, 77], [139, 75], [160, 72], [158, 51], [128, 48], [108, 59]].forEach(([x, z], index) => createPinewatchStreetLight(x, z, index));
  createPinewatchTrafficLight(136, 68, 1.5);
  createPinewatchTrafficLight(161, 77, 7.5);
  createPinewatchTrafficLight(145, 60, 13.5);
  addMesh(village, new THREE.CylinderGeometry(1.25, 1.4, .25, 16), mats.sidewalkDark, [143, mountainRoadHeightAt(143, 65) + .15, 65]);
  addMesh(village, new THREE.CylinderGeometry(.12, .12, 4.8, 8), mats.guardrail, [143, mountainRoadHeightAt(143, 65) + 2.5, 65]);
  addMesh(village, new THREE.ConeGeometry(1.8, 1.1, 8), mats.cabinRoof, [143, mountainRoadHeightAt(143, 65) + 5.2, 65]);
  const villageLabel = makeLabel('PINEWATCH VILLAGE', '#d6fa6a', .64);
  villageLabel.position.set(mountainVillagePosition.x, mountainVillagePosition.y + 7.8, mountainVillagePosition.z);
  pinewatchExpansion.add(villageLabel);
  const summitLabel = makeLabel('MOUNTAIN PASS', '#ff9d50', .56);
  summitLabel.position.set(162, 20, 119);
  mountainExpansion.add(summitLabel);
  addMountainDeliveryMarkers();
  createMountainTraffic();
}

const worldSectorRegistry = new Map();
let lastStreamSectorKey = '';

function regionalRouteVector(route) {
  return route.points.map(([x, z]) => new THREE.Vector3(x, .04, z));
}

function nearestRegionalRoadPoint(x, z) {
  let nearest = { distance: Infinity, height: .02, route: null };
  regionalRoutes.forEach((route) => {
    const points = route.points;
    for (let index = 1; index < points.length; index += 1) {
      const [startX, startZ] = points[index - 1];
      const [endX, endZ] = points[index];
      const dx = endX - startX;
      const dz = endZ - startZ;
      const lengthSq = dx * dx + dz * dz || 1;
      const amount = clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSq, 0, 1);
      const pointX = startX + dx * amount;
      const pointZ = startZ + dz * amount;
      const distance = Math.hypot(x - pointX, z - pointZ);
      if (distance < nearest.distance) nearest = { distance, height: .04, route };
    }
  });
  return nearest;
}

function isOnRegionalRoad(x, z) {
  return nearestRegionalRoadPoint(x, z).distance < 7.5;
}

function nearestUrbanRoadPoint(x, z) {
  let nearest = { distance: Infinity, height: .02 };
  urbanRoadRoutes.forEach((route) => {
    for (let index = 1; index < route.length; index += 1) {
      const [startX, startZ] = route[index - 1];
      const [endX, endZ] = route[index];
      const dx = endX - startX;
      const dz = endZ - startZ;
      const lengthSq = dx * dx + dz * dz || 1;
      const amount = clamp(((x - startX) * dx + (z - startZ) * dz) / lengthSq, 0, 1);
      const pointX = startX + dx * amount;
      const pointZ = startZ + dz * amount;
      const distance = Math.hypot(x - pointX, z - pointZ);
      if (distance < nearest.distance) nearest = { distance, height: .02 };
    }
  });
  return nearest;
}

function isOnUrbanRoad(x, z) {
  return nearestUrbanRoadPoint(x, z).distance < 7.2;
}

function addRegionalRoadNetwork() {
  initializeRegionalRouteMetrics();
  regionalRoutes.forEach((route) => {
    const points = regionalRouteVector(route);
    addMountainPathRibbon(points, 14.2, mats.mountainShoulder, 0, regionalRoadGroup);
    addMountainPathRibbon(points, 11.4, mats.mountainRoad, .05, regionalRoadGroup);
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1];
      const end = points[index];
      const segment = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
      const length = segment.length();
      const heading = Math.atan2(segment.x, segment.z);
      const tangent = segment.normalize();
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
      for (let distance = 6; distance < length - 3; distance += 18) {
        const center = start.clone().lerp(end, distance / length);
        center.y = .11;
        addMesh(regionalRoadGroup, new THREE.BoxGeometry(.18, .03, 8), mats.laneYellow, center, { rotation: [0, heading, 0] });
      }
      [-1, 1].forEach((side) => {
        const edge = start.clone().lerp(end, .5).addScaledVector(normal, side * 5.15);
        edge.y = .11;
        addMesh(regionalRoadGroup, new THREE.BoxGeometry(.09, .035, length), mats.lane, edge, { rotation: [0, heading, 0] });
      });
    }
    const signSegment = Math.min(2, points.length - 2);
    const signStart = points[signSegment];
    const signEnd = points[signSegment + 1];
    const signTangent = new THREE.Vector3(signEnd.x - signStart.x, 0, signEnd.z - signStart.z).normalize();
    const signNormal = new THREE.Vector3(signTangent.z, 0, -signTangent.x);
    const signPoint = signStart.clone().lerp(signEnd, .42).addScaledVector(signNormal, 8.1);
    createSpeedSign(signPoint.x, signPoint.z, route.speedLimit, Math.atan2(signTangent.x, signTangent.z));
  });
  worldRegions.filter((region) => region.type !== 'city' && region.type !== 'mountain').forEach((region) => {
    const label = makeLabel(region.name, region.color, .62);
    label.position.set(region.x, 7, region.z);
    regionalRoadGroup.add(label);
  });
}

function worldSectorIndices(x, z) {
  return { x: Math.floor(x / WORLD_SECTOR_SIZE), z: Math.floor(z / WORLD_SECTOR_SIZE) };
}

function worldSectorKey(x, z) {
  return `${x}:${z}`;
}

function worldRegionNear(x, z) {
  return worldRegions.reduce((nearest, region) => {
    const distance = Math.hypot(region.x - x, region.z - z);
    return distance < nearest.distance ? { region, distance } : nearest;
  }, { region: worldRegions[0], distance: Infinity }).region;
}

function sectorGroundMaterial(type) {
  if (type === 'city') return mats.ground;
  if (type === 'forest') return mats.forestGround;
  if (type === 'lake') return mats.lakeGround;
  if (type === 'desert') return mats.desertGround;
  if (type === 'industrial') return mats.industrialGround;
  if (type === 'rural' || type === 'highlands') return mats.ruralGround;
  return mats.mountainGround;
}

function addSectorTree(group, x, z, scale, seed) {
  addMesh(group, new THREE.CylinderGeometry(.16, .25, 1.45, 7), mats.treeTrunk, [x, .72, z], { castShadow: true });
  const material = randomFrom(seed) > .5 ? mats.treeLeaf : mats.treeLeafDark;
  addMesh(group, new THREE.IcosahedronGeometry(1.1, 1), material, [x, 1.95, z], { scale: [scale, scale, scale], castShadow: true });
}

function addSectorStructure(group, sector, x, z, width, depth, height, seed) {
  const material = sector.region.type === 'industrial' ? mats.asphaltEdge : sector.region.type === 'desert' ? mats.cabinWood : mats.mountainRockLit;
  addMesh(group, new THREE.BoxGeometry(width, height, depth), material, [x, height / 2, z], { castShadow: true, receiveShadow: true });
  if (sector.region.type !== 'industrial') {
    addMesh(group, new THREE.ConeGeometry(Math.max(width, depth) * .7, height * .45, 4), mats.cabinRoof, [x, height + height * .2, z], { rotation: [0, Math.PI / 4, 0], castShadow: true });
  } else {
    addMesh(group, new THREE.BoxGeometry(width * .55, .08, depth * .08), mats.lamp, [x, height * .7, z + depth / 2 + .04]);
  }
  const obstacle = addObstacle(sector.centerX + x, sector.centerZ + z, width / 2 + .5, depth / 2 + .5, `${sector.region.type}-structure`);
  obstacle.sectorKey = sector.key;
  sector.obstacles.push(obstacle);
}

function createWorldSector(sectorX, sectorZ) {
  const key = worldSectorKey(sectorX, sectorZ);
  const centerX = (sectorX + .5) * WORLD_SECTOR_SIZE;
  const centerZ = (sectorZ + .5) * WORLD_SECTOR_SIZE;
  const region = worldRegionNear(centerX, centerZ);
  const group = new THREE.Group();
  group.name = `World sector ${key} // ${region.name}`;
  group.position.set(centerX, 0, centerZ);
  const sector = { key, group, centerX, centerZ, region, obstacles: [] };
  addMesh(group, new THREE.PlaneGeometry(WORLD_SECTOR_SIZE, WORLD_SECTOR_SIZE), sectorGroundMaterial(region.type), [0, -.28, 0], { rotation: [-Math.PI / 2, 0, 0], receiveShadow: true });
  const lakeCore = region.type === 'lake'
    && Math.abs(centerX - region.x) < WORLD_SECTOR_SIZE / 2
    && Math.abs(centerZ - region.z) < WORLD_SECTOR_SIZE / 2;
  if (lakeCore) {
    const lakeWidth = 360;
    const lakeDepth = 270;
    addMesh(group, new THREE.PlaneGeometry(lakeWidth, lakeDepth, 72, 54), mats.water, [region.x - centerX, -.07, region.z - centerZ], { rotation: [-Math.PI / 2, 0, 0] });
    const waterObstacle = addObstacle(region.x, region.z, lakeWidth / 2 + 2, lakeDepth / 2 + 2, 'lake-water');
    waterObstacle.sectorKey = sector.key;
    sector.obstacles.push(waterObstacle);
  }
  const seed = Math.abs(sectorX * 92821 + sectorZ * 68917) + 31;
  const propCount = region.type === 'forest' ? 28 : region.type === 'desert' ? 17 : 12;
  for (let index = 0; index < propCount; index += 1) {
    const localX = -235 + randomFrom(seed + index * 3.7) * 470;
    const localZ = -235 + randomFrom(seed + index * 5.1) * 470;
    const worldX = centerX + localX;
    const worldZ = centerZ + localZ;
    if (isOnRegionalRoad(worldX, worldZ) || isOnMountainRoad(worldX, worldZ) || (Math.abs(worldX) < 170 && Math.abs(worldZ) < 170)) continue;
    if (region.type === 'forest' || (region.type === 'highlands' && index % 3 !== 0)) {
      addSectorTree(group, localX, localZ, .75 + randomFrom(seed + index + 70) * .55, seed + index);
    } else if (region.type === 'lake') {
      addMesh(group, new THREE.ConeGeometry(1.5 + randomFrom(seed + index) * 1.6, 3.2 + randomFrom(seed + index + 12) * 2.6, 7), mats.mountainRock, [localX, 1.45, localZ], { castShadow: true });
    } else {
      addSectorStructure(group, sector, localX, localZ, 8 + randomFrom(seed + index + 80) * 10, 7 + randomFrom(seed + index + 90) * 8, 3 + randomFrom(seed + index + 100) * 7, seed + index);
    }
  }
  streamedWorld.add(group);
  worldSectorRegistry.set(key, sector);
  return sector;
}

function unloadWorldSector(sector) {
  sector.obstacles.forEach((obstacle) => {
    const index = staticObstacles.indexOf(obstacle);
    if (index >= 0) staticObstacles.splice(index, 1);
  });
  streamedWorld.remove(sector.group);
  sector.group.traverse((object) => {
    if (object.geometry?.dispose) object.geometry.dispose();
  });
  worldSectorRegistry.delete(sector.key);
}

function updateWorldStreaming(force = false) {
  const indices = worldSectorIndices(player.position.x, player.position.z);
  const centerKey = worldSectorKey(indices.x, indices.z);
  if (!force && centerKey === lastStreamSectorKey) return;
  lastStreamSectorKey = centerKey;
  const needed = new Set();
  for (let x = indices.x - WORLD_STREAM_RADIUS; x <= indices.x + WORLD_STREAM_RADIUS; x += 1) {
    for (let z = indices.z - WORLD_STREAM_RADIUS; z <= indices.z + WORLD_STREAM_RADIUS; z += 1) {
      if (Math.abs((x + .5) * WORLD_SECTOR_SIZE) > WORLD_LIMIT || Math.abs((z + .5) * WORLD_SECTOR_SIZE) > WORLD_LIMIT) continue;
      const key = worldSectorKey(x, z);
      needed.add(key);
      if (!worldSectorRegistry.has(key)) createWorldSector(x, z);
    }
  }
  [...worldSectorRegistry.values()].forEach((sector) => {
    if (!needed.has(sector.key)) unloadWorldSector(sector);
  });
}

function buildWorld() {
  buildSky();
  buildGroundAndWater();
  buildRoads();
  populateCity();
  populateStreetLights();
  buildLandmarks();
  buildRoadInfrastructure();
  createTraffic();
  buildMountainWorld();
  addRegionalRoadNetwork();
  createRegionalTraffic();
  createSpeedRadarSites();
}

const player = {
  mesh: createCar(0x303fca, 0xd6fa6a, true),
  position: new THREE.Vector3(0, .02, 0),
  speed: 0,
  heading: 0,
  distance: 0,
  rep: 1280,
  cash: 420,
  selectedStyle: 'sport',
  ownedCars: ['sport'],
  paint: '#303fca',
  condition: 100,
  disabledTimer: 0,
  speedingTime: 0,
  violationCooldown: 0,
  trafficViolations: 0,
  lastSignalKey: '',
  stopObservations: {},
  upgrades: { engine: 0, grip: 0 },
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

let garageOpen = false;
let gamePaused = false;
let worldMapOpen = false;
let starterMenuOpen = true;
let menuPage = 'home';
let garageCarouselIndex = 0;
let qualityMode = 'HIGH';
const upgradeConfig = {
  engine: { costs: [240, 420, 700] },
  grip: { costs: [180, 320, 540] },
};

function saveProgress() {
  try {
    localStorage.setItem('neonline-aurora-save', JSON.stringify({
      cash: player.cash,
      rep: player.rep,
      selectedStyle: player.selectedStyle,
      ownedCars: player.ownedCars,
      paint: player.paint,
      condition: player.condition,
      upgrades: player.upgrades,
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
    if (Array.isArray(saved.ownedCars)) {
      player.ownedCars = saved.ownedCars.filter((style) => VEHICLE_CATALOG.some((vehicle) => vehicle.style === style));
      if (!player.ownedCars.includes('sport')) player.ownedCars.unshift('sport');
    }
    if (typeof saved.selectedStyle === 'string' && player.ownedCars.includes(saved.selectedStyle)) player.selectedStyle = saved.selectedStyle;
    if (typeof saved.paint === 'string' && /^#[0-9a-f]{6}$/i.test(saved.paint)) player.paint = saved.paint;
    if (Number.isFinite(saved.condition)) player.condition = clamp(saved.condition, 1, 100);
    if (Array.isArray(saved.cacheIds)) player.collectedCaches = saved.cacheIds.map((id) => Number(id)).filter((id) => Number.isInteger(id));
    if (saved.upgrades) Object.keys(player.upgrades).forEach((key) => {
      player.upgrades[key] = clamp(Number(saved.upgrades[key]) || 0, 0, 3);
    });
  } catch (error) {
    console.warn('Progress load unavailable.', error);
  }
}
loadProgress();

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
const mountainDeliveryStart = mountainVillagePosition.clone();
const mountainDeliveryTarget = mountainVillageDropPosition.clone();
let mountainDeliveryState = 'idle';
let mountainDeliveryTime = 0;
let mountainDeliveryNear = false;
let mountainDeliveryStartMarker = null;
let mountainDeliveryTargetMarker = null;
let mountainDeliveryStartRing = null;
let mountainDeliveryTargetRing = null;

function addMountainDeliveryMarkers() {
  mountainDeliveryStartMarker = new THREE.Group();
  mountainDeliveryStartMarker.position.copy(mountainDeliveryStart);
  mountainDeliveryStartRing = addMesh(mountainDeliveryStartMarker, new THREE.TorusGeometry(2.3, .09, 8, 32), mats.cache, [0, .2, 0], { rotation: [Math.PI / 2, 0, 0] });
  addMesh(mountainDeliveryStartMarker, new THREE.CylinderGeometry(.04, .04, 4.8, 6), mats.cache, [0, 2.4, 0]);
  const startLabel = makeLabel('PINEWATCH DEPOT', '#5ce3d1', .48);
  startLabel.position.y = 5.1;
  mountainDeliveryStartMarker.add(startLabel);
  mountainExpansion.add(mountainDeliveryStartMarker);
  mountainDeliveryTargetMarker = new THREE.Group();
  mountainDeliveryTargetMarker.position.copy(mountainDeliveryTarget);
  mountainDeliveryTargetRing = addMesh(mountainDeliveryTargetMarker, new THREE.TorusGeometry(2.4, .09, 8, 32), mats.event, [0, .2, 0], { rotation: [Math.PI / 2, 0, 0] });
  addMesh(mountainDeliveryTargetMarker, new THREE.CylinderGeometry(.04, .04, 4.8, 6), mats.event, [0, 2.4, 0]);
  const targetLabel = makeLabel('CABIN DROP', '#ff9d50', .48);
  targetLabel.position.y = 5.1;
  mountainDeliveryTargetMarker.add(targetLabel);
  mountainExpansion.add(mountainDeliveryTargetMarker);
}

function mountainDeliveryAction() {
  if (mountainDeliveryState === 'idle' && mountainDeliveryNear) {
    mountainDeliveryState = 'active';
    mountainDeliveryTime = 0;
    playTone(320, .2, .08, 'sine', 90);
    showToast('MOUNTAIN RUN ACCEPTED', 'Pinewatch Depot to the cabin above the pass', '+260 REP');
  } else if (mountainDeliveryState === 'finished' && mountainDeliveryNear) {
    mountainDeliveryState = 'active';
    mountainDeliveryTime = 0;
    showToast('NEW MOUNTAIN PACKAGE', 'Take the next load through Pinewatch', 'DELIVERY RUN');
  }
}

function deliveryAction() {
  if (mountainDeliveryNear || mountainDeliveryState === 'active') {
    mountainDeliveryAction();
    return;
  }
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

function updateMountainDelivery(time, dt) {
  if (!mountainDeliveryStartMarker || !mountainDeliveryTargetMarker) return;
  mountainDeliveryNear = player.position.distanceTo(mountainDeliveryStart) < 12;
  if (mountainDeliveryState === 'active') {
    mountainDeliveryTime += dt;
    if (player.position.distanceTo(mountainDeliveryTarget) < 7.4) {
      mountainDeliveryState = 'finished';
      player.rep += 260;
      player.cash += 180;
      saveProgress();
      playBeacon();
      showToast('PINEWATCH DELIVERED', `${mountainDeliveryTime.toFixed(1)} seconds through the pass`, '+260 REP');
    }
  }
  const pulse = (Math.sin(time * .004) + 1) / 2;
  mountainDeliveryStartRing.rotation.z += dt * 1.15;
  mountainDeliveryStartRing.scale.setScalar(1 + pulse * .14);
  mountainDeliveryTargetRing.rotation.z -= dt * 1.35;
  mountainDeliveryTargetRing.scale.setScalar(1 + pulse * .16);
  mountainDeliveryStartMarker.visible = mountainDeliveryState !== 'active';
  mountainDeliveryTargetMarker.visible = mountainDeliveryState === 'active';
  const relevant = mountainDeliveryNear || mountainDeliveryState === 'active';
  if (!relevant) return;
  const panel = document.querySelector('#delivery-panel');
  panel.classList.add('visible');
  panel.classList.toggle('active', mountainDeliveryState === 'active');
  const status = document.querySelector('#delivery-status');
  const title = document.querySelector('#delivery-title');
  const copy = document.querySelector('#delivery-copy');
  const timeReadout = document.querySelector('#delivery-time');
  const action = document.querySelector('#delivery-action');
  if (mountainDeliveryState === 'idle') {
    status.textContent = mountainDeliveryNear ? 'READY' : 'MOUNTAIN ROUTE';
    title.textContent = 'PINEWATCH SUPPLY RUN';
    copy.textContent = mountainDeliveryNear ? 'Hit V to carry supplies up to the remote cabin.' : 'Climb the pass and find the cyan Pinewatch depot.';
    timeReadout.textContent = mountainDeliveryNear ? 'PRESS V' : 'MOUNTAIN DELIVERY';
    action.innerHTML = mountainDeliveryNear ? '<span class="keycap">V</span><span>ACCEPT MOUNTAIN RUN</span>' : '<span>DEPOT // CABIN DROP</span>';
  } else if (mountainDeliveryState === 'active') {
    status.textContent = 'PASS RUN LIVE';
    title.textContent = 'PINEWATCH SUPPLY RUN';
    copy.textContent = 'Keep to your lane. The cabin drop is beyond the switchbacks.';
    timeReadout.textContent = `${mountainDeliveryTime.toFixed(1)} SEC`;
    action.innerHTML = '<span class="event-live-dot"></span><span>SUPPLIES ON BOARD</span>';
  } else {
    status.textContent = 'DELIVERED';
    title.textContent = 'PINEWATCH COMPLETE';
    copy.textContent = `Last run: ${mountainDeliveryTime.toFixed(1)} seconds. Return to the depot for another load.`;
    timeReadout.textContent = 'COMPLETE';
    action.innerHTML = mountainDeliveryNear ? '<span class="keycap">V</span><span>ACCEPT ANOTHER</span>' : '<span>ROUTE CLEARED</span>';
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
const speedRadarSites = [];
let activeRadarSite = null;
let policeState = 'idle';
let policeTime = 0;

function createSpeedRadarSite(position, heading = 0) {
  const group = new THREE.Group();
  group.position.set(position.x, 0, position.z);
  group.rotation.y = heading;
  addMesh(group, new THREE.CylinderGeometry(.045, .07, 1.05, 7), mats.sidewalkDark, [0, .53, 0]);
  addMesh(group, new THREE.BoxGeometry(.7, .32, .42), mats.asphaltEdge, [0, 1.1, 0], { castShadow: true });
  addMesh(group, new THREE.SphereGeometry(.08, 8, 6), mats.event, [0, 1.22, .24]);
  const label = makeLabel('RADAR', '#ff9d50', .3);
  label.position.set(0, 1.72, 0);
  group.add(label);
  group.userData.label = label;
  roadFurniture.add(group);
  speedRadarSites.push({ group, position: new THREE.Vector3(position.x, .02, position.z), heading, cooldown: 0 });
}

function createSpeedRadarSites() {
  const definitions = [
    [new THREE.Vector3(-59.5, .02, -84), 0],
    [new THREE.Vector3(28.5, .02, 84), 0],
    [new THREE.Vector3(72.5, .02, -28), Math.PI],
    [new THREE.Vector3(-84, .02, 28.5), Math.PI / 2],
    [new THREE.Vector3(84, .02, 72.5), -Math.PI / 2],
  ];
  [.24, .52, .78].forEach((progress, index) => {
    const sample = sampleMountainRoad(progress);
    const shoulder = sample.position.clone().addScaledVector(sample.normal, index % 2 ? -6.7 : 6.7);
    definitions.push([shoulder, Math.atan2(sample.tangent.x, sample.tangent.z)]);
  });
  [[0, .34], [1, .58], [2, .66], [3, .48]].forEach(([routeIndex, progress]) => {
    const sample = sampleRegionalRoute(routeIndex, progress);
    const shoulder = sample.position.clone().addScaledVector(sample.normal, routeIndex % 2 ? -7.4 : 7.4);
    definitions.push([shoulder, Math.atan2(sample.tangent.x, sample.tangent.z)]);
  });
  // Shuffle the authored candidate locations each session so a familiar road
  // does not always produce the same roadside stop.
  for (let index = definitions.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [definitions[index], definitions[swapIndex]] = [definitions[swapIndex], definitions[index]];
  }
  definitions.slice(0, 8).forEach(([position, heading]) => createSpeedRadarSite(position, heading));
}

function nearestSpeedRadarSite() {
  let nearest = null;
  let nearestDistance = 12.5;
  speedRadarSites.forEach((site) => {
    if (site.cooldown > 0) return;
    const distance = Math.hypot(player.position.x - site.position.x, player.position.z - site.position.z);
    if (distance < nearestDistance) {
      nearest = site;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function beginRadarStop(site) {
  if (!site || policeState !== 'idle' || garageOpen || gamePaused) return;
  activeRadarSite = site;
  site.cooldown = 26;
  policeState = 'radar';
  policeTime = 0;
  policeVehicle.position.copy(site.position);
  policeVehicle.position.y = .02;
  policeVehicle.rotation.y = site.heading;
  policeVehicle.visible = true;
  policeSiren.visible = false;
  showToast('SPEED RADAR', 'A roadside unit clocked your speed. Pull over when safe.', 'RADAR STOP');
}

function endRadarStop() {
  policeState = 'idle';
  policeTime = 0;
  activeRadarSite = null;
  policeVehicle.visible = false;
  policeSiren.visible = false;
  policeRed.visible = false;
  policeBlue.visible = false;
}

function updatePolice(time, dt) {
  if (policeState === 'radar') {
    policeTime += dt;
    policeVehicle.rotation.y = activeRadarSite?.heading || policeVehicle.rotation.y;
    if (policeTime > 1.6) {
      policeState = 'pull-over';
      policeTime = 0;
      policeSiren.visible = true;
      showToast('PULL OVER', 'The radar unit is following. Find a safe place to stop.', 'SPEED CHECK');
    }
  } else if (policeState === 'pull-over') {
    policeTime += dt;
    const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
    const side = new THREE.Vector3(Math.cos(player.heading), 0, -Math.sin(player.heading));
    const target = player.position.clone().addScaledVector(forward, -10).addScaledVector(side, 3.2);
    target.y = .02;
    policeVehicle.position.lerp(target, 1 - Math.exp(-3.1 * dt));
    const toPlayer = player.position.clone().sub(policeVehicle.position);
    policeVehicle.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
    policeSiren.position.copy(policeVehicle.position);
    policeSiren.rotation.y = policeVehicle.rotation.y;
    policeRed.visible = Math.sin(time * .025) > 0;
    policeBlue.visible = !policeRed.visible;
    const stoppedSafely = Math.abs(player.speed) < 1.4 && policeVehicle.position.distanceTo(player.position) < 16;
    if (stoppedSafely || policeTime > 12) {
      policeState = 'ticket';
      policeTime = 0;
      policeSiren.visible = false;
      showToast('SPEED CITATION', stoppedSafely ? 'Thank you. Please keep to the posted limit.' : 'Citation recorded without a roadside stop.', 'NO PURSUIT');
    }
  } else if (policeState === 'ticket') {
    policeTime += dt;
    if (policeTime > 3.2) endRadarStop();
  } else {
    policeSiren.visible = false;
  }
}

createCollectibles();

function vehicleCatalogEntry(style = player.selectedStyle) {
  return VEHICLE_CATALOG.find((vehicle) => vehicle.style === style) || VEHICLE_CATALOG[0];
}

function paintName(paint) {
  const names = {
    '#303fca': 'MIDNIGHT BLUE',
    '#d85062': 'SIGNAL RED',
    '#d6fa6a': 'ACID LIME',
    '#5ce3d1': 'AQUA MINT',
    '#f0e6cf': 'PEARL WHITE',
    '#141a24': 'OBSIDIAN',
  };
  return names[paint.toLowerCase()] || 'CUSTOM FINISH';
}

function vehicleRepairCost() {
  return Math.ceil(Math.max(0, 100 - player.condition) * 5);
}

function updateDamageUi() {
  const percent = Math.round(player.condition);
  const percentText = `${percent}%`;
  const conditionPercent = document.querySelector('#condition-percent');
  const conditionFill = document.querySelector('#condition-fill');
  if (conditionPercent) conditionPercent.textContent = percentText;
  if (conditionFill) conditionFill.style.width = `${percent}%`;
  document.querySelectorAll('.condition-bar').forEach((element) => element.classList.toggle('critical', percent < 35));
  document.querySelectorAll('.garage-condition').forEach((block) => {
    const percentElement = block.querySelector('b');
    const fillElement = block.querySelector('em');
    if (percentElement) percentElement.textContent = percentText;
    if (fillElement) fillElement.style.width = `${percent}%`;
    block.classList.toggle('critical', percent < 35);
  });
  const menuPercent = document.querySelector('#menu-condition-percent');
  const menuFill = document.querySelector('#menu-condition-fill');
  if (menuPercent) menuPercent.textContent = percentText;
  if (menuFill) menuFill.style.width = `${percent}%`;
  const menuCondition = document.querySelector('.menu-condition-block');
  if (menuCondition) menuCondition.classList.toggle('critical', percent < 35);
  const repairCost = vehicleRepairCost();
  document.querySelectorAll('[data-repair-cost]').forEach((element) => { element.textContent = repairCost ? `$${repairCost}` : 'READY'; });
  document.querySelectorAll('[data-repair-action]').forEach((button) => {
    button.disabled = !repairCost || player.cash < repairCost;
    button.classList.toggle('ready', !repairCost);
  });
}

function applyVehicleDamage(amount, source = 'impact') {
  if (amount <= 0 || player.disabledTimer > 0) return;
  player.condition = clamp(player.condition - amount, 1, 100);
  saveProgress();
  updateGarageUi();
  if (player.condition <= 8) {
    player.disabledTimer = 2.8;
    player.speed = 0;
    Object.keys(input).forEach((key) => { input[key] = false; });
    showToast('VEHICLE DISABLED', 'Open the Garage and repair the damaged ride', 'REPAIR REQUIRED');
  } else if (amount >= 10) {
    showToast('BODYWORK DAMAGED', `${Math.round(player.condition)}% condition remaining`, source.toUpperCase());
  }
}

function repairVehicle() {
  const cost = vehicleRepairCost();
  if (!cost) {
    showToast('VEHICLE HEALTHY', 'No repair work is currently required', 'READY TO DRIVE');
    return;
  }
  if (player.cash < cost) {
    showToast('REPAIR FUNDS TOO LOW', `You need $${cost.toLocaleString('en-US')} for a full repair`, 'EARN MORE CASH');
    return;
  }
  player.cash -= cost;
  player.condition = 100;
  player.disabledTimer = 0;
  saveProgress();
  updateGarageUi();
  playTone(320, .18, .08, 'sine', 180);
  showToast('REPAIRS COMPLETE', 'Bodywork and drivetrain restored', `$${cost.toLocaleString('en-US')}`);
}

function updateMenuCash() {
  const cash = `$${player.cash.toLocaleString('en-US')}`;
  const rep = player.rep.toLocaleString('en-US');
  ['#menu-cash', '#market-cash', '#menu-garage-cash', '#garage-cash'].forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = selector === '#menu-rep' ? rep : cash;
  });
  const repElement = document.querySelector('#menu-rep');
  if (repElement) repElement.textContent = rep;
  const balance = document.querySelector('#menu-balance-copy');
  if (balance) balance.textContent = `${cash} AVAILABLE`;
}

function updateMenuVehicleUi() {
  const vehicle = vehicleCatalogEntry();
  const nameElements = ['#menu-vehicle-name', '#menu-garage-name'];
  nameElements.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = vehicle.name;
  });
  const classElements = ['#menu-vehicle-class', '#menu-garage-class'];
  classElements.forEach((selector) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = vehicle.className;
  });
  const copy = document.querySelector('#menu-vehicle-copy');
  if (copy) copy.textContent = vehicle.description;
  const paint = document.querySelector('#menu-vehicle-paint');
  if (paint) paint.textContent = paintName(player.paint);
  const art = document.querySelector('.menu-art-car');
  if (art) art.style.setProperty('--menu-paint', player.paint);
  const power = document.querySelector('.menu-stat-bars em');
  const grip = document.querySelectorAll('.menu-stat-bars em')[1];
  const styleScore = document.querySelectorAll('.menu-stat-bars em')[2];
  if (power) power.style.width = `${vehicle.power}%`;
  if (grip) grip.style.width = `${vehicle.grip}%`;
  if (styleScore) styleScore.style.width = `${vehicle.styleScore}%`;
  const hudName = document.querySelector('.vehicle-name');
  if (hudName) hudName.textContent = vehicle.name;
  const menuGarageCash = document.querySelector('#menu-garage-cash');
  if (menuGarageCash) menuGarageCash.textContent = `$${player.cash.toLocaleString('en-US')}`;
  document.querySelectorAll('[data-paint-group] .paint-swatch').forEach((swatch) => {
    swatch.classList.toggle('active', swatch.dataset.paint.toLowerCase() === player.paint.toLowerCase());
  });
  const selectedMarket = document.querySelector('.market-card.selected');
  if (selectedMarket) selectedMarket.style.setProperty('--card-paint', player.paint);
  // The profile line in the HUD remains useful after changing cars from the title screen.
  const meta = document.querySelector('.vehicle-meta');
  if (meta) meta.innerHTML = `<span>${vehicle.className.includes('ELECTRIC') ? 'AWD' : 'RWD'}</span><i></i><span>${vehicle.className}</span><i></i><span id="surface-state">ASPHALT</span>`;
  const garageHeading = document.querySelector('#garage-overlay .garage-header h2');
  if (garageHeading) garageHeading.textContent = vehicle.name;
  const profile = document.querySelector('#garage-overlay .garage-specs strong');
  if (profile) profile.textContent = `${paintName(player.paint)} SPEC`;
  const garageClass = document.querySelector('#garage-overlay .garage-specs > span');
  if (garageClass) garageClass.textContent = `${vehicle.className} / ${vehicle.style.toUpperCase()}`;
}

function renderMarket() {
  const grid = document.querySelector('#market-grid');
  if (!grid) return;
  const ownedCount = document.querySelector('#market-owned-count');
  if (ownedCount) ownedCount.textContent = String(player.ownedCars.length);
  grid.innerHTML = VEHICLE_CATALOG.map((vehicle) => {
    const owned = player.ownedCars.includes(vehicle.style);
    const selected = player.selectedStyle === vehicle.style;
    const action = !owned ? 'BUY' : selected ? 'SELECTED' : 'SELECT';
    const buttonClass = !owned ? 'buy' : selected ? 'selected-button' : '';
    const disabled = selected ? 'disabled' : '';
    const price = vehicle.price ? `$${vehicle.price.toLocaleString('en-US')}` : 'STARTER RIDE';
    return `<article class="market-card ${owned ? 'owned' : ''} ${selected ? 'selected' : ''}" style="--card-paint:${vehicle.paint};--card-accent:${vehicle.accent}">
      <div class="market-art"><div class="market-art-car"></div><div class="market-art-wheel a"></div><div class="market-art-wheel b"></div></div>
      <div class="market-tag"><span>${vehicle.className}</span><b>${owned ? 'OWNED' : 'LOCKED'}</b></div>
      <h3>${vehicle.name}</h3><p>${vehicle.description}</p>
      <div class="market-card-footer"><span class="market-price ${vehicle.price ? '' : 'free'}">${price}</span><button class="market-card-button ${buttonClass}" data-market-style="${vehicle.style}" type="button" ${disabled}>${action}</button></div>
    </article>`;
  }).join('');
}

function renderOwnedGarage() {
  const carousel = document.querySelector('#owned-car-carousel');
  if (!carousel) return;
  const ownedVehicles = VEHICLE_CATALOG.filter((vehicle) => player.ownedCars.includes(vehicle.style));
  const count = document.querySelector('#owned-fleet-count');
  if (count) count.textContent = String(ownedVehicles.length);
  if (garageCarouselIndex >= ownedVehicles.length) garageCarouselIndex = 0;
  carousel.innerHTML = ownedVehicles.map((vehicle) => {
    const selected = vehicle.style === player.selectedStyle;
    return `<button class="owned-car-card ${selected ? 'selected' : ''}" data-owned-style="${vehicle.style}" style="--thumb-paint:${vehicle.paint};--thumb-accent:${vehicle.accent}" type="button">
      <span class="owned-car-thumb"></span><span class="owned-car-copy"><b>${vehicle.name}</b><small>${vehicle.className}</small></span>${selected ? '<span class="owned-car-check">ACTIVE</span>' : ''}
    </button>`;
  }).join('');
  const selectedCard = carousel.querySelector('.owned-car-card.selected');
  if (selectedCard && garageCarouselIndex === 0) selectedCard.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function scrollOwnedGarage(direction) {
  const carousel = document.querySelector('#owned-car-carousel');
  if (!carousel) return;
  const cards = carousel.querySelectorAll('.owned-car-card');
  if (!cards.length) return;
  garageCarouselIndex = (garageCarouselIndex + direction + cards.length) % cards.length;
  cards[garageCarouselIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function applyPlayerVehicleStyle(style, announce = true) {
  if (!player.ownedCars.includes(style)) return false;
  const vehicle = vehicleCatalogEntry(style);
  const oldMesh = player.mesh;
  const oldParent = oldMesh.parent;
  const wasMenuCar = oldParent === menuGarage || starterMenuOpen;
  if (oldParent) oldParent.remove(oldMesh);
  const paintHex = new THREE.Color(player.paint).getHex();
  const nextMesh = createCar(paintHex, new THREE.Color(vehicle.accent).getHex(), true, style);
  nextMesh.position.copy(wasMenuCar ? new THREE.Vector3(0, .02, 0) : player.position);
  nextMesh.rotation.y = player.heading;
  player.mesh = nextMesh;
  player.selectedStyle = style;
  if (fleetAssetScenes[style]) replaceVehicleVisual(nextMesh, fleetAssetScenes[style], 1);
  applyPaintToVehicleRoot(nextMesh, player.paint);
  (wasMenuCar ? menuGarage : actors).add(nextMesh);
  updateGarageUi();
  if (announce) showToast('VEHICLE SELECTED', `${vehicle.name} is ready for Aurora Bay`, 'GARAGE UPDATED');
  return true;
}

function applyPlayerPaint(paint, announce = true) {
  if (!/^#[0-9a-f]{6}$/i.test(paint)) return;
  player.paint = paint.toLowerCase();
  applyPaintToVehicleRoot(player.mesh, player.paint);
  updateGarageUi();
  saveProgress();
  if (announce) showToast('BODY SHOP COMPLETE', `${paintName(player.paint)} finish applied`, 'FREE RESPRAY');
}

function purchaseMarketVehicle(style) {
  const vehicle = vehicleCatalogEntry(style);
  if (player.ownedCars.includes(style)) {
    applyPlayerVehicleStyle(style);
    setMenuPage('home');
    return;
  }
  if (player.cash < vehicle.price) {
    showToast('FUNDS TOO LOW', `${vehicle.name} needs $${vehicle.price.toLocaleString('en-US')}`, 'EARN MORE CASH');
    return;
  }
  player.cash -= vehicle.price;
  player.ownedCars.push(style);
  saveProgress();
  applyPlayerVehicleStyle(style, false);
  renderMarket();
  updateGarageUi();
  showToast('VEHICLE ACQUIRED', `${vehicle.name} added to your garage`, `$${vehicle.price.toLocaleString('en-US')}`);
}

function updateGarageUi() {
  const garageCash = document.querySelector('#garage-cash');
  if (garageCash) garageCash.textContent = `$${player.cash.toLocaleString('en-US')}`;
  document.querySelectorAll('.upgrade-card').forEach((card) => {
    const key = card.dataset.upgrade;
    const level = player.upgrades[key];
    const cost = upgradeConfig[key].costs[level];
    card.querySelector('.upgrade-level').textContent = `LV ${level} / 3`;
    card.querySelector('.upgrade-cost').textContent = cost ? `$${cost}` : 'MAXED';
    card.disabled = !cost || player.cash < cost;
    card.classList.toggle('maxed', !cost);
  });
  updateMenuCash();
  updateMenuVehicleUi();
  updateDamageUi();
  renderMarket();
  renderOwnedGarage();
}

function setMenuPage(page) {
  const validPages = ['home', 'market', 'garage', 'settings'];
  menuPage = validPages.includes(page) ? page : 'home';
  document.querySelectorAll('.menu-nav-button').forEach((button) => button.classList.toggle('active', button.dataset.menuPage === menuPage));
  document.querySelectorAll('.menu-page').forEach((section) => section.classList.toggle('active', section.dataset.menuContent === menuPage));
  updateGarageUi();
}

function setStarterMenuOpen(open) {
  starterMenuOpen = open;
  const overlay = document.querySelector('#main-menu-overlay');
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  if (open) {
    if (garageOpen) setGarageOpen(false);
    if (gamePaused) setPauseOpen(false);
    if (worldMapOpen) setWorldMapOpen(false);
    Object.keys(input).forEach((key) => { input[key] = false; });
    touchSteer = 0;
    world.visible = false;
    menuGarage.visible = true;
    if (player.mesh.parent !== menuGarage) {
      player.mesh.parent?.remove(player.mesh);
      menuGarage.add(player.mesh);
    }
    player.mesh.position.set(0, .02, 0);
    player.speed = 0;
    setMenuPage('home');
    updateGarageUi();
    ensureAudio();
    if (audioState.master && audioState.context) audioState.master.gain.setTargetAtTime(soundOn ? .2 : 0, audioState.context.currentTime, .08);
  } else {
    world.visible = true;
    menuGarage.visible = false;
    if (player.mesh.parent !== actors) {
      player.mesh.parent?.remove(player.mesh);
      actors.add(player.mesh);
    }
    player.position.set(0, .02, 0);
    player.speed = 0;
    player.heading = 0;
    endRadarStop();
    deliveryState = 'idle';
    mountainDeliveryState = 'idle';
    mountainDeliveryTime = 0;
    player.mesh.position.copy(player.position);
    player.mesh.rotation.y = player.heading;
    gamePaused = false;
    if (soundOn) ensureAudio();
  }
}

function updateMenuShowcase(time, dt) {
  if (!starterMenuOpen) return;
  player.mesh.position.set(0, .02, 0);
  player.mesh.rotation.y = .18 + Math.sin(time * .00028) * .17;
  const desiredCamera = new THREE.Vector3(8.7, 4.35, 10.8);
  camera.position.lerp(desiredCamera, 1 - Math.exp(-3.2 * dt));
  const lookTarget = new THREE.Vector3(0, 1.05, 0);
  camera.lookAt(lookTarget);
  camera.fov = damp(camera.fov, 48, 3, dt);
  camera.updateProjectionMatrix();
  const pulse = (Math.sin(time * .002) + 1) / 2;
  menuGarage.userData.lights?.forEach((light, index) => { light.intensity = [13, 8 + pulse * 2, 10 + (1 - pulse) * 2][index]; });
}

function setGarageOpen(open) {
  if (open && worldMapOpen) setWorldMapOpen(false);
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
  saveProgress();
  updateGarageUi();
  playTone(360 + player.upgrades[key] * 80, .2, .08, 'sine', 140);
  showToast(`${key.toUpperCase()} UPGRADED`, `Module level ${player.upgrades[key]} installed`, `$${cost}`);
}

function applyQualityMode() {
  const highQuality = qualityMode === 'HIGH';
  const pixelRatio = highQuality ? Math.min(window.devicePixelRatio || 1, 1.5) : Math.min(window.devicePixelRatio || 1, 1);
  renderer.shadowMap.enabled = highQuality;
  moon.castShadow = highQuality;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.querySelector('#quality-label').textContent = qualityMode;
  const menuQuality = document.querySelector('#menu-settings-quality');
  if (menuQuality) menuQuality.textContent = qualityMode;
}

let renderBudgetElapsed = 0;
let renderBudgetFrames = 0;

function updateRenderBudget(dt) {
  renderBudgetElapsed += dt;
  renderBudgetFrames += 1;
  if (renderBudgetElapsed < 1) return;
  const averageFrameTime = renderBudgetElapsed / Math.max(1, renderBudgetFrames);
  const basePixelRatio = qualityMode === 'HIGH' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
  let pixelRatio = renderer.getPixelRatio();
  if (averageFrameTime > .024) pixelRatio = Math.max(1, pixelRatio - .25);
  else if (averageFrameTime < .014) pixelRatio = Math.min(basePixelRatio, pixelRatio + .1);
  if (Math.abs(pixelRatio - renderer.getPixelRatio()) > .01) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  renderBudgetElapsed = 0;
  renderBudgetFrames = 0;
}

function setWorldMapOpen(open) {
  if (open && (starterMenuOpen || garageOpen || gamePaused)) return;
  worldMapOpen = open;
  worldMapOverlay.classList.toggle('open', open);
  worldMapOverlay.setAttribute('aria-hidden', String(!open));
  document.querySelector('#map-expand').textContent = open ? '× CLOSE' : '⌗ FULL';
  if (open) {
    Object.keys(input).forEach((key) => { input[key] = false; });
    touchSteer = 0;
    drawWorldMap();
  }
}

function setPauseOpen(open) {
  if (open && starterMenuOpen) return;
  if (open && garageOpen) setGarageOpen(false);
  if (open && worldMapOpen) setWorldMapOpen(false);
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
  player.ownedCars = ['sport'];
  player.selectedStyle = 'sport';
  player.paint = '#303fca';
  player.condition = 100;
  player.disabledTimer = 0;
  player.speedingTime = 0;
  player.violationCooldown = 0;
  player.trafficViolations = 0;
  player.lastSignalKey = '';
  player.stopObservations = {};
  player.upgrades = { engine: 0, grip: 0 };
  player.collectedCaches = [];
  applyPlayerVehicleStyle('sport', false);
  applyPlayerPaint(player.paint, false);
  resetCollectibles();
  updateGarageUi();
  showToast('PROGRESS RESET', 'Fresh run, same city', 'LOCAL SAVE CLEARED');
}

const input = { forward: false, back: false, left: false, right: false, handbrake: false };
let touchSteer = 0;
const gamepadState = { forward: false, back: false, handbrake: false, steer: 0 };
let cameraMode = 0;
let soundOn = true;
let routeStep = 0;
let missionProgress = 42;
let sessionSeconds = 0;
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

    Object.assign(audioState, { context, master, engineOsc, engineHarmonic, engineFilter, engineGain, harmonicGain, roadNoiseGain, initialized: true });
  }
  if (audioState.context.state === 'suspended') audioState.context.resume();
}

function updateAudio() {
  if (!audioState.initialized || !audioState.context) return;
  const now = audioState.context.currentTime;
  if (starterMenuOpen || garageOpen || gamePaused || worldMapOpen) {
    audioState.engineGain.gain.setTargetAtTime(0, now, .08);
    audioState.harmonicGain.gain.setTargetAtTime(0, now, .08);
    audioState.roadNoiseGain.gain.setTargetAtTime(0, now, .08);
    audioState.master.gain.setTargetAtTime(soundOn ? (starterMenuOpen ? .2 : garageOpen ? .22 : 0) : 0, now, .08);
    return;
  }
  const speedRatio = clamp(Math.abs(player.speed) / 53, 0, 1);
  const accelerating = input.forward || gamepadState.forward;
  audioState.engineOsc.frequency.setTargetAtTime(48 + speedRatio * 180 + (accelerating ? 15 : 0), now, .045);
  audioState.engineHarmonic.frequency.setTargetAtTime(96 + speedRatio * 360, now, .045);
  audioState.engineFilter.frequency.setTargetAtTime(520 + speedRatio * 820, now, .08);
  audioState.engineGain.gain.setTargetAtTime(.012 + speedRatio * .072 + (accelerating ? .024 : 0), now, .08);
  audioState.harmonicGain.gain.setTargetAtTime(.008 + speedRatio * .028, now, .08);
  audioState.roadNoiseGain.gain.setTargetAtTime(speedRatio * (isOnRoad(player.position.x, player.position.z) ? .045 : .075), now, .12);
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
  if (code === 'Space') input.handbrake = value;
}
window.addEventListener('keydown', (event) => {
  ensureAudio();
  if (starterMenuOpen) {
    if (event.code === 'Escape' && !event.repeat && menuPage !== 'home') setMenuPage('home');
    if (event.code === 'Enter' && !event.repeat && menuPage === 'home') setStarterMenuOpen(false);
    return;
  }
  if (event.code === 'Escape' && !event.repeat) {
    if (worldMapOpen) setWorldMapOpen(false);
    else if (garageOpen) setGarageOpen(false);
    else if (gamePaused) setPauseOpen(false);
    else setPauseOpen(true);
    return;
  }
  if (event.code === 'KeyM' && !event.repeat) {
    if (worldMapOpen) setWorldMapOpen(false);
    else if (!garageOpen && !gamePaused) setWorldMapOpen(true);
    return;
  }
  if (worldMapOpen) return;
  if (event.code === 'KeyP' && !event.repeat) {
    setPauseOpen(!gamePaused);
    return;
  }
  if (event.code === 'KeyG' && !event.repeat) {
    if (!gamePaused) setGarageOpen(!garageOpen);
    return;
  }
  if (garageOpen || gamePaused || starterMenuOpen) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (event.code === 'KeyC' && !event.repeat) {
    cameraMode = (cameraMode + 1) % 2;
    showToast(cameraMode === 0 ? 'FOLLOW CAMERA' : 'HIGH CAMERA', 'Camera angle changed', '');
  }
  if (event.code === 'KeyV' && !event.repeat) deliveryAction();
  if (event.code === 'KeyR' && !event.repeat) resetPlayer();
  setInput(event.code, true);
});
window.addEventListener('keyup', (event) => setInput(event.code, false));
window.addEventListener('pointerdown', () => ensureAudio(), { passive: true });
window.addEventListener('blur', () => {
  Object.keys(input).forEach((key) => { input[key] = false; });
  touchSteer = 0;
  Object.assign(gamepadState, { forward: false, back: false, handbrake: false, steer: 0 });
});

function updateGamepad() {
  if (!navigator.getGamepads) return;
  const gamepad = Array.from(navigator.getGamepads() || []).find(Boolean);
  if (!gamepad) {
    Object.assign(gamepadState, { forward: false, back: false, handbrake: false, steer: 0 });
    return;
  }
  const throttle = gamepad.buttons[7]?.value || gamepad.buttons[0]?.value || 0;
  const brake = gamepad.buttons[6]?.value || gamepad.buttons[1]?.value || 0;
  gamepadState.forward = throttle > .16;
  gamepadState.back = brake > .16;
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
    ['#mobile-gas', 'forward'], ['#mobile-brake', 'back'], ['#mobile-handbrake', 'handbrake'],
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

function toggleSound() {
  soundOn = !soundOn;
  document.querySelectorAll('#sound-toggle, #menu-sound-toggle').forEach((button) => {
    button.textContent = soundOn ? '◒' : '◑';
    button.style.color = soundOn ? '' : 'var(--orange)';
  });
  const menuSound = document.querySelector('#menu-settings-sound');
  if (menuSound) menuSound.textContent = soundOn ? 'ON' : 'OFF';
  if (soundOn) ensureAudio();
  if (audioState.master && audioState.context) {
    audioState.master.gain.setTargetAtTime(soundOn ? (starterMenuOpen ? .2 : .28) : 0, audioState.context.currentTime, .08);
  }
}

document.querySelector('#sound-toggle').addEventListener('click', toggleSound);
document.querySelector('#map-expand').addEventListener('click', () => setWorldMapOpen(!worldMapOpen));
document.querySelector('#world-map-close').addEventListener('click', () => setWorldMapOpen(false));
document.querySelector('#world-map-close-button').addEventListener('click', () => setWorldMapOpen(false));
document.querySelector('#world-map-overlay').addEventListener('click', (event) => {
  if (event.target.id === 'world-map-overlay') setWorldMapOpen(false);
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

document.querySelectorAll('.menu-nav-button').forEach((button) => {
  button.addEventListener('click', () => setMenuPage(button.dataset.menuPage));
});
document.querySelectorAll('[data-menu-goto]').forEach((button) => {
  button.addEventListener('click', () => setMenuPage(button.dataset.menuGoto));
});
document.querySelector('#menu-play-button').addEventListener('click', () => setStarterMenuOpen(false));
document.querySelector('#main-menu-button').addEventListener('click', () => {
  setPauseOpen(false);
  setStarterMenuOpen(true);
});
document.querySelector('#market-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-market-style]');
  if (button) purchaseMarketVehicle(button.dataset.marketStyle);
});
document.querySelector('#owned-car-carousel').addEventListener('click', (event) => {
  const button = event.target.closest('[data-owned-style]');
  if (button) applyPlayerVehicleStyle(button.dataset.ownedStyle);
});
document.querySelector('#garage-prev').addEventListener('click', () => scrollOwnedGarage(-1));
document.querySelector('#garage-next').addEventListener('click', () => scrollOwnedGarage(1));
document.querySelectorAll('[data-paint-group] .paint-swatch').forEach((button) => {
  button.addEventListener('click', () => applyPlayerPaint(button.dataset.paint));
});
document.querySelectorAll('[data-repair-action]').forEach((button) => {
  button.addEventListener('click', repairVehicle);
});
document.querySelector('#menu-sound-toggle').addEventListener('click', toggleSound);
document.querySelector('#menu-settings-sound').addEventListener('click', toggleSound);
document.querySelector('#menu-settings-quality').addEventListener('click', () => {
  qualityMode = qualityMode === 'HIGH' ? 'PERFORMANCE' : 'HIGH';
  applyQualityMode();
});
document.querySelector('#menu-settings-reset').addEventListener('click', () => resetSavedProgress());
updateGarageUi();
setStarterMenuOpen(true);
applyQualityMode();

function resetRoadFurniture() {
  staticObstacles.forEach((obstacle) => {
    if (!obstacle.breakable) return;
    obstacle.broken = false;
    if (obstacle.object) obstacle.object.visible = true;
  });
}

function resetPlayer() {
  resetRoadFurniture();
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
  const insideCityGrid = Math.abs(x) <= CITY_LIMIT && Math.abs(z) <= CITY_LIMIT;
  return (insideCityGrid && roadAxes.some((axis) => Math.abs(x - axis) < 5.2 || Math.abs(z - axis) < 5.2)) || isOnUrbanRoad(x, z) || isOnMountainRoad(x, z) || isOnRegionalRoad(x, z);
}

function getRoadHeightAt(x, z) {
  if (isOnMountainRoad(x, z)) return mountainRoadHeightAt(x, z) + .06;
  const urbanRoad = nearestUrbanRoadPoint(x, z);
  if (urbanRoad.distance < 7.2) return urbanRoad.height + .06;
  const regionalRoad = nearestRegionalRoadPoint(x, z);
  if (regionalRoad.distance < 7.5) return regionalRoad.height + .06;
  return .02;
}

function getSpeedLimit(x, z) {
  if (isOnMountainRoad(x, z)) return 35;
  const urbanRoad = nearestUrbanRoadPoint(x, z);
  if (urbanRoad.distance < 7.2) return 35;
  const regionalRoad = nearestRegionalRoadPoint(x, z);
  if (regionalRoad.distance < 7.5 && regionalRoad.route) return regionalRoad.route.speedLimit;
  return z < -72 ? 35 : 45;
}

function trafficCameraHasWitness(x, z) {
  const camera = trafficCameraIntersections.some(([cameraX, cameraZ]) => Math.hypot(cameraX - x, cameraZ - z) < 1);
  if (!camera) return false;
  const nearbyTraffic = [...traffic, ...mountainTraffic, ...regionalTraffic].filter((vehicle) => {
    if (vehicle.disabledTimer > 0 || !vehicle.mesh.visible || vehicle.currentSpeed < .5) return false;
    return Math.hypot(vehicle.mesh.position.x - x, vehicle.mesh.position.z - z) < 62;
  }).length;
  return nearbyTraffic >= 2;
}

function recordTrafficViolation(label, fine, radarSite = null) {
  if (player.violationCooldown > 0) return;
  player.cash = Math.max(0, player.cash - fine);
  player.trafficViolations += 1;
  player.speedingTime = 0;
  player.violationCooldown = 7;
  saveProgress();
  updateGarageUi();
  playTone(180, .18, .08, 'square', -55);
  if (radarSite) {
    showToast('SPEED RADAR', `${label} detected at a roadside unit`, `-$${fine}`);
    beginRadarStop(radarSite);
  } else {
    showToast('TRAFFIC CITATION', `${label} violation recorded`, `-$${fine}`);
  }
}

function crossingRoadAxis(previous, current, axis, vertical) {
  const before = vertical ? previous.z - axis : previous.x - axis;
  const after = vertical ? current.z - axis : current.x - axis;
  return before * after <= 0 && Math.abs(after - before) > .01;
}

function updateTrafficRules(previousPosition, dt, onRoad) {
  const speedKmh = Math.abs(player.speed) * 3.1;
  const speedLimit = getSpeedLimit(player.position.x, player.position.z);
  if (onRoad && speedKmh > speedLimit + 10) {
    player.speedingTime += dt;
    const radarSite = nearestSpeedRadarSite();
    if (radarSite && player.speedingTime > 1.8 && player.violationCooldown <= 0) recordTrafficViolation(`OVER LIMIT ${speedLimit}`, 45, radarSite);
  } else {
    player.speedingTime = Math.max(0, player.speedingTime - dt * 1.8);
  }
  if (!onRoad) {
    player.lastSignalKey = '';
    player.stopObservations = {};
    return;
  }
  for (const signal of trafficSignals) {
    const data = signal.userData;
    const vertical = Math.abs(previousPosition.x - data.intersectionX) < 4.8 && Math.abs(player.position.x - data.intersectionX) < 4.8;
    const horizontal = Math.abs(previousPosition.z - data.intersectionZ) < 4.8 && Math.abs(player.position.z - data.intersectionZ) < 4.8;
    const crossed = vertical && crossingRoadAxis(previousPosition, player.position, data.intersectionZ, true)
      ? { key: `${data.intersectionX}:${data.intersectionZ}:v:${Math.sign(player.position.z - previousPosition.z)}`, state: data.northSouthState }
      : horizontal && crossingRoadAxis(previousPosition, player.position, data.intersectionX, false)
        ? { key: `${data.intersectionX}:${data.intersectionZ}:h:${Math.sign(player.position.x - previousPosition.x)}`, state: data.eastWestState }
        : null;
    if (!crossed) continue;
    if (crossed.key !== player.lastSignalKey) {
      player.lastSignalKey = crossed.key;
      if (crossed.state === 0 && speedKmh > 4 && trafficCameraHasWitness(data.intersectionX, data.intersectionZ)) recordTrafficViolation('RED LIGHT', 70);
    }
  }
  stopControlledIntersections.forEach(([x, z]) => {
    const vertical = Math.abs(player.position.x - x) < 4.8;
    const horizontal = Math.abs(player.position.z - z) < 4.8;
    const key = `${x}:${z}`;
    const crossed = (vertical && Math.abs(previousPosition.x - x) < 4.8 && crossingRoadAxis(previousPosition, player.position, z, true))
      || (horizontal && Math.abs(previousPosition.z - z) < 4.8 && crossingRoadAxis(previousPosition, player.position, x, false));
    const nearStopLine = vertical
      ? Math.abs(player.position.z - z) < 12
      : horizontal && Math.abs(player.position.x - x) < 12;
    if (nearStopLine && !crossed) {
      const observation = player.stopObservations[key] || { stopped: false };
      if (speedKmh < 2) observation.stopped = true;
      player.stopObservations[key] = observation;
    } else if (!vertical && !horizontal) {
      delete player.stopObservations[key];
    }
    if (crossed) {
      const observation = player.stopObservations[key];
      if (!observation?.stopped && speedKmh > 5 && trafficCameraHasWitness(x, z)) recordTrafficViolation('STOP SIGN', 50);
      delete player.stopObservations[key];
    }
  });
}

function resolveStaticCollisions(impactSpeed = 0) {
  const radius = 1.16;
  let hit = false;
  let breakable = false;
  let impactType = '';
  let strongestObstacle = null;
  for (const obstacle of staticObstacles) {
    if (obstacle.broken) continue;
    const minX = obstacle.x - obstacle.halfX;
    const maxX = obstacle.x + obstacle.halfX;
    const minZ = obstacle.z - obstacle.halfZ;
    const maxZ = obstacle.z + obstacle.halfZ;
    const closestX = clamp(player.position.x, minX, maxX);
    const closestZ = clamp(player.position.z, minZ, maxZ);
    const dx = player.position.x - closestX;
    const dz = player.position.z - closestZ;
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
    if (!strongestObstacle || obstacle.breakable || obstacle.type === 'landmark') strongestObstacle = obstacle;
    impactType = obstacle.type;
    if (obstacle.breakable) {
      obstacle.broken = true;
      breakable = true;
      if (obstacle.object) obstacle.object.visible = false;
    }
  }
  return { hit, breakable, impactType, obstacle: strongestObstacle, impactSpeed: Math.abs(impactSpeed) };
}

function resolveTrafficCollisions(impactSpeed = 0) {
  const radius = 3.0;
  for (const vehicle of [...traffic, ...mountainTraffic, ...regionalTraffic]) {
    const dx = player.position.x - vehicle.mesh.position.x;
    const dz = player.position.z - vehicle.mesh.position.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq >= radius * radius) continue;
    const distance = Math.sqrt(distanceSq) || 1;
    player.position.x += (dx / distance) * (radius - distance);
    player.position.z += (dz / distance) * (radius - distance);
    registerTrafficIncident(vehicle, Math.abs(impactSpeed) + vehicle.currentSpeed, true);
    return { hit: true, trafficHit: true, vehicle, impactSpeed: Math.abs(impactSpeed) + vehicle.currentSpeed };
  }
  if (policeState !== 'idle' && policeVehicle.visible) {
    const dx = player.position.x - policeVehicle.position.x;
    const dz = player.position.z - policeVehicle.position.z;
    const distanceSq = dx * dx + dz * dz;
    if (distanceSq < radius * radius) {
      const distance = Math.sqrt(distanceSq) || 1;
      player.position.x += (dx / distance) * (radius - distance);
      player.position.z += (dz / distance) * (radius - distance);
      return { hit: true, trafficHit: true, policeHit: true, impactSpeed: Math.abs(impactSpeed) + 10 };
    }
  }
  return { hit: false, trafficHit: false, policeHit: false, impactSpeed: 0 };
}

function districtAt(x, z) {
  if (Math.hypot(x - mountainVillagePosition.x, z - mountainVillagePosition.z) < 25) return 'PINEWATCH VILLAGE';
  if (isOnMountainRoad(x, z)) return 'MOUNTAIN PASS';
  const region = worldRegionNear(x, z);
  if (Math.hypot(region.x - x, region.z - z) < 520 && region.type !== 'city') return region.name;
  if (z > 108 || x > 116 || x < -116) return 'OUTER RIDGE';
  if (z < -72) return 'WATERFRONT LOOP';
  if (x > 44 && z < 15) return 'NEON DISTRICT';
  if (x < -44 && z < 15) return 'OCTANE ROW';
  if (z > 44) return 'NORTHSTAR AVE';
  if (x > 0) return 'MIDTOWN EAST';
  return 'SOUTH MARKET';
}

function updatePlayerLighting(steering) {
  const blinking = Math.sin(performance.now() * .011) > 0;
  const leftOn = steering < -.18 && blinking;
  const rightOn = steering > .18 && blinking;
  ['left', 'right'].forEach((side) => {
    const active = side === 'left' ? leftOn : rightOn;
    player.mesh.userData.indicators[side].forEach((lamp) => {
      lamp.material.opacity = active ? .98 : .15;
      lamp.material.emissiveIntensity = active ? 5.5 : .55;
    });
  });
  player.mesh.userData.headlights.forEach((beam) => { beam.intensity = .72; });
}

function updatePlayer(dt) {
  collisionCooldown = Math.max(0, collisionCooldown - dt);
  player.violationCooldown = Math.max(0, player.violationCooldown - dt);
  if (player.disabledTimer > 0 || player.condition <= 8) {
    player.disabledTimer = Math.max(0, player.disabledTimer - dt);
    player.speed = damp(player.speed, 0, 8, dt);
    player.mesh.position.copy(player.position);
    updatePlayerLighting(0);
    setBrakeLights(player.mesh, true);
    return;
  }
  const throttle = input.forward || gamepadState.forward ? 1 : 0;
  const braking = input.back || gamepadState.back ? 1 : 0;
  const steering = clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + touchSteer + gamepadState.steer, -1, 1);
  const onRoad = isOnRoad(player.position.x, player.position.z);
  const vehicleSpec = vehicleCatalogEntry();
  const engineLevel = player.upgrades.engine;
  const engineMultiplier = 1 + engineLevel * .1;
  const gripMultiplier = 1 + player.upgrades.grip * .1;
  const handbraking = input.handbrake && Math.abs(player.speed) > 6;
  const acceleration = (onRoad ? vehicleSpec.acceleration : vehicleSpec.acceleration * vehicleSpec.offRoadTraction) * engineMultiplier;
  const normalTopSpeed = vehicleSpec.topSpeed + engineLevel * 2;

  if (throttle) player.speed += acceleration * dt;
  if (braking) player.speed -= (player.speed > 0 ? vehicleSpec.brakePower : vehicleSpec.brakePower * .42) * dt;
  if (!throttle && !braking) player.speed = damp(player.speed, 0, onRoad ? .78 : 1.25, dt);
  if (handbraking) player.speed = damp(player.speed, 0, .14, dt);
  if (!onRoad) player.speed *= Math.pow(clamp(vehicleSpec.offRoadTraction + player.upgrades.grip * .02, .55, .99), dt);
  player.speed = clamp(player.speed, -12, normalTopSpeed);

  if (Math.abs(player.speed) > .3) {
    const turnFactor = clamp(Math.abs(player.speed) / vehicleSpec.turnSpeed, .12, 1.28) * (handbraking ? 1.8 : 1) * gripMultiplier;
    player.heading += steering * vehicleSpec.turnRate * turnFactor * dt * (player.speed >= 0 ? 1 : -1);
  }
  const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const movement = forward.clone().multiplyScalar(player.speed * dt);
  const previousPosition = player.position.clone();
  player.position.add(movement);
  player.position.y = isOnRoad(player.position.x, player.position.z) ? getRoadHeightAt(player.position.x, player.position.z) : .02;
  player.distance += Math.abs(player.speed * dt);
  updateTrafficRules(previousPosition, dt, onRoad);
  const impactSpeed = Math.abs(player.speed);
  const staticCollision = resolveStaticCollisions(impactSpeed);
  const trafficCollision = resolveTrafficCollisions(impactSpeed);
  const trafficHit = trafficCollision.hit;
  if (staticCollision.hit || trafficHit) {
    if (collisionCooldown <= 0) {
      player.speed *= trafficHit ? -.28 : -.22;
      playImpact(trafficHit);
      const furnitureHit = staticCollision.breakable && !trafficHit;
      const damage = clamp(impactSpeed * (trafficHit ? 1.35 : furnitureHit ? .58 : .92) + (trafficCollision.policeHit ? 7 : 0), 2, 36);
      applyVehicleDamage(damage, trafficCollision.policeHit ? 'POLICE IMPACT' : furnitureHit ? 'ROAD FURNITURE' : 'COLLISION');
      showToast(trafficCollision.policeHit ? 'POLICE CONTACT' : trafficHit ? 'TRAFFIC CONTACT' : furnitureHit ? 'ROAD FURNITURE HIT' : 'BODYWORK CONTACT', trafficCollision.policeHit ? 'The officer is checking the roadside stop' : trafficHit ? 'Vehicle incident logged' : furnitureHit ? 'Sign or signal knocked out' : 'Concrete wins every time', furnitureHit ? 'OBJECT BROKEN' : `-${Math.round(damage)} CONDITION`);
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
  updatePlayerLighting(steering);
  setBrakeLights(player.mesh, Boolean(braking || handbraking || staticCollision.hit || trafficHit));

  document.querySelector('#surface-state').textContent = onRoad ? (handbraking ? 'HAND BRAKE' : 'ASPHALT') : 'GRASS';
  document.querySelector('#surface-state').style.color = handbraking ? 'var(--orange)' : '';
}

function trafficIntersectionAhead(vehicle, maxDistance = 23) {
  let nearest = null;
  const currentPosition = vehicle.vertical ? vehicle.mesh.position.z : vehicle.mesh.position.x;
  for (const axis of roadAxes) {
    const distance = vehicle.direction * (axis - currentPosition);
    if (distance < .5 || distance > maxDistance) continue;
    if (!nearest || distance < nearest.distance) {
      nearest = vehicle.vertical
        ? { x: vehicle.axis, z: axis, distance, key: `${vehicle.axis}:${axis}` }
        : { x: axis, z: vehicle.axis, distance, key: `${axis}:${vehicle.axis}` };
    }
  }
  return nearest;
}

function trafficSignalAhead(vehicle) {
  let nearest = null;
  for (const signal of trafficSignals) {
    const data = signal.userData;
    let distance;
    if (vehicle.vertical) {
      if (Math.abs(vehicle.axis - data.intersectionX) > 1.6) continue;
      distance = vehicle.direction > 0 ? data.intersectionZ - vehicle.mesh.position.z : vehicle.mesh.position.z - data.intersectionZ;
    } else {
      if (Math.abs(vehicle.axis - data.intersectionZ) > 1.6) continue;
      distance = vehicle.direction > 0 ? data.intersectionX - vehicle.mesh.position.x : vehicle.mesh.position.x - data.intersectionX;
    }
    if (distance < -2 || distance > 23) continue;
    const state = vehicle.vertical ? data.northSouthState : data.eastWestState;
    if (!nearest || distance < nearest.distance) nearest = { signal, distance, state };
  }
  return nearest;
}

function trafficStopSignAhead(vehicle) {
  let nearest = null;
  for (const [x, z] of stopControlledIntersections) {
    let distance;
    if (vehicle.vertical) {
      if (Math.abs(vehicle.axis - x) > 1.6) continue;
      distance = vehicle.direction > 0 ? z - vehicle.mesh.position.z : vehicle.mesh.position.z - z;
    } else {
      if (Math.abs(vehicle.axis - z) > 1.6) continue;
      distance = vehicle.direction > 0 ? x - vehicle.mesh.position.x : vehicle.mesh.position.x - x;
    }
    if (distance < -2 || distance > 21) continue;
    if (!nearest || distance < nearest.distance) nearest = { key: `${x}:${z}`, distance };
  }
  return nearest;
}

function trafficPlayerDistance(vehicle) {
  const lateral = vehicle.vertical
    ? Math.abs(player.position.x - (vehicle.axis + vehicle.lane))
    : Math.abs(player.position.z - (vehicle.axis + vehicle.lane));
  if (lateral > 2.1) return null;
  const distance = vehicle.vertical
    ? vehicle.direction * (player.position.z - vehicle.mesh.position.z)
    : vehicle.direction * (player.position.x - vehicle.mesh.position.x);
  return distance > 0 && distance < 19 ? distance : null;
}

function trafficLeadVehicle(vehicle) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const other of traffic) {
    if (other === vehicle || other.vertical !== vehicle.vertical || other.direction !== vehicle.direction) continue;
    if (Math.abs(other.axis - vehicle.axis) > 1.2 || Math.abs(other.lane - vehicle.lane) > .3) continue;
    const distance = vehicle.vertical
      ? vehicle.direction * (other.mesh.position.z - vehicle.mesh.position.z)
      : vehicle.direction * (other.mesh.position.x - vehicle.mesh.position.x);
    if (distance > 0 && distance < 19 && distance < nearestDistance) {
      nearest = other;
      nearestDistance = distance;
    }
  }
  return nearest ? { vehicle: nearest, distance: nearestDistance } : null;
}

function trafficLeadDistance(vehicle) {
  return trafficLeadVehicle(vehicle)?.distance ?? null;
}

function trafficLaneClear(vehicle, laneSide) {
  const targetLane = trafficLaneOffset(vehicle.vertical, vehicle.direction, laneSide);
  for (const other of traffic) {
    if (other === vehicle || other.vertical !== vehicle.vertical || other.direction !== vehicle.direction) continue;
    if (Math.abs(other.axis - vehicle.axis) > 1.2 || Math.abs(other.lane - targetLane) > .45) continue;
    const distance = vehicle.vertical
      ? vehicle.direction * (other.mesh.position.z - vehicle.mesh.position.z)
      : vehicle.direction * (other.mesh.position.x - vehicle.mesh.position.x);
    if (Math.abs(distance) < 9) return false;
  }
  const playerLateral = vehicle.vertical
    ? Math.abs(player.position.x - (vehicle.axis + targetLane))
    : Math.abs(player.position.z - (vehicle.axis + targetLane));
  const playerDistance = vehicle.vertical
    ? vehicle.direction * (player.position.z - vehicle.mesh.position.z)
    : vehicle.direction * (player.position.x - vehicle.mesh.position.x);
  return playerLateral > 2.1 || Math.abs(playerDistance) > 7;
}

function beginTrafficLaneChange(vehicle, targetLaneSide) {
  vehicle.laneChanging = { from: vehicle.lane, to: trafficLaneOffset(vehicle.vertical, vehicle.direction, targetLaneSide), targetLaneSide, progress: 0 };
}

function advanceTrafficLaneChange(vehicle, dt) {
  const change = vehicle.laneChanging;
  if (!change) return;
  change.progress = clamp(change.progress + dt / .85, 0, 1);
  const eased = change.progress * change.progress * (3 - 2 * change.progress);
  vehicle.lane = lerp(change.from, change.to, eased);
  if (vehicle.vertical) vehicle.mesh.position.x = vehicle.axis + vehicle.lane;
  else vehicle.mesh.position.z = vehicle.axis + vehicle.lane;
  if (change.progress >= 1) {
    vehicle.laneSide = change.targetLaneSide;
    vehicle.lane = change.to;
    vehicle.laneChanging = null;
  }
}

function considerTrafficLaneChange(vehicle, dt) {
  if (vehicle.turning) return;
  const upcoming = trafficIntersectionAhead(vehicle, 18);
  const lead = trafficLeadVehicle(vehicle);
  if (vehicle.laneChanging) {
    advanceTrafficLaneChange(vehicle, dt);
    return;
  }
  if (vehicle.laneSide === -1) {
    vehicle.passTimer += dt;
    if (!lead && vehicle.passTimer > 2.2 && (!upcoming || upcoming.distance > 12) && trafficLaneClear(vehicle, 1)) beginTrafficLaneChange(vehicle, 1);
    return;
  }
  vehicle.passTimer = 0;
  if (!lead || lead.vehicle.currentSpeed > vehicle.cruiseSpeed - .9) return;
  if (lead.distance > 13 || (upcoming && upcoming.distance < 18)) return;
  if (trafficLaneClear(vehicle, -1)) beginTrafficLaneChange(vehicle, -1);
}

function trafficIntersectionOccupied(vehicle, key) {
  return traffic.some((other) => {
    if (other === vehicle) return false;
    if (other.turning?.key === key) return true;
    const intersection = other.turning?.intersection;
    if (intersection && `${intersection.x}:${intersection.z}` === key) return true;
    const [x, z] = key.split(':').map(Number);
    return (other.disabledTimer > 0 || other.currentSpeed > 1) && Math.abs(other.mesh.position.x - x) < 3.5 && Math.abs(other.mesh.position.z - z) < 3.5;
  });
}

function trafficTurnChoice(vehicle, intersection) {
  if (vehicle.turnDecisionKey === intersection.key) return vehicle.turnDecision;
  const roll = randomFrom(vehicle.routeSeed + vehicle.turnCount * 13.17 + intersection.x * .17 + intersection.z * .31);
  vehicle.turnCount += 1;
  vehicle.turnDecisionKey = intersection.key;
  vehicle.turnDecision = roll < .22 ? -1 : roll > .78 ? 1 : 0;
  return vehicle.turnDecision;
}

function trafficTurnDirection(vertical, direction, turn) {
  if (vertical) return { vertical: false, direction: turn > 0 ? direction : -direction };
  return { vertical: true, direction: turn > 0 ? -direction : direction };
}

function beginTrafficTurn(vehicle, intersection, turn) {
  const next = trafficTurnDirection(vehicle.vertical, vehicle.direction, turn);
  const nextLaneSide = turn > 0 ? 1 : -1;
  const startDistance = 5.7;
  const start = vehicle.vertical
    ? new THREE.Vector3(vehicle.axis + trafficLaneOffset(true, vehicle.direction, vehicle.laneSide), 0.02, intersection.z - vehicle.direction * startDistance)
    : new THREE.Vector3(intersection.x - vehicle.direction * startDistance, 0.02, vehicle.axis + trafficLaneOffset(false, vehicle.direction, vehicle.laneSide));
  const end = next.vertical
    ? new THREE.Vector3(intersection.x + trafficLaneOffset(true, next.direction, nextLaneSide), 0.02, intersection.z + next.direction * startDistance)
    : new THREE.Vector3(intersection.x + next.direction * startDistance, 0.02, intersection.z + trafficLaneOffset(false, next.direction, nextLaneSide));
  const forwardIn = vehicle.vertical ? new THREE.Vector3(0, 0, vehicle.direction) : new THREE.Vector3(vehicle.direction, 0, 0);
  const forwardOut = next.vertical ? new THREE.Vector3(0, 0, next.direction) : new THREE.Vector3(next.direction, 0, 0);
  const control1 = start.clone().addScaledVector(forwardIn, 4.1);
  const control2 = end.clone().addScaledVector(forwardOut, -4.1);
  vehicle.mesh.position.copy(start);
  vehicle.turning = {
    key: intersection.key,
    intersection: { x: intersection.x, z: intersection.z },
    progress: 0,
    start,
    control1,
    control2,
    end,
    next,
    nextLaneSide,
    turn,
  };
}

function advanceTrafficTurn(vehicle, dt) {
  const turn = vehicle.turning;
  if (!turn) return;
  const curveLength = 8.8;
  turn.progress = clamp(turn.progress + Math.max(vehicle.currentSpeed, 1.2) * dt / curveLength, 0, 1);
  const t = turn.progress;
  const inv = 1 - t;
  const position = turn.start.clone().multiplyScalar(inv * inv * inv)
    .add(turn.control1.clone().multiplyScalar(3 * inv * inv * t))
    .add(turn.control2.clone().multiplyScalar(3 * inv * t * t))
    .add(turn.end.clone().multiplyScalar(t * t * t));
  const derivative = turn.control1.clone().sub(turn.start).multiplyScalar(3 * inv * inv)
    .add(turn.control2.clone().sub(turn.control1).multiplyScalar(6 * inv * t))
    .add(turn.end.clone().sub(turn.control2).multiplyScalar(3 * t * t));
  vehicle.mesh.position.copy(position);
  vehicle.mesh.rotation.y = Math.atan2(derivative.x, derivative.z);
  setBrakeLights(vehicle.mesh, false);
  const wheelSpin = vehicle.currentSpeed * dt * .95;
  vehicle.mesh.userData.wheels.forEach((wheel) => { wheel.children[0].rotation.x -= wheelSpin; });
  vehicle.mesh.userData.loadedWheels?.forEach((wheel) => { wheel.rotation.x -= wheelSpin; });
  if (turn.progress < 1) return;
  vehicle.vertical = turn.next.vertical;
  vehicle.direction = turn.next.direction;
  vehicle.axis = turn.next.vertical ? turn.intersection.x : turn.intersection.z;
  vehicle.laneSide = turn.nextLaneSide;
  vehicle.lane = trafficLaneOffset(vehicle.vertical, vehicle.direction, vehicle.laneSide);
  vehicle.heading = trafficHeading(vehicle.vertical, vehicle.direction);
  vehicle.mesh.rotation.y = vehicle.heading;
  vehicle.turning = null;
}

function trafficTargetSpeed(vehicle, dt) {
  const leadDistance = trafficLeadDistance(vehicle);
  if (leadDistance !== null) return Math.min(vehicle.cruiseSpeed, clamp((leadDistance - 3.4) * 1.1, 0, vehicle.cruiseSpeed));
  const playerDistance = trafficPlayerDistance(vehicle);
  if (playerDistance !== null) return clamp((playerDistance - 3.2) * 1.12, 0, vehicle.cruiseSpeed);
  const ahead = trafficSignalAhead(vehicle);
  if (ahead) {
    const { signal, distance } = ahead;
    const stoppingSignal = ahead.state === 0 || (ahead.state === 1 && distance > 9);
    if (stoppingSignal && distance > 0) {
      const distanceToStopLine = distance - 5.7;
      if (distanceToStopLine < .8) return 0;
      return clamp(distanceToStopLine * 1.05, 0, vehicle.cruiseSpeed);
    }
  }
  const stopSign = trafficStopSignAhead(vehicle);
  if (stopSign) {
    if (vehicle.stopKey !== stopSign.key && stopSign.distance > 0) {
      vehicle.stopKey = stopSign.key;
      vehicle.stopWait = 0;
    }
    if (stopSign.distance > 0) {
      const distanceToStopLine = stopSign.distance - 5.7;
      if (distanceToStopLine < .8 && vehicle.stopWait === 0) {
        vehicle.stopWait = 1.15 + randomFrom(vehicle.axis + vehicle.lane + stopSign.distance) * .7;
      }
      if (vehicle.stopWait > 0) {
        vehicle.stopWait -= dt;
        if (vehicle.stopWait <= 0) vehicle.stopWait = -1;
        return 0;
      }
      if (distanceToStopLine <= 0 && vehicle.stopWait < 0) return vehicle.cruiseSpeed;
      return clamp(distanceToStopLine * 1.05, 0, vehicle.cruiseSpeed);
    }
  } else if (vehicle.stopKey) {
    vehicle.stopKey = '';
    vehicle.stopWait = 0;
  }
  const intersection = trafficIntersectionAhead(vehicle, 9);
  if (intersection && intersection.distance < 8.5 && trafficIntersectionOccupied(vehicle, intersection.key)) {
    const distanceToCenter = intersection.distance - 4.8;
    return clamp(distanceToCenter * 1.12, 0, vehicle.cruiseSpeed);
  }
  return vehicle.cruiseSpeed;
}

function updateTraffic(dt) {
  for (const vehicle of traffic) {
    vehicle.incidentCooldown = Math.max(0, vehicle.incidentCooldown - dt);
    vehicle.hazardTimer = Math.max(0, vehicle.hazardTimer - dt);
    if (vehicle.disabledTimer > 0) {
      vehicle.disabledTimer = Math.max(0, vehicle.disabledTimer - dt);
      vehicle.currentSpeed = 0;
      setBrakeLights(vehicle.mesh, true);
      updateTrafficVehicleIndicators(vehicle);
      if (vehicle.disabledTimer <= 0) respawnTrafficVehicle(vehicle);
      continue;
    }
    if (vehicle.turning) {
      advanceTrafficTurn(vehicle, dt);
      updateTrafficVehicleIndicators(vehicle);
      continue;
    }
    considerTrafficLaneChange(vehicle, dt);
    const targetSpeed = trafficTargetSpeed(vehicle, dt);
    const wasBraking = vehicle.currentSpeed > targetSpeed + .35;
    vehicle.currentSpeed = damp(vehicle.currentSpeed, targetSpeed, wasBraking ? 5.4 : 2.2, dt);
    const upcoming = trafficIntersectionAhead(vehicle, 6.2);
    if (!vehicle.laneChanging && upcoming && upcoming.distance < 6.1 && targetSpeed > .35 && vehicle.currentSpeed > .35 && !trafficIntersectionOccupied(vehicle, upcoming.key)) {
      const turn = trafficTurnChoice(vehicle, upcoming);
      if (turn !== 0) {
        beginTrafficTurn(vehicle, upcoming, turn);
        advanceTrafficTurn(vehicle, dt);
        continue;
      }
    }
    const distance = vehicle.currentSpeed * vehicle.direction * dt;
    if (vehicle.vertical) {
      vehicle.mesh.position.z += distance;
      if (vehicle.mesh.position.z > 108) vehicle.mesh.position.z = -108;
      if (vehicle.mesh.position.z < -108) vehicle.mesh.position.z = 108;
    } else {
      vehicle.mesh.position.x += distance;
      if (vehicle.mesh.position.x > 108) vehicle.mesh.position.x = -108;
      if (vehicle.mesh.position.x < -108) vehicle.mesh.position.x = 108;
    }
    vehicle.mesh.position.y = .02;
    vehicle.mesh.position.x = vehicle.vertical ? vehicle.axis + vehicle.lane : vehicle.mesh.position.x;
    vehicle.mesh.position.z = vehicle.vertical ? vehicle.mesh.position.z : vehicle.axis + vehicle.lane;
    vehicle.mesh.rotation.y = vehicle.heading;
    updateTrafficVehicleIndicators(vehicle);
    setBrakeLights(vehicle.mesh, wasBraking || vehicle.currentSpeed < .8);
    const wheelSpin = vehicle.currentSpeed * dt * .95;
    vehicle.mesh.userData.wheels.forEach((wheel) => { wheel.children[0].rotation.x -= wheelSpin; });
    vehicle.mesh.userData.loadedWheels?.forEach((wheel) => { wheel.rotation.x -= wheelSpin; });
  }
}

function updateMountainTraffic(dt) {
  for (const vehicle of mountainTraffic) {
    vehicle.incidentCooldown = Math.max(0, vehicle.incidentCooldown - dt);
    vehicle.hazardTimer = Math.max(0, vehicle.hazardTimer - dt);
    if (vehicle.disabledTimer > 0) {
      vehicle.disabledTimer = Math.max(0, vehicle.disabledTimer - dt);
      vehicle.currentSpeed = 0;
      setBrakeLights(vehicle.mesh, true);
      updateTrafficVehicleIndicators(vehicle);
      if (vehicle.disabledTimer <= 0) respawnMountainTrafficVehicle(vehicle);
      continue;
    }
    vehicle.currentSpeed = damp(vehicle.currentSpeed, vehicle.cruiseSpeed, 2.2, dt);
    vehicle.progress += vehicle.direction * vehicle.currentSpeed * dt / Math.max(1, mountainRoadLength);
    if (vehicle.progress > .995) vehicle.progress = .025;
    if (vehicle.progress < .025) vehicle.progress = .995;
    const pose = mountainTrafficPosition(vehicle);
    vehicle.mesh.position.copy(pose.position);
    vehicle.mesh.position.y += .02;
    vehicle.mesh.rotation.y = pose.heading;
    updateTrafficVehicleIndicators(vehicle);
    setBrakeLights(vehicle.mesh, vehicle.currentSpeed < .8);
    const wheelSpin = vehicle.currentSpeed * dt * .95;
    vehicle.mesh.userData.wheels.forEach((wheel) => { wheel.children[0].rotation.x -= wheelSpin; });
    vehicle.mesh.userData.loadedWheels?.forEach((wheel) => { wheel.rotation.x -= wheelSpin; });
  }
}

function updateRegionalTraffic(dt) {
  for (const vehicle of regionalTraffic) {
    vehicle.incidentCooldown = Math.max(0, vehicle.incidentCooldown - dt);
    vehicle.hazardTimer = Math.max(0, vehicle.hazardTimer - dt);
    if (vehicle.disabledTimer > 0) {
      vehicle.disabledTimer = Math.max(0, vehicle.disabledTimer - dt);
      vehicle.currentSpeed = 0;
      setBrakeLights(vehicle.mesh, true);
      updateTrafficVehicleIndicators(vehicle);
      if (vehicle.disabledTimer <= 0) respawnRegionalTrafficVehicle(vehicle);
      continue;
    }
    vehicle.currentSpeed = damp(vehicle.currentSpeed, vehicle.cruiseSpeed, 2.1, dt);
    const routeLength = regionalRouteMetrics[vehicle.routeIndex]?.length || 1;
    vehicle.progress += vehicle.direction * vehicle.currentSpeed * dt / routeLength;
    if (vehicle.progress > .995) vehicle.progress = .025;
    if (vehicle.progress < .025) vehicle.progress = .995;
    const pose = regionalTrafficPosition(vehicle);
    vehicle.mesh.position.copy(pose.position);
    vehicle.mesh.rotation.y = pose.heading;
    updateTrafficVehicleIndicators(vehicle);
    setBrakeLights(vehicle.mesh, vehicle.currentSpeed < .8);
    const wheelSpin = vehicle.currentSpeed * dt * .8;
    vehicle.mesh.userData.wheels.forEach((wheel) => { wheel.children[0].rotation.x -= wheelSpin; });
    vehicle.mesh.userData.loadedWheels?.forEach((wheel) => { wheel.rotation.x -= wheelSpin; });
  }
}

function resolveRegionalTrafficCollisions() {
  for (let first = 0; first < regionalTraffic.length; first += 1) {
    const a = regionalTraffic[first];
    if (a.disabledTimer > 0 || a.incidentCooldown > 0) continue;
    for (let second = first + 1; second < regionalTraffic.length; second += 1) {
      const b = regionalTraffic[second];
      if (b.disabledTimer > 0 || b.incidentCooldown > 0 || a.routeIndex !== b.routeIndex) continue;
      const dx = a.mesh.position.x - b.mesh.position.x;
      const dz = a.mesh.position.z - b.mesh.position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= 2.65 * 2.65) continue;
      const distance = Math.sqrt(distanceSq) || 1;
      const relativeSpeed = Math.abs(a.currentSpeed - b.currentSpeed) + (a.direction !== b.direction ? Math.min(a.currentSpeed, b.currentSpeed) : 0);
      if (relativeSpeed < 1.2) continue;
      const aPosition = a.mesh.position.clone();
      const bPosition = b.mesh.position.clone();
      a.mesh.position.x += dx / distance * .48;
      a.mesh.position.z += dz / distance * .48;
      b.mesh.position.x -= dx / distance * .48;
      b.mesh.position.z -= dz / distance * .48;
      registerTrafficIncident(a, relativeSpeed, false, bPosition);
      registerTrafficIncident(b, relativeSpeed, false, aPosition);
    }
  }
}

function resolveMountainTrafficCollisions() {
  for (let first = 0; first < mountainTraffic.length; first += 1) {
    const a = mountainTraffic[first];
    if (a.disabledTimer > 0 || a.incidentCooldown > 0) continue;
    for (let second = first + 1; second < mountainTraffic.length; second += 1) {
      const b = mountainTraffic[second];
      if (b.disabledTimer > 0 || b.incidentCooldown > 0) continue;
      const dx = a.mesh.position.x - b.mesh.position.x;
      const dz = a.mesh.position.z - b.mesh.position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= 2.65 * 2.65) continue;
      const distance = Math.sqrt(distanceSq) || 1;
      const relativeSpeed = Math.abs(a.currentSpeed - b.currentSpeed) + (a.direction !== b.direction ? Math.min(a.currentSpeed, b.currentSpeed) : 0);
      if (relativeSpeed < 1.2) continue;
      const aPosition = a.mesh.position.clone();
      const bPosition = b.mesh.position.clone();
      a.mesh.position.x += dx / distance * .48;
      a.mesh.position.z += dz / distance * .48;
      b.mesh.position.x -= dx / distance * .48;
      b.mesh.position.z -= dz / distance * .48;
      registerTrafficIncident(a, relativeSpeed, false, bPosition);
      registerTrafficIncident(b, relativeSpeed, false, aPosition);
    }
  }
}

function resolveTrafficVehicleCollisions() {
  for (let first = 0; first < traffic.length; first += 1) {
    const a = traffic[first];
    if (a.disabledTimer > 0) continue;
    for (let second = first + 1; second < traffic.length; second += 1) {
      const b = traffic[second];
      if (b.disabledTimer > 0 || a.incidentCooldown > 0 || b.incidentCooldown > 0) continue;
      const dx = a.mesh.position.x - b.mesh.position.x;
      const dz = a.mesh.position.z - b.mesh.position.z;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= 2.65 * 2.65) continue;
      const distance = Math.sqrt(distanceSq) || 1;
      const crossingOrOpposing = a.vertical !== b.vertical || a.direction !== b.direction;
      const relativeSpeed = Math.abs(a.currentSpeed - b.currentSpeed) + (crossingOrOpposing ? Math.min(a.currentSpeed, b.currentSpeed) : 0);
      if (relativeSpeed < 1.2) continue;
      const aPosition = a.mesh.position.clone();
      const bPosition = b.mesh.position.clone();
      a.mesh.position.x += dx / distance * .48;
      a.mesh.position.z += dz / distance * .48;
      b.mesh.position.x -= dx / distance * .48;
      b.mesh.position.z -= dz / distance * .48;
      registerTrafficIncident(a, relativeSpeed, false, bPosition);
      registerTrafficIncident(b, relativeSpeed, false, aPosition);
    }
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
  const targetFov = 55 + clamp(Math.abs(player.speed) * .2, 0, 10);
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
    const vTop = worldToMap(axis, CITY_LIMIT, size);
    const vBottom = worldToMap(axis, -CITY_LIMIT, size);
    mapCtx.beginPath(); mapCtx.moveTo(vTop.x, vTop.y); mapCtx.lineTo(vBottom.x, vBottom.y); mapCtx.stroke();
    const hLeft = worldToMap(-CITY_LIMIT, axis, size);
    const hRight = worldToMap(CITY_LIMIT, axis, size);
    mapCtx.beginPath(); mapCtx.moveTo(hLeft.x, hLeft.y); mapCtx.lineTo(hRight.x, hRight.y); mapCtx.stroke();
  }
  mapCtx.strokeStyle = '#6b7a7e';
  mapCtx.lineWidth = 1;
  for (const axis of roadAxes) {
    const vTop = worldToMap(axis, CITY_LIMIT, size);
    const vBottom = worldToMap(axis, -CITY_LIMIT, size);
    mapCtx.beginPath(); mapCtx.moveTo(vTop.x, vTop.y); mapCtx.lineTo(vBottom.x, vBottom.y); mapCtx.stroke();
    const hLeft = worldToMap(-CITY_LIMIT, axis, size);
    const hRight = worldToMap(CITY_LIMIT, axis, size);
    mapCtx.beginPath(); mapCtx.moveTo(hLeft.x, hLeft.y); mapCtx.lineTo(hRight.x, hRight.y); mapCtx.stroke();
  }
  // parks and water-side massing
  mapCtx.fillStyle = 'rgba(61, 134, 94, .44)';
  const park = worldToMap(0, 44, size); mapCtx.fillRect(park.x - 14, park.y - 12, 28, 24);
  mapCtx.fillStyle = 'rgba(115, 163, 157, .34)';
  mapCtx.fillRect(0, coastY - 2, size, 3);
  mapCtx.strokeStyle = 'rgba(91, 124, 124, .7)';
  mapCtx.lineWidth = 2;
  regionalRoutes.forEach((route) => {
    mapCtx.beginPath();
    route.points.forEach(([x, z], index) => {
      const mapped = worldToMap(x, z, size);
      if (index === 0) mapCtx.moveTo(mapped.x, mapped.y);
      else mapCtx.lineTo(mapped.x, mapped.y);
    });
    mapCtx.stroke();
  });
  mapCtx.strokeStyle = '#4e554d';
  mapCtx.lineWidth = 4;
  mapCtx.beginPath();
  mountainRoadPoints.forEach((point, index) => {
    const mapped = worldToMap(point.x, point.z, size);
    if (index === 0) mapCtx.moveTo(mapped.x, mapped.y);
    else mapCtx.lineTo(mapped.x, mapped.y);
  });
  mapCtx.stroke();
  const villagePoint = worldToMap(mountainVillagePosition.x, mountainVillagePosition.z, size);
  mapCtx.fillStyle = '#d6fa6a';
  mapCtx.fillRect(villagePoint.x - 2.5, villagePoint.y - 2.5, 5, 5);
  beaconPositions.forEach((position, index) => {
    const point = worldToMap(position.x, position.z, size);
    const active = index === routeStep;
    mapCtx.beginPath(); mapCtx.arc(point.x, point.y, active ? 4.4 : 2.6, 0, Math.PI * 2);
    mapCtx.fillStyle = active ? '#ff9d50' : 'rgba(214, 250, 106, .45)'; mapCtx.fill();
    if (active) { mapCtx.strokeStyle = 'rgba(255,157,80,.35)'; mapCtx.lineWidth = 2; mapCtx.stroke(); }
  });
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

function drawWorldMap() {
  if (!worldMapCtx) return;
  const width = worldMap.width;
  const height = worldMap.height;
  const mapSize = Math.min(width, height);
  const offsetX = (width - mapSize) / 2;
  const ctx = worldMapCtx;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#08151e';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.translate(offsetX, 0);
  ctx.fillStyle = 'rgba(12, 70, 80, .62)';
  ctx.fillRect(0, 0, mapSize, mapSize);
  const islandInset = 9;
  ctx.fillStyle = 'rgba(26, 55, 50, .52)';
  ctx.fillRect(islandInset, islandInset, mapSize - islandInset * 2, mapSize - islandInset * 2);
  ctx.strokeStyle = 'rgba(92, 227, 209, .38)';
  ctx.lineWidth = 2;
  ctx.strokeRect(islandInset, islandInset, mapSize - islandInset * 2, mapSize - islandInset * 2);
  const coastY = worldToMap(0, -98, mapSize).y;
  ctx.fillStyle = 'rgba(11, 67, 79, .55)';
  ctx.fillRect(0, coastY, mapSize, mapSize - coastY);
  ctx.strokeStyle = 'rgba(86, 169, 164, .22)';
  ctx.lineWidth = 1;
  for (let x = -20; x < mapSize + 20; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, coastY + 12);
    ctx.lineTo(x + 35, mapSize);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(61, 134, 94, .30)';
  const park = worldToMap(0, 44, mapSize);
  ctx.fillRect(park.x - 38, park.y - 30, 76, 60);
  ctx.fillStyle = 'rgba(92, 154, 124, .16)';
  ctx.fillRect(worldToMap(-44, 0, mapSize).x - 12, worldToMap(-44, 0, mapSize).y - 26, 24, 52);
  ctx.fillStyle = 'rgba(115, 163, 157, .36)';
  ctx.fillRect(0, coastY - 3, mapSize, 5);
  ctx.strokeStyle = '#1e333e';
  ctx.lineWidth = 12;
  roadAxes.forEach((axis) => {
    const verticalTop = worldToMap(axis, CITY_LIMIT, mapSize);
    const verticalBottom = worldToMap(axis, -CITY_LIMIT, mapSize);
    const horizontalLeft = worldToMap(-CITY_LIMIT, axis, mapSize);
    const horizontalRight = worldToMap(CITY_LIMIT, axis, mapSize);
    ctx.beginPath(); ctx.moveTo(verticalTop.x, verticalTop.y); ctx.lineTo(verticalBottom.x, verticalBottom.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(horizontalLeft.x, horizontalLeft.y); ctx.lineTo(horizontalRight.x, horizontalRight.y); ctx.stroke();
  });
  ctx.strokeStyle = '#526b72';
  ctx.lineWidth = 7;
  roadAxes.forEach((axis) => {
    const verticalTop = worldToMap(axis, CITY_LIMIT, mapSize);
    const verticalBottom = worldToMap(axis, -CITY_LIMIT, mapSize);
    const horizontalLeft = worldToMap(-CITY_LIMIT, axis, mapSize);
    const horizontalRight = worldToMap(CITY_LIMIT, axis, mapSize);
    ctx.beginPath(); ctx.moveTo(verticalTop.x, verticalTop.y); ctx.lineTo(verticalBottom.x, verticalBottom.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(horizontalLeft.x, horizontalLeft.y); ctx.lineTo(horizontalRight.x, horizontalRight.y); ctx.stroke();
  });
  ctx.strokeStyle = 'rgba(213, 233, 213, .38)';
  ctx.lineWidth = 1;
  ctx.setLineDash([7, 9]);
  roadAxes.forEach((axis) => {
    const verticalTop = worldToMap(axis, CITY_LIMIT, mapSize);
    const verticalBottom = worldToMap(axis, -CITY_LIMIT, mapSize);
    const horizontalLeft = worldToMap(-CITY_LIMIT, axis, mapSize);
    const horizontalRight = worldToMap(CITY_LIMIT, axis, mapSize);
    ctx.beginPath(); ctx.moveTo(verticalTop.x, verticalTop.y); ctx.lineTo(verticalBottom.x, verticalBottom.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(horizontalLeft.x, horizontalLeft.y); ctx.lineTo(horizontalRight.x, horizontalRight.y); ctx.stroke();
  });
  ctx.setLineDash([]);

  const drawRoute = (points, color, widthLine = 2, dash = [7, 6]) => {
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = widthLine;
    ctx.setLineDash(dash);
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((point, index) => {
      const mapped = worldToMap(point.x, point.z, mapSize);
      if (index === 0) ctx.moveTo(mapped.x, mapped.y);
      else ctx.lineTo(mapped.x, mapped.y);
    });
    ctx.stroke();
    ctx.restore();
  };
  regionalRoutes.forEach((route) => drawRoute(regionalRouteVector(route), 'rgba(71, 90, 91, .72)', 5, []));
  drawRoute(mountainRoadPoints, 'rgba(72, 80, 72, .9)', 11, []);
  drawRoute(mountainRoadPoints, 'rgba(125, 132, 117, .86)', 7, []);
  drawRoute(mountainRoadPoints, 'rgba(215, 192, 104, .9)', 1.5, [8, 7]);
  if (routeStep < beaconPositions.length) drawRoute([player.position, ...beaconPositions.slice(routeStep)], 'rgba(255, 157, 80, .72)', 3, [10, 7]);
  if (deliveryState === 'active') drawRoute([player.position, deliveryTarget], 'rgba(92, 227, 209, .78)', 3, [9, 6]);
  if (mountainDeliveryState === 'active') drawRoute([player.position, mountainDeliveryTarget], 'rgba(92, 227, 209, .78)', 3, [9, 6]);

  const drawText = (text, x, y, color = '#91a7a2', align = 'left') => {
    ctx.font = '500 10px DM Mono, monospace';
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  };
  worldRegions.filter((region) => region.type !== 'city').forEach((region) => {
    const point = worldToMap(region.x, region.z, mapSize);
    ctx.fillStyle = region.color;
    ctx.shadowColor = region.color;
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(point.x, point.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    drawText(region.name, point.x + 10, point.y - 9, region.color);
  });
  drawText('NORTHSTAR AVE', worldToMap(66, 66, mapSize).x + 9, worldToMap(66, 66, mapSize).y - 12, '#b6c5b3');
  drawText('OCTANE ROW', worldToMap(-66, 22, mapSize).x + 9, worldToMap(-66, 22, mapSize).y - 12, '#b6c5b3');
  drawText('MIDTOWN EAST', worldToMap(66, -22, mapSize).x + 9, worldToMap(66, -22, mapSize).y - 12, '#b6c5b3');
  drawText('MOUNTAIN PASS', worldToMap(158, 116, mapSize).x + 9, worldToMap(158, 116, mapSize).y - 12, '#c6b789');
  drawText('PINEWATCH VILLAGE', worldToMap(mountainVillagePosition.x, mountainVillagePosition.z, mapSize).x + 12, worldToMap(mountainVillagePosition.x, mountainVillagePosition.z, mapSize).y + 14, '#d6fa6a');
  drawText('WATERFRONT', mapSize - 10, coastY + 22, '#5ca6aa', 'right');
  const villagePoint = worldToMap(mountainVillagePosition.x, mountainVillagePosition.z, mapSize);
  ctx.fillStyle = '#d6fa6a';
  ctx.shadowColor = '#d6fa6a';
  ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.moveTo(villagePoint.x, villagePoint.y - 7); ctx.lineTo(villagePoint.x + 7, villagePoint.y); ctx.lineTo(villagePoint.x, villagePoint.y + 7); ctx.lineTo(villagePoint.x - 7, villagePoint.y); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0;

  beaconPositions.forEach((position, index) => {
    const point = worldToMap(position.x, position.z, mapSize);
    const active = index === routeStep;
    ctx.beginPath();
    ctx.arc(point.x, point.y, active ? 8 : 5, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#ff9d50' : 'rgba(214, 250, 106, .72)';
    ctx.shadowColor = active ? '#ff9d50' : '#d6fa6a';
    ctx.shadowBlur = active ? 14 : 7;
    ctx.fill();
    ctx.shadowBlur = 0;
    if (active) drawText(beaconNames[index], point.x + 12, point.y - 10, '#ffbd80');
  });
  collectiblePositions.forEach((position, index) => {
    if (player.collectedCaches.includes(index)) return;
    const point = worldToMap(position.x, position.z, mapSize);
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#5ce3d1';
    ctx.shadowColor = '#5ce3d1';
    ctx.shadowBlur = 8;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  });
  const depotPoint = worldToMap(deliveryStart.x, deliveryStart.z, mapSize);
  ctx.fillStyle = '#5ce3d1';
  ctx.fillRect(depotPoint.x - 5, depotPoint.y - 5, 10, 10);
  drawText('DEPOT', depotPoint.x + 10, depotPoint.y + 12, '#79eee1');
  if (deliveryState === 'active') {
    const dropPoint = worldToMap(deliveryTarget.x, deliveryTarget.z, mapSize);
    ctx.fillStyle = '#ff9d50';
    ctx.fillRect(dropPoint.x - 5, dropPoint.y - 5, 10, 10);
    drawText('DROP', dropPoint.x + 10, dropPoint.y + 12, '#ffbd80');
  }
  if (mountainDeliveryState === 'active') {
    const dropPoint = worldToMap(mountainDeliveryTarget.x, mountainDeliveryTarget.z, mapSize);
    ctx.fillStyle = '#ff9d50';
    ctx.fillRect(dropPoint.x - 5, dropPoint.y - 5, 10, 10);
    drawText('CABIN DROP', dropPoint.x + 10, dropPoint.y + 12, '#ffbd80');
  }

  [...traffic, ...mountainTraffic, ...regionalTraffic].forEach((vehicle) => {
    if (vehicle.health >= 100 && vehicle.disabledTimer <= 0) return;
    const point = worldToMap(vehicle.mesh.position.x, vehicle.mesh.position.z, mapSize);
    ctx.fillStyle = vehicle.disabledTimer > 0 ? '#ff5b9c' : '#ff9d50';
    ctx.strokeStyle = 'rgba(255, 157, 80, .45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(point.x, point.y, vehicle.disabledTimer > 0 ? 6 : 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  });
  if (policeState !== 'idle' && policeVehicle.visible) {
    const patrolPoint = worldToMap(policeVehicle.position.x, policeVehicle.position.z, mapSize);
    ctx.fillStyle = '#ff5b9c';
    ctx.beginPath(); ctx.arc(patrolPoint.x, patrolPoint.y, 7, 0, Math.PI * 2); ctx.fill();
    drawText('RADAR STOP', patrolPoint.x + 11, patrolPoint.y - 10, '#ff91bd');
  }
  const current = worldToMap(player.position.x, player.position.z, mapSize);
  ctx.save();
  ctx.translate(current.x, current.y);
  ctx.rotate(-player.heading);
  ctx.fillStyle = '#d6fa6a';
  ctx.shadowColor = '#d6fa6a';
  ctx.shadowBlur = 18;
  ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(9, 10); ctx.lineTo(0, 5); ctx.lineTo(-9, 10); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(214, 250, 106, .26)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, mapSize - 2, mapSize - 2);
  ctx.restore();

  const routeTitle = document.querySelector('#world-map-route');
  const routeCopy = document.querySelector('#world-map-route-copy');
  const status = document.querySelector('#world-map-status');
  if (mountainDeliveryState === 'active') {
    routeTitle.textContent = 'PINEWATCH CABIN DROP';
    routeCopy.textContent = `${Math.round(player.position.distanceTo(mountainDeliveryTarget))} M TO CABIN`;
  } else if (deliveryState === 'active') {
    routeTitle.textContent = 'COURIER DROP';
    routeCopy.textContent = `${Math.round(player.position.distanceTo(deliveryTarget))} M TO DROP POINT`;
  } else if (routeStep < beaconPositions.length) {
    routeTitle.textContent = beaconNames[routeStep];
    routeCopy.textContent = `${Math.round(player.position.distanceTo(beaconPositions[routeStep]))} M TO ACTIVE BEACON`;
  } else {
    routeTitle.textContent = 'FREE ROAM';
    routeCopy.textContent = 'All streets open. Choose your next line.';
  }
  status.textContent = policeState !== 'idle' ? 'RADAR STOP // PULL OVER SAFELY' : 'LIVE NAVIGATION // LEGAL DRIVE';
  document.querySelector('#world-map-location').textContent = districtAt(player.position.x, player.position.z);
  document.querySelector('#world-map-coordinates').textContent = `X ${Math.round(player.position.x).toString().padStart(3, '0')} // Z ${Math.round(player.position.z).toString().padStart(3, '0')}`;
}

function updateHud(dt) {
  const speed = Math.round(Math.abs(player.speed) * 3.1);
  document.querySelector('#speed-value').textContent = String(speed).padStart(3, '0');
  document.querySelector('#gear-value').textContent = player.speed < -0.5 ? 'R' : speed < 2 ? 'P' : (speed > 98 ? '5' : speed > 72 ? '4' : speed > 45 ? '3' : speed > 22 ? '2' : '1');
  document.querySelector('#district-name').textContent = districtAt(player.position.x, player.position.z);
  document.querySelector('#speed-limit').textContent = String(getSpeedLimit(player.position.x, player.position.z));
  const minutes = Math.floor(sessionSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(sessionSeconds % 60).toString().padStart(2, '0');
  document.querySelector('#session-clock').textContent = `${minutes}:${seconds}`;
  // Keep the little bar alive even when a player is idling, like a running vehicle telemetry display.
  const engine = clamp(91 + Math.round(Math.abs(player.speed) / 4), 0, 99);
  document.querySelector('.vehicle-bars .bar span').style.width = `${engine}%`;
  document.querySelector('.vehicle-bars .bar-label b').textContent = `${engine}%`;
  if (dt > 0) {
    drawMiniMap();
    if (worldMapOpen) drawWorldMap();
  }
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

buildWorld();
updateWorldStreaming(true);
buildMenuGarage();

let assetsReady = false;
loadBlenderAssets()
  .catch((error) => console.warn('Asset boot failed; keeping procedural scene.', error))
  .finally(() => { assetsReady = true; });

let lastTime = performance.now();
let hudAccumulator = 0;
function animate(time) {
  const dt = Math.min((time - lastTime) / 1000, .05);
  lastTime = time;
  if (!starterMenuOpen && !garageOpen && !gamePaused && !worldMapOpen) sessionSeconds += dt;
  updateGamepad();
  if (!starterMenuOpen && !garageOpen && !gamePaused && !worldMapOpen) {
    updatePlayer(dt);
    updateWorldStreaming();
    updateTrafficSignals(time);
    updateTraffic(dt);
    updateMountainTraffic(dt);
    updateRegionalTraffic(dt);
    resolveTrafficVehicleCollisions();
    resolveMountainTrafficCollisions();
    resolveRegionalTrafficCollisions();
    updateCollectibles(time, dt);
    updateDelivery(time, dt);
    updateMountainDelivery(time, dt);
    updatePolice(time, dt);
      updateBeacons(time, dt);
  }
  updateAudio();
  updateWater(time);
  if (starterMenuOpen) updateMenuShowcase(time, dt);
  else updateCamera(dt);
  updateSky();
  updateRenderBudget(dt);
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
