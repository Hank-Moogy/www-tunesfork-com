/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as collaboratorInvited } from './collaborator-invited.tsx'
import { template as forkRequestReceived } from './fork-request-received.tsx'
import { template as forkRequestReviewed } from './fork-request-reviewed.tsx'
import { template as inviteAccepted } from './invite-accepted.tsx'
import { template as projectCommented } from './project-commented.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'collaborator-invited': collaboratorInvited,
  'fork-request-received': forkRequestReceived,
  'fork-request-reviewed': forkRequestReviewed,
  'invite-accepted': inviteAccepted,
  'project-commented': projectCommented,
}
