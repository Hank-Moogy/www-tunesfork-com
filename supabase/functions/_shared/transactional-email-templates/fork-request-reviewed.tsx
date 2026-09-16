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
  ownerName?: string
  projectName?: string
  projectUrl?: string
  decision?: 'approved' | 'rejected'
  versionNumber?: number | null
  reviewNote?: string
}

const ForkRequestReviewedEmail = ({
  contributorName,
  ownerName,
  projectName,
  projectUrl,
  decision,
  versionNumber,
  reviewNote,
}: Props) => {
  const ctaUrl = projectUrl || SITE_URL
  const project = projectName || 'the project'
  const owner = ownerName || 'The project owner'
  const approved = decision !== 'rejected'
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>
        {approved
          ? `Your changes are now part of ${project}`
          : `${owner} did not merge your changes to ${project}`}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>
            {approved ? 'Your changes were approved 🎉' : 'Your changes were not merged'}
          </Heading>
          <Text style={text}>{contributorName ? `Hey ${contributorName},` : 'Hey,'}</Text>
          {approved ? (
            <Text style={text}>
              <strong>{owner}</strong> approved your changes to <strong>{project}</strong>
              {typeof versionNumber === 'number' ? <> — they are now version {versionNumber}</> : null}
              {' '}on {SITE_NAME}.
            </Text>
          ) : (
            <Text style={text}>
              <strong>{owner}</strong> decided not to merge your changes to{' '}
              <strong>{project}</strong>. Your local copy is untouched, and you can keep working
              and send a new request whenever you're ready.
            </Text>
          )}
          {reviewNote ? <Text style={quote}>{reviewNote}</Text> : null}
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button style={button} href={ctaUrl}>Open project</Button>
          </Section>
          <Text style={footer}>You're receiving this because you contribute to this project.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ForkRequestReviewedEmail,
  subject: (d: Record<string, any>) => {
    const project = d?.projectName ? ` to ${d.projectName}` : ''
    return d?.decision === 'rejected'
      ? `Your changes${project} were not merged`
      : `Your changes${project} were approved`
  },
  displayName: 'Fork request reviewed',
  previewData: {
    contributorName: 'Jane',
    ownerName: 'Alex',
    projectName: 'Midnight Drive',
    projectUrl: 'https://www.tunesfork.com/project/123',
    decision: 'approved',
    versionNumber: 4,
    reviewNote: 'Love the new drop — keeping it.',
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
  borderLeft: '3px solid #45ff72',
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
