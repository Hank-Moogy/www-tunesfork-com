
-- Create enums
CREATE TYPE public.handoff_status AS ENUM ('ready', 'in_progress');
CREATE TYPE public.permission_level AS ENUM ('viewer', 'contributor');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)), NEW.raw_user_meta_data ->> 'avatar_url');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Create collaborators table FIRST (referenced by projects RLS)
CREATE TABLE public.collaborators (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  permission_level public.permission_level NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  bpm INTEGER,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  handoff_status public.handoff_status NOT NULL DEFAULT 'ready',
  handoff_locked_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  archived BOOLEAN NOT NULL DEFAULT false
);

-- Now add FK on collaborators referencing projects
ALTER TABLE public.collaborators ADD CONSTRAINT collaborators_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners can do everything" ON public.projects FOR ALL TO authenticated USING (auth.uid() = owner_id);
CREATE POLICY "Collaborators can view shared projects" ON public.projects FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.collaborators WHERE collaborators.project_id = projects.id AND collaborators.user_id = auth.uid())
);

ALTER TABLE public.collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Project owners can manage collaborators" ON public.collaborators FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = collaborators.project_id AND projects.owner_id = auth.uid())
);
CREATE POLICY "Users can view their own collaborator records" ON public.collaborators FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Create project_versions table
CREATE TABLE public.project_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  version_number INTEGER NOT NULL,
  uploader_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  change_note TEXT,
  zip_url TEXT NOT NULL,
  audio_preview_url TEXT,
  plugin_list JSONB,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.project_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view versions of accessible projects" ON public.project_versions FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_versions.project_id AND (projects.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.collaborators WHERE collaborators.project_id = projects.id AND collaborators.user_id = auth.uid())))
);
CREATE POLICY "Owners and contributors can insert versions" ON public.project_versions FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects WHERE projects.id = project_versions.project_id AND (projects.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.collaborators WHERE collaborators.project_id = projects.id AND collaborators.user_id = auth.uid() AND collaborators.permission_level = 'contributor')))
);

-- Create comments table
CREATE TABLE public.comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_id UUID REFERENCES public.project_versions(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  timestamp_seconds DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view comments on accessible versions" ON public.comments FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.project_versions pv JOIN public.projects p ON p.id = pv.project_id WHERE pv.id = comments.version_id AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.project_id = p.id AND c.user_id = auth.uid())))
);
CREATE POLICY "Users can insert comments on accessible versions" ON public.comments FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.project_versions pv JOIN public.projects p ON p.id = pv.project_id WHERE pv.id = comments.version_id AND (p.owner_id = auth.uid() OR EXISTS (SELECT 1 FROM public.collaborators c WHERE c.project_id = p.id AND c.user_id = auth.uid())))
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  reference_id UUID,
  read BOOLEAN NOT NULL DEFAULT false,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('project-zips', 'project-zips', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('audio-previews', 'audio-previews', true);

CREATE POLICY "Auth users can upload project zips" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-zips');
CREATE POLICY "Auth users can download project zips" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-zips');
CREATE POLICY "Auth users can upload audio previews" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audio-previews');
CREATE POLICY "Anyone can view audio previews" ON storage.objects FOR SELECT USING (bucket_id = 'audio-previews');
