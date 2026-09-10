import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Use only for schema additions that have not yet been folded into the generated
// Database type. Remove calls from here after regenerating Supabase types.
export const supabaseDynamic = supabase as unknown as SupabaseClient;
