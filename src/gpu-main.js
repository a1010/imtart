import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x050b1a)

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1200
)
camera.position.set(0, 3, 22)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const params = {
  textureSize: 64, // 64x64 = 4096 boids
  fishBounds: 18,
  maxSpeed: 2.6,
  minSpeed: 0.35,
  separationDistance: 1.1,
  alignmentDistance: 2.4,
  cohesionDistance: 2.8,
  separationWeight: 1.4,
  alignmentWeight: 0.55,
  cohesionWeight: 0.4,
  centerForce: 0.32,
  SPIN_FORCE: 0.95,
  CURL_FORCE: 0.6,
  NOISE_SCALE: 0.16,
}

const boidCount = params.textureSize * params.textureSize

const panel = document.createElement('div')
panel.style.position = 'fixed'
panel.style.top = '16px'
panel.style.left = '16px'
panel.style.padding = '10px 12px'
panel.style.borderRadius = '8px'
panel.style.border = '1px solid rgba(255,255,255,0.2)'
panel.style.background = 'rgba(5,11,26,0.7)'
panel.style.backdropFilter = 'blur(5px)'
panel.style.fontSize = '13px'
panel.style.lineHeight = '1.4'
panel.style.zIndex = '20'
panel.innerHTML = [
  '<div style="font-weight:700;margin-bottom:6px;">Boids (GPU)</div>',
  `<div>Count: ${boidCount}</div>`,
  `<div>SPIN_FORCE: ${params.SPIN_FORCE}</div>`,
  `<div>CURL_FORCE: ${params.CURL_FORCE}</div>`,
  `<div>NOISE_SCALE: ${params.NOISE_SCALE}</div>`,
  '<div style="margin-top:8px;opacity:0.8;">CPU 版と同名パラメータを揃えています。</div>',
  '<div style="margin-top:6px;"><a href="/" style="color:#9ed0ff;">CPU 版へ</a></div>',
].join('')
document.body.appendChild(panel)

// CPU 版との差分: boid 状態を JS 配列で保持せず、position/velocity テクスチャを GPU 上で更新する。
const gpuCompute = new GPUComputationRenderer(params.textureSize, params.textureSize, renderer)

const dtPosition = gpuCompute.createTexture()
const dtVelocity = gpuCompute.createTexture()

function fillTextures(positionTexture, velocityTexture) {
  const pos = positionTexture.image.data
  const vel = velocityTexture.image.data
  const radius = params.fishBounds * 0.6

  for (let i = 0; i < boidCount; i += 1) {
    const i4 = i * 4
    const r = Math.cbrt(Math.random()) * radius
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)

    const x = r * Math.sin(phi) * Math.cos(theta)
    const y = r * Math.cos(phi)
    const z = r * Math.sin(phi) * Math.sin(theta)

    pos[i4 + 0] = x
    pos[i4 + 1] = y
    pos[i4 + 2] = z
    pos[i4 + 3] = 1

    const vx = (Math.random() - 0.5) * 2
    const vy = (Math.random() - 0.5) * 2
    const vz = (Math.random() - 0.5) * 2
    const len = Math.hypot(vx, vy, vz) || 1

    vel[i4 + 0] = (vx / len) * params.minSpeed
    vel[i4 + 1] = (vy / len) * params.minSpeed
    vel[i4 + 2] = (vz / len) * params.minSpeed
    vel[i4 + 3] = 1
  }
}

fillTextures(dtPosition, dtVelocity)

