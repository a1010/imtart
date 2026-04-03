import * as THREE from 'three'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x050b1a)

const camera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)
camera.position.set(0, 2, 28)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const params = {
  textureSize: 64,
  worldRadius: 16,
  minSpeed: 0.45,
  maxSpeed: 2.4,
}

const boidCount = params.textureSize * params.textureSize
const stageSettings = {
  1: {
    name: 'Step 1: 直進',
    centerForce: 0.0,
    spinForce: 0.0,
    curlForce: 0.0,
  },
  2: {
    name: 'Step 2: 中心へ収束',
    centerForce: 0.2,
    spinForce: 0.0,
    curlForce: 0.0,
  },
  3: {
    name: 'Step 3: 旋回 + ノイズ',
    centerForce: 0.2,
    spinForce: 0.65,
    curlForce: 0.35,
  },
}

const panel = document.createElement('div')
panel.style.position = 'fixed'
panel.style.top = '16px'
panel.style.left = '16px'
panel.style.padding = '12px'
panel.style.borderRadius = '10px'
panel.style.border = '1px solid rgba(255,255,255,0.2)'
panel.style.background = 'rgba(5,11,26,0.72)'
panel.style.backdropFilter = 'blur(6px)'
panel.style.fontFamily = 'sans-serif'
panel.style.fontSize = '13px'
panel.style.lineHeight = '1.5'
panel.style.color = '#fff'
panel.style.zIndex = '10'

const title = document.createElement('div')
title.textContent = 'GPU Boids Playground'
title.style.fontWeight = '700'
title.style.marginBottom = '8px'

const countInfo = document.createElement('div')
countInfo.textContent = `Count: ${boidCount}`

const modeInfo = document.createElement('div')
modeInfo.style.marginTop = '4px'
modeInfo.style.opacity = '0.9'

const stepInfo = document.createElement('div')
stepInfo.style.margin = '6px 0 8px'

const stepSlider = document.createElement('input')
stepSlider.type = 'range'
stepSlider.min = '1'
stepSlider.max = '3'
stepSlider.step = '1'
stepSlider.value = '1'
stepSlider.style.width = '220px'

const hint = document.createElement('div')
hint.textContent = 'スライダーで段階的に作り込みを確認'
hint.style.marginTop = '6px'
hint.style.opacity = '0.82'

panel.append(title, countInfo, modeInfo, stepInfo, stepSlider, hint)
document.body.appendChild(panel)

const worldGuide = new THREE.Mesh(
  new THREE.SphereGeometry(params.worldRadius, 28, 18),
  new THREE.MeshBasicMaterial({
    color: 0x6f8dff,
    wireframe: true,
    transparent: true,
    opacity: 0.12,
  })
)
scene.add(worldGuide)

const state = {
  centerForce: stageSettings[1].centerForce,
  spinForce: stageSettings[1].spinForce,
  curlForce: stageSettings[1].curlForce,
}

function fract(value) {
  return value - Math.floor(value)
}

function hash2d(x, y) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123)
}

function smoothstep(value) {
  return value * value * (3 - 2 * value)
}

function noise2d(x, y) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1
  const y1 = y0 + 1

  const sx = smoothstep(x - x0)
  const sy = smoothstep(y - y0)

  const n00 = hash2d(x0, y0)
  const n10 = hash2d(x1, y0)
  const n01 = hash2d(x0, y1)
  const n11 = hash2d(x1, y1)

  const ix0 = n00 + (n10 - n00) * sx
  const ix1 = n01 + (n11 - n01) * sx
  return ix0 + (ix1 - ix0) * sy
}

function curl2d(x, z, t) {
  const eps = 0.02
  const scale = 0.13
  const u = x * scale + t * 0.08
  const v = z * scale

  const n1 = noise2d(u, v + eps)
  const n2 = noise2d(u, v - eps)
  const a = (n1 - n2) / (2 * eps)

  const n3 = noise2d(u + eps, v)
  const n4 = noise2d(u - eps, v)
  const b = (n3 - n4) / (2 * eps)

  return { x: a, z: -b }
}

let runSimulation = () => {}

