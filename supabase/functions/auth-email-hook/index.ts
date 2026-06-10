import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

type EmailAction =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'reauthentication'

interface SendEmailHookPayload {
  user?: {
    email?: string
    new_email?: string
  }
  email_data?: {
    email_action_type?: EmailAction
    token?: string
    token_hash?: string
    token_new?: string
    token_hash_new?: string
    redirect_to?: string
    site_url?: string
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, wh-signature, wh-timestamp, wh-token',
}

const EMAIL_SUBJECTS: Record<EmailAction, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

const EMAIL_TEMPLATES: Record<EmailAction, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SITE_NAME = Deno.env.get('EMAIL_SITE_NAME') || 'Tunesfork'
const PUBLIC_BASE_URL = Deno.env.get('PUBLIC_BASE_URL') || 'https://www.tunesfork.com'
const FROM_ADDRESS = Deno.env.get('EMAIL_FROM') || 'Tunesfork <noreply@www.tunesfork.com>'

const SAMPLE_EMAIL = 'user@example.test'
const SAMPLE_DATA: Record<EmailAction, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: PUBLIC_BASE_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: PUBLIC_BASE_URL,
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: PUBLIC_BASE_URL,
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: PUBLIC_BASE_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: PUBLIC_BASE_URL,
    confirmationUrl: PUBLIC_BASE_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: PUBLIC_BASE_URL,
  },
  reauthentication: {
    token: '123456',
  },
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getAuthHookSecret(): string {
  const secret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
    || Deno.env.get('AUTH_EMAIL_HOOK_SECRET')
    || ''
  return secret.replace(/^v1,whsec_/, '')
}

function buildVerifyUrl(emailData: NonNullable<SendEmailHookPayload['email_data']>, tokenHash?: string): string {
  if (!tokenHash) return emailData.site_url || PUBLIC_BASE_URL

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) return emailData.site_url || PUBLIC_BASE_URL

  const url = new URL('/auth/v1/verify', supabaseUrl)
  url.searchParams.set('token', tokenHash)
  url.searchParams.set('type', emailData.email_action_type || 'magiclink')
  if (emailData.redirect_to) {
    url.searchParams.set('redirect_to', emailData.redirect_to)
  }
  return url.toString()
}

async function enqueueEmail(params: {
  emailType: EmailAction
  to: string
  html: string
  text: string
  subject: string
}): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const messageId = crypto.randomUUID()
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: params.emailType,
    recipient_email: params.to,
    status: 'pending',
  })

  const { error } = await supabase.rpc('enqueue_email', {
    queue_name: 'auth_emails',
    payload: {
      run_id: messageId,
      message_id: messageId,
      idempotency_key: messageId,
      to: params.to,
      from: FROM_ADDRESS,
      subject: params.subject,
      html: params.html,
      text: params.text,
      purpose: 'transactional',
      label: params.emailType,
      queued_at: new Date().toISOString(),
    },
  })

  if (error) {
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: params.emailType,
      recipient_email: params.to,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })
    throw error
  }
}

async function handlePreview(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const previewToken = Deno.env.get('EMAIL_PREVIEW_TOKEN')
  const authHeader = req.headers.get('Authorization')

  if (!previewToken || authHeader !== `Bearer ${previewToken}`) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  let type: EmailAction
  try {
    const body = await req.json()
    type = body.type
  } catch {
    return jsonResponse({ error: 'Invalid JSON in request body' }, 400)
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]
  if (!EmailTemplate) {
    return jsonResponse({ error: `Unknown email type: ${type}` }, 400)
  }

  const html = await renderAsync(React.createElement(EmailTemplate, SAMPLE_DATA[type]))
  return new Response(html, {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function verifyPayload(req: Request): Promise<SendEmailHookPayload> {
  const secret = getAuthHookSecret()
  if (!secret) {
    throw new Error('SEND_EMAIL_HOOK_SECRET is not configured')
  }

  const rawBody = await req.text()
  const headers = Object.fromEntries(req.headers.entries())
  return new Webhook(secret).verify(rawBody, headers) as SendEmailHookPayload
}

async function handleWebhook(req: Request): Promise<Response> {
  let payload: SendEmailHookPayload
  try {
    payload = await verifyPayload(req)
  } catch (error) {
    console.error('Auth email hook verification failed', { error })
    return jsonResponse({ error: 'Invalid signature or payload' }, 401)
  }

  const emailData = payload.email_data
  const emailType = emailData?.email_action_type
  const recipient = payload.user?.email

  if (!emailData || !emailType || !EMAIL_TEMPLATES[emailType] || !recipient) {
    console.error('Auth email hook payload missing required fields', {
      emailType,
      hasEmailData: !!emailData,
      hasRecipient: !!recipient,
    })
    return jsonResponse({ error: 'Invalid webhook payload' }, 400)
  }

  const confirmationUrl = buildVerifyUrl(emailData, emailData.token_hash)
  const EmailTemplate = EMAIL_TEMPLATES[emailType]
  const templateProps = {
    siteName: SITE_NAME,
    siteUrl: emailData.site_url || PUBLIC_BASE_URL,
    recipient,
    confirmationUrl,
    token: emailData.token,
    email: recipient,
    newEmail: payload.user?.new_email || recipient,
  }

  const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
  const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
    plainText: true,
  })

  await enqueueEmail({
    emailType,
    to: recipient,
    html,
    text,
    subject: EMAIL_SUBJECTS[emailType],
  })

  if (emailType === 'email_change' && payload.user?.new_email && emailData.token_hash_new) {
    const newEmailProps = {
      ...templateProps,
      confirmationUrl: buildVerifyUrl(emailData, emailData.token_hash_new),
      newEmail: payload.user.new_email,
    }
    const newEmailHtml = await renderAsync(React.createElement(EmailTemplate, newEmailProps))
    const newEmailText = await renderAsync(React.createElement(EmailTemplate, newEmailProps), {
      plainText: true,
    })

    await enqueueEmail({
      emailType,
      to: payload.user.new_email,
      html: newEmailHtml,
      text: newEmailText,
      subject: EMAIL_SUBJECTS.email_change,
    })
  }

  console.log('Auth email enqueued', { emailType, recipient })
  return jsonResponse({ success: true, queued: true })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Auth email hook error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return jsonResponse({ error: message }, 500)
  }
})
