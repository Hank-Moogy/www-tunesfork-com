// Tells a contributor what happened to their fork request. Called by the web app
// right after review_project_contribution succeeds; the RPC itself is the
// authority on who may review, this only decides who to mail.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = Deno.env.get('TUNESFORK_SITE_URL') ?? 'https://www.tunesfork.com'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: userData } = await admin.auth.getUser(authHeader.replace(/^Bearer\s+/i, '').trim())
    const reviewer = userData?.user
    if (!reviewer) return json({ error: 'Unauthorized' }, 401)

    const { versionId } = await req.json().catch(() => ({ versionId: null }))
    if (!versionId || typeof versionId !== 'string') return json({ error: 'versionId required' }, 400)

    const { data: version } = await admin
      .from('project_versions')
      .select('id, project_id, uploader_id, status, version_number, review_note')
      .eq('id', versionId)
      .maybeSingle()
    if (!version) return json({ error: 'Contribution not found' }, 404)

    const { data: project } = await admin
      .from('projects').select('id, name, owner_id').eq('id', version.project_id).maybeSingle()
    if (!project) return json({ error: 'Project not found' }, 404)

    // Only the owner reviews, and only a decided contribution is worth mailing.
    if (project.owner_id !== reviewer.id) return json({ error: 'Not the project owner' }, 403)
    if (version.status !== 'approved' && version.status !== 'rejected') {
      return json({ success: true, skipped: 'not-reviewed' })
    }
    // Owners reviewing their own upload would just be mailing themselves.
    if (version.uploader_id === project.owner_id) return json({ success: true, skipped: 'self' })

    const { data: contributorAuth } = await admin.auth.admin.getUserById(version.uploader_id)
    const contributorEmail = contributorAuth?.user?.email
    if (!contributorEmail) return json({ error: 'Contributor email not found' }, 404)

    const { data: contributorProfile } = await admin
      .from('profiles').select('display_name').eq('user_id', version.uploader_id).maybeSingle()
    const { data: ownerProfile } = await admin
      .from('profiles').select('display_name').eq('user_id', project.owner_id).maybeSingle()

    await admin.functions.invoke('send-transactional-email', {
      body: {
        templateName: 'fork-request-reviewed',
        recipientEmail: contributorEmail,
        // One mail per decision on this contribution.
        idempotencyKey: `fork-reviewed-${version.id}-${version.status}`,
        templateData: {
          contributorName: contributorProfile?.display_name ?? null,
          ownerName: ownerProfile?.display_name ?? null,
          projectName: project.name,
          projectUrl: `${SITE_URL}/project/${project.id}`,
          decision: version.status,
          versionNumber: version.version_number,
          reviewNote: version.review_note ?? null,
        },
      },
    })

    return json({ success: true })
  } catch (e) {
    console.error('notify-contribution-reviewed error', e)
    return json({ error: e instanceof Error ? e.message : 'Unknown' }, 500)
  }
})
