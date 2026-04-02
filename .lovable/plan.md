

# Cloudbleton — Cloud Collaboration for Ableton Live Producers

## Overview
A dark-themed collaboration platform where music producers upload Ableton project folders, share with collaborators, manage versions, and hand off work cleanly.

## Design System
- **Theme**: Dark (#0e0e0e background), electric blue (#3B82F6) accents, electric green (#22C55E) for primary CTAs
- **Typography**: Roboto for body, monospace for version numbers/metadata
- **Style**: Professional music tool aesthetic (Splice/Figma-inspired), subtle gradients, clean cards

## Phase 1: Foundation
- Supabase schema: `projects`, `project_versions`, `collaborators`, `comments`, `notifications` tables with enums and RLS
- Storage buckets for project zips and audio previews
- Auth pages (email/password + Google OAuth) with dark branded UI
- Top nav layout with logo, dashboard link, notifications bell, user avatar dropdown
- Responsive container layout (no sidebar)

## Phase 2: Dashboard & Upload Flow (Core)
- **Dashboard** (`/dashboard`): My Projects / Shared With Me tabs, project cards with BPM, version, collaborators, handoff status badges. Upload Project button. Archive toggle.
- **Upload Modal** (multi-step):
  1. Folder selection via `webkitdirectory` with drag-drop zone. Client-side validation (`.als` detection, samples folder check, size warning). Parse `.als` (gzip XML) to extract name, BPM, plugin list using pako.
  2. Project details form (pre-filled name/BPM, change note)
  3. Optional audio preview attachment (MP3/WAV)
  4. Upload progress — JSZip client-side zipping → Supabase Storage upload with progress bar, confetti on completion

## Phase 3: Project Detail Page
- **Project Detail** (`/project/:id`): Header with inline-editable name, BPM badge, collaborator avatars, handoff status toggle (Ready/In Progress with lock)
- **Version timeline**: Cards with version number, uploader, change note, expandable plugin badges, Wavesurfer.js audio player (green waveform), download button
- **Comments**: Per-version threaded comments with @mention autocomplete, unread indicators

## Phase 4: Sharing, Download & Notifications
- **Share panel**: Email invite with permission dropdown, collaborator list management, shareable link with copy button
- **Download flow**: Handoff conflict warning modal, progress indicator, post-download instruction banner, auto-lock confirmation
- **Notifications**: Bell icon with unread badge, dropdown with notification types, mark-all-read. Email notifications via Resend for key events (new version, @mention, handoff change)

## Phase 5: Polish
- Project cover art (auto-generated gradient thumbnails from project name)
- Dashboard search bar
- Keyboard shortcut (U for upload)
- Error states with retry buttons, graceful .als parsing failures
- Mobile responsiveness for browsing/commenting

