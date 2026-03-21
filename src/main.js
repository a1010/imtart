import * as THREE from 'three'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x050b1a)

const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)


const nav = document.createElement('div')
nav.style.position = 'fixed'
nav.style.top = '16px'
nav.style.right = '16px'
nav.style.padding = '8px 10px'
nav.style.background = 'rgba(5, 11, 26, 0.65)'
nav.style.border = '1px solid rgba(255, 255, 255, 0.2)'
nav.style.borderRadius = '8px'
nav.style.backdropFilter = 'blur(5px)'
nav.style.zIndex = '10'
nav.innerHTML = '<a href="/gpu.html" style="color:#9ed0ff;font-family:sans-serif;font-size:13px;">GPU 版を開く</a>'
document.body.appendChild(nav)

const fishCountRange = { min: 10, max: 100 }
let fishCount = 60

const controls = document.createElement('div')
controls.style.position = 'fixed'
controls.style.top = '16px'
controls.style.left = '16px'
controls.style.padding = '10px 12px'
controls.style.background = 'rgba(5, 11, 26, 0.65)'
controls.style.border = '1px solid rgba(255, 255, 255, 0.2)'
controls.style.borderRadius = '8px'
controls.style.backdropFilter = 'blur(5px)'
controls.style.color = '#ffffff'
controls.style.fontFamily = 'sans-serif'
controls.style.fontSize = '14px'
controls.style.zIndex = '10'

const countLabel = document.createElement('label')
countLabel.textContent = 'Boids: '
countLabel.htmlFor = 'boids-count-slider'

const countValue = document.createElement('span')
countValue.textContent = String(fishCount)
countLabel.appendChild(countValue)

const countSlider = document.createElement('input')
countSlider.id = 'boids-count-slider'
countSlider.type = 'range'
countSlider.min = String(fishCountRange.min)
countSlider.max = String(fishCountRange.max)
countSlider.step = '1'
countSlider.value = String(fishCount)
countSlider.style.display = 'block'
countSlider.style.marginTop = '8px'
countSlider.style.width = '220px'

controls.append(countLabel, countSlider)
document.body.appendChild(controls)

const ambientLight = new THREE.AmbientLight(0xffffff, 0.9)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
directionalLight.position.set(6, 8, 10)
scene.add(directionalLight)

const geometry = new THREE.BoxGeometry()
const material = new THREE.MeshStandardMaterial({
  color: 0x00ffcc,
  emissive: 0x003333,
  metalness: 0.2,
  roughness: 0.4,
})
const cube = new THREE.Mesh(geometry, material)
scene.add(cube)

const fishBounds = 8
const cubeAvoidRadius = 2
const maxSpeed = 0.055
const boidsConfig = {
  SPIN_FORCE: 0.05,
  CURL_FORCE: 0.02,
  NOISE_SCALE: 0.1,
}

const fishGeometry = new THREE.ConeGeometry(0.08, 0.28, 10)
fishGeometry.rotateZ(-Math.PI / 2)
const tailGeometry = new THREE.ConeGeometry(0.06, 0.18, 6)
tailGeometry.rotateZ(Math.PI / 2)
tailGeometry.translate(-0.18, 0, 0)

const fishTemplate = new THREE.Group()
const fishBody = new THREE.Mesh(
  fishGeometry,
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x111111,
    flatShading: true,
  })
)
const fishTail = new THREE.Mesh(
  tailGeometry,
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x111111,
    flatShading: true,
  })
)
fishTemplate.add(fishBody, fishTail)

// CPU 実装: boid の状態は JavaScript 配列で管理し、毎フレーム CPU で更新する。
const fishBoids = []
function createFish(index, totalCount) {
  const hue = index / totalCount
  const color = new THREE.Color().setHSL(hue, 0.95, 0.58)
  const fish = fishTemplate.clone()
  fish.traverse((child) => {
    if (child.isMesh) {
      child.material = child.material.clone()
      child.material.color.copy(color)
      child.material.emissive.copy(color).multiplyScalar(0.25)
    }
  })

  const position = new THREE.Vector3(
    (Math.random() - 0.5) * fishBounds,
    (Math.random() - 0.5) * fishBounds,
    (Math.random() - 0.5) * fishBounds
  )

  const velocity = new THREE.Vector3(
    (Math.random() - 0.5) * maxSpeed,
    (Math.random() - 0.5) * maxSpeed,
    (Math.random() - 0.5) * maxSpeed
  )

  fish.position.copy(position)
  scene.add(fish)
  return { fish, position, velocity }
}

function setFishCount(nextCount) {
  const clampedCount = THREE.MathUtils.clamp(
    Math.round(nextCount),
    fishCountRange.min,
    fishCountRange.max
  )

  while (fishBoids.length < clampedCount) {
    fishBoids.push(createFish(fishBoids.length, clampedCount))
  }

  while (fishBoids.length > clampedCount) {
    const removedBoid = fishBoids.pop()
    scene.remove(removedBoid.fish)
  }

  fishCount = clampedCount
  countSlider.value = String(clampedCount)
  countValue.textContent = String(clampedCount)
}

