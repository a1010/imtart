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

const fishCount = 60
const fishBounds = 8
const cubeAvoidRadius = 2
const maxSpeed = 0.055

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

const fishBoids = []
for (let i = 0; i < fishCount; i += 1) {
  const hue = i / fishCount
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
  fishBoids.push({ fish, position, velocity })
}

const center = new THREE.Vector3(0, 0, 0)
const separation = new THREE.Vector3()
const alignment = new THREE.Vector3()
const cohesion = new THREE.Vector3()
const neighborOffset = new THREE.Vector3()
const avoidCube = new THREE.Vector3()

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

    const towardCenter = center.clone().sub(boid.position).multiplyScalar(0.0015)

    boid.velocity
      .add(separation)
      .add(alignment)
      .add(cohesion)
      .add(towardCenter)

    if (boid.position.length() > fishBounds * 0.8) {
      boid.velocity.addScaledVector(boid.position.clone().normalize(), -0.03)
    }

    boid.velocity.clampLength(0.012, maxSpeed)
    boid.position.add(boid.velocity)

    boid.fish.position.copy(boid.position)
    boid.fish.lookAt(boid.position.clone().add(boid.velocity))
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
