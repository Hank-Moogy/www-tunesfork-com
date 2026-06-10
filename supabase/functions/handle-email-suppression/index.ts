import { createClient } from 'npm:@supabase/supabase-js@2'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

type SuppressionReason = 'bounce' | 'complaint' | 'unsubscribe'

interface SuppressionPayload {
  email: string
  reason: SuppressionReason
  message_id?: string
  metadata?: Record<string, unknown>
  is_retry?: boolean
  retry_count?: number
}

interface ResendWebhookPayload {
  type?: string
  data?: {
    email_id?: string
    to?: string | string[]
    recipient?: string
    email?: string
    [key: string]: unknown
  }
}

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getWebhookSecret(): string {
  return Deno.env.get('RESEND_WEBHOOK_SECRET')
    || Deno.env.get('SUPPRESSION_WEBHOOK_SECRET')
    || ''
}

function firstEmail(value: unknown): string | null {
  if (typeof value === 'string' && value.includes('@')) return value
  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === 'string' && entry.includes('@'))
    return typeof first === 'string' ? first : null
  }
  return null
}

function mapResendEvent(payload: ResendWebhookPayload): SuppressionPayload | null {
  const type = payload.type || ''
  const data = payload.data || {}

  let reason: SuppressionReason | null = null
  if (type === 'email.bounced') reason = 'bounce'
  if (type === 'email.complained') reason = 'complaint'
  if (type === 'email.unsubscribed') reason = 'unsubscribe'
  if (!reason) return null

  const email = firstEmail(data.to) || firstEmail(data.recipient) || firstEmail(data.email)
  if (!email) {
    throw new Error('Resend webhook payload is missing recipient email')
  }

  return {
    email,
    reason,
    message_id: typeof data.email_id === 'string' ? data.email_id : undefined,
    metadata: { provider: 'resend', event_type: type, data },
    is_retry: false,
    retry_count: 0,
  }
}

function parseSuppressionPayload(parsed: unknown): SuppressionPayload {
  const envelope = parsed as { data?: unknown }

  if (envelope.data && typeof envelope.data === 'object') {
    const legacy = envelope.data as Partial<SuppressionPayload>
    if (legacy.email && legacy.reason) {
      return {
        email: legacy.email,
        reason: legacy.reason,
        message_id: legacy.message_id,
        metadata: legacy.metadata,
        is_retry: legacy.is_retry ?? false,
        retry_count: legacy.retry_count ?? 0,
      }
    }
  }

  const resend = mapResendEvent(parsed as ResendWebhookPayload)
  if (resend) return resend

  throw new Error('Unsupported suppression event')
}

async function verifyPayload(req: Request): Promise<SuppressionPayload> {
  const secret = getWebhookSecret()
  if (!secret) {
    throw new Error('RESEND_WEBHOOK_SECRET is not configured')
  }

  const rawBody = await req.text()
  const headers = Object.fromEntries(req.headers.entries())
  const verified = new Webhook(secret).verify(rawBody, headers)
  return parseSuppressionPayload(verified)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  let payload: SuppressionPayload
  try {
    payload = await verifyPayload(req)
  } catch (error) {
    console.error('Suppression webhook verification failed', { error })
    return jsonResponse({ error: 'Invalid signature or payload' }, 401)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  const normalizedEmail = payload.email.toLowerCase()

  const { error: suppressError } = await supabase
    .from('suppressed_emails')
    .upsert(
      {
        email: normalizedEmail,
        reason: payload.reason,
        metadata: payload.metadata ?? null,
      },
      { onConflict: 'email' },
    )

  if (suppressError) {
    console.error('Failed to upsert suppressed email', {
      error: suppressError,
      email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    })
    return jsonResponse({ error: 'Failed to write suppression' }, 500)
  }

  const sendLogStatus = mapReasonToStatus(payload.reason)
  const sendLogMessage = mapReasonToMessage(payload.reason)

  const { error: insertError } = await supabase
    .from('email_send_log')
    .insert({
      message_id: payload.message_id ?? null,
      template_name: 'system',
      recipient_email: normalizedEmail,
      status: sendLogStatus,
      error_message: sendLogMessage,
      metadata: payload.metadata ?? null,
    })

  if (insertError) {
    console.warn('Failed to insert email_send_log', { error: insertError })
  }

  console.log('Suppression processed', {
    email_redacted: normalizedEmail[0] + '***@' + normalizedEmail.split('@')[1],
    reason: payload.reason,
    is_retry: payload.is_retry ?? false,
    retry_count: payload.retry_count ?? 0,
    has_message_id: !!payload.message_id,
  })

  return jsonResponse({ success: true })
})

function mapReasonToStatus(
  reason: string,
): 'bounced' | 'complained' | 'suppressed' {
  switch (reason) {
    case 'bounce':
      return 'bounced'
    case 'complaint':
      return 'complained'
    default:
      return 'suppressed'
  }
}

function mapReasonToMessage(reason: string): string {
  switch (reason) {
    case 'bounce':
      return 'Permanent bounce - email address is invalid or rejected'
    case 'complaint':
      return 'Spam complaint - recipient marked email as spam'
    case 'unsubscribe':
      return 'Recipient unsubscribed'
    default:
      return 'Email suppressed'
  }
}
