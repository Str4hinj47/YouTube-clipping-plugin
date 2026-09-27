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

// Homes are persistent spawn points. The starter is intentionally a modest,
// poorly furnished Pinewatch shack; later properties are optional purchases.
const HOME_CATALOG = [
  { id: 'pinewatch-shack', name: 'PINEWATCH SHACK', className: 'STARTER HOME', price: 0, style: 'shack', location: 'PINEWATCH VILLAGE', description: 'A small, drafty room above the village road. It is not much, but it is yours.', position: [132, 86], spawn: [132, 18.58, 91.2], heading: -2.5 },
  { id: 'pinewatch-cottage', name: 'PINEWATCH COTTAGE', className: 'TWO-ROOM COTTAGE', price: 650, style: 'cottage', location: 'PINEWATCH VILLAGE', description: 'A warmer place with a porch and a clear view of the pass.', position: [145, 84], spawn: [145, 18.48, 89.5], heading: -2.35 },
  { id: 'harbor-flat', name: 'HARBOR FLAT', className: 'CITY APARTMENT', price: 1100, style: 'flat', location: 'AURORA BAY', description: 'A narrow upstairs flat above the waterfront service lanes.', position: [-92, 89], spawn: [-92, .02, 95], heading: -1.55 },
  { id: 'ridge-house', name: 'RIDGE HOUSE', className: 'REMOTE HOUSE', price: 1650, style: 'ridge', location: 'NORTHSTAR OUTPOST', description: 'A quiet remote house for drivers who prefer a long view and fewer neighbors.', position: [388, 2043], spawn: [388, .02, 2050], heading: .1 },
];

const SAVE_SLOT_COUNT = 3;
const LEGACY_SAVE_KEY = 'neonline-aurora-save';
const SAVE_SLOT_PREFIX = 'neonline-aurora-save-slot-';
const LATEST_SAVE_KEY = 'neonline-aurora-latest-slot';
const MENU_SHOWCASE_SCENES = [
  { id: 'aurora-bay', name: 'AURORA BAY', type: 'city', copy: 'Neon boulevards, irregular blocks, and the city line after dark.', camera: [-168, 64, -186], target: [0, 8, 0] },
  { id: 'pinewatch', name: 'PINEWATCH VILLAGE', type: 'mountain', copy: 'A quiet pass town with warm windows and a long way home.', camera: [214, 52, 137], target: [136, 18, 68] },
  { id: 'northstar', name: 'NORTHSTAR OUTPOST', type: 'highlands', copy: 'Remote roads above the bay, where the handoff lights are few.', camera: [545, 72, 2135], target: [400, 2, 2050] },
  { id: 'redwood', name: 'REDWOOD VALLEY', type: 'forest', copy: 'Tree cover, open highway, and the island beyond the city edge.', camera: [-1940, 82, 1925], target: [-1750, 2, 1750] },
  { id: 'lake-aurora', name: 'LAKE AURORA', type: 'lake', copy: 'Cold water and wide horizons on the western road.', camera: [-1770, 76, -1180], target: [-2200, -1, -1450] },
  { id: 'cinder-flats', name: 'CINDER FLATS', type: 'desert', copy: 'Dry ground, long sightlines, and a road that does not forgive noise.', camera: [2070, 75, -2090], target: [2300, 2, -1850] },
  { id: 'eastgate', name: 'EASTGATE', type: 'industrial', copy: 'Freight lanes, hard edges, and the far side of Aurora Bay.', camera: [2540, 82, 760], target: [2800, 2, 500] },
  { id: 'southern-crossroads', name: 'SOUTHERN CROSSROADS', type: 'rural', copy: 'A lonely junction where the island opens into the night.', camera: [245, 74, -2550], target: [500, 2, -2800] },
];

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
// A restrained blue rim keeps building silhouettes and the authored environment
// readable after sunset without flattening the warmer storefront and lamp light.
const nightRim = new THREE.DirectionalLight(0x4b88a8, 0.34);
nightRim.position.set(-100, 72, -130);
scene.add(nightRim);

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
const mountainRoadForest = new THREE.Group();
mountainRoadForest.name = 'Mountain pass roadside conifer dressing';
world.add(mountainRoadForest);
const mountainRoadLighting = new THREE.Group();
mountainRoadLighting.name = 'Mountain pass reflective delineator posts';
world.add(mountainRoadLighting);
const pinewatchExpansion = new THREE.Group();
pinewatchExpansion.name = 'Pinewatch small-town expansion details';
world.add(pinewatchExpansion);
const homeProperties = new THREE.Group();
homeProperties.name = 'Player homes and safehouses';
world.add(homeProperties);
const homePropertyRecords = new Map();
const cargoPickupLocations = new THREE.Group();
cargoPickupLocations.name = 'City contraband pickup locations';
world.add(cargoPickupLocations);
const cargoPickupVisuals = [];
const regionalRoadGroup = new THREE.Group();
regionalRoadGroup.name = 'Streamed 10km regional highway network';
world.add(regionalRoadGroup);
const streamedWorld = new THREE.Group();
streamedWorld.name = 'Streamed rural world sectors';
world.add(streamedWorld);
const islandBoundary = new THREE.Group();
islandBoundary.name = 'Outer island coastline and ocean';
world.add(islandBoundary);
const waterfrontDetails = new THREE.Group();
waterfrontDetails.name = 'Aurora Bay animated waterfront details';
world.add(waterfrontDetails);
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

function createRoadSheenMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;
      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float grazing = 1.0 - abs(dot(normalize(vWorldNormal), viewDirection));
        float shimmer = sin(vWorldPosition.x * .075 + vWorldPosition.z * .021 + uTime * .32) * .5 + .5;
        float brokenHighlight = sin(vWorldPosition.x * .19 - vWorldPosition.z * .043 - uTime * .22) * .5 + .5;
        float intensity = .022 + shimmer * .018 + grazing * .018 + smoothstep(.72, .98, brokenHighlight) * .022;
        vec3 sheen = mix(vec3(.045, .12, .15), vec3(.22, .48, .5), shimmer * .42 + grazing * .32);
        gl_FragColor = vec4(sheen, intensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

function createShoreFoamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPosition;
      void main() {
        float waveA = sin(vWorldPosition.x * .17 + uTime * .62) * .5 + .5;
        float waveB = sin(vWorldPosition.x * .41 - uTime * .37 + vWorldPosition.z * .8) * .5 + .5;
        float broken = smoothstep(.52, .9, waveA * .62 + waveB * .38);
        float edge = 1.0 - smoothstep(.12, 1.45, abs(vWorldPosition.z + 100.0));
        float alpha = (.035 + broken * .12) * edge;
        vec3 foamColor = mix(vec3(.18, .52, .55), vec3(.62, .92, .84), broken);
        gl_FragColor = vec4(foamColor, alpha);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
  });
}

