-- Supabase projects may grant EXECUTE on newly created functions directly to
-- anon and authenticated through default privileges. Revoking PUBLIC alone
-- does not remove those role-specific grants, so lock down every privileged
-- function introduced by the launch migrations explicitly.

REVOKE ALL ON FUNCTION public.create_default_account_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_version_storage_deletion() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_blob_storage_deletion_candidate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_project_entitlement() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_collaborator_entitlement() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.account_physical_storage_bytes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.account_reserved_storage_bytes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.storage_warning_level(bigint, bigint, bigint) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reserve_project_upload(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_upload_reservation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_manifest_project_version(
  uuid, uuid, text, jsonb, bigint, text, integer, jsonb, jsonb, text,
  jsonb, jsonb, bigint, bigint
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_audio_preview_upload(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_audio_preview_upload(uuid, uuid, uuid, text, bigint) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reserve_founding_producer_slot(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_account_plan(uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_project_upload(uuid, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_upload_reservation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_manifest_project_version(
  uuid, uuid, text, jsonb, bigint, text, integer, jsonb, jsonb, text,
  jsonb, jsonb, bigint, bigint
) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_audio_preview_upload(uuid, uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_audio_preview_upload(uuid, uuid, uuid, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_founding_producer_slot(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_account_plan(uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.get_account_storage_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_storage_usage(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.delete_project_version(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_project_version(uuid) TO authenticated, service_role;