function initCpuFallback() {
  modeInfo.textContent = 'Mode: CPU fallback（GPU頂点テクスチャ非対応）'

  const positions = new Float32Array(boidCount * 3)
  const velocities = new Float32Array(boidCount * 3)

  for (let i = 0; i < boidCount; i += 1) {
    const i3 = i * 3
    const r = Math.cbrt(Math.random()) * params.worldRadius * 0.7
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)

    positions[i3 + 0] = r * Math.sin(phi) * Math.cos(theta)
    positions[i3 + 1] = r * Math.cos(phi)
    positions[i3 + 2] = r * Math.sin(phi) * Math.sin(theta)

    const vx = Math.random() - 0.5
    const vy = Math.random() - 0.5
    const vz = Math.random() - 0.5
    const inv = 1 / (Math.hypot(vx, vy, vz) || 1)

    velocities[i3 + 0] = vx * inv * params.minSpeed
    velocities[i3 + 1] = vy * inv * params.minSpeed
    velocities[i3 + 2] = vz * inv * params.minSpeed
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0x87c6ff,
    size: 0.13,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const points = new THREE.Points(geometry, material)
  scene.add(points)

  runSimulation = (dt, elapsedTime) => {
    for (let i = 0; i < boidCount; i += 1) {
      const i3 = i * 3

      const px = positions[i3 + 0]
      const py = positions[i3 + 1]
      const pz = positions[i3 + 2]

      let vx = velocities[i3 + 0]
      let vy = velocities[i3 + 1]
      let vz = velocities[i3 + 2]

      let ax = -px * state.centerForce
      let ay = -py * state.centerForce
      let az = -pz * state.centerForce

      const spinX = pz
      const spinZ = -px
      const spinLen = Math.hypot(spinX, spinZ)
      if (spinLen > 0.0001) {
        ax += (spinX / spinLen) * state.spinForce
        az += (spinZ / spinLen) * state.spinForce
      }

      const curl = curl2d(px, pz, elapsedTime)
      ax += curl.x * state.curlForce
      az += curl.z * state.curlForce

      const dist = Math.hypot(px, py, pz)
      if (dist > params.worldRadius * 0.92) {
        const inv = 1 / (dist || 1)
        ax += -px * inv * 1.4
        ay += -py * inv * 1.4
        az += -pz * inv * 1.4
      }

      vx += ax * dt * 8
      vy += ay * dt * 8
      vz += az * dt * 8

      const speed = Math.hypot(vx, vy, vz)
      if (speed > params.maxSpeed) {
        const inv = 1 / speed
        vx *= inv * params.maxSpeed
        vy *= inv * params.maxSpeed
        vz *= inv * params.maxSpeed
      } else if (speed < params.minSpeed) {
        const safeSpeed = speed || 1
        const inv = 1 / safeSpeed
        vx = (vx + 0.0001) * inv * params.minSpeed
        vy *= inv * params.minSpeed
        vz *= inv * params.minSpeed
      }

      positions[i3 + 0] += vx * dt
      positions[i3 + 1] += vy * dt
      positions[i3 + 2] += vz * dt

      velocities[i3 + 0] = vx
      velocities[i3 + 1] = vy
      velocities[i3 + 2] = vz
    }

    geometry.attributes.position.needsUpdate = true
  }
}