const velocityShader = /* glsl */ `
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform float time;
  uniform float delta;
  uniform float fishBounds;
  uniform float maxSpeed;
  uniform float minSpeed;

  uniform float separationDistance;
  uniform float alignmentDistance;
  uniform float cohesionDistance;

  uniform float separationWeight;
  uniform float alignmentWeight;
  uniform float cohesionWeight;

  uniform float centerForce;
  uniform float SPIN_FORCE;
  uniform float CURL_FORCE;
  uniform float NOISE_SCALE;

  const float PI = 3.14159265359;
  const int SAMPLE_COUNT = 24;

  float hash1(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  vec2 hash2(vec2 p) {
    return vec2(
      hash1(p + 17.13),
      hash1(p + 37.17)
    );
  }

  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash1(i + vec2(0.0, 0.0));
    float b = hash1(i + vec2(1.0, 0.0));
    float c = hash1(i + vec2(0.0, 1.0));
    float d = hash1(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  vec3 sampleCurlNoise(vec3 p) {
    float eps = 0.01;
    vec2 uv = p.xz * NOISE_SCALE;

    float n1 = smoothNoise(uv + vec2(0.0, eps));
    float n2 = smoothNoise(uv - vec2(0.0, eps));
    float a = (n1 - n2) / (2.0 * eps);

    float n3 = smoothNoise(uv + vec2(eps, 0.0));
    float n4 = smoothNoise(uv - vec2(eps, 0.0));
    float b = (n3 - n4) / (2.0 * eps);

    return vec3(a, 0.0, -b);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 selfPosition = texture2D(texturePosition, uv).xyz;
    vec3 selfVelocity = texture2D(textureVelocity, uv).xyz;

    vec3 separation = vec3(0.0);
    vec3 alignment = vec3(0.0);
    vec3 cohesion = vec3(0.0);

    float separationNeighbors = 0.0;
    float groupNeighbors = 0.0;

    for (int i = 0; i < SAMPLE_COUNT; i++) {
      float fi = float(i);
      vec2 sampleUv = hash2(uv + vec2(fi * 0.123, fi * 0.371 + time * 0.02));
      vec3 p = texture2D(texturePosition, sampleUv).xyz;
      vec3 v = texture2D(textureVelocity, sampleUv).xyz;

      vec3 diff = selfPosition - p;
      float d = length(diff);

      if (d > 0.0001 && d < separationDistance) {
        separation += normalize(diff) / (d + 0.08);
        separationNeighbors += 1.0;
      }

      if (d > 0.0001 && d < alignmentDistance) {
        alignment += v;
        groupNeighbors += 1.0;
      }

      if (d > 0.0001 && d < cohesionDistance) {
        cohesion += p;
      }
    }

    if (separationNeighbors > 0.0) {
      separation /= separationNeighbors;
    }

    if (groupNeighbors > 0.0) {
      alignment = (alignment / groupNeighbors) - selfVelocity;
      cohesion = (cohesion / groupNeighbors) - selfPosition;
    }

    vec3 centerVec = -selfPosition;
    vec3 centerConstraint = centerVec * centerForce;

    vec3 spin = vec3(-centerVec.z, 0.0, centerVec.x);
    if (length(spin) > 1e-5) {
      spin = normalize(spin) * SPIN_FORCE;
    }

    vec3 curlNoise = sampleCurlNoise(selfPosition + vec3(time * 0.2, 0.0, 0.0)) * CURL_FORCE;

    vec3 nextVelocity = selfVelocity;
    nextVelocity += separation * separationWeight;
    nextVelocity += alignment * alignmentWeight;
    nextVelocity += cohesion * cohesionWeight;
    nextVelocity += centerConstraint;
    nextVelocity += spin;
    nextVelocity += curlNoise;

    float dist = length(selfPosition);
    if (dist > fishBounds * 0.85) {
      nextVelocity += normalize(-selfPosition) * 1.1;
    }

    float speed = length(nextVelocity);
    if (speed > maxSpeed) {
      nextVelocity = normalize(nextVelocity) * maxSpeed;
    } else if (speed < minSpeed) {
      nextVelocity = normalize(nextVelocity + vec3(0.0001, 0.0, 0.0)) * minSpeed;
    }

    gl_FragColor = vec4(nextVelocity, 1.0);
  }
`

const positionShader = /* glsl */ `
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform float delta;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 position = texture2D(texturePosition, uv).xyz;
    vec3 velocity = texture2D(textureVelocity, uv).xyz;

    position += velocity * delta;

    gl_FragColor = vec4(position, 1.0);
  }
`

