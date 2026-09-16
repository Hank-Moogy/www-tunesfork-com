/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'TunesFork'
const SITE_URL = 'https://www.tunesfork.com'

interface Props {
  contributorName?: string
  contributorEmail?: string
  projectName?: string
  projectUrl?: string
  ownerName?: string
  changeNote?: string
  replacedPrevious?: boolean
}

const ForkRequestReceivedEmail = ({
  contributorName,
  contributorEmail,
  projectName,
  projectUrl,
  ownerName,
  changeNote,
  replacedPrevious,
}: Props) => {
  const ctaUrl = projectUrl || SITE_URL
  const who = contributorName || contributorEmail || 'A collaborator'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{who} sent changes to {projectName || 'your project'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>New fork request</Heading>
          <Text style={text}>{ownerName ? `Hey ${ownerName},` : 'Hey,'}</Text>
          <Text style={text}>
            <strong>{who}</strong> saved changes to{' '}
            <strong>{projectName || 'your project'}</strong> on {SITE_NAME}.
          </Text>
          {changeNote ? (
            <Text style={quote}>{changeNote}</Text>
          ) : null}
          <Text style={text}>
            Nothing has changed in your project yet — their save is waiting for you to approve
            it before it becomes a version.
          </Text>
          {replacedPrevious ? (
            <Text style={text}>
              This replaces their previous request, so you only need to review the latest one.
            </Text>
          ) : null}
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button style={button} href={ctaUrl}>Review the changes</Button>
          </Section>
          <Text style={footer}>You're receiving this because you own this project.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ForkRequestReceivedEmail,
  subject: (d: Record<string, any>) => {
    const who = d?.contributorName || d?.contributorEmail || 'A collaborator'
    const proj = d?.projectName ? ` to ${d.projectName}` : ''
    return `${who} sent changes${proj}`
  },
  displayName: 'Fork request received',
  previewData: {
    contributorName: 'Jane',
    contributorEmail: 'jane@example.com',
    projectName: 'Midnight Drive',
    projectUrl: 'https://www.tunesfork.com/project/123',
    ownerName: 'Alex',
    changeNote: 'Reworked the second drop and re-recorded the top line',
    replacedPrevious: false,
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Roboto', Arial, sans-serif" }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0e0e0e', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#555555', lineHeight: '1.6', margin: '0 0 16px' }
const quote = {
  fontSize: '14px',
  color: '#0e0e0e',
  lineHeight: '1.6',
  margin: '0 0 16px',
  padding: '12px 16px',
  backgroundColor: '#f5f5f5',
  borderLeft: '3px solid #ffb52e',
  borderRadius: '4px',
}
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
