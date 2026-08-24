import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = Deno.env.get('PUBLIC_BASE_URL') || 'https://www.tunesfork.com'

function sanitizeComment(body: string): string {
  const normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  return normalized.length > 1200 ? `${normalized.slice(0, 1197)}...` : normalized
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization') ?? ''

    if (!supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const { data: userData } = await admin.auth.getUser(token)
    const actor = userData?.user

    if (!actor) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { commentId, comment_id } = await req.json()
    const targetCommentId = commentId || comment_id

    if (!targetCommentId || typeof targetCommentId !== 'string') {
      return new Response(JSON.stringify({ error: 'commentId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: comment, error: commentError } = await admin
      .from('comments')
      .select('id, body, user_id, version_id')
      .eq('id', targetCommentId)
      .maybeSingle()

    if (commentError || !comment) {
      return new Response(JSON.stringify({ error: 'Comment not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (comment.user_id !== actor.id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: version, error: versionError } = await admin
      .from('project_versions')
      .select('id, project_id, major_version, version_number')
      .eq('id', comment.version_id)
      .maybeSingle()

    if (versionError || !version) {
      return new Response(JSON.stringify({ error: 'Version not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('id, name, owner_id')
      .eq('id', version.project_id)
      .maybeSingle()

    if (projectError || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: actorCollaborator } = await admin
      .from('collaborators')
      .select('id')
      .eq('project_id', project.id)
      .eq('user_id', actor.id)
      .maybeSingle()

    if (project.owner_id !== actor.id && !actorCollaborator) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: collaborators, error: collaboratorsError } = await admin
      .from('collaborators')
      .select('user_id')
      .eq('project_id', project.id)

    if (collaboratorsError) {
      return new Response(JSON.stringify({ error: 'Could not load collaborators' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const recipientIds = new Set<string>([
      project.owner_id,
      ...(collaborators ?? []).map((collaborator) => collaborator.user_id),
    ])
    recipientIds.delete(actor.id)

    if (recipientIds.size === 0) {
      return new Response(JSON.stringify({ success: true, skipped: 'no_recipients' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const allParticipantIds = [...recipientIds, actor.id]
    const { data: profiles } = await admin
      .from('profiles')
      .select('user_id, display_name')
      .in('user_id', allParticipantIds)

    const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]))
    const actorName = profileMap.get(actor.id)?.display_name || actor.user_metadata?.full_name || actor.email || 'Someone'
    const commentBody = sanitizeComment(comment.body)
    const projectUrl = `${SITE_URL}/project/${project.id}`

    const results = await Promise.allSettled(
      [...recipientIds].map(async (recipientId) => {
        const { data: recipientAuth } = await admin.auth.admin.getUserById(recipientId)
        const recipientEmail = recipientAuth?.user?.email
        if (!recipientEmail) return { recipientId, skipped: 'missing_email' }

        const recipientName = profileMap.get(recipientId)?.display_name ?? null
        const { error } = await admin.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'project-commented',
            recipientEmail,
            idempotencyKey: `project-commented-${comment.id}-${recipientId}`,
            templateData: {
              commenterName: actorName,
              recipientName,
              projectName: project.name,
              projectUrl,
              commentBody,
            },
          },
        })

        if (error) throw error
        return { recipientId, queued: true }
      })
    )

    const queued = results.filter((result) => result.status === 'fulfilled' && result.value.queued).length
    const failed = results.filter((result) => result.status === 'rejected').length

    if (failed > 0) {
      console.warn('Some comment notifications failed', { commentId: comment.id, queued, failed })
    }

    return new Response(JSON.stringify({ success: true, queued, failed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('notify-project-comment error', error)
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