const velocityVariable = gpuCompute.addVariable('textureVelocity', velocityShader, dtVelocity)
const positionVariable = gpuCompute.addVariable('texturePosition', positionShader, dtPosition)

gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable])
gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable])

const velocityUniforms = velocityVariable.material.uniforms
velocityUniforms.time = { value: 0 }
velocityUniforms.delta = { value: 0.016 }
velocityUniforms.fishBounds = { value: params.fishBounds }
velocityUniforms.maxSpeed = { value: params.maxSpeed }
velocityUniforms.minSpeed = { value: params.minSpeed }
velocityUniforms.separationDistance = { value: params.separationDistance }
velocityUniforms.alignmentDistance = { value: params.alignmentDistance }
velocityUniforms.cohesionDistance = { value: params.cohesionDistance }
velocityUniforms.separationWeight = { value: params.separationWeight }
velocityUniforms.alignmentWeight = { value: params.alignmentWeight }
velocityUniforms.cohesionWeight = { value: params.cohesionWeight }
velocityUniforms.centerForce = { value: params.centerForce }
velocityUniforms.SPIN_FORCE = { value: params.SPIN_FORCE }
velocityUniforms.CURL_FORCE = { value: params.CURL_FORCE }
velocityUniforms.NOISE_SCALE = { value: params.NOISE_SCALE }

const positionUniforms = positionVariable.material.uniforms
positionUniforms.delta = { value: 0.016 }

const error = gpuCompute.init()
if (error !== null) {
  throw new Error(error)
}

const references = new Float32Array(boidCount * 2)
for (let i = 0; i < boidCount; i += 1) {
  const x = (i % params.textureSize) / (params.textureSize - 1)
  const y = Math.floor(i / params.textureSize) / (params.textureSize - 1)
  references[i * 2 + 0] = x
  references[i * 2 + 1] = y
}

const boidGeometry = new THREE.BufferGeometry()
boidGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(boidCount * 3), 3))
boidGeometry.setAttribute('reference', new THREE.Float32BufferAttribute(references, 2))

const boidMaterial = new THREE.ShaderMaterial({
  uniforms: {
    texturePosition: { value: null },
    textureVelocity: { value: null },
    pointSize: { value: 3.2 },
  },
  vertexShader: /* glsl */ `
    uniform sampler2D texturePosition;
    uniform sampler2D textureVelocity;
    uniform float pointSize;
    attribute vec2 reference;
    varying float vSpeed;

    void main() {
      vec3 pos = texture2D(texturePosition, reference).xyz;
      vec3 vel = texture2D(textureVelocity, reference).xyz;
      vSpeed = length(vel);

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;
      gl_PointSize = pointSize * (260.0 / -mvPosition.z);
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vSpeed;

    void main() {
      vec2 p = gl_PointCoord - vec2(0.5);
      float d = length(p);
      if (d > 0.5) discard;

      float t = clamp(vSpeed / 2.5, 0.0, 1.0);
      vec3 slowColor = vec3(0.25, 0.55, 1.0);
      vec3 fastColor = vec3(1.0, 0.45, 0.75);
      vec3 c = mix(slowColor, fastColor, t);
      gl_FragColor = vec4(c, 1.0 - smoothstep(0.32, 0.5, d));
    }
  `,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
})

const boidPoints = new THREE.Points(boidGeometry, boidMaterial)
scene.add(boidPoints)

const centerGuide = new THREE.Mesh(
  new THREE.SphereGeometry(0.4, 20, 20),
  new THREE.MeshBasicMaterial({ color: 0x89a9ff, transparent: true, opacity: 0.55 })
)
scene.add(centerGuide)

const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)

  const dt = Math.min(clock.getDelta(), 0.033)
  const elapsed = clock.elapsedTime

  velocityUniforms.time.value = elapsed
  velocityUniforms.delta.value = dt
  positionUniforms.delta.value = dt

  gpuCompute.compute()

  boidMaterial.uniforms.texturePosition.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture
  boidMaterial.uniforms.textureVelocity.value = gpuCompute.getCurrentRenderTarget(velocityVariable).texture

  centerGuide.rotation.y += dt * 0.8
  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()