const mats = {
  ground: new THREE.MeshStandardMaterial({ color: 0x132a29, roughness: 1 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x1a3a31, roughness: 1 }),
  asphalt: new THREE.MeshPhysicalMaterial({ color: 0x17212a, roughness: .76, metalness: .12, clearcoat: .28, clearcoatRoughness: .18 }),
  roadSheen: createRoadSheenMaterial(),
  asphaltEdge: new THREE.MeshStandardMaterial({ color: 0x202c34, roughness: .9, metalness: .08 }),
  buildingFrame: new THREE.MeshPhysicalMaterial({ color: 0x18252e, roughness: .58, metalness: .42, clearcoat: .18, clearcoatRoughness: .2 }),
  buildingRoof: new THREE.MeshStandardMaterial({ color: 0x1b262c, roughness: .72, metalness: .24 }),
  sidewalk: new THREE.MeshStandardMaterial({ color: 0x5b6567, roughness: .92 }),
  sidewalkDark: new THREE.MeshStandardMaterial({ color: 0x3b484c, roughness: .9, metalness: .04 }),
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
  shoreFoam: createShoreFoamMaterial(),
  mountainGround: new THREE.MeshStandardMaterial({ color: 0x1b2929, roughness: 1 }),
  forestGround: new THREE.MeshStandardMaterial({ color: 0x18342b, roughness: 1 }),
  lakeGround: new THREE.MeshStandardMaterial({ color: 0x153039, roughness: .96 }),
  desertGround: new THREE.MeshStandardMaterial({ color: 0x4b3b2c, roughness: 1 }),
  desertPlant: new THREE.MeshStandardMaterial({ color: 0x68704d, roughness: .94, flatShading: true }),
  industrialGround: new THREE.MeshStandardMaterial({ color: 0x26313a, roughness: .96 }),
  ruralGround: new THREE.MeshStandardMaterial({ color: 0x304334, roughness: 1 }),
  mountainRock: new THREE.MeshStandardMaterial({ color: 0x26353a, roughness: .96, flatShading: true }),
  mountainRockLit: new THREE.MeshStandardMaterial({ color: 0x3c4c4b, roughness: .92, flatShading: true }),
  mountainRoad: new THREE.MeshPhysicalMaterial({ color: 0x1a242c, roughness: .8, metalness: .08, clearcoat: .2, clearcoatRoughness: .22 }),
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
const roadSheenMeshes = [];

// A small shared visual language keeps the authored GLB, procedural fallback, and
// streamed roadside kits in the same cool-night palette without adding a texture
// dependency or a large number of unique materials.
const polishMats = {
  cyanCore: new THREE.MeshStandardMaterial({ color: 0x5ce3d1, emissive: 0x187f88, emissiveIntensity: 3.2, metalness: .38, roughness: .24 }),
  pinkCore: new THREE.MeshStandardMaterial({ color: 0xff5b9c, emissive: 0x8a1f62, emissiveIntensity: 3.1, metalness: .3, roughness: .26 }),
  amberCore: new THREE.MeshStandardMaterial({ color: 0xffb15e, emissive: 0x99451f, emissiveIntensity: 2.8, metalness: .26, roughness: .3 }),
  limeCore: new THREE.MeshStandardMaterial({ color: 0xd6fa6a, emissive: 0x719f2a, emissiveIntensity: 2.9, metalness: .28, roughness: .28 }),
  cyanGlow: new THREE.MeshBasicMaterial({ color: 0x5ce3d1, transparent: true, opacity: .2, blending: THREE.AdditiveBlending, depthWrite: false }),
  pinkGlow: new THREE.MeshBasicMaterial({ color: 0xff5b9c, transparent: true, opacity: .18, blending: THREE.AdditiveBlending, depthWrite: false }),
  amberGlow: new THREE.MeshBasicMaterial({ color: 0xff9d50, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false }),
  limeGlow: new THREE.MeshBasicMaterial({ color: 0xd6fa6a, transparent: true, opacity: .16, blending: THREE.AdditiveBlending, depthWrite: false }),
  reflector: new THREE.MeshStandardMaterial({ color: 0xd8e9e0, emissive: 0x477d78, emissiveIntensity: 1.8, metalness: .45, roughness: .34 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x17242d, metalness: .7, roughness: .34 }),
};
const polishPulseMeshes = [];
const polishPulseLights = [];
const streetGlowGeometry = new THREE.CircleGeometry(2.8, 18);
const polishCoreByAccent = {
  cyan: polishMats.cyanCore,
  pink: polishMats.pinkCore,
  amber: polishMats.amberCore,
  lime: polishMats.limeCore,
};
const polishGlowByAccent = {
  cyan: polishMats.cyanGlow,
  pink: polishMats.pinkGlow,
  amber: polishMats.amberGlow,
  lime: polishMats.limeGlow,
};
const polishHexByAccent = { cyan: 0x5ce3d1, pink: 0xff5b9c, amber: 0xff9d50, lime: 0xd6fa6a };

function polishAccentForRegion(type) {
  if (type === 'industrial') return 'pink';
  if (type === 'desert') return 'amber';
  if (type === 'highlands' || type === 'rural') return 'lime';
  return 'cyan';
}

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
let skyMoonGlow = null;
let skyMaterial = null;
const skyMoonOffset = new THREE.Vector3(-75, 68, -145);

function buildSky() {
  // The gradient is deliberately shader-only: it gives the city a teal horizon,
  // indigo zenith, and a very subtle magenta pollution band for depth at distance.
  skyMaterial = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vWorldPosition;
      void main() {
        vec3 direction = normalize(vWorldPosition - cameraPosition);
        float horizon = smoothstep(-.18, .48, direction.y);
        vec3 horizonColor = vec3(.045, .135, .18);
        vec3 zenithColor = vec3(.008, .018, .055);
        vec3 color = mix(horizonColor, zenithColor, horizon);
        float horizonBand = exp(-abs(direction.y - .035) * 18.0);
        color += vec3(.075, .035, .075) * horizonBand;
        color += vec3(.015, .055, .065) * pow(max(direction.y, 0.0), 1.6);
        float skyMask = smoothstep(.02, .38, direction.y) * (1.0 - smoothstep(.42, .7, direction.y));
        float ribbonA = exp(-abs(direction.y - (.2 + sin(direction.x * 7.5 + direction.z * 2.2 + uTime * .055) * .055)) * 28.0);
        float ribbonB = exp(-abs(direction.y - (.29 + sin(direction.x * 12.0 - direction.z * 3.5 - uTime * .072) * .045)) * 34.0);
        float strands = .55 + .45 * (sin(direction.x * 25.0 + direction.z * 9.0 + uTime * .25) * .5 + .5);
        vec3 auroraColor = mix(vec3(.12, .72, .62), vec3(.46, .26, .72), .5 + .5 * sin(direction.x * 3.0 + uTime * .08));
        color += auroraColor * (ribbonA * .075 + ribbonB * .04) * strands * skyMask;
        float cloudSignal = sin(direction.x * 15.0 + direction.z * 8.0 + uTime * .018) * .5 + .5;
        cloudSignal *= sin(direction.x * 4.0 - direction.z * 13.0 - uTime * .012) * .5 + .5;
        float cloudHaze = smoothstep(.62, .82, cloudSignal) * exp(-abs(direction.y - .095) * 19.0);
        color += vec3(.04, .065, .09) * cloudHaze * .22;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(WORLD_LIMIT + 2600, 48, 24), skyMaterial);
  sky.renderOrder = -10;
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
  // A layered moon halo keeps the skyline readable without a texture dependency.
  const moonGlowMaterial = new THREE.MeshBasicMaterial({ color: 0x5ca4b6, transparent: true, opacity: .035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const moonHalo = addMesh(world, new THREE.CircleGeometry(24, 32), moonGlowMaterial, [-75, 68, -145]);
  skyMoonGlow = moonHalo;
  const moonDisk = addMesh(world, new THREE.CircleGeometry(13, 32), new THREE.MeshBasicMaterial({ color: 0x90a9b1, transparent: true, opacity: .14, side: THREE.DoubleSide, depthWrite: false }), [-75, 68, -145]);
  skyMoon = moonDisk;
  moonDisk.lookAt(camera.position);
}

function updateSky(time = 0) {
  if (skyMaterial) skyMaterial.uniforms.uTime.value = time * .001;
  if (skyStars) skyStars.position.copy(camera.position);
  if (skyMoonGlow) {
    skyMoonGlow.position.copy(camera.position).add(skyMoonOffset);
    skyMoonGlow.lookAt(camera.position);
  }
  if (skyMoon) {
    skyMoon.position.copy(camera.position).add(skyMoonOffset);
    skyMoon.lookAt(camera.position);
  }
}

function createWaterfrontBuoy(x, z, seed = 1) {
  const buoy = new THREE.Group();
  buoy.name = 'Harbor navigation buoy';
  buoy.position.set(x, -.02, z);
  const core = seed % 2 ? polishMats.amberCore : polishMats.cyanCore;
  addMesh(buoy, new THREE.CylinderGeometry(.11, .18, .5, 8), mats.buildingFrame, [0, .22, 0], { castShadow: true });
  addMesh(buoy, new THREE.SphereGeometry(.2, 10, 6), core, [0, .56, 0]);
  addMesh(buoy, new THREE.CylinderGeometry(.05, .05, .22, 8), core, [0, .82, 0]);
  addMesh(buoy, new THREE.CircleGeometry(.7, 16), seed % 2 ? polishMats.amberGlow : polishMats.cyanGlow, [0, .015, 0], { rotation: [-Math.PI / 2, 0, 0] });
  waterfrontDetails.add(buoy);
  return buoy;
}

function buildWaterfrontDetails() {
  const foam = addMesh(waterfrontDetails, new THREE.PlaneGeometry(270, 3.1, 72, 2), mats.shoreFoam, [0, -.045, -100], { rotation: [-Math.PI / 2, 0, 0] });
  foam.renderOrder = 2;
  [-112, -124, -136].forEach((z, index) => createWaterfrontBuoy(-98 + index * 66, z, index + 1));
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
  buildWaterfrontDetails();
}

function updateWater(time) {
  const waterTime = time * .001;
  mats.water.uniforms.uTime.value = waterTime;
  mats.ocean.uniforms.uTime.value = waterTime * .72;
  mats.shoreFoam.uniforms.uTime.value = waterTime * 1.12;
}

function addRoadSheen(parent, geometry, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const sheen = addMesh(parent, geometry, mats.roadSheen, position, { rotation });
  sheen.renderOrder = 1;
  roadSheenMeshes.push(sheen);
  return sheen;
}

function updateVisualPolish(time) {
  const seconds = time * .001;
  mats.roadSheen.uniforms.uTime.value = seconds;
  polishPulseMeshes.forEach(({ material, baseOpacity, phase }) => {
    material.opacity = baseOpacity * (.84 + Math.sin(seconds * 2.1 + phase) * .16);
  });
  polishPulseLights.forEach(({ light, baseIntensity, phase }) => {
    light.intensity = baseIntensity * (.88 + Math.sin(seconds * 1.7 + phase) * .12);
  });
}

function buildRoads() {
  for (const x of roadAxes) {
    addMesh(city, new THREE.PlaneGeometry(9.6, 230), mats.asphalt, [x, -.035, 0], { rotation: [-Math.PI / 2, 0, 0], receiveShadow: true });
    addRoadSheen(city, new THREE.PlaneGeometry(9.18, 230), [x, .012, 0], [-Math.PI / 2, 0, 0]);
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
    addRoadSheen(city, new THREE.PlaneGeometry(230, 9.18), [0, .012, z], [-Math.PI / 2, 0, 0]);
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
    addMountainPathRibbon(points, 10.08, mats.roadSheen, .052, cityEnhancements);
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

function addBuildingFacadeKit(group, width, depth, height, floors, architectureStyle, trimMaterial, seed) {
  const frontZ = depth / 2 + .09;
  const frameHeight = Math.max(2.8, height - .55);
  const frontBays = Math.max(2, Math.min(7, Math.floor(width / 3.8)));
  const sideBays = Math.max(2, Math.min(5, Math.floor(depth / 4.1)));
  const frameInset = width / 2 - .72;
  for (let bay = 0; bay < frontBays; bay += 1) {
    const x = -frameInset + bay * ((frameInset * 2) / Math.max(1, frontBays - 1));
    addMesh(group, new THREE.BoxGeometry(.075, frameHeight, .1), mats.buildingFrame, [x, frameHeight / 2 + .25, frontZ], { castShadow: true });
    if (architectureStyle % 3 === 0) {
      addMesh(group, new THREE.BoxGeometry(.035, frameHeight * .72, .035), trimMaterial, [x, frameHeight * .47 + .25, frontZ + .065]);
    }
  }
  for (let bay = 0; bay < sideBays; bay += 1) {
    const windowZ = -depth / 2 + 1.4 + bay * ((depth - 2.8) / Math.max(1, sideBays - 1));
    addMesh(group, new THREE.BoxGeometry(.1, frameHeight, .075), mats.buildingFrame, [width / 2 + .09, frameHeight / 2 + .25, windowZ], { castShadow: true });
  }
  const bandStep = architectureStyle % 2 === 0 ? 2 : 3;
  for (let floor = bandStep; floor < floors; floor += bandStep) {
    const y = 1.35 + floor * 3.05;
    addMesh(group, new THREE.BoxGeometry(width * .91, .075, .12), mats.buildingFrame, [0, y, frontZ], { castShadow: true });
    if (architectureStyle === 2 || architectureStyle === 5) {
      addMesh(group, new THREE.BoxGeometry(width * .65, .035, .04), trimMaterial, [0, y + .055, frontZ + .07]);
    }
  }
  const entranceWidth = Math.min(2.3, Math.max(1.4, width * .17));
  addMesh(group, new THREE.BoxGeometry(entranceWidth, 1.9, .08), mats.glass, [0, .98, frontZ + .015], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(entranceWidth + .22, .1, .13), mats.buildingFrame, [0, 1.98, frontZ + .02], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(entranceWidth + .58, .12, .76), trimMaterial, [0, 2.06, depth / 2 + .42], { castShadow: true });
  if (architectureStyle === 1 || architectureStyle === 4) {
    const balconyWidth = Math.min(4.2, Math.max(2.7, width * .28));
    const balconyX = architectureStyle === 1 ? -width * .21 : width * .2;
    const balconyCount = Math.max(1, Math.floor((floors - 1) / 2));
    for (let balcony = 0; balcony < balconyCount; balcony += 1) {
      const y = 3.12 + balcony * 6.1;
      if (y > height - 1.1) break;
      addMesh(group, new THREE.BoxGeometry(balconyWidth, .1, 1.08), mats.buildingFrame, [balconyX, y, depth / 2 + .49], { castShadow: true });
      addMesh(group, new THREE.BoxGeometry(balconyWidth, .075, .07), trimMaterial, [balconyX, y + .63, depth / 2 + 1.02], { castShadow: true });
      for (const side of [-1, 1]) {
        addMesh(group, new THREE.BoxGeometry(.06, .58, .06), mats.buildingFrame, [balconyX + side * (balconyWidth / 2 - .04), y + .31, depth / 2 + 1.02], { castShadow: true });
      }
    }
  }
  const roofY = height + .18;
  addMesh(group, new THREE.BoxGeometry(width + .18, .16, .16), mats.buildingFrame, [0, roofY, depth / 2], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(width + .18, .16, .16), mats.buildingFrame, [0, roofY, -depth / 2], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(.16, .16, depth), mats.buildingFrame, [width / 2, roofY, 0], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(.16, .16, depth), mats.buildingFrame, [-width / 2, roofY, 0], { castShadow: true });
  const utilityCount = 1 + Math.floor(randomFrom(seed * 3.1) * 3);
  for (let unit = 0; unit < utilityCount; unit += 1) {
    const utilityWidth = .9 + randomFrom(seed + unit * 13) * .65;
    const utilityDepth = .7 + randomFrom(seed + unit * 17) * .5;
    const utilityX = -width * .25 + randomFrom(seed + unit * 19) * width * .5;
    const utilityZ = -depth * .22 + randomFrom(seed + unit * 23) * depth * .44;
    addMesh(group, new THREE.BoxGeometry(utilityWidth, .52, utilityDepth), mats.buildingRoof, [utilityX, height + .48, utilityZ], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(utilityWidth * .72, .045, utilityDepth * .72), trimMaterial, [utilityX, height + .76, utilityZ]);
  }
  if (architectureStyle === 0 || architectureStyle === 5) {
    const mastX = architectureStyle === 0 ? -width * .28 : width * .27;
    addMesh(group, new THREE.CylinderGeometry(.045, .06, 1.35, 6), mats.buildingFrame, [mastX, height + 1.14, depth * .12], { castShadow: true });
    addMesh(group, new THREE.SphereGeometry(.12, 8, 6), trimMaterial, [mastX, height + 1.84, depth * .12]);
  }
}

function createBuilding(x, z, width, depth, height, colorIndex, seed) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.name = `Blender building ${seed}`;
  const palette = [0x253c4a, 0x30434b, 0x3d3d4c, 0x24484b, 0x4b3f4b, 0x35455b];
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: palette[colorIndex % palette.length], roughness: .8, metalness: .1, clearcoat: .12, clearcoatRoughness: .28 });
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
  const floors = Math.max(2, Math.floor(height / 3.1));
  const frontCols = Math.max(2, Math.floor(width / 2.7));
  const sideCols = Math.max(2, Math.floor(depth / 2.7));
  for (let floor = 0; floor < floors; floor += 1) {
    const y = 1.35 + floor * 3.05;
    for (let col = 0; col < frontCols; col += 1) {
      const windowX = -width / 2 + 1.35 + col * ((width - 2.2) / Math.max(1, frontCols - 1));
      const lit = randomFrom(seed * 9 + floor * 31 + col * 17) > .27;
      if (lit) {
        const frontWindow = windowMats[(colorIndex + floor + col + Math.floor(seed)) % windowMats.length];
        createWindow(group, windowX, y, depth / 2 + .025, .72, .035, frontWindow);
        if (randomFrom(seed + floor * 8 + col) > .35) {
          const rearWindow = windowMats[(colorIndex + floor + col + 1 + Math.floor(seed / 3)) % windowMats.length];
          createWindow(group, windowX, y, -depth / 2 - .025, .72, .035, rearWindow);
        }
      }
    }
    for (let col = 0; col < sideCols; col += 1) {
      const windowZ = -depth / 2 + 1.35 + col * ((depth - 2.2) / Math.max(1, sideCols - 1));
      if (randomFrom(seed * 4 + floor * 18 + col * 5) > .34) {
        createWindow(group, width / 2 + .025, y, windowZ, .035, .72, windowMats[(colorIndex + floor + col + 1) % windowMats.length], [0, Math.PI / 2, 0]);
      }
    }
  }
  addBuildingFacadeKit(group, width, depth, height, floors, architectureStyle, trimMaterial, seed);
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
  // The imported environment supplies the primary massing; this deterministic facade
  // kit gives each block a readable night face without replacing authored landmarks.
  const windowMats = [mats.windowCyan, mats.windowPurple, mats.windowAmber, mats.windowBlue];
  const accentFloors = Math.max(2, Math.floor(height / 3.1));
  const accentColumns = Math.max(3, Math.min(6, Math.floor(width / 3.4)));
  for (let floor = 0; floor < accentFloors; floor += 1) {
    const y = 1.32 + floor * 3.05;
    for (let column = 0; column < accentColumns; column += 1) {
      const windowX = -width / 2 + 1.25 + column * ((width - 2.1) / Math.max(1, accentColumns - 1));
      if (randomFrom(seed * 2.7 + floor * 19 + column * 7) > .24) {
        const material = windowMats[(style + floor + column) % windowMats.length];
        createWindow(group, windowX, y, depth / 2 + .245, .7, .045, material);
      }
    }
    if (floor > 0 && floor % (style % 2 ? 2 : 3) === 0) {
      addMesh(group, new THREE.BoxGeometry(width * .84, .055, .1), mats.buildingFrame, [0, y - .48, depth / 2 + .27], { castShadow: true });
    }
  }
  for (let column = 0; column < accentColumns; column += 1) {
    const x = -width / 2 + 1.1 + column * ((width - 2.2) / Math.max(1, accentColumns - 1));
    addMesh(group, new THREE.BoxGeometry(.06, Math.max(2.4, height - .55), .08), mats.buildingFrame, [x, Math.max(1.4, height / 2), depth / 2 + .29], { castShadow: true });
  }
  const roofUnitCount = 1 + (seed % 3);
  for (let unit = 0; unit < roofUnitCount; unit += 1) {
    const unitX = -width * .26 + unit * (width * .24);
    addMesh(group, new THREE.BoxGeometry(1.05 + (unit % 2) * .35, .42, .72), mats.buildingRoof, [unitX, height + .42, -depth * .12 + (unit % 2) * .28], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(.7, .035, .48), trim, [unitX, height + .65, -depth * .12 + (unit % 2) * .28]);
  }
  if (style % 3 === 1 && height > 11) {
    const balconyWidth = Math.min(3.8, width * .28);
    for (let balcony = 0; balcony < Math.max(1, Math.floor((accentFloors - 1) / 2)); balcony += 1) {
      const y = 3.05 + balcony * 6.1;
      if (y > height - 1) break;
      addMesh(group, new THREE.BoxGeometry(balconyWidth, .08, .88), mats.buildingFrame, [width * .18, y, depth / 2 + .47], { castShadow: true });
      addMesh(group, new THREE.BoxGeometry(balconyWidth, .06, .06), trim, [width * .18, y + .58, depth / 2 + .9], { castShadow: true });
    }
  }
  cityEnhancements.add(group);
  return group;
}

function createPolishPulseBand(parent, radius, y, accent, phase = 0) {
  const material = new THREE.MeshBasicMaterial({
    color: polishHexByAccent[accent] || polishHexByAccent.cyan,
    transparent: true,
    opacity: .62,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const ring = addMesh(parent, new THREE.TorusGeometry(radius, .07, 7, 32), material, [0, y, 0], { rotation: [Math.PI / 2, 0, 0] });
  ring.renderOrder = 2;
  polishPulseMeshes.push({ object: ring, material, baseOpacity: .62, phase });
  return ring;
}

function createAuroraSpire(x, z, height, accent = 'cyan', labelText = 'AURORA SPIRE', variant = 0) {
  const group = new THREE.Group();
  group.name = `Aurora Bay skyline landmark // ${labelText}`;
  group.position.set(x, 0, z);
  const core = polishCoreByAccent[accent] || polishMats.cyanCore;
  const glow = polishGlowByAccent[accent] || polishMats.cyanGlow;
  const baseRadius = variant % 2 === 0 ? 2.25 : 1.8;
  addMesh(group, new THREE.CylinderGeometry(baseRadius + .45, baseRadius + .9, .28, 10), polishMats.darkMetal, [0, .14, 0], { castShadow: true, receiveShadow: true });
  addMesh(group, new THREE.CylinderGeometry(baseRadius * .58, baseRadius, height * .84, variant === 1 ? 6 : 8), core, [0, height * .42, 0], { castShadow: true });
  for (const side of [-1, 1]) {
    addMesh(group, new THREE.BoxGeometry(.16, height * .77, .16), core, [side * baseRadius * .72, height * .4, 0], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(.11, height * .64, .11), glow, [0, height * .34, side * baseRadius * .72]);
  }
  const ringCount = variant === 2 ? 4 : 3;
  for (let index = 0; index < ringCount; index += 1) {
    createPolishPulseBand(group, baseRadius + .2 + (index % 2) * .28, height * (.2 + index * .19), accent, index * .8 + variant);
  }
  if (variant === 1) {
    addMesh(group, new THREE.BoxGeometry(baseRadius * 1.8, .16, .16), core, [0, height * .9, 0], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(.16, .16, baseRadius * 1.8), core, [0, height * .9, 0], { castShadow: true });
  } else {
    addMesh(group, new THREE.ConeGeometry(.28, 2.4, 8), core, [0, height + 1.2, 0], { castShadow: true });
  }
  const beaconLight = new THREE.PointLight(polishHexByAccent[accent] || polishHexByAccent.cyan, 1.35, 32, 2);
  beaconLight.position.y = Math.min(height * .78, height - 1);
  group.add(beaconLight);
  polishPulseLights.push({ light: beaconLight, baseIntensity: 1.35, phase: variant * .9 });
  const label = makeLabel(labelText, accent === 'pink' ? '#ff5b9c' : accent === 'amber' ? '#ff9d50' : accent === 'lime' ? '#d6fa6a' : '#5ce3d1', .42);
  label.position.set(0, height + 3.2, 0);
  group.add(label);
  cityEnhancements.add(group);
  return group;
}

function createHarborGateway(x, z, rotation = 0) {
  const group = new THREE.Group();
  group.name = 'Aurora Harbor illuminated gateway';
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  addMesh(group, new THREE.BoxGeometry(1.05, 7.8, 1.05), polishMats.darkMetal, [-9, 3.9, 0], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(1.05, 7.8, 1.05), polishMats.darkMetal, [9, 3.9, 0], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(19.5, .42, .42), polishMats.darkMetal, [0, 7.55, 0], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(.18, 7.2, .18), polishMats.cyanCore, [-8.35, 3.8, .54]);
  addMesh(group, new THREE.BoxGeometry(.18, 7.2, .18), polishMats.amberCore, [8.35, 3.8, .54]);
  addMesh(group, new THREE.BoxGeometry(17.2, .11, .11), polishMats.cyanCore, [0, 7.36, .55]);
  addMesh(group, new THREE.BoxGeometry(17.2, .08, .08), polishMats.pinkCore, [0, 7.67, .55]);
  const gatewayLight = new THREE.PointLight(0x5ce3d1, 1.7, 30, 2);
  gatewayLight.position.set(0, 6.1, 1.2);
  group.add(gatewayLight);
  polishPulseLights.push({ light: gatewayLight, baseIntensity: 1.7, phase: 1.7 });
  const label = makeLabel('AURORA HARBOR', '#5ce3d1', .5);
  label.position.set(0, 8.9, .1);
  group.add(label);
  cityEnhancements.add(group);
  return group;
}

function createRoadReflector(x, z, heading, accent = 'cyan', parent = cityEnhancements) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  addMesh(group, new THREE.CylinderGeometry(.045, .075, .72, 6), polishMats.darkMetal, [0, .36, 0]);
  addMesh(group, new THREE.BoxGeometry(.28, .12, .06), polishMats.reflector, [0, .7, .035]);
  addMesh(group, new THREE.BoxGeometry(.17, .045, .04), polishGlowByAccent[accent] || polishMats.cyanGlow, [0, .72, .075]);
  parent.add(group);
  return group;
}

function buildRoadReflectors() {
  urbanRoadRoutes.forEach((route, routeIndex) => {
    for (let index = 1; index < route.length; index += 1) {
      const [startX, startZ] = route[index - 1];
      const [endX, endZ] = route[index];
      const segment = new THREE.Vector3(endX - startX, 0, endZ - startZ);
      const length = segment.length();
      if (length < 1) continue;
      const heading = Math.atan2(segment.x, segment.z);
      const tangent = segment.normalize();
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
      for (let distance = 20; distance < length - 6; distance += 36) {
        const center = new THREE.Vector3(startX, 0, startZ).lerp(new THREE.Vector3(endX, 0, endZ), distance / length);
        const side = ((Math.floor(distance / 36) + routeIndex) % 2 ? 1 : -1);
        center.addScaledVector(normal, side * 6.35);
        createRoadReflector(center.x, center.z, heading, routeIndex % 3 === 1 ? 'pink' : 'cyan');
      }
    }
  });
}

function buildVisualPolish() {
  // One civic anchor, three lower skyline notes, and a waterfront threshold give
  // Aurora Bay a readable silhouette instead of a field of interchangeable blocks.
  createAuroraSpire(0, 44, 40, 'cyan', 'AURORA SPIRE', 0);
  createAuroraSpire(-88, -62, 27, 'pink', 'NORTH LIGHT', 1);
  createAuroraSpire(88, -53, 32, 'amber', 'EAST LOOP', 2);
  createAuroraSpire(-4, 91, 24, 'lime', 'HARBOR LINK', 3);
  createHarborGateway(0, -95, 0);
  buildRoadReflectors();
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
  // Most lamps get a cheap additive pool while only every fourth lamp receives a
  // real point light. This makes the boulevard read as lit without multiplying
  // expensive light calculations across the whole grid.
  if (seed % 2 === 0) {
    const poolMaterial = seed % 4 === 0 ? polishMats.amberGlow : polishMats.cyanGlow;
    const pool = addMesh(group, streetGlowGeometry, poolMaterial, [horizontal ? 1.08 : 0, .026, horizontal ? 0 : 1.08], { rotation: [-Math.PI / 2, 0, 0] });
    pool.renderOrder = 1;
  }
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

// Progression is intentionally data-driven. Adjust only this block to change the
// starter ride or the delivery milestone that grants each vehicle.
const PROGRESSION_CONFIG = {
  starterStyle: 'sport',
  vehicleUnlocks: [
    { style: 'sport', deliveries: 0, title: 'Starter ride' },
    { style: 'hatch', deliveries: 2, title: 'First milestone' },
    { style: 'ev', deliveries: 4, title: 'Clean-energy unlock' },
    { style: 'wagon', deliveries: 7, title: 'Long-haul unlock' },
    { style: 'suv', deliveries: 10, title: 'Mountain-ready unlock' },
    { style: 'classic', deliveries: 14, title: 'Heritage unlock' },
    { style: 'pickup', deliveries: 18, title: 'Utility unlock' },
    { style: 'supercar', deliveries: 24, title: 'Flagship unlock' },
  ],
};

const VEHICLE_CATALOG = [
  { style: 'sport', name: 'MIDNIGHT GT', className: 'SPORT COUPE', price: 0, vehicleValue: 2200, paint: '#303fca', accent: '#d6fa6a', description: 'Your balanced blue-hour starter.', power: 86, grip: 72, styleScore: 94, acceleration: 22, topSpeed: 39, brakePower: 34, turnRate: 1.75, turnSpeed: 18, offRoadTraction: .72 },
  { style: 'hatch', name: 'METRO HATCH', className: 'CITY HATCH', price: 300, vehicleValue: 300, paint: '#d85062', accent: '#5ce3d1', description: 'Small footprint. Sharp exits.', power: 62, grip: 88, styleScore: 76, acceleration: 20, topSpeed: 34, brakePower: 37, turnRate: 2.08, turnSpeed: 16, offRoadTraction: .84 },
  { style: 'ev', name: 'PULSE EV', className: 'ELECTRIC SPORT', price: 420, vehicleValue: 420, paint: '#5ce3d1', accent: '#d6fa6a', description: 'Instant torque for clean lines.', power: 82, grip: 84, styleScore: 91, acceleration: 26, topSpeed: 41, brakePower: 36, turnRate: 1.92, turnSpeed: 17, offRoadTraction: .78 },
  { style: 'classic', name: 'CINDER CLASSIC', className: 'GRAND TOURER', price: 560, vehicleValue: 560, paint: '#f0e6cf', accent: '#ff9d50', description: 'Old soul. Long, smooth corners.', power: 74, grip: 64, styleScore: 98, acceleration: 17, topSpeed: 31, brakePower: 27, turnRate: 1.42, turnSpeed: 20, offRoadTraction: .6 },
  { style: 'wagon', name: 'GRAND TOURER', className: 'TOURING WAGON', price: 680, vehicleValue: 680, paint: '#496f9a', accent: '#d6fa6a', description: 'Room for the long way home.', power: 78, grip: 79, styleScore: 84, acceleration: 19, topSpeed: 35, brakePower: 32, turnRate: 1.58, turnSpeed: 18, offRoadTraction: .74 },
  { style: 'suv', name: 'TRAIL SCOUT', className: 'ADVENTURE SUV', price: 820, vehicleValue: 820, paint: '#6d8b75', accent: '#ff9d50', description: 'High stance. No road required.', power: 81, grip: 86, styleScore: 82, acceleration: 18, topSpeed: 33, brakePower: 39, turnRate: 1.48, turnSpeed: 19, offRoadTraction: .94 },
  { style: 'pickup', name: 'HARBOR UTILITY', className: 'UTILITY PICKUP', price: 950, vehicleValue: 950, paint: '#c36b48', accent: '#5ce3d1', description: 'Heavy work, neon nights.', power: 89, grip: 61, styleScore: 79, acceleration: 16, topSpeed: 30, brakePower: 38, turnRate: 1.28, turnSpeed: 21, offRoadTraction: .86 },
  { style: 'supercar', name: 'VELOCE R', className: 'SUPER COUPE', price: 1400, vehicleValue: 1400, paint: '#8e72c9', accent: '#ff5b9c', description: 'Low, loud, and fictional.', power: 98, grip: 90, styleScore: 97, acceleration: 27, topSpeed: 48, brakePower: 35, turnRate: 1.9, turnSpeed: 16, offRoadTraction: .56 },
];
const fleetAssetScenes = {};

// Crash damage is deliberately represented as geometry instead of a single
// health tint. That keeps dents, scuffs, creases, broken-looking trim, and
// cracked surfaces visible on both the procedural wrapper and an imported GLB.
const DAMAGE_CONFIG = Object.freeze({
  repairFraction: .8,
  waterRecoveryFraction: .5,
});
const damageDentMaterial = new THREE.MeshStandardMaterial({ color: 0x111820, metalness: .18, roughness: .92, transparent: true, opacity: .74, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const damageScratchMaterial = new THREE.MeshBasicMaterial({ color: 0xd2a58c, transparent: true, opacity: .9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
const damageBareMetalMaterial = new THREE.MeshStandardMaterial({ color: 0xb8c0c0, metalness: .82, roughness: .42, transparent: true, opacity: .84, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
const damageTransferMaterial = new THREE.MeshStandardMaterial({ color: 0x351f29, metalness: .12, roughness: .88, transparent: true, opacity: .82, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
const damageCrackMaterial = new THREE.LineBasicMaterial({ color: 0x10151c, transparent: true, opacity: .94, depthTest: false });

function damageRandom(seed, offset = 0) {
  const value = Math.sin((seed + offset * 19.173) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function createDamageRig(vehicleRoot) {
  if (vehicleRoot.userData.damageRig) return vehicleRoot.userData.damageRig;
  const rig = new THREE.Group();
  rig.name = 'persistent collision damage';
  rig.userData.marks = [];
  rig.userData.impactCount = 0;
  rig.renderOrder = 4;
  vehicleRoot.userData.damageRig = rig;
  vehicleRoot.add(rig);
  return rig;
}

function addDamageBox(parent, width, height, depth, material, position, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(position[0], position[1], position[2]);
  if (rotation) mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

function addDamageCracks(parent, zone, x, y, surface, sign, seed) {
  const vertices = [];
  const crackCount = 3 + Math.floor(damageRandom(seed, 32) * 3);
  for (let index = 0; index < crackCount; index += 1) {
    const start = damageRandom(seed, 40 + index) * 2 - 1;
    const spread = .2 + damageRandom(seed, 50 + index) * .42;
    if (zone === 'left' || zone === 'right') {
      const crackZ = surface + (damageRandom(seed, 60 + index) - .5) * .4;
      vertices.push(
        new THREE.Vector3(sign * 1.19, y + start * .15, crackZ),
        new THREE.Vector3(sign * 1.195, y + start * .15 + spread * (damageRandom(seed, 70 + index) > .5 ? 1 : -1), crackZ + (damageRandom(seed, 80 + index) - .5) * .62),
      );
    } else {
      const crackX = x + (damageRandom(seed, 60 + index) - .5) * .5;
      vertices.push(
        new THREE.Vector3(crackX, y + start * .14, surface + sign * .075),
        new THREE.Vector3(crackX + (damageRandom(seed, 70 + index) - .5) * .38, y + start * .14 + spread * (damageRandom(seed, 80 + index) > .5 ? 1 : -1), surface + sign * .08),
      );
    }
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(vertices);
  const cracks = new THREE.LineSegments(geometry, damageCrackMaterial);
  cracks.renderOrder = 8;
  parent.add(cracks);
}

function localImpactPosition(impact = {}) {
  if (Array.isArray(impact.localPosition) && impact.localPosition.length >= 3) {
    return new THREE.Vector3(Number(impact.localPosition[0]) || 0, Number(impact.localPosition[1]) || .7, Number(impact.localPosition[2]) || 1.8);
  }
  if (impact.localPosition?.isVector3) return impact.localPosition.clone();
  if (impact.worldPosition?.isVector3) {
    const local = impact.worldPosition.clone().sub(player.position);
    return local.applyAxisAngle(new THREE.Vector3(0, 1, 0), -player.heading);
  }
  return new THREE.Vector3((damageRandom(impact.seed || 1, 1) - .5) * 1.2, .7, 2.1);
}

function addVisibleDamage(vehicleRoot, impactSpeed = 0, impact = {}, persist = true) {
  const rig = vehicleRoot?.userData?.damageRig || createDamageRig(vehicleRoot);
  const seed = Number.isFinite(impact.seed) ? impact.seed : ((rig.userData.impactCount || 0) + 1);
  rig.userData.impactCount = Math.max(rig.userData.impactCount || 0, seed);
  const local = localImpactPosition(impact);
  const sideDominant = Math.abs(local.x) > Math.abs(local.z) * .72;
  const zone = impact.zone || (sideDominant ? (local.x < 0 ? 'left' : 'right') : (local.z < 0 ? 'rear' : 'front'));
  const mark = new THREE.Group();
  mark.name = `impact mark ${seed}`;
  mark.userData = { zone, speed: impactSpeed, seed };
  rig.add(mark);
  rig.userData.marks.push(mark);

  const wide = .23 + damageRandom(seed, 2) * .44;
  const tall = .1 + damageRandom(seed, 3) * .2;
  const long = .35 + damageRandom(seed, 4) * .72;
  const hardImpact = impactSpeed >= 10;
  const severeImpact = impactSpeed >= 18;
  let surface;
  let sign;
  let x;
  let y = clamp(local.y || .7, .5, 1.32);

  if (zone === 'left' || zone === 'right') {
    sign = zone === 'left' ? -1 : 1;
    surface = (local.z || 0) * .72;
    surface = clamp(surface, -1.55, 1.55);
    x = sign * 1.13;
    const dent = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 7), damageDentMaterial);
    dent.position.set(x + sign * .035, y, surface);
    dent.scale.set(.075 + wide * .08, tall + .07, long * .7);
    mark.add(dent);
    addDamageBox(mark, .035, .025 + tall * .12, long, damageScratchMaterial, [x + sign * .075, y + .08, surface + (damageRandom(seed, 5) - .5) * .22], [(damageRandom(seed, 6) - .5) * .7, 0, 0]);
    addDamageBox(mark, .04, .035, long * .66, damageBareMetalMaterial, [x + sign * .078, y - .08, surface + .12], [(damageRandom(seed, 7) - .5) * .45, 0, 0]);
    if (damageRandom(seed, 8) > .36) addDamageBox(mark, .07, .13 + tall, .2 + wide * .4, damageTransferMaterial, [x + sign * .07, y + .12, surface + .16], [0, damageRandom(seed, 9) * .8, damageRandom(seed, 10) * .45]);
    if (hardImpact) addDamageCracks(mark, zone, x, y, surface, sign, seed);
  } else {
    sign = zone === 'front' ? 1 : -1;
    surface = sign * 2.17;
    x = clamp(local.x || 0, -.72, .72);
    const dent = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 7), damageDentMaterial);
    dent.position.set(x, y, surface + sign * .035);
    dent.scale.set(wide, tall + .055, .075 + long * .06);
    mark.add(dent);
    addDamageBox(mark, long, .027 + tall * .1, .035, damageScratchMaterial, [x + (damageRandom(seed, 5) - .5) * .18, y + .08, surface + sign * .075], [0, 0, (damageRandom(seed, 6) - .5) * .58]);
    addDamageBox(mark, long * .64, .038, .045, damageBareMetalMaterial, [x - .06, y - .09, surface + sign * .08], [0, 0, (damageRandom(seed, 7) - .5) * .38]);
    if (damageRandom(seed, 8) > .32) addDamageBox(mark, .18 + wide * .45, .11 + tall, .07, damageTransferMaterial, [x + .2, y + .1, surface + sign * .065], [0, damageRandom(seed, 9) * .7, damageRandom(seed, 10) * .5]);
    if (hardImpact) addDamageCracks(mark, zone, x, y, surface, sign, seed);
  }

  if (hardImpact) {
    // A folded panel lip makes a hard strike read as deformation rather than a decal.
    if (zone === 'left' || zone === 'right') {
      addDamageBox(mark, .065, .08 + tall * .7, .5 + wide, damageDentMaterial, [sign * 1.17, y - .18, surface + .18], [damageRandom(seed, 11) * .55, 0, damageRandom(seed, 12) * .65]);
    } else {
      addDamageBox(mark, .5 + wide, .075 + tall * .5, .07, damageDentMaterial, [x - .1, y - .18, surface + sign * .08], [0, damageRandom(seed, 11) * .55, damageRandom(seed, 12) * .55]);
    }
  }
  if (severeImpact) {
    // A displaced fragment and a dark lamp/trim void sell a high-energy impact.
    const fragment = zone === 'left' || zone === 'right'
      ? [zone === 'left' ? -1.2 : 1.2, y + .08, surface + .32]
      : [x + .34, y + .06, surface + sign * .1];
    addDamageBox(mark, .11 + damageRandom(seed, 13) * .16, .08 + damageRandom(seed, 14) * .13, .16 + damageRandom(seed, 15) * .3, damageTransferMaterial, fragment, [damageRandom(seed, 16), damageRandom(seed, 17), damageRandom(seed, 18)]);
    if (zone === 'front' || zone === 'rear') addDamageBox(mark, .22, .12, .04, damageDentMaterial, [x, y + .16, surface + sign * .08], [0, 0, damageRandom(seed, 19) * .5]);
  }

  if (persist && typeof player !== 'undefined') {
    player.damageSequence = Math.max(player.damageSequence || 0, seed);
    const record = { localPosition: [local.x, local.y, local.z], speed: impactSpeed, zone, seed };
    player.damageRecords = Array.isArray(player.damageRecords) ? player.damageRecords : [];
    player.damageRecords.push(record);
  }
  return mark;
}

function clearVisibleVehicleDamage(vehicleRoot = player.mesh, clearRecords = true) {
  const rig = vehicleRoot?.userData?.damageRig;
  if (rig) {
    rig.userData.marks?.forEach((mark) => mark.traverse((object) => {
      if (object.geometry?.dispose) object.geometry.dispose();
    }));
    rig.userData.marks?.forEach((mark) => rig.remove(mark));
    rig.userData.marks = [];
    rig.userData.impactCount = 0;
  }
  if (clearRecords && typeof player !== 'undefined') player.damageRecords = [];
}

function restoreVisibleDamage() {
  if (!player.mesh || !Array.isArray(player.damageRecords)) return;
  clearVisibleVehicleDamage(player.mesh, false);
  player.damageRecords.forEach((record) => addVisibleDamage(player.mesh, record.speed || 0, record, false));
}

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
  root.userData.headlightMeshes = [];
  root.userData.trafficHeadlights = [];
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
    const head = addMesh(root, new THREE.BoxGeometry(.28, .15, .08), headMaterial.clone(), [x, .78, 2.16]);
    root.userData.headlightMeshes.push(head);
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
  for (const x of [-.7, .7]) {
    const beam = new THREE.PointLight(0xa8dcff, playerCar ? .72 : .42, playerCar ? 10 : 9, 2);
    beam.position.set(x, .86, 2.22);
    beam.visible = playerCar;
    if (playerCar) {
      // The hero headlights are the only vehicle lights allowed to cast shadows;
      // traffic keeps the cheaper illumination path so the night scene stays stable.
      beam.castShadow = true;
      beam.shadow.mapSize.set(256, 256);
      beam.shadow.camera.near = .08;
      beam.shadow.camera.far = 12;
      beam.shadow.bias = -.002;
      beam.shadow.normalBias = .02;
    }
    lightingRig.add(beam);
    if (playerCar) root.userData.headlights.push(beam);
    else root.userData.trafficHeadlights.push(beam);
  }
  root.add(lightingRig);
  root.userData.lightingRig = lightingRig;
  if (playerCar) createDamageRig(root);
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
let trafficLightingElapsed = 0;
const gltfLoader = new GLTFLoader();
const AUTHORED_REGION_ASSETS = [
  { type: 'highlands', url: './assets/regions/northstar_outpost.glb' },
  { type: 'forest', url: './assets/regions/redwood_valley.glb' },
  { type: 'lake', url: './assets/regions/lake_aurora.glb' },
  { type: 'desert', url: './assets/regions/cinder_flats.glb' },
  { type: 'industrial', url: './assets/regions/eastgate.glb' },
  { type: 'rural', url: './assets/regions/southern_crossroads.glb' },
];
const authoredRegionScenes = new Map();

function prepareImportedModel(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    if (!object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!material) return;
      // Bring authored surfaces closer to the procedural palette while retaining
      // their original colors, maps, and modeled detail.
      if (material.isMeshStandardMaterial) {
        material.roughness = clamp(Number.isFinite(material.roughness) ? material.roughness : .72, .24, 1);
        material.metalness = clamp(Number.isFinite(material.metalness) ? material.metalness : .08, 0, .9);
        material.envMapIntensity = Math.max(Number.isFinite(material.envMapIntensity) ? material.envMapIntensity : 0, .72);
        const materialLabel = `${object.name || ''} ${material.name || ''}`;
        if (/(window|neon|emissive|lamp|light|sign)/i.test(materialLabel) && material.emissive && material.color) {
          if (material.emissive.r + material.emissive.g + material.emissive.b < .02) material.emissive.copy(material.color).multiplyScalar(.12);
          material.emissiveIntensity = Math.max(Number.isFinite(material.emissiveIntensity) ? material.emissiveIntensity : 0, .55);
        }
      }
      material.needsUpdate = true;
    });
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
  const preservedDamage = vehicleRoot.userData.damageRig;
  const previousLoaded = vehicleRoot.userData.loadedModel;
  if (previousLoaded) vehicleRoot.remove(previousLoaded);
  vehicleRoot.children.forEach((child) => { if (child !== preservedLighting && child !== preservedDamage) child.visible = false; });
  if (preservedLighting) preservedLighting.visible = true;
  if (preservedDamage) preservedDamage.visible = true;
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

async function loadOptionalAsset(url) {
  try {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok ? loadOneAsset(url) : null;
  } catch (error) {
    return null;
  }
}

function cloneImportedSectorAsset(sourceScene) {
  const clone = sourceScene.clone(true);
  clone.traverse((object) => {
    if (!object.isMesh) return;
    // Sector instances are unloaded independently. Clone geometry so removing a
    // streamed sector never disposes the source scene or another live instance.
    if (object.geometry?.clone) object.geometry = object.geometry.clone();
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return clone;
}

function hydrateAuthoredRegionSector(sector) {
  if (!sector || sector.authoredKit) return;
  const sourceScene = authoredRegionScenes.get(sector.region.type);
  if (!sourceScene) return;
  const distance = Math.hypot(sector.region.x - sector.centerX, sector.region.z - sector.centerZ);
  if (distance > WORLD_SECTOR_SIZE * .8) return;
  const authoredKit = cloneImportedSectorAsset(sourceScene);
  authoredKit.name = `${sector.region.name} authored modular kit`;
  authoredKit.position.set(sector.region.x - sector.centerX, 0, sector.region.z - sector.centerZ);
  sector.group.add(authoredKit);
  sector.authoredKit = authoredKit;
  // The source asset is the final art when available. Deterministic geometry
  // stays available for sectors without an exported kit or a failed asset load.
  if (sector.fallbackVisuals) sector.fallbackVisuals.visible = false;
}

function hydrateAuthoredRegionSectors() {
  worldSectorRegistry.forEach((sector) => hydrateAuthoredRegionSector(sector));
}

async function loadBlenderAssets() {
  const fleetStyles = ['hatch', 'supercar', 'suv', 'pickup', 'wagon', 'classic', 'ev', 'sport'];
  const results = await Promise.allSettled([
    loadOneAsset('./assets/aurora_bay_environment.glb'),
    loadOneAsset('./assets/midnight_gt.glb'),
    ...fleetStyles.map((style) => loadOneAsset(`./assets/fleet/${style}.glb`)),
    ...AUTHORED_REGION_ASSETS.map(({ url }) => loadOptionalAsset(url)),
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
  const regionAssetOffset = 2 + fleetStyles.length;
  AUTHORED_REGION_ASSETS.forEach((entry, index) => {
    const result = results[regionAssetOffset + index];
    if (result?.status === 'fulfilled' && result.value?.scene) {
      const sourceScene = prepareImportedModel(result.value.scene);
      sourceScene.name = `${entry.type} authored modular region kit`;
      authoredRegionScenes.set(entry.type, sourceScene);
    }
  });
  hydrateAuthoredRegionSectors();
  applyPlayerVehicleStyle(player.selectedStyle, false, true);
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
  const nearest = nearestMountainRoadPoint(x, z);
  const villageRadius = Math.hypot(x - mountainVillagePosition.x, z - mountainVillagePosition.z);
  // Pinewatch branches are laid over the same pass grade, so the village
  // streets keep their elevation even where they leave the main switchback.
  return nearest.distance < 6.2 || (villageRadius < 38 && nearest.distance < 46);
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
  ribbon.receiveShadow = material !== mats.roadSheen;
  if (material === mats.roadSheen) {
    ribbon.renderOrder = 1;
    roadSheenMeshes.push(ribbon);
  }
  parent.add(ribbon);
  return ribbon;
}

function addMountainRoadDetails() {
  addMountainPathRibbon(mountainRoadPoints, 10.6, mats.mountainShoulder, 0);
  addMountainPathRibbon(mountainRoadPoints, 8.8, mats.mountainRoad, .045);
  addMountainPathRibbon(mountainRoadPoints, 8.52, mats.roadSheen, .064);
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

function createMountainPine(x, z, scale = 1, seed = 1) {
  const group = new THREE.Group();
  group.name = `Mountain roadside pine ${seed}`;
  group.position.set(x, mountainRoadHeightAt(x, z) - .02, z);
  group.rotation.y = randomFrom(seed * 1.9) * Math.PI * 2;
  group.scale.setScalar(scale);
  const trunkHeight = 1.35;
  const trunk = addMesh(group, new THREE.CylinderGeometry(.12, .2, trunkHeight, 7), mats.treeTrunk, [0, trunkHeight / 2, 0], { castShadow: true });
  trunk.castShadow = true;
  const foliage = randomFrom(seed + 8) > .48 ? mats.treeLeaf : mats.treeLeafDark;
  const foliageGroup = new THREE.Group();
  foliageGroup.position.y = .95;
  addMesh(foliageGroup, new THREE.ConeGeometry(1.05, 2.2, 8), foliage, [0, .75, 0], { castShadow: true });
  addMesh(foliageGroup, new THREE.ConeGeometry(.82, 1.8, 8), foliage, [0, 1.8, 0], { castShadow: true });
  addMesh(foliageGroup, new THREE.ConeGeometry(.56, 1.35, 8), foliage, [0, 2.7, 0], { castShadow: true });
  group.add(foliageGroup);
  mountainRoadForest.add(group);
  registerFoliageWind(mountainRoadForest, foliageGroup, .028 + randomFrom(seed + 14) * .022, seed * .41);
  return group;
}

function buildMountainRoadForest() {
  let seed = 1200;
  for (let index = 1; index < mountainRoadPoints.length; index += 1) {
    const start = mountainRoadPoints[index - 1];
    const end = mountainRoadPoints[index];
    const segment = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
    const length = segment.length();
    if (length < 1) continue;
    const tangent = segment.normalize();
    const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
    for (let distance = 7; distance < length - 2; distance += 11 + randomFrom(seed++) * 4) {
      const center = start.clone().lerp(end, distance / length);
      const villageDistance = Math.hypot(center.x - mountainVillagePosition.x, center.z - mountainVillagePosition.z);
      // Keep Pinewatch open and small-scale; the heavier tree wall belongs on the pass.
      const nearVillage = villageDistance < 52;
      for (const side of [-1, 1]) {
        const outerOffset = nearVillage ? 18 + randomFrom(seed++) * 6 : 10.5 + randomFrom(seed++) * 11;
        const treePosition = center.clone().addScaledVector(normal, side * outerOffset);
        if (Math.hypot(treePosition.x - mountainVillagePosition.x, treePosition.z - mountainVillagePosition.z) < 34) continue;
        const treeScale = nearVillage ? .72 + randomFrom(seed++) * .28 : .82 + randomFrom(seed++) * .58;
        createMountainPine(treePosition.x, treePosition.z, treeScale, seed++);
      }
      if (!nearVillage && randomFrom(seed++) > .46) {
        const outerOffset = 25 + randomFrom(seed++) * 12;
        const treePosition = center.clone().addScaledVector(normal, (randomFrom(seed++) > .5 ? 1 : -1) * outerOffset);
        createMountainPine(treePosition.x, treePosition.z, .72 + randomFrom(seed++) * .4, seed++);
      }
    }
  }
}

function createMountainDelineator(x, z, heading, side = 1) {
  const group = new THREE.Group();
  group.name = 'Mountain road reflective delineator';
  group.position.set(x, mountainRoadHeightAt(x, z), z);
  group.rotation.y = heading;
  addMesh(group, new THREE.CylinderGeometry(.045, .07, .82, 6), mats.buildingFrame, [0, .41, 0], { castShadow: true });
  addMesh(group, new THREE.BoxGeometry(.24, .16, .055), polishMats.reflector, [0, .7, .035]);
  const reflectorMaterial = side > 0 ? polishMats.amberCore : polishMats.cyanCore;
  addMesh(group, new THREE.BoxGeometry(.13, .05, .035), reflectorMaterial, [0, .71, .075]);
  mountainRoadLighting.add(group);
  return group;
}

function buildMountainRoadLighting() {
  for (let index = 1; index < mountainRoadPoints.length; index += 1) {
    const start = mountainRoadPoints[index - 1];
    const end = mountainRoadPoints[index];
    const segment = new THREE.Vector3(end.x - start.x, 0, end.z - start.z);
    const length = segment.length();
    if (length < 1) continue;
    const heading = Math.atan2(segment.x, segment.z);
    const normal = new THREE.Vector3(segment.z, 0, -segment.x).normalize();
    for (let distance = 10; distance < length - 4; distance += 18) {
      const center = start.clone().lerp(end, distance / length);
      if (Math.hypot(center.x - mountainVillagePosition.x, center.z - mountainVillagePosition.z) < 44) continue;
      [-1, 1].forEach((side) => {
        const post = center.clone().addScaledVector(normal, side * 5.55);
        createMountainDelineator(post.x, post.z, heading, side);
      });
    }
  }
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

function homeGroundHeight(home) {
  return home.style === 'shack' || home.style === 'cottage' ? (home.groundY ?? home.spawn[1]) : .02;
}

function createHomeProperty(home, index = 0) {
  const [x, z] = home.position || [home.spawn[0], home.spawn[2] + 4];
  const groundY = homeGroundHeight(home);
  const group = new THREE.Group();
  group.name = `${home.name} // player property`;
  group.position.set(x, groundY, z);
  const isFlat = home.style === 'flat';
  const width = home.style === 'shack' ? 6.8 : home.style === 'cottage' ? 8.2 : isFlat ? 7.2 : 8.8;
  const depth = home.style === 'shack' ? 5.1 : home.style === 'cottage' ? 6.1 : isFlat ? 5.8 : 6.8;
  const height = home.style === 'shack' ? 3.2 : home.style === 'cottage' ? 3.8 : isFlat ? 6.3 : 4.3;
  const wallMaterial = home.style === 'shack' ? mats.cabinWood : home.style === 'cottage' ? mats.cabinWood : new THREE.MeshStandardMaterial({ color: isFlat ? 0x3d4a55 : 0x4f5e58, roughness: .92 });
  const roofMaterial = home.style === 'flat' ? mats.mountainRockLit : mats.cabinRoof;
  addMesh(group, new THREE.BoxGeometry(width, height, depth), wallMaterial, [0, height / 2, 0], { castShadow: true, receiveShadow: true });
  if (isFlat) {
    addMesh(group, new THREE.BoxGeometry(width + .35, .34, depth + .35), roofMaterial, [0, height + .17, 0], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .7, .04, .05), mats.villageLight, [0, height * .68, depth / 2 + .04]);
  } else {
    addMesh(group, new THREE.ConeGeometry(Math.max(width, depth) * .72, height * .52, 4), roofMaterial, [0, height + height * .22, 0], { rotation: [0, Math.PI / 4, 0], castShadow: true });
  }
  const doorMaterial = home.style === 'shack' ? mats.sidewalkDark : mats.cabinRoof;
  addMesh(group, new THREE.BoxGeometry(.72, 1.55, .07), doorMaterial, [0, .78, depth / 2 + .045], { castShadow: true });
  const windowMaterial = home.style === 'shack' ? mats.windowAmber : mats.windowCyan;
  addMesh(group, new THREE.BoxGeometry(1.0, .62, .055), windowMaterial, [-width * .27, height * .55, depth / 2 + .05]);
  addMesh(group, new THREE.BoxGeometry(1.0, .62, .055), home.style === 'shack' ? mats.windowAmber : mats.windowBlue, [width * .27, height * .55, depth / 2 + .05]);
  if (home.style === 'shack') {
    addMesh(group, new THREE.BoxGeometry(width * .56, .12, 1.05), mats.mountainShoulder, [0, .08, depth / 2 + .58], { receiveShadow: true });
    addMesh(group, new THREE.CylinderGeometry(.14, .18, 1.2, 7), mats.cabinRoof, [-width * .34, .62, depth / 2 + .78], { castShadow: true });
    addMesh(group, new THREE.BoxGeometry(.9, .08, .18), mats.sidewalkDark, [width * .27, .25, depth / 2 + .12]);
  } else if (home.style === 'cottage') {
    addMesh(group, new THREE.BoxGeometry(width * .6, .14, 1.25), mats.mountainShoulder, [0, .1, depth / 2 + .66], { receiveShadow: true });
    [-width * .25, width * .25].forEach((px) => addMesh(group, new THREE.CylinderGeometry(.05, .07, 1.1, 6), mats.guardrail, [px, .62, depth / 2 + .94], { castShadow: true }));
  } else if (isFlat) {
    for (let level = 0; level < 2; level += 1) {
      addMesh(group, new THREE.BoxGeometry(width * .58, .06, .06), mats.windowAmber, [0, 1.2 + level * 2.3, depth / 2 + .05]);
    }
    addMesh(group, new THREE.BoxGeometry(.22, height * .58, .22), mats.guardrail, [width * .42, height * .45, depth / 2 + .2]);
  } else {
    addMesh(group, new THREE.BoxGeometry(width * .58, .14, 1.25), mats.mountainShoulder, [0, .1, depth / 2 + .68], { receiveShadow: true });
    addMesh(group, new THREE.BoxGeometry(width * .45, .12, depth * .55), mats.cabinRoof, [0, height + .15, -depth * .08], { castShadow: true });
  }
  const porchLight = new THREE.PointLight(0xffb36d, home.style === 'shack' ? .65 : 1.05, 8, 2);
  porchLight.position.set(0, 2.15, depth / 2 + .28);
  group.add(porchLight);
  const label = makeLabel(home.price ? 'FOR SALE' : 'STARTER HOME', home.price ? '#ff9d50' : '#d6fa6a', .32);
  label.position.set(0, height + (isFlat ? .8 : 1.2), depth / 2 + .1);
  group.add(label);
  const homeObstacle = addObstacle(x, z, width / 2 + .65, depth / 2 + .65, 'home-property', group);
  homeObstacle.homeId = home.id;
  homeProperties.add(group);
  const record = { group, label, porchLight, homeObstacle, homeId: home.id, index };
  homePropertyRecords.set(home.id, record);
  return record;
}

function buildHomeProperties() {
  HOME_CATALOG.forEach((home, index) => {
    if (home.style === 'shack' || home.style === 'cottage') {
      const villageY = mountainRoadHeightAt(home.spawn[0], home.spawn[2]);
      home.spawn[1] = villageY + .08;
      home.groundY = mountainRoadHeightAt(home.position[0], home.position[1]);
    }
    createHomeProperty(home, index);
  });
  spawnPlayerAtHome(true);
}

function selectedHomeEntry() {
  return HOME_CATALOG.find((home) => home.id === player.selectedHome) || HOME_CATALOG[0];
}

function spawnPlayerAtHome(forceHome = false) {
  const home = selectedHomeEntry();
  const hasResume = !forceHome && Array.isArray(player.resumePosition) && player.resumePosition.length >= 3;
  if (hasResume) {
    player.position.set(...player.resumePosition.slice(0, 3));
    player.heading = Number.isFinite(player.resumeHeading) ? player.resumeHeading : (home.heading || 0);
    player.resumePosition = null;
  } else {
    player.resumePosition = null;
    player.position.set(home.spawn[0], home.spawn[1], home.spawn[2]);
    player.lastSafePosition.copy(player.position);
    player.heading = home.heading || 0;
  }
  player.speed = 0;
  player.mesh.position.copy(player.position);
  player.mesh.rotation.set(0, player.heading, 0);
  return home;
}

function updateHomePropertyVisuals() {
  homePropertyRecords.forEach((record, id) => {
    const owned = player.ownedHomes?.includes(id);
    const selected = player.selectedHome === id;
    if (record.label?.material) record.label.material.opacity = selected ? 1 : owned ? .72 : .52;
    if (record.porchLight) record.porchLight.intensity = selected ? 1.7 : owned ? 1.05 : .55;
  });
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
  buildMountainRoadForest();
  buildMountainRoadLighting();
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
    addMountainPathRibbon(points, 11.08, mats.roadSheen, .068, regionalRoadGroup);
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

function registerFoliageWind(owner, object, amplitude = .035, phase = 0) {
  owner.userData.windObjects = owner.userData.windObjects || [];
  owner.userData.windObjects.push({
    object,
    amplitude,
    phase,
    baseX: object.rotation.x,
    baseZ: object.rotation.z,
  });
  return object;
}

function updateFoliageWind(time) {
  const seconds = time * .001;
  const updateOwner = (owner) => {
    owner?.userData?.windObjects?.forEach(({ object, amplitude, phase, baseX, baseZ }) => {
      if (!object) return;
      object.rotation.x = baseX + Math.sin(seconds * .72 + phase) * amplitude * .42;
      object.rotation.z = baseZ + Math.sin(seconds * .91 + phase * 1.37) * amplitude;
    });
  };
  updateOwner(mountainRoadForest);
  if (typeof worldSectorRegistry !== 'undefined') {
    worldSectorRegistry.forEach((sector) => updateOwner(sector.fallbackVisuals));
  }
}

function addSectorConifer(group, x, z, scale, seed) {
  const tree = new THREE.Group();
  tree.position.set(x, 0, z);
  tree.rotation.y = randomFrom(seed * 1.7) * Math.PI * 2;
  tree.scale.setScalar(scale);
  const foliage = randomFrom(seed + 6) > .5 ? mats.treeLeaf : mats.treeLeafDark;
  addMesh(tree, new THREE.CylinderGeometry(.12, .2, 1.25, 7), mats.treeTrunk, [0, .62, 0], { castShadow: true });
  const foliageGroup = new THREE.Group();
  foliageGroup.position.y = .54;
  addMesh(foliageGroup, new THREE.ConeGeometry(.92, 1.85, 8), foliage, [0, .88, 0], { castShadow: true });
  addMesh(foliageGroup, new THREE.ConeGeometry(.7, 1.55, 8), foliage, [0, 1.81, 0], { castShadow: true });
  addMesh(foliageGroup, new THREE.ConeGeometry(.46, 1.1, 8), foliage, [0, 2.64, 0], { castShadow: true });
  tree.add(foliageGroup);
  registerFoliageWind(group, foliageGroup, .035 + randomFrom(seed + 10) * .025, seed * .37);
  group.add(tree);
  return tree;
}

function addSectorTree(group, x, z, scale, seed) {
  if (seed % 3 === 0) return addSectorConifer(group, x, z, scale, seed);
  addMesh(group, new THREE.CylinderGeometry(.16, .25, 1.45, 7), mats.treeTrunk, [x, .72, z], { castShadow: true });
  const material = randomFrom(seed) > .5 ? mats.treeLeaf : mats.treeLeafDark;
  const foliageGroup = new THREE.Group();
  foliageGroup.position.set(x, .86, z);
  addMesh(foliageGroup, new THREE.IcosahedronGeometry(1.1, 1), material, [0, 1.09, 0], { scale: [scale, scale, scale], castShadow: true });
  group.add(foliageGroup);
  registerFoliageWind(group, foliageGroup, .022 + randomFrom(seed + 14) * .018, seed * .29);
  return foliageGroup;
}

function addRegionalFence(group, x, z, heading, seed) {
  const fence = new THREE.Group();
  fence.position.set(x, 0, z);
  fence.rotation.y = heading;
  const length = 4.6 + randomFrom(seed) * 2.5;
  [-1, 1].forEach((side) => {
    addMesh(fence, new THREE.CylinderGeometry(.055, .075, .9, 6), mats.cabinWood, [0, .45, side * length / 2], { castShadow: true });
  });
  addMesh(fence, new THREE.BoxGeometry(.08, .08, length), mats.cabinWood, [0, .58, 0], { castShadow: true });
  addMesh(fence, new THREE.BoxGeometry(.07, .07, length), mats.cabinWood, [0, .32, 0], { castShadow: true });
  group.add(fence);
  return fence;
}

function addDesertCactus(group, x, z, scale, seed) {
  const cactus = new THREE.Group();
  cactus.position.set(x, 0, z);
  cactus.rotation.y = randomFrom(seed) * Math.PI * 2;
  cactus.scale.setScalar(scale);
  addMesh(cactus, new THREE.CylinderGeometry(.14, .2, 1.25, 7), mats.desertPlant, [0, .63, 0], { castShadow: true });
  if (seed % 2 === 0) {
    addMesh(cactus, new THREE.CylinderGeometry(.07, .09, .55, 6), mats.desertPlant, [.23, .62, 0], { rotation: [0, 0, -Math.PI / 2], castShadow: true });
    addMesh(cactus, new THREE.CylinderGeometry(.07, .09, .48, 6), mats.desertPlant, [-.23, .78, 0], { rotation: [0, 0, Math.PI / 2], castShadow: true });
  }
  group.add(cactus);
  return cactus;
}

function addLakeReedCluster(group, x, z, scale, seed) {
  const reeds = new THREE.Group();
  reeds.position.set(x, 0, z);
  for (let index = 0; index < 5; index += 1) {
    const offsetX = (randomFrom(seed + index * 3) - .5) * .7;
    const offsetZ = (randomFrom(seed + index * 5) - .5) * .7;
    addMesh(reeds, new THREE.CylinderGeometry(.018, .035, .75 + randomFrom(seed + index * 7) * .5, 5), mats.treeLeafDark, [offsetX, .42, offsetZ], { rotation: [randomFrom(seed + index) * .18 - .09, 0, randomFrom(seed + index + 1) * .2 - .1], castShadow: true });
  }
  reeds.scale.setScalar(scale);
  group.add(reeds);
  registerFoliageWind(group, reeds, .055 + randomFrom(seed + 22) * .035, seed * .18);
  return reeds;
}

function addIndustrialRoadsideKit(group, x, z, heading, seed) {
  const kit = new THREE.Group();
  kit.position.set(x, 0, z);
  kit.rotation.y = heading;
  addMesh(kit, new THREE.BoxGeometry(2.6, .72, 4.2), mats.asphaltEdge, [0, .36, 0], { castShadow: true, receiveShadow: true });
  addMesh(kit, new THREE.BoxGeometry(2.15, .06, .06), polishMats.pinkCore, [0, .74, -1.5]);
  addMesh(kit, new THREE.CylinderGeometry(.1, .1, 3.2, 8), mats.guardrail, [1.3, 1.12, .25], { rotation: [Math.PI / 2, 0, 0], castShadow: true });
  addMesh(kit, new THREE.CylinderGeometry(.1, .1, 3.2, 8), mats.guardrail, [-1.3, 1.12, -.25], { rotation: [Math.PI / 2, 0, 0], castShadow: true });
  if (seed % 2 === 0) addMesh(kit, new THREE.BoxGeometry(.12, 1.7, .12), mats.buildingFrame, [0, .85, -1.65], { castShadow: true });
  group.add(kit);
  return kit;
}

function addSectorStructure(group, sector, x, z, width, depth, height, seed) {
  const material = sector.region.type === 'industrial' ? mats.asphaltEdge : sector.region.type === 'desert' ? mats.cabinWood : mats.mountainRockLit;
  const accent = polishAccentForRegion(sector.region.type);
  const accentMaterial = polishCoreByAccent[accent];
  addMesh(group, new THREE.BoxGeometry(width, height, depth), material, [x, height / 2, z], { castShadow: true, receiveShadow: true });
  if (sector.region.type !== 'industrial') {
    addMesh(group, new THREE.ConeGeometry(Math.max(width, depth) * .7, height * .45, 4), mats.cabinRoof, [x, height + height * .2, z], { rotation: [0, Math.PI / 4, 0], castShadow: true });
  } else {
    addMesh(group, new THREE.BoxGeometry(width * .55, .08, depth * .08), mats.lamp, [x, height * .7, z + depth / 2 + .04]);
  }
  // A restrained facade band is enough to give remote structures a purpose at
  // night: cyan on water/forest roads, amber in the flats, pink at Eastgate.
  const bandWidth = Math.max(1.4, Math.min(width * .62, 5.2));
  const bandY = Math.max(1.1, Math.min(height * .62, height - .35));
  addMesh(group, new THREE.BoxGeometry(bandWidth, .13, .045), accentMaterial, [x, bandY, z + depth / 2 + .05]);
  if (seed % 2 === 0) addMesh(group, new THREE.BoxGeometry(.07, Math.max(.4, height * .38), .05), accentMaterial, [x - bandWidth * .38, height * .48, z + depth / 2 + .055]);
  const obstacle = addObstacle(sector.centerX + x, sector.centerZ + z, width / 2 + .5, depth / 2 + .5, `${sector.region.type}-structure`);
  obstacle.sectorKey = sector.key;
  sector.obstacles.push(obstacle);
}

function addRegionalRoadsideDetails(group, sector, seed) {
  const minX = sector.centerX - WORLD_SECTOR_SIZE / 2;
  const maxX = sector.centerX + WORLD_SECTOR_SIZE / 2;
  const minZ = sector.centerZ - WORLD_SECTOR_SIZE / 2;
  const maxZ = sector.centerZ + WORLD_SECTOR_SIZE / 2;
  const accent = polishAccentForRegion(sector.region.type);
  let placed = 0;
  regionalRoutes.forEach((route, routeIndex) => {
    if (placed >= 8) return;
    for (let index = 1; index < route.points.length && placed < 8; index += 1) {
      const [startX, startZ] = route.points[index - 1];
      const [endX, endZ] = route.points[index];
      const segment = new THREE.Vector3(endX - startX, 0, endZ - startZ);
      const length = segment.length();
      if (length < 1) continue;
      const heading = Math.atan2(segment.x, segment.z);
      const tangent = segment.normalize();
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
      for (let distance = 58; distance < length - 8 && placed < 8; distance += 132) {
        const center = new THREE.Vector3(startX, 0, startZ).lerp(new THREE.Vector3(endX, 0, endZ), distance / length);
        const side = randomFrom(seed + routeIndex * 13 + index * 7 + distance) > .5 ? 1 : -1;
        center.addScaledVector(normal, side * 8.25);
        if (center.x < minX || center.x > maxX || center.z < minZ || center.z > maxZ) continue;
        if (Math.abs(center.x) < 180 && Math.abs(center.z) < 180) continue;
        createRoadReflector(center.x - sector.centerX, center.z - sector.centerZ, heading, accent, group);
        placed += 1;
      }
    }
  });
}

function addBiomeRoadsideDressing(group, sector, seed) {
  if (sector.region.type === 'city' || sector.region.type === 'mountain') return;
  const biome = sector.region.type;
  let placed = 0;
  regionalRoutes.forEach((route, routeIndex) => {
    if (placed >= 14) return;
    for (let index = 1; index < route.points.length && placed < 14; index += 1) {
      const [startX, startZ] = route.points[index - 1];
      const [endX, endZ] = route.points[index];
      const segment = new THREE.Vector3(endX - startX, 0, endZ - startZ);
      const length = segment.length();
      if (length < 1) continue;
      const heading = Math.atan2(segment.x, segment.z);
      const tangent = segment.normalize();
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x);
      const spacing = biome === 'forest' ? 92 : biome === 'highlands' ? 112 : 136;
      for (let distance = 32; distance < length - 14 && placed < 14; distance += spacing) {
        const center = new THREE.Vector3(startX, 0, startZ).lerp(new THREE.Vector3(endX, 0, endZ), distance / length);
        const side = ((placed + routeIndex + index) % 2 ? 1 : -1);
        const offset = biome === 'forest' || biome === 'highlands' ? 13 + randomFrom(seed + placed * 9) * 12 : 10 + randomFrom(seed + placed * 11) * 9;
        const prop = center.clone().addScaledVector(normal, side * offset);
        if (Math.abs(prop.x - sector.centerX) > WORLD_SECTOR_SIZE / 2 - 10 || Math.abs(prop.z - sector.centerZ) > WORLD_SECTOR_SIZE / 2 - 10) continue;
        const localX = prop.x - sector.centerX;
        const localZ = prop.z - sector.centerZ;
        if (biome === 'forest') {
          addSectorConifer(group, localX, localZ, .78 + randomFrom(seed + placed * 3) * .52, seed + placed * 17);
          if (placed % 3 === 0) addSectorTree(group, localX + side * 4.5, localZ + 2.5, .52 + randomFrom(seed + placed) * .3, seed + placed * 21);
        } else if (biome === 'highlands') {
          addSectorConifer(group, localX, localZ, .72 + randomFrom(seed + placed * 5) * .48, seed + placed * 19);
        } else if (biome === 'rural') {
          addRegionalFence(group, localX, localZ, heading, seed + placed * 13);
        } else if (biome === 'desert') {
          addDesertCactus(group, localX, localZ, .82 + randomFrom(seed + placed * 7) * .58, seed + placed * 23);
        } else if (biome === 'industrial') {
          addIndustrialRoadsideKit(group, localX, localZ, heading, seed + placed * 29);
        } else if (biome === 'lake') {
          addLakeReedCluster(group, localX, localZ, .72 + randomFrom(seed + placed * 4) * .4, seed + placed * 31);
        }
        placed += 1;
      }
    }
  });
}

function createWorldSector(sectorX, sectorZ) {
  const key = worldSectorKey(sectorX, sectorZ);
  const centerX = (sectorX + .5) * WORLD_SECTOR_SIZE;
  const centerZ = (sectorZ + .5) * WORLD_SECTOR_SIZE;
  const region = worldRegionNear(centerX, centerZ);
  const group = new THREE.Group();
  group.name = `World sector ${key} // ${region.name}`;
  group.position.set(centerX, 0, centerZ);
  const fallbackVisuals = new THREE.Group();
  fallbackVisuals.name = `${region.name} deterministic fallback visuals`;
  group.add(fallbackVisuals);
  const sector = { key, group, centerX, centerZ, region, obstacles: [], fallbackVisuals, authoredKit: null };
  addMesh(fallbackVisuals, new THREE.PlaneGeometry(WORLD_SECTOR_SIZE, WORLD_SECTOR_SIZE), sectorGroundMaterial(region.type), [0, -.28, 0], { rotation: [-Math.PI / 2, 0, 0], receiveShadow: true });
  const lakeCore = region.type === 'lake'
    && Math.abs(centerX - region.x) < WORLD_SECTOR_SIZE / 2
    && Math.abs(centerZ - region.z) < WORLD_SECTOR_SIZE / 2;
  if (lakeCore) {
    const lakeWidth = 360;
    const lakeDepth = 270;
    addMesh(fallbackVisuals, new THREE.PlaneGeometry(lakeWidth, lakeDepth, 72, 54), mats.water, [region.x - centerX, -.07, region.z - centerZ], { rotation: [-Math.PI / 2, 0, 0] });
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
      addSectorTree(fallbackVisuals, localX, localZ, .75 + randomFrom(seed + index + 70) * .55, seed + index);
    } else if (region.type === 'lake') {
      addMesh(fallbackVisuals, new THREE.ConeGeometry(1.5 + randomFrom(seed + index) * 1.6, 3.2 + randomFrom(seed + index + 12) * 2.6, 7), mats.mountainRock, [localX, 1.45, localZ], { castShadow: true });
    } else {
      addSectorStructure(fallbackVisuals, sector, localX, localZ, 8 + randomFrom(seed + index + 80) * 10, 7 + randomFrom(seed + index + 90) * 8, 3 + randomFrom(seed + index + 100) * 7, seed + index);
    }
  }
  addRegionalRoadsideDetails(fallbackVisuals, sector, seed + 400);
  addBiomeRoadsideDressing(fallbackVisuals, sector, seed + 800);
  streamedWorld.add(group);
  worldSectorRegistry.set(key, sector);
  hydrateAuthoredRegionSector(sector);
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

const menuShowcaseSectorKeys = new Set();

function ensureMenuShowcaseSectors() {
  if (!worldBuilt) return;
  MENU_SHOWCASE_SCENES.forEach((showcase) => {
    [showcase.camera, showcase.target].forEach(([x, , z]) => {
      const indices = worldSectorIndices(x, z);
      const key = worldSectorKey(indices.x, indices.z);
      if (!worldSectorRegistry.has(key)) createWorldSector(indices.x, indices.z);
      menuShowcaseSectorKeys.add(key);
    });
  });
}

function buildWorld() {
  buildSky();
  buildGroundAndWater();
  buildRoads();
  populateCity();
  populateStreetLights();
  buildLandmarks();
  buildVisualPolish();
  buildRoadInfrastructure();
  createTraffic();
  buildMountainWorld();
  addRegionalRoadNetwork();
  createRegionalTraffic();
  createSpeedRadarSites();
}

const player = {
  mesh: createCar(new THREE.Color(vehicleCatalogEntry(PROGRESSION_CONFIG.starterStyle).paint).getHex(), new THREE.Color(vehicleCatalogEntry(PROGRESSION_CONFIG.starterStyle).accent).getHex(), true, PROGRESSION_CONFIG.starterStyle),
  position: new THREE.Vector3(0, .02, 0),
  speed: 0,
  heading: 0,
  distance: 0,
  rep: 1280,
  cash: 420,
  selectedStyle: PROGRESSION_CONFIG.starterStyle,
  ownedCars: [PROGRESSION_CONFIG.starterStyle],
  completedDeliveries: 0,
  paint: vehicleCatalogEntry(PROGRESSION_CONFIG.starterStyle).paint,
  condition: 100,
  damageRecords: [],
  damageSequence: 0,
  disabledTimer: 0,
  submerged: false,
  waterRecoveryPending: false,
  waterBody: '',
  waterSinkTime: 0,
  recoveryCost: 0,
  lastSafePosition: new THREE.Vector3(132, 18.58, 91.2),
  resumePosition: null,
  resumeHeading: 0,
  ownedHomes: ['pinewatch-shack'],
  selectedHome: 'pinewatch-shack',
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

// Driving feel is intentionally separated from simulation state. The car remains
// deterministic for collisions and saves, while the presentation layer can add
// suspension, body load, camera lag, and impact feedback without changing mission
// rules or vehicle progression.
const drivingPresentation = {
  visualSpeed: 0,
  steering: 0,
  bodyRoll: 0,
  bodyPitch: 0,
  suspension: 0,
  time: 0,
  cameraShake: 0,
};

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
let activeSaveSlot = 1;
let worldBuilt = false;
let saveSelectOpen = false;
let phoneOpen = false;
let phoneMessages = [];
let phoneMessageSequence = 0;
let phoneSelectedMessageId = '';
let phoneNotificationTimer = null;
let roadsideStopHistory = [];
let roadsideStopSequence = 0;
let pendingSavedRun = null;
let menuShowcaseIndex = 0;
let menuShowcaseElapsed = 0;
let menuShowcaseTransition = 1;
let garageCarouselIndex = 0;
let qualityMode = 'HIGH';
const upgradeConfig = {
  engine: { costs: [240, 420, 700] },
  grip: { costs: [180, 320, 540] },
};

function vehicleUnlockRule(style) {
  return PROGRESSION_CONFIG.vehicleUnlocks.find((rule) => rule.style === style) || null;
}

function isVehicleUnlocked(style) {
  const rule = vehicleUnlockRule(style);
  return !rule || player.completedDeliveries >= rule.deliveries;
}

function nextVehicleUnlockRule() {
  return [...PROGRESSION_CONFIG.vehicleUnlocks]
    .sort((a, b) => a.deliveries - b.deliveries)
    .find((rule) => rule.deliveries > player.completedDeliveries && !player.ownedCars.includes(rule.style)) || null;
}

function deliveryMilestoneCopy() {
  const next = nextVehicleUnlockRule();
  if (!next) return `${player.completedDeliveries} DELIVERIES // FLEET COMPLETE`;
  return `${player.completedDeliveries} / ${next.deliveries} DELIVERIES`;
}

function deliveryMilestoneDetail() {
  const next = nextVehicleUnlockRule();
  if (!next) return 'ALL VEHICLES UNLOCKED';
  const vehicle = VEHICLE_CATALOG.find((entry) => entry.style === next.style);
  return `${Math.max(0, next.deliveries - player.completedDeliveries)} MORE // ${vehicle?.name || next.style.toUpperCase()}`;
}

function grantUnlockedVehicles() {
  const newlyUnlocked = [];
  PROGRESSION_CONFIG.vehicleUnlocks
    .slice()
    .sort((a, b) => a.deliveries - b.deliveries)
    .forEach((rule) => {
      if (player.completedDeliveries < rule.deliveries || player.ownedCars.includes(rule.style)) return;
      if (!VEHICLE_CATALOG.some((vehicle) => vehicle.style === rule.style)) return;
      player.ownedCars.push(rule.style);
      newlyUnlocked.push(rule.style);
    });
  if (!player.ownedCars.includes(PROGRESSION_CONFIG.starterStyle)) player.ownedCars.unshift(PROGRESSION_CONFIG.starterStyle);
  return newlyUnlocked;
}

function announceVehicleUnlocks(styles) {
  if (!styles.length) return;
  const names = styles.map((style) => vehicleCatalogEntry(style).name).join(' + ');
  window.setTimeout(() => showToast('VEHICLE UNLOCKED', names, `${player.completedDeliveries} DELIVERIES`), 420);
}

function registerDeliveryCompletion() {
  player.completedDeliveries += 1;
  setCityDeliveryMission(player.completedDeliveries % CITY_DELIVERY_MISSIONS.length);
  const newlyUnlocked = grantUnlockedVehicles();
  saveProgress();
  updateGarageUi();
  announceVehicleUnlocks(newlyUnlocked);
  return newlyUnlocked;
}

function normalizeSaveSlot(slot) {
  const value = Number(slot);
  return Number.isInteger(value) && value >= 1 && value <= SAVE_SLOT_COUNT ? value : 1;
}

function saveSlotKey(slot) {
  return `${SAVE_SLOT_PREFIX}${normalizeSaveSlot(slot)}`;
}

function readSaveSlot(slot) {
  const normalized = normalizeSaveSlot(slot);
  try {
    const slotRaw = localStorage.getItem(saveSlotKey(normalized));
    if (slotRaw) return JSON.parse(slotRaw);
    // Migrate the original single-save format into slot one without deleting it.
    if (normalized !== 1) return null;
    const legacyRaw = localStorage.getItem(LEGACY_SAVE_KEY);
    if (!legacyRaw) return null;
    const legacy = JSON.parse(legacyRaw);
    return legacy?.saveSlot && legacy.saveSlot !== 1 ? null : legacy;
  } catch (error) {
    console.warn('Save slot read unavailable.', error);
    return null;
  }
}

function latestSaveSlot() {
  try {
    const recorded = normalizeSaveSlot(localStorage.getItem(LATEST_SAVE_KEY));
    if (readSaveSlot(recorded)) return recorded;
  } catch (error) {
    console.warn('Latest save lookup unavailable.', error);
  }
  let latest = 0;
  let latestTime = -1;
  for (let slot = 1; slot <= SAVE_SLOT_COUNT; slot += 1) {
    const saved = readSaveSlot(slot);
    const updatedAt = Number(saved?.updatedAt) || 0;
    if (saved && updatedAt >= latestTime) {
      latest = slot;
      latestTime = updatedAt;
    }
  }
  return latest;
}

function resetProgressStateToDefaults() {
  const starter = HOME_CATALOG[0];
  player.distance = 0;
  player.rep = 1280;
  player.cash = 420;
  player.selectedStyle = PROGRESSION_CONFIG.starterStyle;
  player.ownedCars = [PROGRESSION_CONFIG.starterStyle];
  player.completedDeliveries = 0;
  player.paint = vehicleCatalogEntry(PROGRESSION_CONFIG.starterStyle).paint;
  player.condition = 100;
  player.damageRecords = [];
  player.damageSequence = 0;
  player.disabledTimer = 0;
  player.submerged = false;
  player.waterRecoveryPending = false;
  player.waterBody = '';
  player.waterSinkTime = 0;
  player.recoveryCost = 0;
  player.lastSafePosition.set(starter.spawn[0], starter.spawn[1], starter.spawn[2]);
  player.resumePosition = null;
  player.resumeHeading = starter.heading || 0;
  player.ownedHomes = ['pinewatch-shack'];
  player.selectedHome = 'pinewatch-shack';
  player.speedingTime = 0;
  player.violationCooldown = 0;
  player.trafficViolations = 0;
  player.lastSignalKey = '';
  player.stopObservations = {};
  player.upgrades = { engine: 0, grip: 0 };
  player.collectedCaches = [];
  phoneMessages = [];
  phoneMessageSequence = 0;
  phoneSelectedMessageId = '';
  roadsideStopHistory = [];
  roadsideStopSequence = 0;
  pendingSavedRun = null;
}

function saveProgress() {
  try {
    const payload = {
      cash: player.cash,
      rep: player.rep,
      selectedStyle: player.selectedStyle,
      ownedCars: player.ownedCars,
      completedDeliveries: player.completedDeliveries,
      ownedHomes: player.ownedHomes,
      selectedHome: player.selectedHome,
      paint: player.paint,
      condition: player.condition,
      damageRecords: player.damageRecords,
      position: [player.position.x, player.position.y, player.position.z],
      heading: player.heading,
      lastSafePosition: [player.lastSafePosition.x, player.lastSafePosition.y, player.lastSafePosition.z],
      upgrades: player.upgrades,
      cacheIds: player.collectedCaches,
      waterRecoveryPending: player.waterRecoveryPending,
      waterBody: player.waterBody,
      phoneMessages,
      roadsideStopHistory,
      run: {
        active: cargoRun.active,
        route: cargoRun.route,
        missionId: cargoRun.missionId,
        elapsed: cargoRun.elapsed,
        deadline: cargoRun.deadline,
        exposure: cargoRun.exposure,
        baseCash: cargoRun.baseCash,
        baseRep: cargoRun.baseRep,
        bonusRate: cargoRun.bonusRate,
        outcome: cargoRun.outcome,
        outcomeTitle: cargoRun.outcomeTitle,
        outcomeCopy: cargoRun.outcomeCopy,
        outcomeTimer: cargoRun.outcomeTimer,
        deadlineWarningSent: cargoRun.deadlineWarningSent,
        lastPayout: cargoRun.lastPayout,
        lastEarlyBonus: cargoRun.lastEarlyBonus,
        lastExposurePenalty: cargoRun.lastExposurePenalty,
        cityMissionIndex: cityDeliveryMissionIndex,
        pickupIndex: cargoPickupIndex,
        dropoffIndex: cargoDropoffIndex,
        deliveryState,
        mountainDeliveryState,
      },
      updatedAt: Date.now(),
      saveSlot: activeSaveSlot,
    };
    const serialized = JSON.stringify(payload);
    localStorage.setItem(saveSlotKey(activeSaveSlot), serialized);
    // Keep the original key as a backwards-compatible mirror for existing installs.
    localStorage.setItem(LEGACY_SAVE_KEY, serialized);
    localStorage.setItem(LATEST_SAVE_KEY, String(activeSaveSlot));
  } catch (error) {
    console.warn('Progress save unavailable.', error);
  }
}

function loadProgress(slot = latestSaveSlot()) {
  activeSaveSlot = normalizeSaveSlot(slot || 1);
  resetProgressStateToDefaults();
  const saved = readSaveSlot(activeSaveSlot);
  if (!saved) return false;
  try {
    if (Number.isFinite(saved.cash)) player.cash = saved.cash;
    if (Number.isFinite(saved.rep)) player.rep = saved.rep;
    if (Number.isFinite(saved.completedDeliveries)) player.completedDeliveries = Math.max(0, Math.floor(saved.completedDeliveries));
    if (Array.isArray(saved.ownedHomes)) player.ownedHomes = saved.ownedHomes.filter((id) => HOME_CATALOG.some((home) => home.id === id));
    if (!player.ownedHomes.includes('pinewatch-shack')) player.ownedHomes.unshift('pinewatch-shack');
    if (typeof saved.selectedHome === 'string' && player.ownedHomes.includes(saved.selectedHome)) player.selectedHome = saved.selectedHome;
    if (Array.isArray(saved.ownedCars)) player.ownedCars = saved.ownedCars.filter((style) => VEHICLE_CATALOG.some((vehicle) => vehicle.style === style));
    if (!player.ownedCars.includes(PROGRESSION_CONFIG.starterStyle)) player.ownedCars.unshift(PROGRESSION_CONFIG.starterStyle);
    grantUnlockedVehicles();
    if (typeof saved.selectedStyle === 'string' && player.ownedCars.includes(saved.selectedStyle)) player.selectedStyle = saved.selectedStyle;
    if (typeof saved.paint === 'string' && /^#[0-9a-f]{6}$/i.test(saved.paint)) player.paint = saved.paint;
    if (Number.isFinite(saved.condition)) player.condition = clamp(saved.condition, 1, 100);
    if (Array.isArray(saved.position) && saved.position.length >= 3 && saved.position.every((value) => Number.isFinite(Number(value)))) {
      player.resumePosition = saved.position.slice(0, 3).map((value) => Number(value));
      player.resumeHeading = Number.isFinite(Number(saved.heading)) ? Number(saved.heading) : 0;
    }
    if (Array.isArray(saved.lastSafePosition) && saved.lastSafePosition.length >= 3 && saved.lastSafePosition.every((value) => Number.isFinite(Number(value)))) {
      player.lastSafePosition.set(...saved.lastSafePosition.slice(0, 3).map((value) => Number(value)));
    }
    if (Array.isArray(saved.damageRecords)) {
      player.damageRecords = saved.damageRecords
        .filter((record) => record && Array.isArray(record.localPosition) && record.localPosition.length >= 3)
        .map((record, index) => ({
          localPosition: record.localPosition.slice(0, 3).map((value) => Number(value) || 0),
          speed: clamp(Number(record.speed) || 0, 0, 100),
          zone: ['front', 'rear', 'left', 'right'].includes(record.zone) ? record.zone : 'front',
          seed: Number.isFinite(record.seed) ? record.seed : index + 1,
        }));
      player.damageSequence = player.damageRecords.reduce((highest, record) => Math.max(highest, record.seed), 0);
    }
    if (saved.waterRecoveryPending) {
      player.waterRecoveryPending = true;
      player.submerged = true;
      player.waterBody = typeof saved.waterBody === 'string' ? saved.waterBody : 'water';
      player.recoveryCost = vehicleRecoveryCost();
    }
    if (Array.isArray(saved.cacheIds)) player.collectedCaches = saved.cacheIds.map((id) => Number(id)).filter((id) => Number.isInteger(id));
    if (Array.isArray(saved.phoneMessages)) {
      phoneMessages = saved.phoneMessages
        .filter((message) => message && typeof message.subject === 'string' && typeof message.body === 'string')
        .slice(0, 24)
        .map((message, index) => ({
          id: String(message.id || `saved-${index}`),
          key: typeof message.key === 'string' ? message.key : '',
          missionId: typeof message.missionId === 'string' ? message.missionId : '',
          kind: typeof message.kind === 'string' ? message.kind : 'mission',
          sender: typeof message.sender === 'string' ? message.sender : 'THE CARTEL',
          subject: message.subject,
          body: message.body,
          category: typeof message.category === 'string' ? message.category : 'MISSION',
          status: typeof message.status === 'string' ? message.status : 'SECURE',
          timestamp: Number(message.timestamp) || Date.now(),
          unread: Boolean(message.unread),
        }));
      phoneMessageSequence = phoneMessages.reduce((highest, message) => Math.max(highest, Number(String(message.id).replace(/\D/g, '')) || 0), 0);
    }
    if (Array.isArray(saved.roadsideStopHistory)) {
      roadsideStopHistory = saved.roadsideStopHistory
        .filter((entry) => entry && typeof entry.district === 'string')
        .slice(0, 8)
        .map((entry, index) => ({
          id: String(entry.id || `stop-${index}`),
          timestamp: Number(entry.timestamp) || Date.now(),
          district: entry.district,
          speed: Math.max(0, Number(entry.speed) || 0),
          speedLimit: Math.max(0, Number(entry.speedLimit) || 0),
          safeStop: Boolean(entry.safeStop),
          outcome: ['warning', 'citation', 'inspection-cleared', 'compromised'].includes(entry.outcome) ? entry.outcome : 'citation',
          fine: Math.max(0, Number(entry.fine) || 0),
          exposureBefore: clamp(Number(entry.exposureBefore) || 0, 0, 100),
          exposureAfter: clamp(Number(entry.exposureAfter) || 0, 0, 100),
          cargoMission: typeof entry.cargoMission === 'string' ? entry.cargoMission : '',
        }));
      roadsideStopSequence = roadsideStopHistory.reduce((highest, entry) => Math.max(highest, Number(String(entry.id).replace(/\D/g, '')) || 0), 0);
    }
    if (saved.run && typeof saved.run === 'object') {
      pendingSavedRun = {
        active: Boolean(saved.run.active),
        route: saved.run.route === 'mountain' ? 'mountain' : saved.run.route === 'city' ? 'city' : '',
        missionId: typeof saved.run.missionId === 'string' ? saved.run.missionId : '',
        elapsed: Math.max(0, Number(saved.run.elapsed) || 0),
        deadline: Math.max(0, Number(saved.run.deadline) || 0),
        exposure: clamp(Number(saved.run.exposure) || 0, 0, 100),
        baseCash: Math.max(0, Number(saved.run.baseCash) || 0),
        baseRep: Math.max(0, Number(saved.run.baseRep) || 0),
        bonusRate: Math.max(0, Number(saved.run.bonusRate) || 0),
        outcome: typeof saved.run.outcome === 'string' ? saved.run.outcome : '',
        outcomeTitle: typeof saved.run.outcomeTitle === 'string' ? saved.run.outcomeTitle : '',
        outcomeCopy: typeof saved.run.outcomeCopy === 'string' ? saved.run.outcomeCopy : '',
        outcomeTimer: Math.max(0, Number(saved.run.outcomeTimer) || 0),
        deadlineWarningSent: Boolean(saved.run.deadlineWarningSent),
        lastPayout: Math.max(0, Number(saved.run.lastPayout) || 0),
        lastEarlyBonus: Math.max(0, Number(saved.run.lastEarlyBonus) || 0),
        lastExposurePenalty: Math.max(0, Number(saved.run.lastExposurePenalty) || 0),
        cityMissionIndex: Math.max(0, Math.floor(Number(saved.run.cityMissionIndex) || 0)),
        pickupIndex: Math.max(0, Math.floor(Number(saved.run.pickupIndex) || 0)),
        dropoffIndex: Math.max(0, Math.floor(Number(saved.run.dropoffIndex) || 0)),
        deliveryState: ['idle', 'active', 'finished', 'failed'].includes(saved.run.deliveryState) ? saved.run.deliveryState : 'idle',
        mountainDeliveryState: ['idle', 'active', 'finished', 'failed'].includes(saved.run.mountainDeliveryState) ? saved.run.mountainDeliveryState : 'idle',
      };
    }
    if (saved.upgrades) Object.keys(player.upgrades).forEach((key) => {
      player.upgrades[key] = clamp(Number(saved.upgrades[key]) || 0, 0, 3);
    });
    return true;
  } catch (error) {
    console.warn('Progress load unavailable.', error);
    return false;
  }
}

const PHONE_MAX_MESSAGES = 24;

function escapePhoneHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function phoneTimeLabel(timestamp) {
  const date = new Date(Number(timestamp) || Date.now());
  const age = Math.max(0, Date.now() - date.getTime());
  if (age < 60 * 1000) return 'JUST NOW';
  if (age < 60 * 60 * 1000) return `${Math.floor(age / 60000)}M AGO`;
  if (age < 24 * 60 * 60 * 1000) return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
}

function updatePhoneUnreadBadge() {
  const unread = phoneMessages.filter((message) => message.unread).length;
  document.querySelectorAll('.phone-unread-badge').forEach((badge) => {
    badge.textContent = unread > 9 ? '9+' : String(unread);
    badge.hidden = unread === 0;
  });
  const inboxCount = document.querySelector('#phone-inbox-count');
  if (inboxCount) inboxCount.textContent = `${phoneMessages.length} ${phoneMessages.length === 1 ? 'THREAD' : 'THREADS'}`;
  const phoneToggle = document.querySelector('#phone-toggle');
  if (phoneToggle) phoneToggle.classList.toggle('has-unread', unread > 0);
}

function renderPhone() {
  const list = document.querySelector('#phone-thread-list');
  const detail = document.querySelector('#phone-message-detail');
  const empty = document.querySelector('#phone-empty-state');
  if (!list || !detail || !empty) {
    updatePhoneUnreadBadge();
    return;
  }
  if (!phoneMessages.length) {
    phoneSelectedMessageId = '';
    list.innerHTML = '<div class="phone-list-empty"><span>INBOX CLEAR</span><small>Mission traffic will appear here.</small></div>';
    detail.hidden = true;
    empty.hidden = false;
    updatePhoneUnreadBadge();
    return;
  }
  const selected = phoneMessages.find((message) => message.id === phoneSelectedMessageId) || phoneMessages[0];
  phoneSelectedMessageId = selected.id;
  list.innerHTML = phoneMessages.map((message) => `
    <button class="phone-thread-card ${message.id === selected.id ? 'selected' : ''} ${message.unread ? 'unread' : ''}" data-phone-id="${escapePhoneHtml(message.id)}" type="button">
      <span class="phone-thread-card-topline"><b>${escapePhoneHtml(message.category || 'MISSION')}</b><time>${escapePhoneHtml(phoneTimeLabel(message.timestamp))}</time></span>
      <strong>${escapePhoneHtml(message.subject)}</strong>
      <span class="phone-thread-card-sender">${escapePhoneHtml(message.sender)}${message.unread ? '<i>NEW</i>' : ''}</span>
      <p>${escapePhoneHtml(message.body)}</p>
    </button>`).join('');
  detail.hidden = false;
  empty.hidden = true;
  document.querySelector('#phone-detail-category').textContent = messageCategory(selected);
  document.querySelector('#phone-detail-time').textContent = phoneTimeLabel(selected.timestamp);
  document.querySelector('#phone-detail-subject').textContent = selected.subject;
  document.querySelector('#phone-detail-sender').textContent = selected.sender;
  document.querySelector('#phone-detail-body').textContent = selected.body;
  document.querySelector('#phone-detail-status').textContent = selected.unread ? 'UNREAD // TAP THREAD TO CLEAR' : (selected.status || 'READ // SECURE');
  updatePhoneUnreadBadge();
}

function messageCategory(message) {
  return String(message?.category || 'MISSION').toUpperCase();
}

function addPhoneMessage(details = {}, options = {}) {
  const {
    persist = true,
    notify = true,
  } = options;
  const key = typeof details.key === 'string' ? details.key : '';
  if (key && phoneMessages.some((message) => message.key === key)) return false;
  const message = {
    id: `phone-${Date.now()}-${phoneMessageSequence += 1}`,
    key,
    missionId: typeof details.missionId === 'string' ? details.missionId : '',
    kind: typeof details.kind === 'string' ? details.kind : 'mission',
    sender: typeof details.sender === 'string' ? details.sender : 'MARA // OPERATIONS',
    subject: typeof details.subject === 'string' ? details.subject : 'MISSION UPDATE',
    body: typeof details.body === 'string' ? details.body : 'A new secure update is waiting on your line.',
    category: typeof details.category === 'string' ? details.category : 'MISSION',
    status: typeof details.status === 'string' ? details.status : 'SECURE',
    timestamp: Number(details.timestamp) || Date.now(),
    unread: details.unread !== false,
  };
  phoneMessages = [message, ...phoneMessages].slice(0, PHONE_MAX_MESSAGES);
  phoneSelectedMessageId = phoneOpen ? message.id : (phoneSelectedMessageId || message.id);
  renderPhone();
  const phoneToggle = document.querySelector('#phone-toggle');
  if (phoneToggle) {
    phoneToggle.classList.add('phone-new');
    window.clearTimeout(phoneNotificationTimer);
    phoneNotificationTimer = window.setTimeout(() => phoneToggle.classList.remove('phone-new'), 900);
  }
  if (persist && !starterMenuOpen) saveProgress();
  if (notify && !phoneOpen && !starterMenuOpen) {
    showToast('NEW SECURE MESSAGE', message.subject, 'PHONE // P');
  }
  return true;
}

function queueMissionAvailability(mission, route = 'city') {
  if (!mission) return;
  const cycle = route === 'city' ? player.completedDeliveries : 'network';
  addPhoneMessage({
    key: `available:${route}:${cycle}:${mission.id}`,
    missionId: mission.id,
    kind: 'availability',
    category: 'AVAILABLE',
    sender: route === 'mountain' ? 'JUNO // PINEWATCH LINE' : 'MARA // OPERATIONS',
    subject: `CONTRACT OPEN // ${mission.title}`,
    body: route === 'mountain'
      ? `${mission.copy} The Pinewatch depot is live. Bring the case to the cabin before the ${mission.deadline}-second window closes.`
      : `${mission.copy} Pickup: ${currentCargoPickupSpot().label}. Drop: ${currentCargoDropoffSpot().label}. Deadline: ${mission.deadline} seconds.`,
    status: `OPEN // ${mission.deadline} SEC WINDOW`,
  }, { persist: false, notify: false });
}

function selectPhoneMessage(id, markRead = true) {
  const message = phoneMessages.find((entry) => entry.id === id);
  if (!message) return;
  phoneSelectedMessageId = message.id;
  if (markRead && message.unread) {
    message.unread = false;
    if (!starterMenuOpen) saveProgress();
  }
  renderPhone();
}

function markAllPhoneMessagesRead() {
  const changed = phoneMessages.some((message) => message.unread);
  phoneMessages.forEach((message) => { message.unread = false; });
  if (changed && !starterMenuOpen) saveProgress();
  renderPhone();
}

function roadsideStopOutcomeLabel(outcome) {
  return {
    warning: 'WARNING',
    citation: 'CITATION',
    'inspection-cleared': 'CASE CLEARED',
    compromised: 'COMPROMISED',
  }[outcome] || 'CITATION';
}

function renderRoadsideStopHistory() {
  const list = document.querySelector('#roadside-stop-history-list');
  const count = document.querySelector('#roadside-stop-history-count');
  if (!list) return;
  if (count) count.textContent = `${roadsideStopHistory.length} / 8 LOGGED`;
  if (!roadsideStopHistory.length) {
    list.innerHTML = '<div class="roadside-history-empty">NO PRIOR RADAR CONTACTS // CLEAN RECORD</div>';
    return;
  }
  list.innerHTML = roadsideStopHistory.slice(0, 3).map((entry) => `
    <div class="roadside-history-row ${entry.outcome === 'compromised' ? 'failed' : entry.outcome === 'inspection-cleared' ? 'cleared' : ''}">
      <span><b>${escapePhoneHtml(roadsideStopOutcomeLabel(entry.outcome))}</b><small>${escapePhoneHtml(entry.district)} // ${escapePhoneHtml(phoneTimeLabel(entry.timestamp))}</small></span>
      <span><b>${Math.round(entry.speed)} / ${Math.round(entry.speedLimit)} KM/H</b><small>${entry.exposureAfter > entry.exposureBefore ? `RISK +${Math.round(entry.exposureAfter - entry.exposureBefore)}%` : 'NO EXPOSURE CHANGE'}</small></span>
    </div>`).join('');
}

function recordRoadsideStopHistory(details = {}) {
  const entry = {
    id: `stop-${Date.now()}-${roadsideStopSequence += 1}`,
    timestamp: Date.now(),
    district: typeof details.district === 'string' ? details.district : 'AURORA BAY',
    speed: Math.max(0, Number(details.speed) || 0),
    speedLimit: Math.max(0, Number(details.speedLimit) || 0),
    safeStop: Boolean(details.safeStop),
    outcome: ['warning', 'citation', 'inspection-cleared', 'compromised'].includes(details.outcome) ? details.outcome : 'citation',
    fine: Math.max(0, Number(details.fine) || 0),
    exposureBefore: clamp(Number(details.exposureBefore) || 0, 0, 100),
    exposureAfter: clamp(Number(details.exposureAfter) || 0, 0, 100),
    cargoMission: typeof details.cargoMission === 'string' ? details.cargoMission : '',
  };
  roadsideStopHistory = [entry, ...roadsideStopHistory].slice(0, 8);
  renderRoadsideStopHistory();
  return entry;
}

function setPhoneOpen(open) {
  if (open && (starterMenuOpen || roadsideStopOpen)) return;
  if (open && garageOpen) setGarageOpen(false);
  if (open && worldMapOpen) setWorldMapOpen(false);
  if (open && gamePaused) setPauseOpen(false);
  phoneOpen = open;
  const overlay = document.querySelector('#phone-overlay');
  if (overlay) {
    overlay.classList.toggle('open', open);
    overlay.setAttribute('aria-hidden', String(!open));
  }
  if (open) {
    Object.keys(input).forEach((key) => { input[key] = false; });
    touchSteer = 0;
    Object.assign(gamepadState, { forward: false, back: false, handbrake: false, steer: 0 });
    renderPhone();
    ensureAudio();
  } else if (soundOn) {
    ensureAudio();
  }
}

activeSaveSlot = latestSaveSlot() || 1;
loadProgress(activeSaveSlot);
spawnPlayerAtHome();
restoreVisibleDamage();

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

const CARGO_PICKUP_SPOTS = [
  { id: 'underpass', label: 'UNDERPASS', copy: 'beneath the old city overpass', position: [0, .08, -44], style: 'underpass' },
  { id: 'dark-alley', label: 'DARK ALLEY', copy: 'inside a shadowed service alley', position: [46, .08, 2], style: 'alley' },
  { id: 'rail-alley', label: 'RAIL ALLEY', copy: 'inside a second shadowed service alley', position: [-38, .08, 78], style: 'alley' },
];
const CARGO_DROPOFF_SPOTS = [
  { id: 'northstar-outpost', label: 'NORTHSTAR OUTPOST', position: [400, .08, 2050] },
  { id: 'redwood-valley', label: 'REDWOOD VALLEY', position: [-1750, .08, 1750] },
  { id: 'lake-road', label: 'LAKE ROAD LOOKOUT', position: [-1100, .08, -1050] },
  { id: 'cinder-flats', label: 'CINDER FLATS', position: [2300, .08, -1850] },
  { id: 'eastgate', label: 'EASTGATE YARD', position: [2800, .08, 500] },
  { id: 'southern-crossroads', label: 'SOUTHERN CROSSROADS', position: [500, .08, -2800] },
];
let cargoPickupIndex = 0;
let cargoDropoffIndex = 0;

function createCargoPickupVisuals() {
  CARGO_PICKUP_SPOTS.forEach((spot, index) => {
    const [x, y, z] = spot.position;
    const group = new THREE.Group();
    group.name = `${spot.label} // city pickup`;
    group.position.set(x, y, z);
    if (spot.style === 'underpass') {
      addMesh(group, new THREE.BoxGeometry(24, 1.15, 8), mats.mountainRockLit, [0, 5.1, 0], { castShadow: true, receiveShadow: true });
      [-9, 9].forEach((columnX) => {
        addMesh(group, new THREE.BoxGeometry(.9, 5, 1.1), mats.mountainRock, [columnX, 2.5, 0], { castShadow: true });
        addObstacle(x + columnX, z, .65, .8, 'cargo-pickup-support');
      });
      addMesh(group, new THREE.BoxGeometry(20, .06, 7), mats.asphaltEdge, [0, .02, 0], { receiveShadow: true });
      for (let lightX = -7; lightX <= 7; lightX += 7) {
        const lamp = addMesh(group, new THREE.BoxGeometry(1.05, .08, .24), mats.lamp, [lightX, 4.48, 0]);
        lamp.material = mats.lamp;
      }
    } else if (spot.style === 'alley') {
      addMesh(group, new THREE.BoxGeometry(.55, 3.8, 12), mats.mountainRock, [-4.3, 1.9, 0], { castShadow: true });
      addMesh(group, new THREE.BoxGeometry(.55, 3.8, 12), mats.mountainRock, [4.3, 1.9, 0], { castShadow: true });
      addMesh(group, new THREE.BoxGeometry(9, .25, 1.1), mats.guardrail, [0, 3.7, -4.8], { castShadow: true });
      addMesh(group, new THREE.BoxGeometry(9, .08, 12), mats.asphaltEdge, [0, .02, 0], { receiveShadow: true });
      addMesh(group, new THREE.BoxGeometry(.12, 2.2, .12), mats.guardrail, [-3.2, 1.1, -3.9]);
      addMesh(group, new THREE.SphereGeometry(.16, 8, 8), mats.lamp, [-3.2, 2.2, -3.9]);
      addObstacle(x - 4.3, z, .5, 6.2, 'cargo-pickup-wall');
      addObstacle(x + 4.3, z, .5, 6.2, 'cargo-pickup-wall');
    } else {
      addMesh(group, new THREE.BoxGeometry(12, .18, 7), mats.asphaltEdge, [0, .05, 0], { receiveShadow: true });
      addMesh(group, new THREE.BoxGeometry(11, .3, .35), mats.guardrail, [0, 3.05, -2.8], { castShadow: true });
      addMesh(group, new THREE.BoxGeometry(.22, 3, .22), mats.guardrail, [-5, 1.5, -2.8], { castShadow: true });
      addMesh(group, new THREE.BoxGeometry(.22, 3, .22), mats.guardrail, [5, 1.5, -2.8], { castShadow: true });
      addMesh(group, new THREE.BoxGeometry(3.4, 2.4, .35), mats.cabinWood, [0, 1.2, 2.6], { castShadow: true });
      addMesh(group, new THREE.BoxGeometry(2.3, .08, .9), mats.cabinRoof, [0, 2.45, 2.6], { castShadow: true });
      addObstacle(x, z + 2.6, 1.9, .55, 'cargo-pickup-wall');
    }
    const waypoint = new THREE.Group();
    const ring = addMesh(waypoint, new THREE.TorusGeometry(2.0, .075, 8, 28), mats.cache, [0, .18, 0], { rotation: [Math.PI / 2, 0, 0] });
    const beam = addMesh(waypoint, new THREE.CylinderGeometry(.03, .03, 3.2, 6), mats.cache, [0, 1.6, 0]);
    const label = makeLabel(`${spot.label} PICKUP`, '#5ce3d1', .34);
    label.position.y = 3.8;
    waypoint.add(label);
    group.add(waypoint);
    cargoPickupLocations.add(group);
    cargoPickupVisuals.push({ group, waypoint, ring, beam, label });
  });
}

function currentCargoPickupSpot() {
  return CARGO_PICKUP_SPOTS[cargoPickupIndex] || CARGO_PICKUP_SPOTS[0];
}

function currentCargoDropoffSpot() {
  return CARGO_DROPOFF_SPOTS[cargoDropoffIndex] || CARGO_DROPOFF_SPOTS[0];
}

function updateCargoPickupVisuals(time = performance.now(), dt = 0) {
  cargoPickupVisuals.forEach((visual, index) => {
    const selected = index === cargoPickupIndex && !cargoRun.active;
    visual.waypoint.visible = selected;
    const pulse = (Math.sin(time * .004 + index) + 1) / 2;
    if (selected) {
      visual.ring.rotation.z += dt * 1.15;
      visual.ring.scale.setScalar(1 + pulse * .13);
      visual.beam.scale.y = 1 + pulse * .18;
    }
  });
}

const deliveryStart = new THREE.Vector3(0, .08, -44);
const deliveryTarget = new THREE.Vector3(400, .08, 2050);
const deliveryStartMarker = new THREE.Group();
deliveryStartMarker.position.copy(deliveryStart);
const deliveryStartRing = addMesh(deliveryStartMarker, new THREE.TorusGeometry(2.2, .08, 8, 32), mats.cache, [0, .18, 0], { rotation: [Math.PI / 2, 0, 0] });
const deliveryStartBeam = addMesh(deliveryStartMarker, new THREE.CylinderGeometry(.035, .035, 4.5, 6), mats.cache, [0, 2.25, 0]);
const deliveryStartLabel = makeLabel('CITY PICKUP', '#5ce3d1', .5);
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
const CITY_DELIVERY_MISSIONS = [
  { id: 'south-market', title: 'SOUTH MARKET RUN', copy: 'Collect an unmarked case at the city pickup, then move it to the remote handoff.', activeCopy: 'The remote handoff is marked. Keep the case sealed and exposure low.', rep: 180, cash: 120, deadline: 24, bonusRate: 7 },
  { id: 'pulse-station', title: 'PULSE STATION SUPPLY', copy: 'Move a sealed case out of Aurora Bay before the city wakes up.', activeCopy: 'The remote handoff is waiting. Avoid cameras and keep the line clean.', rep: 195, cash: 130, deadline: 22, bonusRate: 8 },
  { id: 'octane-row', title: 'OCTANE ROW PARTS', copy: 'Collect the unmarked package and take it beyond the city boundary.', activeCopy: 'The outside drop is marked. Avoid unnecessary bodywork and attention.', rep: 210, cash: 140, deadline: 26, bonusRate: 8 },
  { id: 'northstar-overlook', title: 'NORTHSTAR OVERLOOK', copy: 'Run a night-shift case from a fixed city pickup to a remote overlook.', activeCopy: 'The remote overlook is marked. Let the road set the pace, not panic.', rep: 225, cash: 150, deadline: 32, bonusRate: 8 },
  { id: 'pine-and-salt', title: 'PINE AND SALT RUN', copy: 'Take a sealed unmarked order across the island after collecting it in town.', activeCopy: 'The outside handoff is marked. Keep the cargo and the line clean.', rep: 240, cash: 160, deadline: 20, bonusRate: 9 },
  { id: 'east-neighborhood', title: 'EAST NEIGHBORHOOD DROP', copy: 'Finish the late unmarked cargo route at a remote regional junction.', activeCopy: 'The regional drop is marked. One calm run gets it done.', rep: 255, cash: 170, deadline: 18, bonusRate: 9 },
];
let cityDeliveryMissionIndex = 0;
let deliveryState = 'idle';
let deliveryTime = 0;
let deliveryNear = false;

const CARGO_RUN_CONFIG = Object.freeze({
  maxExposure: 100,
  baseInspectionChance: .06,
  maxInspectionChance: .84,
  radarExposure: 8,
  violationExposure: 13,
});
const MOUNTAIN_CARGO_MISSION = {
  id: 'pinewatch-night-run',
  title: 'PINEWATCH NIGHT RUN',
  copy: 'Move an unmarked case through Pinewatch to the cabin above the pass.',
  activeCopy: 'The case is live. Stay smooth through the switchbacks and keep exposure low.',
  rep: 260,
  cash: 180,
  deadline: 46,
  bonusRate: 7,
};
const cargoRun = {
  active: false,
  route: '',
  missionId: '',
  elapsed: 0,
  deadline: 0,
  exposure: 0,
  baseCash: 0,
  baseRep: 0,
  bonusRate: 0,
  outcome: '',
  outcomeTitle: '',
  outcomeCopy: '',
  outcomeTimer: 0,
  deadlineWarningSent: false,
  lastPayout: 0,
  lastEarlyBonus: 0,
  lastExposurePenalty: 0,
};

function cargoRiskTier(exposure = cargoRun.exposure) {
  if (exposure < 20) return 'LOW';
  if (exposure < 45) return 'WATCH';
  if (exposure < 70) return 'HOT';
  return 'CRITICAL';
}

function cargoPayoutPreview(mission) {
  const secondsRemaining = Math.max(0, cargoRun.deadline - cargoRun.elapsed);
  const earlyBonus = Math.ceil(secondsRemaining * (mission.bonusRate || cargoRun.bonusRate || 0));
  const exposurePenalty = Math.floor(cargoRun.exposure * .6);
  return {
    secondsRemaining,
    earlyBonus,
    exposurePenalty,
    payout: Math.max(0, mission.cash + earlyBonus - exposurePenalty),
  };
}

function startCargoRun(route, mission) {
  if (cargoRun.active) return false;
  Object.assign(cargoRun, {
    active: true,
    route,
    missionId: mission.id,
    elapsed: 0,
    deadline: mission.deadline,
    exposure: 0,
    baseCash: mission.cash,
    baseRep: mission.rep,
    bonusRate: mission.bonusRate,
    outcome: '',
    outcomeTitle: '',
    outcomeCopy: '',
    outcomeTimer: 0,
    deadlineWarningSent: false,
    lastPayout: 0,
    lastEarlyBonus: 0,
    lastExposurePenalty: 0,
  });
  const pickupLabel = route === 'city' ? currentCargoPickupSpot().label : 'PINEWATCH DEPOT';
  const dropoffLabel = route === 'city' ? currentCargoDropoffSpot().label : 'CABIN DROP';
  addPhoneMessage({
    missionId: mission.id,
    kind: 'accepted',
    category: 'ACCEPTED',
    sender: 'MARA // OPERATIONS',
    subject: `CASE ACCEPTED // ${mission.title}`,
    body: `Pickup confirmed at ${pickupLabel}. Deliver to ${dropoffLabel} before the ${mission.deadline}-second window closes. Keep the case sealed and the line legal.`,
    status: `LIVE // ${mission.deadline} SEC WINDOW`,
  });
  return true;
}

function recordCargoExposure(amount, source = 'driving incident') {
  if (!cargoRun.active || amount <= 0) return;
  const previous = cargoRun.exposure;
  cargoRun.exposure = clamp(cargoRun.exposure + amount, 0, CARGO_RUN_CONFIG.maxExposure);
  if (previous < 55 && cargoRun.exposure >= 55) {
    showToast('EXPOSURE RISING', `${source} put the unmarked cargo under attention`, 'SLOW DOWN');
  } else if (previous < 82 && cargoRun.exposure >= 82) {
    showToast('CARGO RISK CRITICAL', 'One more serious incident could end the run', 'KEEP IT CLEAN');
  }
}

function failCargoRun(title, copy, reward = 'NO PAYOUT') {
  if (!cargoRun.active) return;
  cargoRun.active = false;
  cargoRun.outcome = 'failed';
  cargoRun.outcomeTitle = title;
  cargoRun.outcomeCopy = copy;
  cargoRun.outcomeTimer = 4.2;
  if (cargoRun.route === 'city') deliveryState = 'failed';
  if (cargoRun.route === 'mountain') mountainDeliveryState = 'failed';
  addPhoneMessage({
    missionId: cargoRun.missionId,
    kind: 'failed',
    category: 'COMPROMISED',
    sender: 'MARA // OPERATIONS',
    subject: `RUN FAILED // ${title}`,
    body: `${copy} The case is written off. Exposure reached ${Math.round(cargoRun.exposure)}%. No payout was issued.`,
    status: 'FAILED // NO PAYOUT',
  });
  showToast(title, copy, reward);
}

function completeCargoRun(mission) {
  if (!cargoRun.active) return;
  const payout = cargoPayoutPreview(mission);
  cargoRun.active = false;
  cargoRun.outcome = 'complete';
  cargoRun.lastPayout = payout.payout;
  cargoRun.lastEarlyBonus = payout.earlyBonus;
  cargoRun.lastExposurePenalty = payout.exposurePenalty;
  addPhoneMessage({
    missionId: mission.id,
    kind: 'success',
    category: 'DELIVERED',
    sender: 'MARA // SETTLEMENT',
    subject: `DELIVERY CONFIRMED // ${mission.title}`,
    body: `Clean work. The case reached ${cargoRun.route === 'mountain' ? 'the cabin drop' : 'the remote handoff'} in ${cargoRun.elapsed.toFixed(1)} seconds. Settlement: $${payout.payout}. Keep the line open for the next contract.`,
    status: `PAID // +$${payout.payout}`,
  }, { persist: false });
  player.rep += mission.rep;
  player.cash += payout.payout;
  registerDeliveryCompletion();
  playBeacon();
  showToast(`${mission.title} COMPLETE`, `${cargoRun.elapsed.toFixed(1)} seconds // ${cargoRiskTier()} exposure`, `+$${payout.payout}`);
}

function inspectCargoAtRoadside() {
  if (!cargoRun.active) return { active: false, passed: true, exposure: 0 };
  const exposureBefore = cargoRun.exposure;
  const chance = clamp(CARGO_RUN_CONFIG.baseInspectionChance + (cargoRun.exposure / 100) * .78, CARGO_RUN_CONFIG.baseInspectionChance, CARGO_RUN_CONFIG.maxInspectionChance);
  if (Math.random() < chance) {
    failCargoRun('CARGO BUSTED', `The roadside inspection found the unmarked case at ${Math.round(cargoRun.exposure)}% exposure.`);
    return { active: true, passed: false, exposureBefore, exposure: cargoRun.exposure, chance };
  }
  recordCargoExposure(CARGO_RUN_CONFIG.radarExposure, 'roadside inspection');
  return { active: true, passed: true, exposureBefore, exposure: cargoRun.exposure, chance };
}

function settleCargoFailure(route, dt) {
  if (cargoRun.outcome !== 'failed' || cargoRun.route !== route) return false;
  cargoRun.outcomeTimer -= dt;
  if (cargoRun.outcomeTimer <= 0) {
    if (route === 'city') deliveryState = 'idle';
    if (route === 'mountain') mountainDeliveryState = 'idle';
    cargoRun.outcome = '';
    cargoRun.route = '';
  }
  return true;
}

function clearCargoRun() {
  Object.assign(cargoRun, {
    active: false,
    route: '',
    missionId: '',
    elapsed: 0,
    deadline: 0,
    exposure: 0,
    baseCash: 0,
    baseRep: 0,
    bonusRate: 0,
    outcome: '',
    outcomeTitle: '',
    outcomeCopy: '',
    outcomeTimer: 0,
    deadlineWarningSent: false,
    lastPayout: 0,
    lastEarlyBonus: 0,
    lastExposurePenalty: 0,
  });
}

function currentCityDeliveryMission() {
  return CITY_DELIVERY_MISSIONS[cityDeliveryMissionIndex] || CITY_DELIVERY_MISSIONS[0];
}

function updateCargoDeadlineWarning(mission) {
  if (!cargoRun.active || cargoRun.deadlineWarningSent || !mission) return;
  const secondsRemaining = Math.max(0, cargoRun.deadline - cargoRun.elapsed);
  if (secondsRemaining > Math.max(6, mission.deadline * .28)) return;
  cargoRun.deadlineWarningSent = true;
  addPhoneMessage({
    missionId: mission.id,
    kind: 'deadline',
    category: 'DEADLINE',
    sender: 'MARA // OPERATIONS',
    subject: `DEADLINE WARNING // ${mission.title}`,
    body: `The handoff window is closing. Approximately ${Math.ceil(secondsRemaining)} seconds remain. Keep the case moving and avoid any stop that is not required by the road.`,
    status: `URGENT // ${Math.ceil(secondsRemaining)} SEC LEFT`,
  });
}

function setCityDeliveryMission(index) {
  cityDeliveryMissionIndex = ((index % CITY_DELIVERY_MISSIONS.length) + CITY_DELIVERY_MISSIONS.length) % CITY_DELIVERY_MISSIONS.length;
  cargoPickupIndex = Math.floor(Math.random() * CARGO_PICKUP_SPOTS.length);
  cargoDropoffIndex = Math.floor(Math.random() * CARGO_DROPOFF_SPOTS.length);
  const pickup = currentCargoPickupSpot();
  const dropoff = currentCargoDropoffSpot();
  deliveryStart.set(pickup.position[0], pickup.position[1], pickup.position[2]);
  deliveryTarget.set(dropoff.position[0], dropoff.position[1], dropoff.position[2]);
  deliveryStartMarker.position.copy(deliveryStart);
  deliveryTargetMarker.position.copy(deliveryTarget);
  updateCargoPickupVisuals();
  queueMissionAvailability(currentCityDeliveryMission(), 'city');
}

setCityDeliveryMission(player.completedDeliveries % CITY_DELIVERY_MISSIONS.length);
queueMissionAvailability(MOUNTAIN_CARGO_MISSION, 'mountain');

const mountainDeliveryStart = mountainVillagePosition.clone();
const mountainDeliveryTarget = mountainVillageDropPosition.clone();
let mountainDeliveryState = 'idle';
let mountainDeliveryTime = 0;
let mountainDeliveryNear = false;
let mountainDeliveryStartMarker = null;
let mountainDeliveryTargetMarker = null;
let mountainDeliveryStartRing = null;
let mountainDeliveryTargetRing = null;

function applyPendingSavedRun() {
  if (!pendingSavedRun) return;
  const savedRun = pendingSavedRun;
  pendingSavedRun = null;
  setCityDeliveryMission(savedRun.cityMissionIndex);
  cargoPickupIndex = clamp(savedRun.pickupIndex, 0, CARGO_PICKUP_SPOTS.length - 1);
  cargoDropoffIndex = clamp(savedRun.dropoffIndex, 0, CARGO_DROPOFF_SPOTS.length - 1);
  const pickup = currentCargoPickupSpot();
  const dropoff = currentCargoDropoffSpot();
  deliveryStart.set(pickup.position[0], pickup.position[1], pickup.position[2]);
  deliveryTarget.set(dropoff.position[0], dropoff.position[1], dropoff.position[2]);
  Object.assign(cargoRun, {
    active: savedRun.active,
    route: savedRun.route,
    missionId: savedRun.missionId,
    elapsed: savedRun.elapsed,
    deadline: savedRun.deadline,
    exposure: savedRun.exposure,
    baseCash: savedRun.baseCash,
    baseRep: savedRun.baseRep,
    bonusRate: savedRun.bonusRate,
    outcome: savedRun.outcome,
    outcomeTitle: savedRun.outcomeTitle,
    outcomeCopy: savedRun.outcomeCopy,
    outcomeTimer: savedRun.outcomeTimer,
    deadlineWarningSent: savedRun.deadlineWarningSent,
    lastPayout: savedRun.lastPayout,
    lastEarlyBonus: savedRun.lastEarlyBonus,
    lastExposurePenalty: savedRun.lastExposurePenalty,
  });
  deliveryState = savedRun.deliveryState;
  mountainDeliveryState = savedRun.mountainDeliveryState;
}

applyPendingSavedRun();

function addMountainDeliveryMarkers() {
  mountainDeliveryStartMarker = new THREE.Group();
  mountainDeliveryStartMarker.position.copy(mountainDeliveryStart);
  mountainDeliveryStartRing = addMesh(mountainDeliveryStartMarker, new THREE.TorusGeometry(2.3, .09, 8, 32), mats.cache, [0, .2, 0], { rotation: [Math.PI / 2, 0, 0] });
  addMesh(mountainDeliveryStartMarker, new THREE.CylinderGeometry(.04, .04, 4.8, 6), mats.cache, [0, 2.4, 0]);
  const startLabel = makeLabel('PINEWATCH DEPOT', '#5ce3d1', .48);
  startLabel.position.y = 5.1;
  mountainDeliveryStartMarker.add(startLabel);
  pinewatchExpansion.add(mountainDeliveryStartMarker);
  mountainDeliveryTargetMarker = new THREE.Group();
  mountainDeliveryTargetMarker.position.copy(mountainDeliveryTarget);
  mountainDeliveryTargetRing = addMesh(mountainDeliveryTargetMarker, new THREE.TorusGeometry(2.4, .09, 8, 32), mats.event, [0, .2, 0], { rotation: [Math.PI / 2, 0, 0] });
  addMesh(mountainDeliveryTargetMarker, new THREE.CylinderGeometry(.04, .04, 4.8, 6), mats.event, [0, 2.4, 0]);
  const targetLabel = makeLabel('CABIN DROP', '#ff9d50', .48);
  targetLabel.position.y = 5.1;
  mountainDeliveryTargetMarker.add(targetLabel);
  pinewatchExpansion.add(mountainDeliveryTargetMarker);
}

function mountainDeliveryAction() {
  if (cargoRun.active) return;
  if (mountainDeliveryState === 'idle' && mountainDeliveryNear) {
    mountainDeliveryState = 'active';
    mountainDeliveryTime = 0;
    startCargoRun('mountain', MOUNTAIN_CARGO_MISSION);
    playTone(320, .2, .08, 'sine', 90);
    showToast('MOUNTAIN CARGO ACCEPTED', MOUNTAIN_CARGO_MISSION.copy, `DEADLINE ${MOUNTAIN_CARGO_MISSION.deadline} SEC`);
  } else if (mountainDeliveryState === 'finished' && mountainDeliveryNear) {
    mountainDeliveryState = 'active';
    mountainDeliveryTime = 0;
    startCargoRun('mountain', MOUNTAIN_CARGO_MISSION);
    showToast('NEW UNMARKED CASE', MOUNTAIN_CARGO_MISSION.copy, `DEADLINE ${MOUNTAIN_CARGO_MISSION.deadline} SEC`);
  }
}

function deliveryAction() {
  if (cargoRun.active) return;
  if (mountainDeliveryNear || mountainDeliveryState === 'active') {
    mountainDeliveryAction();
    return;
  }
  if (deliveryState === 'idle' && deliveryNear) {
    deliveryState = 'active';
    deliveryTime = 0;
    const mission = currentCityDeliveryMission();
    startCargoRun('city', mission);
    playTone(320, .2, .08, 'sine', 90);
    showToast(`${mission.title} ACCEPTED`, `Pickup at ${currentCargoPickupSpot().label}. Drop at ${currentCargoDropoffSpot().label}.`, `DEADLINE ${mission.deadline} SEC`);
  } else if (deliveryState === 'finished' && deliveryNear) {
    deliveryState = 'active';
    deliveryTime = 0;
    const mission = currentCityDeliveryMission();
    startCargoRun('city', mission);
    showToast('NEW UNMARKED CASE', `Pickup at ${currentCargoPickupSpot().label}. Drop at ${currentCargoDropoffSpot().label}.`, `DEADLINE ${mission.deadline} SEC`);
  }
}

function updateCargoRiskUi(route) {
  const risk = document.querySelector('#delivery-risk');
  if (!risk) return;
  const relevant = cargoRun.route === route && (cargoRun.active || cargoRun.outcome);
  const tier = cargoRiskTier();
  risk.classList.remove('low', 'watch', 'hot', 'critical');
  if (!relevant) {
    risk.textContent = 'RISK CLEAR';
    risk.classList.add('low');
    return;
  }
  risk.textContent = `${cargoRun.outcome === 'failed' ? 'LAST RISK' : 'RISK'} ${Math.round(cargoRun.exposure)}% // ${tier}`;
  risk.classList.add(tier.toLowerCase());
}

function updateDelivery(time, dt) {
  const startDistance = player.position.distanceTo(deliveryStart);
  deliveryNear = startDistance < 11;
  const mission = currentCityDeliveryMission();
  settleCargoFailure('city', dt);
  if (deliveryState === 'active' && cargoRun.active && cargoRun.route === 'city') {
    cargoRun.elapsed += dt;
    deliveryTime = cargoRun.elapsed;
    updateCargoDeadlineWarning(mission);
    if (cargoRun.elapsed >= cargoRun.deadline) {
      failCargoRun('DEADLINE MISSED', 'The unmarked cargo window closed before you reached the drop.', 'NO PAYOUT');
    } else if (player.position.distanceTo(deliveryTarget) < 7.4) {
      deliveryState = 'finished';
      completeCargoRun(mission);
    }
  }
  const pulse = (Math.sin(time * .004) + 1) / 2;
  deliveryStartRing.rotation.z += dt * 1.1;
  deliveryStartRing.scale.setScalar(1 + pulse * .12);
  deliveryStartBeam.scale.y = 1 + pulse * .2;
  deliveryStartMarker.visible = deliveryState !== 'active';
  deliveryTargetMarker.visible = deliveryState === 'active' && cargoRun.route === 'city';
  if (deliveryState === 'active' && cargoRun.route === 'city') {
    deliveryTargetRing.rotation.z -= dt * 1.4;
    deliveryTargetRing.scale.setScalar(1 + pulse * .16);
    deliveryTargetBeam.scale.y = 1 + pulse * .2;
  }
  const panel = document.querySelector('#delivery-panel');
  const visible = deliveryNear || deliveryState === 'active' || deliveryState === 'finished' || deliveryState === 'failed';
  panel.classList.toggle('visible', visible);
  panel.classList.toggle('active', deliveryState === 'active' && cargoRun.route === 'city');
  const status = document.querySelector('#delivery-status');
  const title = document.querySelector('#delivery-title');
  const copy = document.querySelector('#delivery-copy');
  const timeReadout = document.querySelector('#delivery-time');
  const reward = document.querySelector('#delivery-reward');
  const action = document.querySelector('#delivery-action');
  if (deliveryState === 'idle') {
    status.textContent = deliveryNear ? 'READY // PICKUP' : 'OPEN WORLD';
    title.textContent = mission.title;
    const pickup = currentCargoPickupSpot();
    copy.textContent = deliveryNear ? `Hit V to collect ${pickup.copy}. Drop at ${currentCargoDropoffSpot().label}.` : `${mission.copy} Pickup: ${pickup.label}.`;
    timeReadout.textContent = deliveryNear ? `DEADLINE ${mission.deadline} SEC` : 'UNMARKED CARGO // CITY PICKUP';
    reward.textContent = `+$${mission.cash} BASE`;
    action.innerHTML = deliveryNear ? '<span class="keycap">V</span><span>ACCEPT HOT CARGO</span>' : '<span>CITY PICKUP // NEXT CASE</span>';
  } else if (deliveryState === 'active' && cargoRun.route === 'city') {
    const preview = cargoPayoutPreview(mission);
    status.textContent = 'CARGO LIVE';
    title.textContent = mission.title;
    copy.textContent = `${mission.activeCopy} Drop at ${currentCargoDropoffSpot().label}. Deadline ${mission.deadline} seconds.`;
    timeReadout.textContent = `${deliveryTime.toFixed(1)} / ${mission.deadline} SEC`;
    reward.textContent = `$${preview.payout} EST.`;
    action.innerHTML = '<span class="event-live-dot"></span><span>DEADLINE RUN LIVE</span>';
  } else if (deliveryState === 'failed') {
    status.textContent = 'BUSTED';
    title.textContent = cargoRun.outcomeTitle || 'CARGO LOST';
    copy.textContent = cargoRun.outcomeCopy || 'The run ended without a payout.';
    timeReadout.textContent = 'NO PAYOUT';
    reward.textContent = 'CARGO LOST';
    action.innerHTML = '<span>RETURN TO DEPOT // RESET ROUTE</span>';
  } else {
    status.textContent = 'DELIVERED';
    title.textContent = 'RUN COMPLETE';
    copy.textContent = `Last run: ${deliveryTime.toFixed(1)} seconds. Risk stayed ${cargoRiskTier(cargoRun.exposure)}.`;
    timeReadout.textContent = 'COMPLETE';
    reward.textContent = `+$${cargoRun.lastPayout}`;
    action.innerHTML = deliveryNear ? '<span class="keycap">V</span><span>ACCEPT NEXT CASE</span>' : '<span>ROUTE CLEARED</span>';
  }
  updateCargoRiskUi('city');
}

function updateMountainDelivery(time, dt) {
  if (!mountainDeliveryStartMarker || !mountainDeliveryTargetMarker) return;
  mountainDeliveryNear = player.position.distanceTo(mountainDeliveryStart) < 12;
  settleCargoFailure('mountain', dt);
  if (mountainDeliveryState === 'active' && cargoRun.active && cargoRun.route === 'mountain') {
    cargoRun.elapsed += dt;
    mountainDeliveryTime = cargoRun.elapsed;
    updateCargoDeadlineWarning(MOUNTAIN_CARGO_MISSION);
    if (cargoRun.elapsed >= cargoRun.deadline) {
      failCargoRun('DEADLINE MISSED', 'The mountain drop window closed before the case reached the cabin.', 'NO PAYOUT');
    } else if (player.position.distanceTo(mountainDeliveryTarget) < 7.4) {
      mountainDeliveryState = 'finished';
      completeCargoRun(MOUNTAIN_CARGO_MISSION);
    }
  }
  const pulse = (Math.sin(time * .004) + 1) / 2;
  mountainDeliveryStartRing.rotation.z += dt * 1.15;
  mountainDeliveryStartRing.scale.setScalar(1 + pulse * .14);
  mountainDeliveryTargetRing.rotation.z -= dt * 1.35;
  mountainDeliveryTargetRing.scale.setScalar(1 + pulse * .16);
  mountainDeliveryStartMarker.visible = mountainDeliveryState !== 'active';
  mountainDeliveryTargetMarker.visible = mountainDeliveryState === 'active' && cargoRun.route === 'mountain';
  const relevant = mountainDeliveryNear || mountainDeliveryState === 'active' || mountainDeliveryState === 'finished' || mountainDeliveryState === 'failed';
  if (!relevant) return;
  const panel = document.querySelector('#delivery-panel');
  panel.classList.add('visible');
  panel.classList.toggle('active', mountainDeliveryState === 'active' && cargoRun.route === 'mountain');
  const status = document.querySelector('#delivery-status');
  const title = document.querySelector('#delivery-title');
  const copy = document.querySelector('#delivery-copy');
  const timeReadout = document.querySelector('#delivery-time');
  const reward = document.querySelector('#delivery-reward');
  const action = document.querySelector('#delivery-action');
  if (mountainDeliveryState === 'idle') {
    status.textContent = mountainDeliveryNear ? 'READY' : 'MOUNTAIN ROUTE';
    title.textContent = MOUNTAIN_CARGO_MISSION.title;
    copy.textContent = mountainDeliveryNear ? `Hit V to accept this deadline run. ${MOUNTAIN_CARGO_MISSION.copy}` : MOUNTAIN_CARGO_MISSION.copy;
    timeReadout.textContent = mountainDeliveryNear ? `DEADLINE ${MOUNTAIN_CARGO_MISSION.deadline} SEC` : 'PINEWATCH CARGO';
    reward.textContent = `+$${MOUNTAIN_CARGO_MISSION.cash} BASE`;
    action.innerHTML = mountainDeliveryNear ? '<span class="keycap">V</span><span>ACCEPT HOT CARGO</span>' : '<span>PINEWATCH DEPOT // NEXT CASE</span>';
  } else if (mountainDeliveryState === 'active' && cargoRun.route === 'mountain') {
    const preview = cargoPayoutPreview(MOUNTAIN_CARGO_MISSION);
    status.textContent = 'CARGO LIVE';
    title.textContent = MOUNTAIN_CARGO_MISSION.title;
    copy.textContent = `${MOUNTAIN_CARGO_MISSION.activeCopy} Deadline ${MOUNTAIN_CARGO_MISSION.deadline} seconds.`;
    timeReadout.textContent = `${mountainDeliveryTime.toFixed(1)} / ${MOUNTAIN_CARGO_MISSION.deadline} SEC`;
    reward.textContent = `$${preview.payout} EST.`;
    action.innerHTML = '<span class="event-live-dot"></span><span>DEADLINE RUN LIVE</span>';
  } else if (mountainDeliveryState === 'failed') {
    status.textContent = 'BUSTED';
    title.textContent = cargoRun.outcomeTitle || 'CARGO LOST';
    copy.textContent = cargoRun.outcomeCopy || 'The mountain run ended without a payout.';
    timeReadout.textContent = 'NO PAYOUT';
    reward.textContent = 'CARGO LOST';
    action.innerHTML = '<span>RETURN TO PINEWATCH DEPOT</span>';
  } else {
    status.textContent = 'DELIVERED';
    title.textContent = 'PINEWATCH COMPLETE';
    copy.textContent = `Last run: ${mountainDeliveryTime.toFixed(1)} seconds. Risk stayed ${cargoRiskTier(cargoRun.exposure)}.`;
    timeReadout.textContent = 'COMPLETE';
    reward.textContent = `+$${cargoRun.lastPayout}`;
    action.innerHTML = mountainDeliveryNear ? '<span class="keycap">V</span><span>ACCEPT NEXT CASE</span>' : '<span>ROUTE CLEARED</span>';
  }
  updateCargoRiskUi('mountain');
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
let roadsideStopOpen = false;
let roadsideStopResolved = false;
let roadsideStopWasSafe = false;
let roadsideStopContext = null;

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

function currentRoadsideStopContext() {
  return roadsideStopContext || {
    recordedSpeed: Math.abs(player.speed) * 3.1,
    speedLimit: getSpeedLimit(player.position.x, player.position.z),
    severity: 'citation',
    fine: 45,
    district: districtAt(player.position.x, player.position.z),
  };
}

function showRoadsideStopPanel(stoppedSafely) {
  roadsideStopOpen = true;
  roadsideStopResolved = false;
  roadsideStopWasSafe = stoppedSafely;
  Object.keys(input).forEach((key) => { input[key] = false; });
  touchSteer = 0;
  Object.assign(gamepadState, { forward: false, back: false, handbrake: false, steer: 0 });
  const overlay = document.querySelector('#roadside-stop-overlay');
  const title = document.querySelector('#roadside-stop-title');
  const copy = document.querySelector('#roadside-stop-copy');
  const status = document.querySelector('#roadside-stop-status');
  const reason = document.querySelector('#roadside-stop-reason');
  const location = document.querySelector('#roadside-stop-location');
  const cargo = document.querySelector('#roadside-stop-cargo');
  const record = document.querySelector('#roadside-stop-record');
  const outcome = document.querySelector('#roadside-stop-outcome');
  const action = document.querySelector('#roadside-stop-action');
  if (!overlay || !title || !copy || !status || !reason || !location || !cargo || !record || !outcome || !action) {
    roadsideStopOpen = false;
    return;
  }
  const context = currentRoadsideStopContext();
  const mission = cargoRun.route === 'mountain' ? MOUNTAIN_CARGO_MISSION : currentCityDeliveryMission();
  const warning = context.severity === 'warning';
  title.innerHTML = warning ? 'SLOW <b>DOWN.</b>' : 'PULL <b>OVER.</b>';
  status.textContent = stoppedSafely ? (warning ? 'STOPPED // WARNING REVIEW' : 'STOPPED SAFELY') : 'CITATION WITHOUT STOP';
  copy.textContent = stoppedSafely
    ? warning
      ? 'The radar unit logged a minor speed violation. Cooperate with the review before returning to the route.'
      : 'You pulled over safely. Cooperate with the roadside check before returning to the route.'
    : 'The radar unit recorded a citation without a safe stop. Resolve the record before returning to the route.';
  reason.textContent = `RADAR CHECK // ${Math.round(context.recordedSpeed)} KM/H // LIMIT ${Math.round(context.speedLimit)}`;
  location.textContent = context.district;
  cargo.textContent = cargoRun.active ? `ACTIVE CASE // ${mission.title} // RISK ${Math.round(cargoRun.exposure)}%` : 'NO ACTIVE CASE // CITATION ONLY';
  record.textContent = warning ? 'WARNING // NO FINE' : `CITATION // -$${context.fine}`;
  outcome.hidden = true;
  outcome.innerHTML = '';
  action.innerHTML = cargoRun.active
    ? `${stoppedSafely ? 'COOPERATE' : 'ACKNOWLEDGE'} / INSPECT CARGO <span>ENTER</span>`
    : `${warning ? 'ACKNOWLEDGE WARNING' : 'ACKNOWLEDGE CITATION'} <span>ENTER</span>`;
  renderRoadsideStopHistory();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  playTone(warning ? 320 : 220, .16, .06, 'sine', warning ? -60 : -100);
}

function renderRoadsideStopResult(result, cargoWasActive, outcomeType) {
  const overlay = document.querySelector('#roadside-stop-overlay');
  const title = document.querySelector('#roadside-stop-title');
  const status = document.querySelector('#roadside-stop-status');
  const copy = document.querySelector('#roadside-stop-copy');
  const location = document.querySelector('#roadside-stop-location');
  const cargo = document.querySelector('#roadside-stop-cargo');
  const record = document.querySelector('#roadside-stop-record');
  const outcome = document.querySelector('#roadside-stop-outcome');
  const action = document.querySelector('#roadside-stop-action');
  if (!overlay || !title || !status || !copy || !location || !cargo || !record || !outcome || !action) return;
  const context = currentRoadsideStopContext();
  const clean = outcomeType !== 'compromised';
  const warning = context.severity === 'warning';
  title.innerHTML = outcomeType === 'compromised' ? 'CASE <b>COMPROMISED.</b>' : warning ? 'WARNING <b>ISSUED.</b>' : 'STOP <b>CLOSED.</b>';
  status.textContent = outcomeType === 'compromised'
    ? 'CASE COMPROMISED'
    : warning
      ? 'WARNING LOGGED // NO FINE'
      : 'CITATION LOGGED // NO PURSUIT';
  copy.textContent = !cargoWasActive
    ? (roadsideStopWasSafe
      ? warning
        ? 'The officer logged a warning. No cash was deducted, and no pursuit was started.'
        : 'The officer recorded the speed citation. No cargo was declared, and no pursuit was started.'
      : 'The citation was recorded without a safe roadside stop. No pursuit was started.')
    : result.passed
      ? `The case stayed sealed during the roadside inspection. Exposure is now ${Math.round(result.exposure)}%.`
      : 'The roadside inspection found the unmarked case. The run is compromised and the payout is lost.';
  location.textContent = context.district;
  cargo.textContent = !cargoWasActive
    ? 'NO ACTIVE CASE // DRIVE LEGAL'
    : result.passed
      ? `INSPECTION CLEAR // RISK ${Math.round(result.exposure)}%`
      : 'CARGO BUSTED // NO PAYOUT';
  record.textContent = outcomeType === 'compromised'
    ? 'RUN LOST // NO PAYOUT'
    : warning
      ? 'WARNING // $0'
      : `CITATION // -$${context.fine}`;
  outcome.hidden = false;
  outcome.classList.toggle('failed', outcomeType === 'compromised');
  outcome.classList.toggle('cleared', clean);
  outcome.innerHTML = outcomeType === 'compromised'
    ? '<b>RUN TERMINATED</b><span>The case is written off. Return to the depot and wait for the next available contract.</span>'
    : '<b>ROAD CONTACT RESOLVED</b><span>Return to the road when ready. The stop does not create a pursuit or heat state.</span>';
  action.innerHTML = 'RETURN TO ROAD <span>ENTER</span>';
}

function resolveRoadsideStop() {
  if (!roadsideStopOpen) return;
  if (roadsideStopResolved) {
    roadsideStopOpen = false;
    roadsideStopResolved = false;
    roadsideStopWasSafe = false;
    const overlay = document.querySelector('#roadside-stop-overlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (soundOn) ensureAudio();
    return;
  }
  const context = currentRoadsideStopContext();
  const cargoWasActive = cargoRun.active;
  const mission = cargoWasActive ? (cargoRun.route === 'mountain' ? MOUNTAIN_CARGO_MISSION : currentCityDeliveryMission()) : null;
  const exposureBefore = cargoRun.exposure;
  const result = cargoWasActive ? inspectCargoAtRoadside() : { active: false, passed: true, exposure: exposureBefore };
  const outcomeType = cargoWasActive ? (result.passed ? 'inspection-cleared' : 'compromised') : context.severity;
  policeState = 'ticket';
  policeTime = 0;
  policeSiren.visible = false;
  if (cargoWasActive && result.passed) {
    addPhoneMessage({
      missionId: mission.id,
      kind: 'inspection',
      category: 'INSPECTION',
      sender: 'MARA // OPERATIONS',
      subject: `STOP CLEARED // ${mission.title}`,
      body: `The roadside contact cleared the case in ${context.district}. Exposure is now ${Math.round(result.exposure)}%. Keep the next stretch calm and finish the handoff.`,
      status: `CLEARED // RISK ${Math.round(result.exposure)}%`,
    }, { notify: false });
  }
  recordRoadsideStopHistory({
    district: context.district,
    speed: context.recordedSpeed,
    speedLimit: context.speedLimit,
    safeStop: roadsideStopWasSafe,
    outcome: outcomeType,
    fine: context.fine,
    exposureBefore,
    exposureAfter: result.exposure,
    cargoMission: mission?.title || '',
  });
  saveProgress();
  roadsideStopResolved = true;
  renderRoadsideStopResult(result, cargoWasActive, outcomeType);
  if (!cargoWasActive) showToast(
    context.severity === 'warning' ? 'SPEED WARNING' : 'SPEED CITATION',
    context.severity === 'warning' ? 'Warning logged. Keep to the posted limit.' : roadsideStopWasSafe ? 'Thank you. Please keep to the posted limit.' : 'Citation recorded without a roadside stop.',
    context.severity === 'warning' ? 'NO FINE' : `-$${context.fine}`,
  );
}

function beginRadarStop(site, details = {}) {
  if (!site || policeState !== 'idle' || garageOpen || gamePaused || roadsideStopOpen) return;
  const speedLimit = Math.max(0, Number(details.speedLimit) || getSpeedLimit(player.position.x, player.position.z));
  const recordedSpeed = Math.max(0, Number(details.recordedSpeed) || Math.abs(player.speed) * 3.1);
  roadsideStopContext = {
    recordedSpeed,
    speedLimit,
    severity: details.severity === 'warning' ? 'warning' : 'citation',
    fine: Number.isFinite(Number(details.fine)) ? Math.max(0, Number(details.fine)) : 45,
    district: districtAt(site.position.x, site.position.z),
  };
  activeRadarSite = site;
  site.cooldown = 26;
  policeState = 'radar';
  policeTime = 0;
  policeVehicle.position.copy(site.position);
  policeVehicle.position.y = .02;
  policeVehicle.rotation.y = site.heading;
  policeVehicle.visible = true;
  policeSiren.visible = false;
  playTone(120, .28, .08, 'sawtooth', -45);
  window.setTimeout(() => playTone(240, .16, .045, 'square', -90), 130);
  showToast('SPEED RADAR', `${Math.round(recordedSpeed)} KM/H // LIMIT ${Math.round(speedLimit)} // ${roadsideStopContext.district}`, 'PULL OVER');
}

function endRadarStop() {
  policeState = 'idle';
  policeTime = 0;
  roadsideStopOpen = false;
  roadsideStopResolved = false;
  roadsideStopWasSafe = false;
  roadsideStopContext = null;
  activeRadarSite = null;
  policeVehicle.visible = false;
  policeSiren.visible = false;
  policeRed.visible = false;
  policeBlue.visible = false;
  const overlay = document.querySelector('#roadside-stop-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
  }
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
      policeState = 'stopped';
      policeTime = 0;
      policeSiren.visible = false;
      showRoadsideStopPanel(stoppedSafely);
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

function vehicleValue(style = player.selectedStyle) {
  const vehicle = vehicleCatalogEntry(style);
  // The starter is free at the Market, but it still has a real insured value so
  // water recovery cannot become a cost-free reset button.
  return Math.max(1, Number(vehicle.vehicleValue) || Number(vehicle.price) || 1000);
}

function vehicleRepairCost() {
  const missingCondition = Math.max(0, 100 - player.condition);
  return missingCondition ? Math.ceil((missingCondition / 100) * vehicleValue() * DAMAGE_CONFIG.repairFraction) : 0;
}

function vehicleRecoveryCost() {
  return Math.ceil(vehicleValue() * DAMAGE_CONFIG.waterRecoveryFraction);
}

function waterBodyAt(x, z) {
  const lake = worldRegions.find((region) => region.type === 'lake');
  if (lake && Math.abs(x - lake.x) <= 180 && Math.abs(z - lake.z) <= 135) return 'LAKE AURORA';
  // The small waterfront loop has a visible ocean inlet below the promenade.
  // Its road surface stays above z -120, so a driver must actually leave the
  // road and enter the water rather than being punished for using the loop.
  if (Math.abs(x) <= 154 && z >= -144 && z <= -120) return 'AURORA OCEAN';
  if (Math.abs(x) > WORLD_LIMIT || Math.abs(z) > WORLD_LIMIT) return 'AURORA OCEAN';
  return '';
}

function enterVehicleWater(body) {
  if (player.waterRecoveryPending) return;
  const cargoWasActive = cargoRun.active;
  if (cargoWasActive) failCargoRun('CARGO LOST', `The unmarked case was lost in ${body.toLowerCase()}.`, 'NO PAYOUT');
  player.waterRecoveryPending = true;
  player.submerged = true;
  player.waterBody = body;
  player.recoveryCost = vehicleRecoveryCost();
  player.waterSinkTime = 0;
  player.speed = 0;
  player.condition = Math.min(player.condition, 1);
  Object.keys(input).forEach((key) => { input[key] = false; });
  player.mesh.position.copy(player.position);
  player.mesh.position.y = player.position.y;
  saveProgress();
  updateGarageUi();
  const surfaceState = document.querySelector('#surface-state');
  if (surfaceState) {
    surfaceState.textContent = 'SUBMERGED';
    surfaceState.style.color = 'var(--pink)';
  }
  showToast(cargoWasActive ? 'CARGO LOST // VEHICLE SUBMERGED' : 'VEHICLE SUBMERGED', cargoWasActive ? `${body} recovery required. The run paid nothing.` : `${body} recovery requires half the vehicle value`, `$${player.recoveryCost.toLocaleString('en-US')}`);
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
  const recoveryCost = vehicleRecoveryCost();
  document.querySelectorAll('[data-repair-cost]').forEach((element) => { element.textContent = repairCost ? `$${repairCost.toLocaleString('en-US')}` : 'READY'; });
  document.querySelectorAll('[data-repair-action]').forEach((button) => {
    button.disabled = player.waterRecoveryPending || !repairCost || player.cash < repairCost;
    button.classList.toggle('ready', !repairCost && !player.waterRecoveryPending);
  });
  document.querySelectorAll('[data-revive-cost]').forEach((element) => { element.textContent = `$${recoveryCost.toLocaleString('en-US')}`; });
  document.querySelectorAll('[data-revive-action]').forEach((button) => {
    button.hidden = !player.waterRecoveryPending;
    button.disabled = !player.waterRecoveryPending || player.cash < recoveryCost;
    button.classList.toggle('ready', player.waterRecoveryPending && player.cash >= recoveryCost);
  });
  const recoveryPanel = document.querySelector('#water-recovery-panel');
  if (recoveryPanel) {
    recoveryPanel.classList.toggle('visible', player.waterRecoveryPending);
    recoveryPanel.setAttribute('aria-hidden', String(!player.waterRecoveryPending));
  }
  const recoveryPanelCost = document.querySelector('#water-recovery-cost');
  if (recoveryPanelCost) recoveryPanelCost.textContent = `$${recoveryCost.toLocaleString('en-US')}`;
  const recoveryBody = document.querySelector('#water-recovery-body');
  if (recoveryBody) recoveryBody.textContent = player.waterRecoveryPending
    ? `${player.waterBody || 'Water'} recovery is required. Pay half the vehicle value to revive and tow it to your last safe road.`
    : '';
  const damageCount = document.querySelectorAll('[data-damage-count]');
  const damageSummary = `${player.damageRecords?.length || 0} IMPACT MARKS // ${player.waterRecoveryPending ? `RECOVERY $${recoveryCost.toLocaleString('en-US')}` : repairCost ? `REPAIR $${repairCost.toLocaleString('en-US')}` : 'REPAIR READY'}`;
  damageCount.forEach((element) => { element.textContent = damageSummary; });
}

function applyVehicleDamage(amount, source = 'impact', impact = {}) {
  if (amount <= 0 || player.disabledTimer > 0) return;
  player.condition = clamp(player.condition - amount, 1, 100);
  addVisibleDamage(player.mesh, amount, impact);
  recordCargoExposure(clamp(3 + amount * .42, 3, 20), source);
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
  if (player.waterRecoveryPending) {
    showToast('RECOVERY REQUIRED', 'Pay the water recovery fee before repair work can begin', `$${vehicleRecoveryCost().toLocaleString('en-US')}`);
    return;
  }
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
  clearVisibleVehicleDamage(player.mesh);
  saveProgress();
  updateGarageUi();
  playTone(320, .18, .08, 'sine', 180);
  showToast('REPAIRS COMPLETE', 'Dents, scratches, and damaged panels restored', `$${cost.toLocaleString('en-US')}`);
}

function recoverVehicle() {
  if (!player.waterRecoveryPending) {
    showToast('RECOVERY NOT REQUIRED', 'The vehicle is already on solid ground', 'READY TO DRIVE');
    return;
  }
  const cost = vehicleRecoveryCost();
  if (player.cash < cost) {
    showToast('RECOVERY FUNDS TOO LOW', `You need $${cost.toLocaleString('en-US')} to revive this vehicle`, 'EARN MORE CASH');
    return;
  }
  player.cash -= cost;
  player.condition = 100;
  player.disabledTimer = 0;
  player.submerged = false;
  player.waterRecoveryPending = false;
  player.waterBody = '';
  player.waterSinkTime = 0;
  player.recoveryCost = 0;
  player.position.copy(player.lastSafePosition || new THREE.Vector3(0, .02, 0));
  player.position.y = getRoadHeightAt(player.position.x, player.position.z);
  player.speed = 0;
  player.heading = 0;
  player.mesh.position.copy(player.position);
  player.mesh.rotation.y = player.heading;
  clearVisibleVehicleDamage(player.mesh);
  saveProgress();
  updateGarageUi();
  playTone(240, .2, .08, 'sine', 180);
  showToast('VEHICLE RECOVERED', 'Tow service revived the vehicle and restored the body', `$${cost.toLocaleString('en-US')}`);
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
  if (meta) meta.innerHTML = `<span>${vehicle.className.includes('ELECTRIC') ? 'AWD' : 'RWD'}</span><i></i><span>${vehicle.className}</span><i></i><span id="surface-state"${player.waterRecoveryPending ? ' style="color:var(--pink)"' : ''}>${player.waterRecoveryPending ? 'SUBMERGED' : 'ASPHALT'}</span>`;
  const garageHeading = document.querySelector('#garage-overlay .garage-header h2');
  if (garageHeading) garageHeading.textContent = vehicle.name;
  const profile = document.querySelector('#garage-overlay .garage-specs strong');
  if (profile) profile.textContent = `${paintName(player.paint)} SPEC`;
  const garageClass = document.querySelector('#garage-overlay .garage-specs > span');
  if (garageClass) garageClass.textContent = `${vehicle.className} / ${vehicle.style.toUpperCase()}`;
}

function updateProgressionUi() {
  const milestone = document.querySelector('#delivery-milestone');
  if (milestone) milestone.textContent = deliveryMilestoneCopy();
  const deliveries = document.querySelector('#market-deliveries');
  if (deliveries) deliveries.textContent = String(player.completedDeliveries);
  const nextUnlock = document.querySelector('#market-next-unlock');
  if (nextUnlock) nextUnlock.textContent = deliveryMilestoneDetail();
}

function renderMarket() {
  const grid = document.querySelector('#market-grid');
  if (!grid) return;
  const ownedCount = document.querySelector('#market-owned-count');
  if (ownedCount) ownedCount.textContent = String(player.ownedCars.length);
  grid.innerHTML = VEHICLE_CATALOG.map((vehicle) => {
    const owned = player.ownedCars.includes(vehicle.style);
    const selected = player.selectedStyle === vehicle.style;
    const unlocked = isVehicleUnlocked(vehicle.style);
    const rule = vehicleUnlockRule(vehicle.style);
    const action = !unlocked ? 'LOCKED' : !owned ? 'BUY' : selected ? 'SELECTED' : 'SELECT';
    const buttonClass = !unlocked ? 'locked' : !owned ? 'buy' : selected ? 'selected-button' : '';
    const disabled = !unlocked || selected ? 'disabled' : '';
    const price = !unlocked ? `${rule?.deliveries || 0} DELIVERIES` : vehicle.price ? `$${vehicle.price.toLocaleString('en-US')}` : 'STARTER RIDE';
    const status = owned ? 'OWNED' : unlocked ? 'UNLOCKED' : `DELIVERY ${rule?.deliveries || 0}`;
    return `<article class="market-card ${owned ? 'owned' : ''} ${selected ? 'selected' : ''} ${!unlocked ? 'locked' : ''}" style="--card-paint:${vehicle.paint};--card-accent:${vehicle.accent}">
      <div class="market-art"><div class="market-art-car"></div><div class="market-art-wheel a"></div><div class="market-art-wheel b"></div></div>
      <div class="market-tag"><span>${vehicle.className}</span><b>${status}</b></div>
      <h3>${vehicle.name}</h3><p>${!unlocked ? `${rule?.deliveries || 0} completed deliveries unlock this car.` : vehicle.description}</p>
      <div class="market-card-costs"><span>REPAIR CAP $${Math.ceil(vehicle.vehicleValue * DAMAGE_CONFIG.repairFraction).toLocaleString('en-US')}</span><span>WATER $${Math.ceil(vehicle.vehicleValue * DAMAGE_CONFIG.waterRecoveryFraction).toLocaleString('en-US')}</span></div>
      <div class="market-card-footer"><span class="market-price ${vehicle.price || !unlocked ? '' : 'free'}">${price}</span><button class="market-card-button ${buttonClass}" data-market-style="${vehicle.style}" type="button" ${disabled}>${action}</button></div>
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

function applyPlayerVehicleStyle(style, announce = true, force = false) {
  if (player.waterRecoveryPending && !force) {
    showToast('RECOVERY REQUIRED', 'Revive the submerged vehicle before changing cars', `$${vehicleRecoveryCost().toLocaleString('en-US')}`);
    return false;
  }
  if (!player.ownedCars.includes(style)) return false;
  const vehicle = vehicleCatalogEntry(style);
  const oldMesh = player.mesh;
  const oldParent = oldMesh.parent;
  const wasMenuCar = oldParent === menuGarage;
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
  nextMesh.visible = !starterMenuOpen;
  restoreVisibleDamage();
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
  if (player.waterRecoveryPending) {
    showToast('RECOVERY REQUIRED', 'Revive the submerged vehicle before using the Market', `$${vehicleRecoveryCost().toLocaleString('en-US')}`);
    return;
  }
  const vehicle = vehicleCatalogEntry(style);
  const rule = vehicleUnlockRule(style);
  if (!isVehicleUnlocked(style)) {
    showToast('VEHICLE LOCKED', `${vehicle.name} unlocks after ${rule?.deliveries || 0} completed deliveries`, `${player.completedDeliveries} / ${rule?.deliveries || 0}`);
    return;
  }
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

function renderProperties() {
  const grid = document.querySelector('#property-grid');
  if (!grid) return;
  grid.innerHTML = HOME_CATALOG.map((home) => {
    const owned = player.ownedHomes.includes(home.id);
    const selected = player.selectedHome === home.id;
    const action = selected ? 'CURRENT HOME' : owned ? 'SELECT HOME' : `BUY FOR $${home.price.toLocaleString('en-US')}`;
    const disabled = selected ? 'disabled' : '';
    return `<article class="property-card ${owned ? 'owned' : ''} ${selected ? 'selected' : ''}">
      <div class="property-art property-art-${home.style}"><span class="property-art-door"></span><span class="property-art-window a"></span><span class="property-art-window b"></span><span class="property-art-light"></span></div>
      <div class="property-card-top"><span>${home.className}</span><b>${owned ? (selected ? 'ACTIVE' : 'OWNED') : 'AVAILABLE'}</b></div>
      <h3>${home.name}</h3><p>${home.description}</p>
      <div class="property-card-meta"><span>${home.location}</span><strong>${home.price ? `$${home.price.toLocaleString('en-US')}` : 'STARTER'}</strong></div>
      <button class="property-card-button ${selected ? 'selected-button' : owned ? '' : 'buy'}" data-home-id="${home.id}" type="button" ${disabled}>${action}</button>
    </article>`;
  }).join('');
}

function updateHomeUi() {
  const home = selectedHomeEntry();
  const name = document.querySelector('#home-name');
  if (name) name.textContent = home.name;
  const location = document.querySelector('#home-location');
  if (location) location.textContent = home.location;
  updateHomePropertyVisuals();
}

function selectHome(id) {
  const home = HOME_CATALOG.find((entry) => entry.id === id);
  if (!home || !player.ownedHomes.includes(id)) return;
  if (player.waterRecoveryPending) {
    showToast('RECOVERY REQUIRED', 'Recover the submerged vehicle before changing safehouses', `$${vehicleRecoveryCost().toLocaleString('en-US')}`);
    return;
  }
  if (cargoRun.active || deliveryState === 'active' || mountainDeliveryState === 'active') {
    showToast('CARGO RUN LIVE', 'Finish or forfeit the current case before changing safehouses', 'NO TELEPORT');
    return;
  }
  player.selectedHome = id;
  spawnPlayerAtHome(true);
  saveProgress();
  updateHomeUi();
  updateGarageUi();
  showToast('HOME SELECTED', `${home.name} is now your spawn point`, home.location);
}

function purchaseHome(id) {
  const home = HOME_CATALOG.find((entry) => entry.id === id);
  if (!home) return;
  if (player.ownedHomes.includes(id)) {
    selectHome(id);
    return;
  }
  if (player.waterRecoveryPending) {
    showToast('RECOVERY REQUIRED', 'Recover the submerged vehicle before buying a safehouse', `$${vehicleRecoveryCost().toLocaleString('en-US')}`);
    return;
  }
  if (player.cash < home.price) {
    showToast('FUNDS TOO LOW', `${home.name} needs $${home.price.toLocaleString('en-US')}`, 'EARN MORE CASH');
    return;
  }
  player.cash -= home.price;
  player.ownedHomes.push(id);
  player.selectedHome = id;
  spawnPlayerAtHome(true);
  saveProgress();
  updateGarageUi();
  showToast('PROPERTY ACQUIRED', `${home.name} is now owned and selected`, `$${home.price.toLocaleString('en-US')}`);
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
  updateProgressionUi();
  updateDamageUi();
  renderMarket();
  renderOwnedGarage();
  renderProperties();
  updateHomeUi();
}

function formatSaveStamp(saved) {
  if (!saved?.updatedAt) return 'LOCAL SAVE // TIME UNKNOWN';
  const date = new Date(saved.updatedAt);
  if (Number.isNaN(date.getTime())) return 'LOCAL SAVE // TIME UNKNOWN';
  return `LAST PLAYED // ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function renderSaveSlots() {
  const list = document.querySelector('#save-slot-list');
  if (!list) return;
  const latest = latestSaveSlot();
  list.innerHTML = Array.from({ length: SAVE_SLOT_COUNT }, (_, index) => index + 1).map((slot) => {
    const saved = readSaveSlot(slot);
    const isLatest = saved && slot === latest;
    const home = HOME_CATALOG.find((entry) => entry.id === saved?.selectedHome) || HOME_CATALOG[0];
    const details = saved
      ? `${home.name} // ${Number(saved.completedDeliveries) || 0} DELIVERIES // $${(Number(saved.cash) || 0).toLocaleString('en-US')}`
      : 'EMPTY SLOT // START A NEW RUN';
    return `<article class="save-slot-card ${saved ? 'filled' : 'empty'} ${isLatest ? 'latest' : ''}">
      <div class="save-slot-mark"><span>0${slot}</span><i></i></div>
      <div class="save-slot-copy"><div><b>SAVE SLOT ${slot}</b><small>${saved ? (isLatest ? 'LATEST SAVE' : 'LOCAL PROFILE') : 'AVAILABLE'}</small></div><strong>${details}</strong><p>${saved ? formatSaveStamp(saved) : 'Your progress, cars, homes, and deliveries will be stored here.'}</p></div>
      <button class="save-slot-action ${saved ? '' : 'new'}" data-save-slot="${slot}" data-save-action="${saved ? 'load' : 'new'}" type="button">${saved ? 'LOAD SAVE' : 'START NEW RUN'} <span>↗</span></button>
    </article>`;
  }).join('');
}

function updateStartMenuUi() {
  const latestSlot = latestSaveSlot();
  const latest = latestSlot ? readSaveSlot(latestSlot) : null;
  const continueButton = document.querySelector('#menu-continue-button');
  const latestCopy = document.querySelector('#menu-latest-save');
  if (continueButton) continueButton.disabled = !latest;
  if (latestCopy) latestCopy.textContent = latest ? `SLOT ${latestSlot} // ${formatSaveStamp(latest)}` : 'NO LOCAL SAVE // PLAY TO START A PROFILE';
}

function setSaveSelectOpen(open) {
  saveSelectOpen = open;
  const overlay = document.querySelector('#save-select-overlay');
  if (!overlay) return;
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  if (open) renderSaveSlots();
}

function activateSaveSlot(slot, newRun = false) {
  const normalized = normalizeSaveSlot(slot);
  if (!newRun && !readSaveSlot(normalized)) return false;
  if (newRun) {
    activeSaveSlot = normalized;
    resetProgressStateToDefaults();
  } else {
    loadProgress(normalized);
  }
  endRadarStop();
  deliveryState = 'idle';
  mountainDeliveryState = 'idle';
  clearCargoRun();
  mountainDeliveryTime = 0;
  setCityDeliveryMission(player.completedDeliveries % CITY_DELIVERY_MISSIONS.length);
  applyPendingSavedRun();
  spawnPlayerAtHome();
  if (player.selectedStyle !== player.mesh.userData?.style) applyPlayerVehicleStyle(player.selectedStyle, false, true);
  else applyPaintToVehicleRoot(player.mesh, player.paint);
  restoreVisibleDamage();
  saveProgress();
  updateGarageUi();
  renderSaveSlots();
  updateStartMenuUi();
  setSaveSelectOpen(false);
  setStarterMenuOpen(false);
  showToast(newRun ? 'NEW PROFILE READY' : 'SAVE LOADED', `Save slot ${normalized} // ${selectedHomeEntry().name}`, `${player.completedDeliveries} DELIVERIES`);
  return true;
}

function continueLatestSave() {
  const latest = latestSaveSlot();
  if (!latest) {
    setSaveSelectOpen(true);
    return;
  }
  activateSaveSlot(latest, false);
}

function setMenuPage(page) {
  const validPages = ['home', 'market', 'garage', 'settings'];
  menuPage = validPages.includes(page) ? page : 'home';
  document.querySelectorAll('.menu-nav-button').forEach((button) => button.classList.toggle('active', button.dataset.menuPage === menuPage));
  document.querySelectorAll('.menu-page').forEach((section) => section.classList.toggle('active', section.dataset.menuContent === menuPage));
  updateGarageUi();
}

function updateMenuShowcaseReadout(showcase) {
  const region = document.querySelector('#menu-showcase-region');
  const location = document.querySelector('#menu-showcase-location');
  const copy = document.querySelector('#menu-showcase-copy');
  const index = document.querySelector('#menu-showcase-index');
  if (region) region.textContent = showcase.name;
  if (location) location.textContent = showcase.name;
  if (copy) copy.textContent = showcase.copy;
  if (index) index.textContent = `${String(menuShowcaseIndex + 1).padStart(2, '0')} / ${String(MENU_SHOWCASE_SCENES.length).padStart(2, '0')}`;
  document.querySelectorAll('.showcase-dot').forEach((dot) => dot.classList.toggle('active', Number(dot.dataset.showcaseIndex) === menuShowcaseIndex));
}

function resetMenuShowcase() {
  menuShowcaseElapsed = 0;
  menuShowcaseTransition = 1;
  const showcase = MENU_SHOWCASE_SCENES[menuShowcaseIndex];
  camera.position.set(showcase.camera[0], showcase.camera[1], showcase.camera[2]);
  camera.lookAt(new THREE.Vector3(showcase.target[0], showcase.target[1], showcase.target[2]));
  camera.fov = 48;
  camera.updateProjectionMatrix();
  updateMenuShowcaseReadout(showcase);
}

function setStarterMenuOpen(open) {
  starterMenuOpen = open;
  const overlay = document.querySelector('#main-menu-overlay');
  overlay.classList.toggle('open', open);
  overlay.setAttribute('aria-hidden', String(!open));
  if (open) {
    setSaveSelectOpen(false);
    if (garageOpen) setGarageOpen(false);
    if (gamePaused) setPauseOpen(false);
    if (worldMapOpen) setWorldMapOpen(false);
    if (phoneOpen) setPhoneOpen(false);
    if (roadsideStopOpen) endRadarStop();
    Object.keys(input).forEach((key) => { input[key] = false; });
    touchSteer = 0;
    world.visible = true;
    menuGarage.visible = false;
    if (player.mesh.parent === menuGarage) {
      player.mesh.parent.remove(player.mesh);
      actors.add(player.mesh);
    }
    player.mesh.visible = false;
    player.speed = 0;
    ensureMenuShowcaseSectors();
    resetMenuShowcase();
    setMenuPage('home');
    renderSaveSlots();
    updateStartMenuUi();
    updateGarageUi();
    ensureAudio();
    if (audioState.master && audioState.context) audioState.master.gain.setTargetAtTime(soundOn ? .2 : 0, audioState.context.currentTime, .08);
  } else {
    if (phoneOpen) setPhoneOpen(false);
    setSaveSelectOpen(false);
    world.visible = true;
    menuGarage.visible = false;
    if (player.mesh.parent !== actors) {
      player.mesh.parent?.remove(player.mesh);
      actors.add(player.mesh);
    }
    player.mesh.visible = true;
    endRadarStop();
    player.mesh.position.copy(player.position);
    player.mesh.rotation.y = player.heading;
    lastStreamSectorKey = '';
    updateWorldStreaming(true);
    gamePaused = false;
    if (soundOn) ensureAudio();
  }
}

function updateMenuShowcase(time, dt) {
  if (!starterMenuOpen) return;
  menuShowcaseElapsed += dt;
  if (menuShowcaseElapsed >= 5.5) {
    menuShowcaseElapsed = 0;
    menuShowcaseTransition = 0;
    menuShowcaseIndex = (menuShowcaseIndex + 1) % MENU_SHOWCASE_SCENES.length;
    updateMenuShowcaseReadout(MENU_SHOWCASE_SCENES[menuShowcaseIndex]);
  }
  menuShowcaseTransition = Math.min(1, menuShowcaseTransition + dt / 1.1);
  const showcase = MENU_SHOWCASE_SCENES[menuShowcaseIndex];
  const drift = Math.sin(time * .00024 + menuShowcaseIndex) * 3.5;
  const desiredCamera = new THREE.Vector3(showcase.camera[0] + drift * .22, showcase.camera[1] + Math.sin(time * .00019) * 1.2, showcase.camera[2] + drift);
  camera.position.lerp(desiredCamera, 1 - Math.exp(-1.8 * dt));
  camera.lookAt(new THREE.Vector3(showcase.target[0], showcase.target[1], showcase.target[2]));
  camera.fov = damp(camera.fov, 48, 3, dt);
  camera.updateProjectionMatrix();
  const wash = document.querySelector('#menu-showcase-wash');
  if (wash) wash.style.opacity = menuShowcaseTransition < .5 ? String((.5 - menuShowcaseTransition) * 1.6) : '0';
}

function setGarageOpen(open) {
  if (open && roadsideStopOpen) return;
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
  if (open && (starterMenuOpen || garageOpen || gamePaused || roadsideStopOpen)) return;
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
  if (open && (starterMenuOpen || roadsideStopOpen)) return;
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
  try {
    const previous = readSaveSlot(activeSaveSlot);
    localStorage.removeItem(saveSlotKey(activeSaveSlot));
    if (activeSaveSlot === 1 || previous?.saveSlot === activeSaveSlot) localStorage.removeItem(LEGACY_SAVE_KEY);
    if (Number(localStorage.getItem(LATEST_SAVE_KEY)) === activeSaveSlot) localStorage.removeItem(LATEST_SAVE_KEY);
  } catch (error) {
    console.warn('Progress reset unavailable.', error);
  }
  resetProgressStateToDefaults();
  setCityDeliveryMission(0);
  deliveryState = 'idle';
  mountainDeliveryState = 'idle';
  clearCargoRun();
  clearVisibleVehicleDamage(player.mesh);
  applyPlayerVehicleStyle(PROGRESSION_CONFIG.starterStyle, false, true);
  applyPlayerPaint(player.paint, false);
  spawnPlayerAtHome(true);
  resetCollectibles();
  renderSaveSlots();
  updateStartMenuUi();
  updateGarageUi();
  showToast('PROFILE RESET', `Save slot ${activeSaveSlot} cleared`, 'LOCAL SAVE REMOVED');
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
  engineSub: null,
  engineFilter: null,
  engineGain: null,
  harmonicGain: null,
  subGain: null,
  roadNoiseGain: null,
  tireNoiseGain: null,
  tireNoiseFilter: null,
  windNoiseGain: null,
  windNoiseFilter: null,
  noiseSources: [],
  lastIndicatorTick: -1,
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

    const engineSub = context.createOscillator();
    engineSub.type = 'sine';
    engineSub.frequency.value = 24;
    const subGain = context.createGain();
    subGain.gain.value = .006;
    engineSub.connect(subGain);
    subGain.connect(master);
    engineSub.start();

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

    const tireNoise = context.createBufferSource();
    tireNoise.buffer = noiseBuffer;
    tireNoise.loop = true;
    const tireNoiseFilter = context.createBiquadFilter();
    tireNoiseFilter.type = 'bandpass';
    tireNoiseFilter.frequency.value = 1100;
    tireNoiseFilter.Q.value = 1.1;
    const tireNoiseGain = context.createGain();
    tireNoiseGain.gain.value = 0;
    tireNoise.connect(tireNoiseFilter);
    tireNoiseFilter.connect(tireNoiseGain);
    tireNoiseGain.connect(master);
    tireNoise.start();

    const windNoise = context.createBufferSource();
    windNoise.buffer = noiseBuffer;
    windNoise.loop = true;
    const windNoiseFilter = context.createBiquadFilter();
    windNoiseFilter.type = 'highpass';
    windNoiseFilter.frequency.value = 480;
    const windNoiseGain = context.createGain();
    windNoiseGain.gain.value = 0;
    windNoise.connect(windNoiseFilter);
    windNoiseFilter.connect(windNoiseGain);
    windNoiseGain.connect(master);
    windNoise.start();

    Object.assign(audioState, {
      context,
      master,
      engineOsc,
      engineHarmonic,
      engineSub,
      engineFilter,
      engineGain,
      harmonicGain,
      subGain,
      roadNoiseGain,
      tireNoiseGain,
      tireNoiseFilter,
      windNoiseGain,
      windNoiseFilter,
      noiseSources: [roadNoise, tireNoise, windNoise],
      initialized: true,
    });
  }
  if (audioState.context.state === 'suspended') audioState.context.resume();
}

function updateAudio() {
  if (!audioState.initialized || !audioState.context) return;
  const now = audioState.context.currentTime;
  if (starterMenuOpen || garageOpen || gamePaused || worldMapOpen || phoneOpen || roadsideStopOpen) {
    audioState.engineGain.gain.setTargetAtTime(0, now, .08);
    audioState.harmonicGain.gain.setTargetAtTime(0, now, .08);
    audioState.subGain.gain.setTargetAtTime(0, now, .08);
    audioState.roadNoiseGain.gain.setTargetAtTime(0, now, .08);
    audioState.tireNoiseGain.gain.setTargetAtTime(0, now, .08);
    audioState.windNoiseGain.gain.setTargetAtTime(0, now, .08);
    audioState.master.gain.setTargetAtTime(soundOn ? (starterMenuOpen ? .2 : garageOpen ? .22 : 0) : 0, now, .08);
    return;
  }
  const speedRatio = clamp(Math.abs(player.speed) / 53, 0, 1);
  const accelerating = input.forward || gamepadState.forward;
  const onRoad = isOnRoad(player.position.x, player.position.z);
  const steeringLoad = clamp(Math.abs(drivingPresentation.steering) * speedRatio, 0, 1);
  const handbrakeLoad = input.handbrake && speedRatio > .16 ? 1 : 0;
  const offRoadLoad = onRoad ? 0 : .32;
  audioState.engineOsc.frequency.setTargetAtTime(48 + speedRatio * 180 + (accelerating ? 15 : 0), now, .045);
  audioState.engineHarmonic.frequency.setTargetAtTime(96 + speedRatio * 360, now, .045);
  audioState.engineSub.frequency.setTargetAtTime(24 + speedRatio * 38, now, .08);
  audioState.engineFilter.frequency.setTargetAtTime(520 + speedRatio * 820, now, .08);
  audioState.engineGain.gain.setTargetAtTime(.012 + speedRatio * .072 + (accelerating ? .024 : 0), now, .08);
  audioState.harmonicGain.gain.setTargetAtTime(.008 + speedRatio * .028, now, .08);
  audioState.subGain.gain.setTargetAtTime(.004 + speedRatio * .018 + (accelerating ? .006 : 0), now, .1);
  audioState.roadNoiseGain.gain.setTargetAtTime(speedRatio * (onRoad ? .045 : .075), now, .12);
  audioState.tireNoiseFilter.frequency.setTargetAtTime(850 + steeringLoad * 950 + handbrakeLoad * 650, now, .08);
  audioState.tireNoiseGain.gain.setTargetAtTime((steeringLoad * .028) + (handbrakeLoad * .065) + offRoadLoad * speedRatio * .022, now, .08);
  audioState.windNoiseFilter.frequency.setTargetAtTime(460 + speedRatio * 1180, now, .12);
  audioState.windNoiseGain.gain.setTargetAtTime(speedRatio * speedRatio * .052, now, .16);
  const indicatorActive = input.left || input.right || Math.abs(gamepadState.steer) > .2;
  const indicatorTick = Math.floor(performance.now() / 520);
  if (!indicatorActive) audioState.lastIndicatorTick = -1;
  else if (indicatorTick !== audioState.lastIndicatorTick) {
    audioState.lastIndicatorTick = indicatorTick;
    playTone(760, .045, .018, 'square', -150);
  }
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
    if (saveSelectOpen) {
      if (event.code === 'Escape' && !event.repeat) setSaveSelectOpen(false);
      return;
    }
    if (event.code === 'Escape' && !event.repeat && menuPage !== 'home') setMenuPage('home');
    if (event.code === 'Enter' && !event.repeat && menuPage === 'home') setSaveSelectOpen(true);
    return;
  }
  if (roadsideStopOpen) {
    if (['Enter', 'Space'].includes(event.code) && !event.repeat) {
      event.preventDefault();
      resolveRoadsideStop();
    }
    return;
  }
  if (event.code === 'Escape' && !event.repeat) {
    if (phoneOpen) setPhoneOpen(false);
    else if (worldMapOpen) setWorldMapOpen(false);
    else if (garageOpen) setGarageOpen(false);
    else if (gamePaused) setPauseOpen(false);
    else setPauseOpen(true);
    return;
  }
  if (event.code === 'KeyP' && !event.repeat) {
    if (!garageOpen && !worldMapOpen && !gamePaused) setPhoneOpen(!phoneOpen);
    return;
  }
  if (event.code === 'KeyM' && !event.repeat) {
    if (phoneOpen) return;
    if (worldMapOpen) setWorldMapOpen(false);
    else if (!garageOpen && !gamePaused) setWorldMapOpen(true);
    return;
  }
  if (worldMapOpen || phoneOpen) return;
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
  document.querySelector('#mobile-phone').addEventListener('click', () => setPhoneOpen(!phoneOpen));
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
document.querySelector('#phone-toggle').addEventListener('click', () => setPhoneOpen(!phoneOpen));
document.querySelector('#phone-close').addEventListener('click', () => setPhoneOpen(false));
document.querySelector('#phone-overlay').addEventListener('click', (event) => {
  if (event.target.id === 'phone-overlay') setPhoneOpen(false);
});
document.querySelector('#phone-thread-list').addEventListener('click', (event) => {
  const thread = event.target.closest('[data-phone-id]');
  if (thread) selectPhoneMessage(thread.dataset.phoneId);
});
document.querySelector('#phone-mark-all').addEventListener('click', markAllPhoneMessagesRead);
document.querySelector('#roadside-stop-action').addEventListener('click', resolveRoadsideStop);
document.querySelector('#map-expand').addEventListener('click', () => setWorldMapOpen(!worldMapOpen));
document.querySelector('#world-map-close').addEventListener('click', () => setWorldMapOpen(false));
document.querySelector('#world-map-close-button').addEventListener('click', () => setWorldMapOpen(false));
document.querySelector('#world-map-overlay').addEventListener('click', (event) => {
  if (event.target.id === 'world-map-overlay') setWorldMapOpen(false);
});
document.querySelector('#garage-open').addEventListener('click', () => setGarageOpen(true));
document.querySelector('#water-recovery-open-garage').addEventListener('click', () => setGarageOpen(true));
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
document.querySelector('#menu-play-button').addEventListener('click', () => setSaveSelectOpen(true));
document.querySelector('#menu-continue-button').addEventListener('click', continueLatestSave);
document.querySelector('#menu-settings-button').addEventListener('click', () => setMenuPage('settings'));
document.querySelector('#save-select-close').addEventListener('click', () => setSaveSelectOpen(false));
document.querySelector('#save-select-overlay').addEventListener('click', (event) => {
  if (event.target.id === 'save-select-overlay') setSaveSelectOpen(false);
});
document.querySelector('#save-slot-list').addEventListener('click', (event) => {
  const button = event.target.closest('[data-save-slot]');
  if (!button) return;
  activateSaveSlot(button.dataset.saveSlot, button.dataset.saveAction === 'new');
});
document.querySelectorAll('.showcase-dot').forEach((dot) => {
  dot.addEventListener('click', () => {
    menuShowcaseIndex = clamp(Number(dot.dataset.showcaseIndex), 0, MENU_SHOWCASE_SCENES.length - 1);
    menuShowcaseElapsed = 0;
    menuShowcaseTransition = 0;
    updateMenuShowcaseReadout(MENU_SHOWCASE_SCENES[menuShowcaseIndex]);
  });
});
document.querySelector('#main-menu-button').addEventListener('click', () => {
  saveProgress();
  setPauseOpen(false);
  setStarterMenuOpen(true);
});
document.querySelector('#market-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-market-style]');
  if (button) purchaseMarketVehicle(button.dataset.marketStyle);
});
document.querySelector('#property-grid').addEventListener('click', (event) => {
  const button = event.target.closest('[data-home-id]');
  if (!button) return;
  const homeId = button.dataset.homeId;
  if (player.ownedHomes.includes(homeId)) selectHome(homeId);
  else purchaseHome(homeId);
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
document.querySelectorAll('[data-revive-action]').forEach((button) => {
  button.addEventListener('click', recoverVehicle);
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
  if (player.waterRecoveryPending) {
    showToast('RECOVERY REQUIRED', 'The vehicle is submerged. Open Garage and pay the recovery fee.', `$${vehicleRecoveryCost().toLocaleString('en-US')}`);
    return;
  }
  const cargoAbandoned = cargoRun.active;
  if (cargoAbandoned) failCargoRun('CARGO ABANDONED', 'Resetting the vehicle forfeited the unmarked case.', 'NO PAYOUT');
  resetRoadFurniture();
  const home = spawnPlayerAtHome(true);
  if (!cargoAbandoned) showToast('VEHICLE RESET', `Back at ${home.name}`, '');
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

function recordTrafficViolation(label, fine, radarSite = null, details = {}) {
  if (player.violationCooldown > 0) return;
  const recordedSpeed = Math.max(0, Number(details.recordedSpeed) || Math.abs(player.speed) * 3.1);
  const speedLimit = Math.max(0, Number(details.speedLimit) || getSpeedLimit(player.position.x, player.position.z));
  const severity = radarSite && recordedSpeed - speedLimit < 16 ? 'warning' : 'citation';
  const appliedFine = severity === 'warning' ? 0 : fine;
  player.cash = Math.max(0, player.cash - appliedFine);
  player.trafficViolations += 1;
  player.speedingTime = 0;
  player.violationCooldown = 7;
  recordCargoExposure(CARGO_RUN_CONFIG.violationExposure, label);
  saveProgress();
  updateGarageUi();
  playTone(180, .18, .08, 'square', -55);
  if (radarSite) {
    showToast(severity === 'warning' ? 'SPEED WARNING' : 'SPEED RADAR', `${label} detected at a roadside unit`, appliedFine ? `-$${appliedFine}` : 'NO FINE');
    beginRadarStop(radarSite, { recordedSpeed, speedLimit, severity, fine: appliedFine });
  } else {
    showToast('TRAFFIC CITATION', `${label} violation recorded`, `-$${appliedFine}`);
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
  if (onRoad && speedKmh > speedLimit + 4) {
    recordCargoExposure(dt * clamp((speedKmh - speedLimit) * .16, .4, 3.2), 'speeding');
  }
  if (onRoad && speedKmh > speedLimit + 10) {
    player.speedingTime += dt;
    const radarSite = nearestSpeedRadarSite();
    if (radarSite && player.speedingTime > 1.8 && player.violationCooldown <= 0) recordTrafficViolation(`OVER LIMIT ${speedLimit}`, 45, radarSite, { recordedSpeed: speedKmh, speedLimit });
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
    // Water is a recoverable world state, not a solid bumper. Let the player
    // cross the lake edge far enough for waterBodyAt() to trigger recovery.
    if (obstacle.type === 'lake-water') continue;
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

function updateVehiclePresentation(dt, steering, onRoad, handbraking = false) {
  drivingPresentation.time += dt;
  drivingPresentation.steering = damp(drivingPresentation.steering, steering, 11, dt);
  const acceleration = (player.speed - drivingPresentation.visualSpeed) / Math.max(.016, dt);
  drivingPresentation.visualSpeed = damp(drivingPresentation.visualSpeed, player.speed, 13, dt);
  const speedRatio = clamp(Math.abs(player.speed) / Math.max(1, vehicleCatalogEntry().turnSpeed), 0, 1);
  const load = clamp(acceleration * .0042, -.085, .085);
  const targetPitch = onRoad ? -load : -load * .45;
  const targetRoll = clamp(-drivingPresentation.steering * speedRatio * (handbraking ? .14 : .075), -.12, .12);
  const targetSuspension = onRoad
    ? Math.sin(drivingPresentation.time * (8.5 + speedRatio * 7)) * speedRatio * .018
    : Math.sin(drivingPresentation.time * 6.5) * .012;
  drivingPresentation.bodyPitch = damp(drivingPresentation.bodyPitch, targetPitch, 8, dt);
  drivingPresentation.bodyRoll = damp(drivingPresentation.bodyRoll, targetRoll, 8, dt);
  drivingPresentation.suspension = damp(drivingPresentation.suspension, targetSuspension, 11, dt);
  player.mesh.position.copy(player.position);
  player.mesh.position.y += drivingPresentation.suspension;
  player.mesh.rotation.y = player.heading;
  player.mesh.rotation.x = drivingPresentation.bodyPitch;
  player.mesh.rotation.z = drivingPresentation.bodyRoll;
  player.mesh.userData.wheels.forEach((wheel) => {
    if (wheel.userData.isFront) wheel.rotation.y = drivingPresentation.steering * .22;
  });
}

function updatePlayer(dt) {
  collisionCooldown = Math.max(0, collisionCooldown - dt);
  player.violationCooldown = Math.max(0, player.violationCooldown - dt);
  if (player.waterRecoveryPending) {
    player.waterSinkTime = Math.min(2.4, player.waterSinkTime + dt);
    player.speed = 0;
    player.mesh.position.copy(player.position);
    player.mesh.position.y = player.position.y - Math.min(.92, player.waterSinkTime * .52);
    player.mesh.rotation.y = player.heading;
    player.mesh.rotation.z = Math.sin(player.waterSinkTime * 1.4) * .045;
    updatePlayerLighting(0);
    setBrakeLights(player.mesh, true);
    return;
  }
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
  if (onRoad) player.lastSafePosition.copy(player.position);
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
  const waterBody = waterBodyAt(player.position.x, player.position.z);
  if (waterBody) {
    enterVehicleWater(waterBody);
    return;
  }
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
      drivingPresentation.cameraShake = Math.max(drivingPresentation.cameraShake, clamp(impactSpeed / 42, .08, .26));
      playImpact(trafficHit);
      const furnitureHit = staticCollision.breakable && !trafficHit;
      const impactOrigin = trafficCollision.policeHit
        ? policeVehicle.position.clone()
        : trafficCollision.vehicle?.mesh.position.clone()
          || (staticCollision.obstacle ? new THREE.Vector3(staticCollision.obstacle.x, player.position.y, staticCollision.obstacle.z) : player.position.clone().add(forward));
      const damage = clamp(impactSpeed * (trafficHit ? 1.35 : furnitureHit ? .58 : .92) + (trafficCollision.policeHit ? 7 : 0), 2, 36);
      applyVehicleDamage(damage, trafficCollision.policeHit ? 'POLICE IMPACT' : furnitureHit ? 'ROAD FURNITURE' : 'COLLISION', { worldPosition: impactOrigin, seed: (player.damageSequence || 0) + 1 });
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
  player.mesh.userData.wheels.forEach((wheel) => {
    wheel.rotation.z = Math.PI / 2;
    wheel.children[0].rotation.x -= player.speed * dt * 1.8;
  });
  player.mesh.userData.loadedWheels?.forEach((wheel) => {
    wheel.rotation.x -= player.speed * dt * 1.8;
  });
  updateVehiclePresentation(dt, steering, onRoad, handbraking);
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

function updateTrafficLighting(dt) {
  trafficLightingElapsed += dt;
  if (trafficLightingElapsed < .12) return;
  trafficLightingElapsed = 0;
  const vehicles = [...traffic, ...mountainTraffic, ...regionalTraffic];
  vehicles.forEach((vehicle) => {
    vehicle.mesh.userData.trafficHeadlights?.forEach((light) => { light.visible = false; });
  });
  const candidates = vehicles
    .map((vehicle) => ({ vehicle, distanceSq: vehicle.mesh.position.distanceToSquared(player.position) }))
    .filter(({ vehicle, distanceSq }) => vehicle.mesh.visible && vehicle.mesh.userData.trafficHeadlights?.length && distanceSq < 140 * 140)
    .sort((a, b) => a.distanceSq - b.distanceSq)
    .slice(0, 12);
  candidates.forEach(({ vehicle, distanceSq }) => {
    const falloff = 1 - Math.sqrt(distanceSq) / 140;
    vehicle.mesh.userData.trafficHeadlights.forEach((light) => {
      light.visible = true;
      light.intensity = .2 + falloff * .24;
      light.distance = 7.5 + falloff * 3.5;
    });
    vehicle.mesh.userData.headlightMeshes?.forEach((lamp) => {
      if (lamp.material?.emissiveIntensity !== undefined) lamp.material.emissiveIntensity = 3.4 + falloff * 1.5;
    });
  });
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
  const right = new THREE.Vector3(Math.cos(player.heading), 0, -Math.sin(player.heading));
  let offset = cameraMode === 0 ? new THREE.Vector3(0, 5.15, -10.8) : new THREE.Vector3(0, 10.8, -14.8);
  offset.applyAxisAngle(Y_AXIS, player.heading);
  const targetPosition = player.position.clone().add(offset);
  const shake = drivingPresentation.cameraShake;
  targetPosition.addScaledVector(right, Math.sin(drivingPresentation.time * 34) * shake * .34);
  targetPosition.y += Math.cos(drivingPresentation.time * 42) * shake * .22;
  camera.position.lerp(targetPosition, 1 - Math.exp(-5.5 * dt));
  const lookLead = cameraMode === 0 ? 3.1 + Math.abs(player.speed) * .055 : 2.2;
  const lookTarget = player.position.clone().add(forward.multiplyScalar(lookLead));
  lookTarget.y = cameraMode === 0 ? 1.05 : .2;
  camera.lookAt(lookTarget);
  camera.rotation.z = damp(camera.rotation.z, -drivingPresentation.bodyRoll * .22, 7, dt);
  drivingPresentation.cameraShake = damp(drivingPresentation.cameraShake, 0, 9, dt);
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
  const mountainDropPoint = worldToMap(mountainDeliveryTarget.x, mountainDeliveryTarget.z, size);
  const cityCargoActive = cargoRun.active && cargoRun.route === 'city' && deliveryState === 'active';
  const mountainCargoActive = cargoRun.active && cargoRun.route === 'mountain' && mountainDeliveryState === 'active';
  const waypointPoint = cityCargoActive ? dropPoint : mountainCargoActive ? mountainDropPoint : depotPoint;
  const waypointColor = cityCargoActive || mountainCargoActive ? '#ff9d50' : '#5ce3d1';
  mapCtx.fillStyle = waypointColor;
  mapCtx.shadowColor = waypointColor;
  mapCtx.shadowBlur = 8;
  mapCtx.fillRect(waypointPoint.x - 2.8, waypointPoint.y - 2.8, 5.6, 5.6);
  mapCtx.shadowBlur = 0;
  if (cityCargoActive) {
    mapCtx.strokeStyle = 'rgba(255,157,80,.5)';
    mapCtx.lineWidth = 1.5;
    mapCtx.strokeRect(dropPoint.x - 5, dropPoint.y - 5, 10, 10);
  } else if (mountainCargoActive) {
    mapCtx.strokeStyle = 'rgba(255,157,80,.5)';
    mapCtx.lineWidth = 1.5;
    mapCtx.strokeRect(mountainDropPoint.x - 5, mountainDropPoint.y - 5, 10, 10);
  }
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
  const cityCargoActive = cargoRun.active && cargoRun.route === 'city' && deliveryState === 'active';
  const mountainCargoActive = cargoRun.active && cargoRun.route === 'mountain' && mountainDeliveryState === 'active';
  if (cityCargoActive) {
    const dropPoint = worldToMap(deliveryTarget.x, deliveryTarget.z, mapSize);
    ctx.fillStyle = '#ff9d50';
    ctx.shadowColor = '#ff9d50';
    ctx.shadowBlur = 13;
    ctx.fillRect(dropPoint.x - 5, dropPoint.y - 5, 10, 10);
    ctx.shadowBlur = 0;
    drawText(`DROP // ${currentCargoDropoffSpot().label}`, dropPoint.x + 10, dropPoint.y + 12, '#ffbd80');
  } else if (mountainCargoActive) {
    const dropPoint = worldToMap(mountainDeliveryTarget.x, mountainDeliveryTarget.z, mapSize);
    ctx.fillStyle = '#ff9d50';
    ctx.shadowColor = '#ff9d50';
    ctx.shadowBlur = 13;
    ctx.fillRect(dropPoint.x - 5, dropPoint.y - 5, 10, 10);
    ctx.shadowBlur = 0;
    drawText('DROP // CABIN', dropPoint.x + 10, dropPoint.y + 12, '#ffbd80');
  } else {
    ctx.fillStyle = '#5ce3d1';
    ctx.shadowColor = '#5ce3d1';
    ctx.shadowBlur = 10;
    ctx.fillRect(depotPoint.x - 5, depotPoint.y - 5, 10, 10);
    ctx.shadowBlur = 0;
    drawText(`PICKUP // ${currentCargoPickupSpot().label}`, depotPoint.x + 10, depotPoint.y + 12, '#79eee1');
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
  if (cargoRun.active && cargoRun.route === 'mountain') {
    routeTitle.textContent = `${MOUNTAIN_CARGO_MISSION.title} // CARGO`;
    routeCopy.textContent = `${Math.round(player.position.distanceTo(mountainDeliveryTarget))} M TO CABIN // ${Math.ceil(Math.max(0, cargoRun.deadline - cargoRun.elapsed))} SEC // RISK ${Math.round(cargoRun.exposure)}%`;
  } else if (cargoRun.active && cargoRun.route === 'city') {
    routeTitle.textContent = `${currentCityDeliveryMission().title} // CARGO`;
    routeCopy.textContent = `${Math.round(player.position.distanceTo(deliveryTarget))} M TO ${currentCargoDropoffSpot().label} // ${Math.ceil(Math.max(0, cargoRun.deadline - cargoRun.elapsed))} SEC // RISK ${Math.round(cargoRun.exposure)}%`;
  } else if (mountainDeliveryState === 'active') {
    routeTitle.textContent = 'PINEWATCH CABIN DROP';
    routeCopy.textContent = `${Math.round(player.position.distanceTo(mountainDeliveryTarget))} M TO CABIN`;
  } else if (deliveryState === 'active') {
    routeTitle.textContent = currentCityDeliveryMission().title;
    routeCopy.textContent = `${Math.round(player.position.distanceTo(deliveryTarget))} M TO ${currentCargoDropoffSpot().label}`;
  } else if (deliveryNear || deliveryState === 'finished' || deliveryState === 'failed') {
    routeTitle.textContent = `${currentCityDeliveryMission().title} // PICKUP`;
    routeCopy.textContent = `${Math.round(player.position.distanceTo(deliveryStart))} M TO ${currentCargoPickupSpot().label}`;
  } else if (routeStep < beaconPositions.length) {
    routeTitle.textContent = beaconNames[routeStep];
    routeCopy.textContent = `${Math.round(player.position.distanceTo(beaconPositions[routeStep]))} M TO ACTIVE BEACON`;
  } else {
    routeTitle.textContent = 'FREE ROAM';
    routeCopy.textContent = 'All streets open. Choose your next line.';
  }
  status.textContent = policeState !== 'idle' ? 'RADAR STOP // PULL OVER SAFELY' : cargoRun.active ? 'UNMARKED CARGO // DEADLINE RUN' : 'LIVE NAVIGATION // LEGAL DRIVE';
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
window.addEventListener('beforeunload', () => {
  if (!starterMenuOpen) saveProgress();
});

buildWorld();
worldBuilt = true;
buildHomeProperties();
createCargoPickupVisuals();
updateHomePropertyVisuals();
updateCargoPickupVisuals();
updateWorldStreaming(true);
ensureMenuShowcaseSectors();

let assetsReady = false;
loadBlenderAssets()
  .catch((error) => console.warn('Asset boot failed; keeping procedural scene.', error))
  .finally(() => { assetsReady = true; });

let lastTime = performance.now();
let hudAccumulator = 0;
let saveAccumulator = 0;
function animate(time) {
  const dt = Math.min((time - lastTime) / 1000, .05);
  lastTime = time;
  if (!starterMenuOpen && !garageOpen && !gamePaused && !worldMapOpen && !phoneOpen && !roadsideStopOpen) sessionSeconds += dt;
  updateGamepad();
  if (!starterMenuOpen && !garageOpen && !gamePaused && !worldMapOpen && !phoneOpen && !roadsideStopOpen) {
    updatePlayer(dt);
    updateWorldStreaming();
    updateTrafficSignals(time);
    updateTraffic(dt);
    updateMountainTraffic(dt);
    updateRegionalTraffic(dt);
    updateTrafficLighting(dt);
    resolveTrafficVehicleCollisions();
    resolveMountainTrafficCollisions();
    resolveRegionalTrafficCollisions();
    updateCollectibles(time, dt);
    updateDelivery(time, dt);
    updateCargoPickupVisuals(time, dt);
    updateMountainDelivery(time, dt);
    updatePolice(time, dt);
    updateBeacons(time, dt);
    saveAccumulator += dt;
    if (saveAccumulator >= 8) {
      saveProgress();
      saveAccumulator = 0;
    }
  }
  updateAudio();
  updateWater(time);
  updateFoliageWind(time);
  updateVisualPolish(time);
  if (starterMenuOpen) updateMenuShowcase(time, dt);
  else updateCamera(dt);
  updateSky(time);
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
