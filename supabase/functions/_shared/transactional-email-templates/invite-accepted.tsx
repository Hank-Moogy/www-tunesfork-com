/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'TunesFork'
const SITE_URL = 'https://www.tunesfork.com'

interface Props {
  collaboratorName?: string
  collaboratorEmail?: string
  projectName?: string
  projectUrl?: string
  ownerName?: string
}

const InviteAcceptedEmail = ({
  collaboratorName,
  collaboratorEmail,
  projectName,
  projectUrl,
  ownerName,
}: Props) => {
  const ctaUrl = projectUrl || SITE_URL
  const who = collaboratorName || collaboratorEmail || 'A new collaborator'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{who} joined {projectName || 'your project'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Your invite was accepted 🎉</Heading>
          <Text style={text}>{ownerName ? `Hey ${ownerName},` : 'Hey,'}</Text>
          <Text style={text}>
            <strong>{who}</strong> just accepted your invitation and joined{' '}
            <strong>{projectName || 'your project'}</strong> on {SITE_NAME}.
          </Text>
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button style={button} href={ctaUrl}>Open project</Button>
          </Section>
          <Text style={footer}>You're receiving this because you invited them to collaborate.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: InviteAcceptedEmail,
  subject: (d: Record<string, any>) => {
    const who = d?.collaboratorName || d?.collaboratorEmail || 'Someone'
    const proj = d?.projectName ? ` to ${d.projectName}` : ''
    return `${who} accepted your invite${proj}`
  },
  displayName: 'Invite accepted',
  previewData: {
    collaboratorName: 'Jane',
    collaboratorEmail: 'jane@example.com',
    projectName: 'Midnight Drive',
    projectUrl: 'https://www.tunesfork.com/project/123',
    ownerName: 'Alex',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Roboto', Arial, sans-serif" }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0e0e0e', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#555555', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#3B82F6',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '10px',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