countSlider.addEventListener('input', () => {
  setFishCount(Number.parseInt(countSlider.value, 10))
})

setFishCount(fishCount)

const center = new THREE.Vector3(0, 0, 0)
const separation = new THREE.Vector3()
const alignment = new THREE.Vector3()
const cohesion = new THREE.Vector3()
const centerConstraint = new THREE.Vector3()
const spinForce = new THREE.Vector3()
const curlNoise = new THREE.Vector3()
const neighborOffset = new THREE.Vector3()
const avoidCube = new THREE.Vector3()
const toCenter = new THREE.Vector3()
const velocityDirection = new THREE.Vector3()
const fishForwardAxis = new THREE.Vector3(1, 0, 0)
const fishQuaternion = new THREE.Quaternion()

const curlEps = 0.0001

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

  const ix0 = THREE.MathUtils.lerp(n00, n10, sx)
  const ix1 = THREE.MathUtils.lerp(n01, n11, sx)

  return THREE.MathUtils.lerp(ix0, ix1, sy)
}

function sampleCurlNoise(position) {
  const x = position.x * boidsConfig.NOISE_SCALE
  const y = position.z * boidsConfig.NOISE_SCALE

  const n1 = noise2d(x, y + curlEps)
  const n2 = noise2d(x, y - curlEps)
  const a = (n1 - n2) / (2 * curlEps)

  const n3 = noise2d(x + curlEps, y)
  const n4 = noise2d(x - curlEps, y)
  const b = (n3 - n4) / (2 * curlEps)

  return curlNoise.set(a, 0, -b)
}

camera.position.set(0, 2, 9)
camera.lookAt(0, 0, 0)

function updateBoids() {
  for (let i = 0; i < fishBoids.length; i += 1) {
    const boid = fishBoids[i]

    separation.set(0, 0, 0)
    alignment.set(0, 0, 0)
    cohesion.set(0, 0, 0)

    let neighbors = 0

    for (let j = 0; j < fishBoids.length; j += 1) {
      if (i === j) continue

      const other = fishBoids[j]
      neighborOffset.subVectors(boid.position, other.position)
      const distance = neighborOffset.length()
      if (distance < 1.5) {
        separation.addScaledVector(neighborOffset.normalize(), 1 / (distance + 0.15))
      }
      if (distance < 3.2) {
        alignment.add(other.velocity)
        cohesion.add(other.position)
        neighbors += 1
      }
    }

    if (neighbors > 0) {
      alignment.divideScalar(neighbors).sub(boid.velocity).multiplyScalar(0.05)
      cohesion
        .divideScalar(neighbors)
        .sub(boid.position)
        .multiplyScalar(0.009)
    }

    separation.multiplyScalar(0.06)

    avoidCube.copy(boid.position)
    const distanceToCenter = avoidCube.length()
    if (distanceToCenter < cubeAvoidRadius) {
      avoidCube
        .normalize()
        .multiplyScalar((cubeAvoidRadius - distanceToCenter) * 0.08)
      boid.velocity.add(avoidCube)
    }

    centerConstraint
      .subVectors(center, boid.position)
      .multiplyScalar(0.0015)

    toCenter.subVectors(center, boid.position)
    const toCenterLengthSq = toCenter.lengthSq()
    if (toCenterLengthSq > 1e-8) {
      spinForce
        .set(-toCenter.z, 0, toCenter.x)
        .normalize()
        .multiplyScalar(boidsConfig.SPIN_FORCE)
    } else {
      spinForce.set(0, 0, 0)
    }

    sampleCurlNoise(boid.position).multiplyScalar(boidsConfig.CURL_FORCE)

    boid.velocity
      .add(separation)
      .add(alignment)
      .add(cohesion)
      .add(centerConstraint)
      .add(spinForce)
      .add(curlNoise)

    if (boid.position.length() > fishBounds * 0.8) {
      boid.velocity.addScaledVector(boid.position.clone().normalize(), -0.03)
    }

    boid.velocity.clampLength(0.012, maxSpeed)
    boid.position.add(boid.velocity)

    boid.fish.position.copy(boid.position)
    if (boid.velocity.lengthSq() > 1e-8) {
      velocityDirection.copy(boid.velocity).normalize()
      fishQuaternion.setFromUnitVectors(fishForwardAxis, velocityDirection)
      boid.fish.quaternion.copy(fishQuaternion)
    }
  }
}

function animate() {
  requestAnimationFrame(animate)

  cube.rotation.x += 0.008
  cube.rotation.y += 0.011

  updateBoids()

  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()
