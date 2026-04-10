import * as THREE from 'three'

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x050b1a)

const camera = new THREE.PerspectiveCamera(
  65,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)
camera.position.set(0, 0, 8)
camera.lookAt(0, 0, 0)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const status = document.createElement('div')
status.textContent = 'step 9'
status.style.position = 'fixed'
status.style.top = '12px'
status.style.left = '12px'
status.style.padding = '8px 10px'
status.style.border = '1px solid rgba(255,255,255,0.25)'
status.style.borderRadius = '8px'
status.style.background = 'rgba(5,11,26,0.72)'
status.style.fontFamily = 'sans-serif'
status.style.fontSize = '14px'
status.style.color = '#fff'
status.style.zIndex = '10'
document.body.appendChild(status)

const agentBodyGeometry = new THREE.ConeGeometry(0.08, 0.28, 10)
agentBodyGeometry.rotateZ(-Math.PI / 2)
const agentTailGeometry = new THREE.ConeGeometry(0.06, 0.18, 6)
agentTailGeometry.rotateZ(Math.PI / 2)
agentTailGeometry.translate(-0.18, 0, 0)

const agentTemplate = new THREE.Group()
const agentBody = new THREE.Mesh(
  agentBodyGeometry,
  new THREE.MeshBasicMaterial({ color: 0x87c6ff })
)
const agentTail = new THREE.Mesh(
  agentTailGeometry,
  new THREE.MeshBasicMaterial({ color: 0x87c6ff })
)
agentTemplate.add(agentBody, agentTail)
const agents = []
const agentCount = 10
const bounds = 3.6
const maxSpeed = 0.04
const minSpeed = 0.01
const centerAttractionStrength = 0.00055
const alignmentNeighborRadius = 1.4
const alignmentStrength = 0.02
const cohesionNeighborRadius = alignmentNeighborRadius
const cohesionStrength = 0.0035
const separationDistance = 0.75
const separationStrength = 0.012
const alignmentNeighborRadiusSq = alignmentNeighborRadius ** 2
const cohesionNeighborRadiusSq = cohesionNeighborRadius ** 2
const separationDistanceSq = separationDistance ** 2

for (let i = 0; i < agentCount; i += 1) {
  const agent = agentTemplate.clone()
  agent.position.set(
    (Math.random() - 0.5) * bounds * 1.2,
    (Math.random() - 0.5) * bounds * 1.2,
    (Math.random() - 0.5) * bounds * 1.2
  )
  agent.userData.velocity = new THREE.Vector3(
    (Math.random() - 0.5) * maxSpeed,
    (Math.random() - 0.5) * maxSpeed,
    (Math.random() - 0.5) * maxSpeed
  )
  scene.add(agent)
  agents.push(agent)
}

const centerForce = new THREE.Vector3()
const alignmentAverageVelocity = new THREE.Vector3()
const alignmentAdjustment = new THREE.Vector3()
const cohesionAveragePosition = new THREE.Vector3()
const cohesionAdjustment = new THREE.Vector3()
const separationAverageDirection = new THREE.Vector3()
const separationOffset = new THREE.Vector3()
const separationAdjustment = new THREE.Vector3()
const velocityDirection = new THREE.Vector3()
const agentForwardAxis = new THREE.Vector3(1, 0, 0)
const agentQuaternion = new THREE.Quaternion()

function animate() {
  requestAnimationFrame(animate)
  for (let i = 0; i < agents.length; i += 1) {
    const agent = agents[i]
    const velocity = agent.userData.velocity

    alignmentAverageVelocity.set(0, 0, 0)
    cohesionAveragePosition.set(0, 0, 0)
    separationAverageDirection.set(0, 0, 0)
    let alignmentNeighborCount = 0
    let cohesionNeighborCount = 0
    let separationNeighborCount = 0
    for (let j = 0; j < agents.length; j += 1) {
      if (i === j) continue
      const neighbor = agents[j]
      const distanceSq = agent.position.distanceToSquared(neighbor.position)

      if (distanceSq <= alignmentNeighborRadiusSq) {
        alignmentAverageVelocity.add(neighbor.userData.velocity)
        alignmentNeighborCount += 1
      }

      if (distanceSq <= cohesionNeighborRadiusSq) {
        cohesionAveragePosition.add(neighbor.position)
        cohesionNeighborCount += 1
      }

      if (distanceSq <= separationDistanceSq && distanceSq > 1e-8) {
        separationOffset.copy(agent.position).sub(neighbor.position)
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
        .sub(velocity)
        .multiplyScalar(alignmentStrength)
      velocity.add(alignmentAdjustment)
    }

    if (cohesionNeighborCount > 0) {
      cohesionAveragePosition.multiplyScalar(1 / cohesionNeighborCount)
      cohesionAdjustment
        .copy(cohesionAveragePosition)
        .sub(agent.position)
        .multiplyScalar(cohesionStrength)
      velocity.add(cohesionAdjustment)
    }

    if (separationNeighborCount > 0) {
      separationAverageDirection.multiplyScalar(1 / separationNeighborCount)
      separationAdjustment
        .copy(separationAverageDirection)
        .multiplyScalar(separationStrength)
      velocity.add(separationAdjustment)
    }

    centerForce.copy(agent.position).multiplyScalar(-centerAttractionStrength)
    velocity.add(centerForce)
    velocity.clampLength(minSpeed, maxSpeed)
    agent.position.add(velocity)

    if (Math.abs(agent.position.x) > bounds) {
      agent.position.x = THREE.MathUtils.clamp(agent.position.x, -bounds, bounds)
      velocity.x *= -1
    }
    if (Math.abs(agent.position.y) > bounds) {
      agent.position.y = THREE.MathUtils.clamp(agent.position.y, -bounds, bounds)
      velocity.y *= -1
    }
    if (Math.abs(agent.position.z) > bounds) {
      agent.position.z = THREE.MathUtils.clamp(agent.position.z, -bounds, bounds)
      velocity.z *= -1
    }

    if (velocity.lengthSq() > 1e-8) {
      velocityDirection.copy(velocity).normalize()
      agentQuaternion.setFromUnitVectors(agentForwardAxis, velocityDirection)
      agent.quaternion.copy(agentQuaternion)
    }
  }
  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()
