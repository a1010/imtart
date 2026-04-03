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
status.textContent = 'step 5'
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

const agentGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2)
const agentMaterial = new THREE.MeshBasicMaterial({ color: 0x87c6ff })
const agents = []
const agentCount = 10
const spacing = 0.5
const startX = -((agentCount - 1) * spacing) / 2
const baseAmplitude = 1.2
const baseSpeed = 0.7

for (let i = 0; i < agentCount; i += 1) {
  const agent = new THREE.Mesh(agentGeometry, agentMaterial)
  agent.position.set(startX + i * spacing, 0, 0)
  agent.userData.phase = i * 0.35
  agent.userData.speed = baseSpeed + i * 0.03
  agent.userData.amplitude = baseAmplitude + i * 0.03
  scene.add(agent)
  agents.push(agent)
}

function animate() {
  requestAnimationFrame(animate)
  const t = performance.now() * 0.001
  for (let i = 0; i < agents.length; i += 1) {
    const agent = agents[i]
    const offsetX =
      Math.sin(t * agent.userData.speed + agent.userData.phase) *
      agent.userData.amplitude
    agent.position.x = startX + i * spacing + offsetX
  }
  renderer.render(scene, camera)
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

animate()
