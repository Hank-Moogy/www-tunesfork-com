/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'TunesFork'
const SITE_URL = 'https://www.tunesfork.com'

interface Props {
  inviterName?: string
  projectName?: string
  projectUrl?: string
  recipientName?: string
}

const CollaboratorInvitedEmail = ({
  inviterName,
  projectName,
  projectUrl,
  recipientName,
}: Props) => {
  const ctaUrl = projectUrl || SITE_URL
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {inviterName ? `${inviterName} invited you` : "You've been invited"} to collaborate on {projectName || 'a project'}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>You've been invited 🎶</Heading>
          <Text style={text}>
            {recipientName ? `Hey ${recipientName},` : 'Hey,'}
          </Text>
          <Text style={text}>
            <strong>{inviterName || 'Someone'}</strong> invited you to collaborate on{' '}
            <strong>{projectName || 'their project'}</strong> on {SITE_NAME}.
          </Text>
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button style={button} href={ctaUrl}>Open project</Button>
          </Section>
          <Text style={footer}>
            If you weren't expecting this, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: CollaboratorInvitedEmail,
  subject: (d: Record<string, any>) =>
    d?.inviterName && d?.projectName
      ? `${d.inviterName} invited you to collaborate on ${d.projectName}`
      : "You've been invited to collaborate on TunesFork",
  displayName: 'Collaborator invited',
  previewData: {
    inviterName: 'Alex',
    projectName: 'Midnight Drive',
    projectUrl: 'https://www.tunesfork.com/project/123',
    recipientName: 'Jane',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Roboto', Arial, sans-serif" }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0e0e0e', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#555555', lineHeight: '1.6', margin: '0 0 16px' }
const button = {
  backgroundColor: '#22C55E',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '10px',
  padding: '12px 24px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
