import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://www.tunesfork.com'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    // Authenticate caller (the user accepting the invite). Validate the JWT
    // with the service-role client — the legacy SUPABASE_ANON_KEY injected
    // into functions is not valid on projects using publishable/secret keys.
    const authClient = createClient(supabaseUrl, serviceKey)
    const { data: userData } = await authClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, '').trim())
    const acceptingUser = userData?.user
    if (!acceptingUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { projectId } = await req.json()
    if (!projectId || typeof projectId !== 'string') {
      return new Response(JSON.stringify({ error: 'projectId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)

    // Look up project + owner email
    const { data: project, error: pErr } = await admin
      .from('projects').select('id, name, owner_id').eq('id', projectId).maybeSingle()
    if (pErr || !project) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Don't notify when owner accepts their own link
    if (project.owner_id === acceptingUser.id) {
      return new Response(JSON.stringify({ success: true, skipped: 'self' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: ownerAuth } = await admin.auth.admin.getUserById(project.owner_id)
    const ownerEmail = ownerAuth?.user?.email
    if (!ownerEmail) {
      return new Response(JSON.stringify({ error: 'Owner email not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: ownerProfile } = await admin
      .from('profiles').select('display_name').eq('user_id', project.owner_id).maybeSingle()
    const { data: collabProfile } = await admin
      .from('profiles').select('display_name').eq('user_id', acceptingUser.id).maybeSingle()

    // Invoke send-transactional-email with service role
    await admin.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'invite-accepted',
        recipientEmail: ownerEmail,
        idempotencyKey: `invite-accepted-${project.id}-${acceptingUser.id}`,
        templateData: {
          ownerName: ownerProfile?.display_name ?? null,
          collaboratorName: collabProfile?.display_name ?? null,
          collaboratorEmail: acceptingUser.email,
          projectName: project.name,
          projectUrl: `${SITE_URL}/project/${project.id}`,
        },
      },
    })

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('notify-invite-accepted error', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
