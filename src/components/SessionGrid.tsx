import { useMemo } from "react";
import { Music, Piano, Undo2, Layers } from "lucide-react";
import type { Track } from "@/lib/als-parser";
import { ABLETON_COLORS } from "@/lib/als-parser";

interface SessionGridProps {
  tracks: Track[];
}

const TRACK_WIDTH = 144;
const SCENE_LABEL_WIDTH = 92;

const typeIcons: Record<Track["type"], typeof Music> = {
  audio: Music,
  midi: Piano,
  return: Undo2,
  group: Layers,
};

export default function SessionGrid({ tracks }: SessionGridProps) {
  const sessionTracks = useMemo(
    () => tracks.filter((track) => track.type !== "return" && track.type !== "group"),
    [tracks],
  );
  const scenes = useMemo(() => {
    const byIndex = new Map<number, string>();
    for (const track of sessionTracks) {
      for (const clip of track.sessionClips ?? []) {
        if (!byIndex.has(clip.sceneIndex)) {
          byIndex.set(clip.sceneIndex, clip.sceneName || `Scene ${clip.sceneIndex + 1}`);
        }
      }
    }
    const maxScene = Math.max(-1, ...byIndex.keys());
    return Array.from({ length: maxScene + 1 }, (_, index) => ({
      index,
      name: byIndex.get(index) || `Scene ${index + 1}`,
    }));
  }, [sessionTracks]);

  if (scenes.length === 0) {
    return (
      <div className="px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          This save has no Session View clips, or it was uploaded before Session metadata was supported.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-auto bg-secondary/20">
      <div
        className="grid min-w-max"
        style={{
          gridTemplateColumns: `${SCENE_LABEL_WIDTH}px repeat(${sessionTracks.length}, ${TRACK_WIDTH}px)`,
        }}
      >
        <div className="sticky left-0 top-0 z-30 border-b border-r border-border bg-secondary px-2 py-2 text-[9px] font-mono uppercase tracking-wider text-muted-foreground">
          Scenes
        </div>
        {sessionTracks.map((track, trackIndex) => {
          const Icon = typeIcons[track.type];
          return (
            <div
              key={`${track.name}-${trackIndex}`}
              className="sticky top-0 z-20 flex items-center gap-1.5 border-b border-r border-border bg-secondary px-2 py-2"
              title={track.name}
            >
              <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate text-[10px] font-mono text-foreground/85">{track.name}</span>
            </div>
          );
        })}

        {scenes.map((scene) => (
          <div key={scene.index} className="contents">
            <div
              className="sticky left-0 z-10 flex min-h-12 items-center border-b border-r border-border/60 bg-card px-2 text-[9px] font-mono text-muted-foreground"
              title={scene.name}
            >
              <span className="truncate">{scene.name}</span>
            </div>
            {sessionTracks.map((track, trackIndex) => {
              const clip = track.sessionClips?.find((candidate) => candidate.sceneIndex === scene.index);
              const colorIndex = clip?.color ?? track.color;
              const color = ABLETON_COLORS[colorIndex] ?? ABLETON_COLORS[0];
              return (
                <div
                  key={`${scene.index}-${trackIndex}`}
                  className="min-h-12 border-b border-r border-border/50 p-1"
                >
                  {clip && (
                    <div
                      className="flex h-10 flex-col justify-center overflow-hidden rounded px-2 text-black/75"
                      style={{ backgroundColor: color, opacity: 0.86 }}
                      title={`${clip.name || track.name}${clip.length ? ` · ${clip.length} beats` : ""}`}
                    >
                      <span className="truncate text-[9px] font-semibold">{clip.name || track.name}</span>
                      {clip.length > 0 && (
                        <span className="text-[8px] opacity-65">{clip.length} beats</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
