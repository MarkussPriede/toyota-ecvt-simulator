import { createContext, useCallback, useContext, useMemo, type PropsWithChildren } from 'react'
import type { Group } from 'three'
import type { ComponentId } from '../simulation/types'

interface AnchorRegistryValue {
  objects: Map<ComponentId, Group>
  register: (id: ComponentId, object: Group | null) => void
}

const AnchorRegistry = createContext<AnchorRegistryValue | null>(null)

export function DrivetrainAnchorProvider({ children }: PropsWithChildren) {
  const objects = useMemo(() => new Map<ComponentId, Group>(), [])
  const register = useCallback((id: ComponentId, object: Group | null) => {
    if (object) objects.set(id, object)
    else objects.delete(id)
  }, [objects])
  const value = useMemo(() => ({ objects, register }), [objects, register])
  return <AnchorRegistry.Provider value={value}>{children}</AnchorRegistry.Provider>
}

export function useDrivetrainAnchors() {
  return useContext(AnchorRegistry)
}
