/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'TunesFork'
const SITE_URL = 'https://www.tunesfork.com'

interface Props {
  commenterName?: string
  commentBody?: string
  projectName?: string
  projectUrl?: string
  recipientName?: string | null
}

const ProjectCommentedEmail = ({
  commenterName,
  commentBody,
  projectName,
  projectUrl,
  recipientName,
}: Props) => {
  const ctaUrl = projectUrl || SITE_URL
  const who = commenterName || 'Someone'
  const title = projectName || 'your project'

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{who} commented on {title}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>{who} commented on {title}</Heading>
          <Text style={text}>
            {recipientName ? `Hey ${recipientName},` : 'Hey,'}
          </Text>
          <Text style={text}>
            <strong>{who}</strong> left a new comment on <strong>{title}</strong> in {SITE_NAME}.
          </Text>
          {commentBody ? (
            <Section style={commentBox}>
              <Text style={commentText}>{commentBody}</Text>
            </Section>
          ) : null}
          <Section style={{ textAlign: 'center', margin: '32px 0' }}>
            <Button style={button} href={ctaUrl}>Open project</Button>
          </Section>
          <Text style={footer}>
            You are receiving this because you collaborate on this TunesFork project.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: ProjectCommentedEmail,
  subject: (d: Record<string, any>) =>
    d?.commenterName && d?.projectName
      ? `${d.commenterName} commented on ${d.projectName}`
      : 'New comment on your TunesFork project',
  displayName: 'Project commented',
  previewData: {
    commenterName: 'Alex',
    recipientName: 'Jane',
    projectName: 'Midnight Drive',
    projectUrl: 'https://www.tunesfork.com/project/123',
    commentBody: 'The bass works now. I would keep this arrangement and try one shorter intro.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: "'Roboto', Arial, sans-serif" }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0e0e0e', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#555555', lineHeight: '1.6', margin: '0 0 16px' }
const commentBox = {
  backgroundColor: '#f6f6f2',
  border: '1px solid #e8e4d8',
  borderRadius: '10px',
  padding: '16px',
  margin: '20px 0',
}
const commentText = {
  fontSize: '14px',
  color: '#24231f',
  lineHeight: '1.6',
  margin: '0',
  whiteSpace: 'pre-wrap' as const,
}
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
