import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useEffect } from 'react'
import { TUTORIAL } from '../data/tutorial'
import { useSimulator } from '../state/useSimulator'

export function TutorialOverlay() {
  const active = useSimulator((state) => state.tutorialActive)
  const index = useSimulator((state) => state.tutorialStep)
  const setTutorial = useSimulator((state) => state.setTutorial)
  const setTutorialStep = useSimulator((state) => state.setTutorialStep)
  const setSelected = useSimulator((state) => state.setSelectedComponent)
  const setCamera = useSimulator((state) => state.setCameraPreset)
  const applyScenario = useSimulator((state) => state.applyScenario)
  const step = TUTORIAL[index]

  useEffect(() => {
    if (!active || !step) return
    setSelected(step.component)
    setCamera(step.camera)
    if (step.scenario) applyScenario(step.scenario)
  }, [active, step, setSelected, setCamera, applyScenario])

  if (!active || !step) return null
  const last = index === TUTORIAL.length - 1
  return (
    <div className="tutorial-card" role="dialog" aria-label="Guided eCVT tutorial">
      <button className="tutorial-close" onClick={() => setTutorial(false)} aria-label="Close tutorial"><X size={16} /></button>
      <div className="tutorial-progress"><span style={{ width: `${((index + 1) / TUTORIAL.length) * 100}%` }} /></div>
      <p className="eyebrow">GUIDED TOUR · {index + 1} OF {TUTORIAL.length}</p>
      <h2>{step.title}</h2>
      <p>{step.text}</p>
      <div className="tutorial-actions">
        <button className="button secondary" disabled={index === 0} onClick={() => setTutorialStep(index - 1)}><ChevronLeft size={15} /> Back</button>
        <button className="button primary" onClick={() => last ? setTutorial(false) : setTutorialStep(index + 1)}>{last ? 'Finish tour' : 'Next'} {!last && <ChevronRight size={15} />}</button>
      </div>
    </div>
  )
}
