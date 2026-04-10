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

const stepLabel = document.createElement('div')
stepLabel.textContent = 'step 9'
stepLabel.style.marginBottom = '8px'
stepLabel.style.fontWeight = '600'
stepLabel.style.letterSpacing = '0.03em'

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

controls.append(stepLabel, countLabel, countSlider)
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
const maxSpeed = 0.055
// Step 6: 中心から離れるほど弱く中心方向へ戻る力
const centerAttractionStrength = 0.0006
const alignmentNeighborRadius = 1.8
const alignmentStrength = 0.018
const cohesionNeighborRadius = alignmentNeighborRadius
const cohesionStrength = 0.0035
const separationDistance = 0.95
const separationStrength = 0.01
const alignmentNeighborRadiusSq = alignmentNeighborRadius ** 2
const cohesionNeighborRadiusSq = cohesionNeighborRadius ** 2
const separationDistanceSq = separationDistance ** 2

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

const velocityDirection = new THREE.Vector3()
const fishForwardAxis = new THREE.Vector3(1, 0, 0)
const fishQuaternion = new THREE.Quaternion()
const centerAttraction = new THREE.Vector3()
const alignmentAverageVelocity = new THREE.Vector3()
const alignmentAdjustment = new THREE.Vector3()
const cohesionAveragePosition = new THREE.Vector3()
const cohesionAdjustment = new THREE.Vector3()
const separationAverageDirection = new THREE.Vector3()
const separationOffset = new THREE.Vector3()
const separationAdjustment = new THREE.Vector3()

camera.position.set(0, 2, 9)
camera.lookAt(0, 0, 0)

function updateBoids() {
  for (let i = 0; i < fishBoids.length; i += 1) {
    const boid = fishBoids[i]

    alignmentAverageVelocity.set(0, 0, 0)
    cohesionAveragePosition.set(0, 0, 0)
    separationAverageDirection.set(0, 0, 0)
    let alignmentNeighborCount = 0
    let cohesionNeighborCount = 0
    let separationNeighborCount = 0
    for (let j = 0; j < fishBoids.length; j += 1) {
      if (i === j) continue
      const neighbor = fishBoids[j]
      const distanceSq = boid.position.distanceToSquared(neighbor.position)

      if (distanceSq <= alignmentNeighborRadiusSq) {
        alignmentAverageVelocity.add(neighbor.velocity)
        alignmentNeighborCount += 1
      }

      if (distanceSq <= cohesionNeighborRadiusSq) {
        cohesionAveragePosition.add(neighbor.position)
        cohesionNeighborCount += 1
      }

      if (distanceSq <= separationDistanceSq && distanceSq > 1e-8) {
        separationOffset.copy(boid.position).sub(neighbor.position)
        separationAverageDirection.add(
          separationOffset.multiplyScalar(1 / Math.sqrt(distanceSq))
        )
        separationNeighborCount += 1
      }
    }
    if (alignmentNeighborCount > 0) {
      alignmentAverageVelocity.multiplyScalar(1 / alignmentNeighborCount)
      alignmentAdjustment
        .copy(alignmentAverageVelocity)
        .sub(boid.velocity)
        .multiplyScalar(alignmentStrength)
      boid.velocity.add(alignmentAdjustment)
    }

    if (cohesionNeighborCount > 0) {
      cohesionAveragePosition.multiplyScalar(1 / cohesionNeighborCount)
      cohesionAdjustment
        .copy(cohesionAveragePosition)
        .sub(boid.position)
        .multiplyScalar(cohesionStrength)
      boid.velocity.add(cohesionAdjustment)
    }

    if (separationNeighborCount > 0) {
      separationAverageDirection.multiplyScalar(1 / separationNeighborCount)
      separationAdjustment
        .copy(separationAverageDirection)
        .multiplyScalar(separationStrength)
      boid.velocity.add(separationAdjustment)
    }

    centerAttraction.copy(boid.position).multiplyScalar(-centerAttractionStrength)
    boid.velocity.add(centerAttraction)
    boid.position.add(boid.velocity)
    boid.velocity.clampLength(0.012, maxSpeed)

    if (Math.abs(boid.position.x) > fishBounds) {
      boid.position.x = THREE.MathUtils.clamp(boid.position.x, -fishBounds, fishBounds)
      boid.velocity.x *= -1
    }
    if (Math.abs(boid.position.y) > fishBounds) {
      boid.position.y = THREE.MathUtils.clamp(boid.position.y, -fishBounds, fishBounds)
      boid.velocity.y *= -1
    }
    if (Math.abs(boid.position.z) > fishBounds) {
      boid.position.z = THREE.MathUtils.clamp(boid.position.z, -fishBounds, fishBounds)
      boid.velocity.z *= -1
    }

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
