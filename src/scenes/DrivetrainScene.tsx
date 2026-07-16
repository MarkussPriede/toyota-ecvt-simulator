import { ContactShadows, Grid } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Suspense } from 'react'
import { ElectricalAssembly, DifferentialAssembly, EngineAssembly, MotorAssembly, ReductionAssembly } from '../drivetrain/Assemblies'
import { PowerSplitDevice } from '../drivetrain/PowerSplitDevice'
import { useSimulator } from '../state/useSimulator'
import { CameraRig } from './CameraRig'
import { EnergyFlows } from './EnergyFlows'
import { RotationArrows } from './RotationArrows'
import { TransmissionHousing } from './TransmissionHousing'

function SimulationClock() {
  const tick = useSimulator((state) => state.tick)
  useFrame((_, delta) => tick(delta))
  return null
}

export function DrivetrainScene() {
  const quality = useSimulator((state) => state.quality)
  return (
    <Suspense fallback={null}>
      <color attach="background" args={['#071017']} />
      <fog attach="fog" args={['#071017', 18, 34]} />
      <ambientLight intensity={0.82} />
      <hemisphereLight args={['#cceeff', '#17252e', 1.15]} />
      <directionalLight position={[-9, 6, 7]} color="#ffd5b2" intensity={1.1} />
      <spotLight position={[2, 11, 8]} angle={0.48} penumbra={0.75} intensity={3.2} castShadow={quality !== 'low'} shadow-mapSize-width={quality === 'high' ? 2048 : 1024} shadow-mapSize-height={quality === 'high' ? 2048 : 1024} />
      <pointLight position={[-7, 3, 5]} color="#ffad72" intensity={2.0} distance={16} />
      <pointLight position={[6, 4, -5]} color="#59d9ff" intensity={1.8} distance={16} />
      <SimulationClock />
      <group position={[0, 0.35, 0]}>
        <TransmissionHousing />
        <EngineAssembly />
        <MotorAssembly kind="mg1" />
        <PowerSplitDevice />
        <MotorAssembly kind="mg2" />
        <ReductionAssembly />
        <DifferentialAssembly />
        <ElectricalAssembly />
        <EnergyFlows />
        <RotationArrows />
      </group>
      <Grid position={[0, -2.2, 0]} args={[30, 30]} cellSize={0.6} cellThickness={0.35} cellColor="#1c3c48" sectionSize={3} sectionThickness={0.8} sectionColor="#255d6e" fadeDistance={24} fadeStrength={1.5} infiniteGrid />
      {quality !== 'low' && <ContactShadows position={[0, -2.15, 0]} opacity={0.45} scale={25} blur={2.8} far={8} />}
      <CameraRig />
    </Suspense>
  )
}