function initGpuSimulation() {
  modeInfo.textContent = 'Mode: GPU simulation'

  const gpuCompute = new GPUComputationRenderer(params.textureSize, params.textureSize, renderer)

  const dtPosition = gpuCompute.createTexture()
  const dtVelocity = gpuCompute.createTexture()

  const pos = dtPosition.image.data
  const vel = dtVelocity.image.data

  for (let i = 0; i < boidCount; i += 1) {
    const i4 = i * 4

    const r = Math.cbrt(Math.random()) * params.worldRadius * 0.7
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)

    pos[i4 + 0] = r * Math.sin(phi) * Math.cos(theta)
    pos[i4 + 1] = r * Math.cos(phi)
    pos[i4 + 2] = r * Math.sin(phi) * Math.sin(theta)
    pos[i4 + 3] = 1

    const vx = Math.random() - 0.5
    const vy = Math.random() - 0.5
    const vz = Math.random() - 0.5
    const len = Math.hypot(vx, vy, vz) || 1

    vel[i4 + 0] = (vx / len) * params.minSpeed
    vel[i4 + 1] = (vy / len) * params.minSpeed
    vel[i4 + 2] = (vz / len) * params.minSpeed
    vel[i4 + 3] = 1
  }

  const velocityShader = /* glsl */ `
    uniform sampler2D texturePosition;
    uniform sampler2D textureVelocity;
    uniform float time;
    uniform float delta;
    uniform float worldRadius;
    uniform float minSpeed;
    uniform float maxSpeed;
    uniform float centerForce;
    uniform float spinForce;
    uniform float curlForce;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);

      float a = hash(i + vec2(0.0, 0.0));
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));

      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    vec3 curl2d(vec3 p) {
      float eps = 0.02;
      vec2 uv = p.xz * 0.13 + vec2(time * 0.08, 0.0);

      float n1 = noise(uv + vec2(0.0, eps));
      float n2 = noise(uv - vec2(0.0, eps));
      float a = (n1 - n2) / (2.0 * eps);

      float n3 = noise(uv + vec2(eps, 0.0));
      float n4 = noise(uv - vec2(eps, 0.0));
      float b = (n3 - n4) / (2.0 * eps);

      return vec3(a, 0.0, -b);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec3 pos = texture2D(texturePosition, uv).xyz;
      vec3 vel = texture2D(textureVelocity, uv).xyz;

      vec3 toCenter = -pos;
      vec3 accel = vec3(0.0);

      accel += toCenter * centerForce;

      vec3 spin = vec3(-toCenter.z, 0.0, toCenter.x);
      if (length(spin) > 0.0001) {
        accel += normalize(spin) * spinForce;
      }

      accel += curl2d(pos) * curlForce;

      if (length(pos) > worldRadius * 0.92) {
        accel += normalize(-pos) * 1.4;
      }

      vel += accel * delta * 8.0;

      float speed = length(vel);
      if (speed > maxSpeed) {
        vel = normalize(vel) * maxSpeed;
      } else if (speed < minSpeed) {
        vel = normalize(vel + vec3(0.0001, 0.0, 0.0)) * minSpeed;
      }

      gl_FragColor = vec4(vel, 1.0);
    }
  `

  const positionShader = /* glsl */ `
    uniform sampler2D texturePosition;
    uniform sampler2D textureVelocity;
    uniform float delta;

    void main() {
      vec2 uv = gl_FragCoord.xy / resolution.xy;
      vec3 pos = texture2D(texturePosition, uv).xyz;
      vec3 vel = texture2D(textureVelocity, uv).xyz;

      pos += vel * delta;

      gl_FragColor = vec4(pos, 1.0);
    }
  `

  const velocityVariable = gpuCompute.addVariable('textureVelocity', velocityShader, dtVelocity)
  const positionVariable = gpuCompute.addVariable('texturePosition', positionShader, dtPosition)

  gpuCompute.setVariableDependencies(velocityVariable, [velocityVariable, positionVariable])
  gpuCompute.setVariableDependencies(positionVariable, [velocityVariable, positionVariable])

  const velocityUniforms = velocityVariable.material.uniforms
  velocityUniforms.time = { value: 0 }
  velocityUniforms.delta = { value: 0.016 }
  velocityUniforms.worldRadius = { value: params.worldRadius }
  velocityUniforms.minSpeed = { value: params.minSpeed }
  velocityUniforms.maxSpeed = { value: params.maxSpeed }
  velocityUniforms.centerForce = { value: state.centerForce }
  velocityUniforms.spinForce = { value: state.spinForce }
  velocityUniforms.curlForce = { value: state.curlForce }

  const positionUniforms = positionVariable.material.uniforms
  positionUniforms.delta = { value: 0.016 }

  const initError = gpuCompute.init()
  if (initError !== null) {
    return false
  }

  const boidGeometry = new THREE.BufferGeometry()
  const pointPositions = new Float32Array(boidCount * 3)
  const pointUvs = new Float32Array(boidCount * 2)

  for (let i = 0; i < boidCount; i += 1) {
    const x = i % params.textureSize
    const y = Math.floor(i / params.textureSize)
    const i2 = i * 2
    pointUvs[i2 + 0] = (x + 0.5) / params.textureSize
    pointUvs[i2 + 1] = (y + 0.5) / params.textureSize
  }

  boidGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3))
  boidGeometry.setAttribute('boidUv', new THREE.Float32BufferAttribute(pointUvs, 2))

  const boidMaterial = new THREE.ShaderMaterial({
    uniforms: {
      texturePosition: { value: null },
      pointSize: { value: 3.5 * renderer.getPixelRatio() },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute vec2 boidUv;
      uniform sampler2D texturePosition;
      uniform float pointSize;

      void main() {
        vec3 pos = texture2D(texturePosition, boidUv).xyz;
        vec4 mv = modelViewMatrix * vec4(pos, 1.0);
        gl_PointSize = pointSize;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      void main() {
        vec2 p = gl_PointCoord - vec2(0.5);
        float r2 = dot(p, p);
        if (r2 > 0.25) {
          discard;
        }
        float alpha = smoothstep(0.25, 0.0, r2);
        gl_FragColor = vec4(0.50, 0.76, 1.0, alpha * 0.95);
      }
    `,
  })

  const boids = new THREE.Points(boidGeometry, boidMaterial)
  scene.add(boids)

  runSimulation = (dt, elapsedTime) => {
    velocityUniforms.time.value = elapsedTime
    velocityUniforms.delta.value = dt
    positionUniforms.delta.value = dt

    gpuCompute.compute()
    boidMaterial.uniforms.texturePosition.value =
      gpuCompute.getCurrentRenderTarget(positionVariable).texture
  }

  return true
}

const canUseGpuBoids = renderer.capabilities.maxVertexTextures > 0
if (canUseGpuBoids) {
  const initialized = initGpuSimulation()
  if (!initialized) {
    initCpuFallback()
  }
} else {
  initCpuFallback()
}

function applyStep(step) {
  const next = stageSettings[step]
  stepInfo.textContent = next.name
  state.centerForce = next.centerForce
  state.spinForce = next.spinForce
  state.curlForce = next.curlForce
}

stepSlider.addEventListener('input', () => {
  applyStep(Number.parseInt(stepSlider.value, 10))
})
applyStep(1)

const clock = new THREE.Clock()

function animate() {
  requestAnimationFrame(animate)

  const dt = Math.min(clock.getDelta(), 0.033)
  runSimulation(dt, clock.elapsedTime)

  worldGuide.rotation.y += dt * 0.15
  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()
