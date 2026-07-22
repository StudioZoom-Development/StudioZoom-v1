import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { ProjectStage } from '@/types'

export interface GateResult {
  canAdvance: boolean
  reasons:    string[]   // human-readable unmet conditions
}

export async function checkStageGate(
  projectId: string,
  currentStage: ProjectStage
): Promise<GateResult> {
  const reasons: string[] = []
  const projSnap = await getDoc(doc(db, 'projects', projectId))
  const proj     = projSnap.data()

  if (currentStage === 'booked') {
    if (!proj?.staffUids?.length)
      reasons.push('Assign at least one team member')
    if (!proj?.milestones?.depositPaid)
      reasons.push('Record the advance payment')
  }

  if (currentStage === 'planning') {
    const snap = await getDocs(query(
      collection(db, 'checkouts'),
      where('projectId', '==', projectId),
      where('status', '==', 'out')
    ))
    if (snap.empty) reasons.push('Check out equipment for this event')
  }

  if (currentStage === 'preProduction') {
    const m = proj?.milestones || {}
    if (!m.rawPhotosDelivered && !m.rawVideosDelivered)
      reasons.push('Mark raw photos or video as delivered for editing handoff')
  }

  if (currentStage === 'postProduction') {
    // Both photo AND video tracks must be fully done
    const snap = await getDocs(query(
      collection(db, 'workItems'),
      where('projectId', '==', projectId)
    ))
    const items     = snap.docs.map(d => d.data())
    const photoDone = items.filter(i => i.track === 'photo').every(i => i.status === 'done')
    const videoDone = items.filter(i => i.track === 'video').every(i => i.status === 'done')
    if (!photoDone) reasons.push('All photo track tasks must be completed')
    if (!videoDone) reasons.push('All video track tasks must be completed')
  }

  if (currentStage === 'eventDay') {
    const m = proj?.milestones || {}
    if (!m.rawPhotosDelivered && !m.rawVideosDelivered)
      reasons.push('Raw footage must be logged as delivered before post-production begins')
  }

  return { canAdvance: reasons.length === 0, reasons }
}
