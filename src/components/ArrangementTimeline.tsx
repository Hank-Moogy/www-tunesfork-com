import { useMemo } from "react";
import { Music, Piano, Undo2, Layers } from "lucide-react";
import type { Track } from "@/lib/als-parser";
import { ABLETON_COLORS } from "@/lib/als-parser";

interface ArrangementTimelineProps {
  tracks: Track[];
}

const TRACK_HEIGHT = 28;
const LABEL_WIDTH = 160;
const BEAT_PX = 2; // pixels per beat
const MIN_WIDTH = 600;

const typeIcons: Record<Track["type"], typeof Music> = {
  audio: Music,
  midi: Piano,
  return: Undo2,
  group: Layers,
};

const typeColors: Record<Track["type"], string> = {
  audio: "text-blue-400",
  midi: "text-green-400",
  return: "text-orange-400",
  group: "text-purple-400",
};

export default function ArrangementTimeline({ tracks }: ArrangementTimelineProps) {
  const { maxBeat, beatMarkers } = useMemo(() => {
    let max = 0;
    for (const t of tracks) {
      for (const c of t.clips) {
        if (c.end > max) max = c.end;
      }
    }
    // Round up to next bar (4 beats)
    max = Math.ceil(max / 4) * 4;
    if (max === 0) max = 16;

    // Generate bar markers
    const markers: number[] = [];
    const step = max > 512 ? 32 : max > 128 ? 16 : max > 64 ? 8 : 4;
    for (let b = 0; b <= max; b += step) {
      markers.push(b);
    }
    return { maxBeat: max, beatMarkers: markers };
  }, [tracks]);

  const timelineWidth = Math.max(MIN_WIDTH, maxBeat * BEAT_PX);

  if (tracks.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-secondary/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">No track data available for this version.</p>
      </div>
    );
  }

  return (
    <div className="bg-secondary/20 overflow-hidden">
      <div className="flex">
        {/* Track labels */}
        <div className="shrink-0 border-r border-border" style={{ width: LABEL_WIDTH }}>
          {/* Header spacer */}
          <div className="h-6 border-b border-border bg-secondary/50 px-2 flex items-center">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Tracks ({tracks.length})
            </span>
          </div>
          {tracks.map((track, i) => {
            const Icon = typeIcons[track.type];
            return (
              <div
                key={i}
                className="flex items-center gap-1.5 px-2 border-b border-border/50 hover:bg-secondary/50 transition-colors"
                style={{ height: TRACK_HEIGHT }}
              >
                <Icon className={`h-3 w-3 shrink-0 ${typeColors[track.type]}`} />
                <span className="text-[11px] text-foreground truncate font-mono">
                  {track.name}
                </span>
              </div>
            );
          })}
        </div>

        {/* Timeline area */}
        <div className="flex-1 overflow-x-auto">
          <div style={{ width: timelineWidth, minWidth: "100%" }}>
            {/* Beat markers */}
            <div className="relative h-6 border-b border-border bg-secondary/50">
              {beatMarkers.map((beat) => (
                <div
                  key={beat}
                  className="absolute top-0 h-full flex items-center"
                  style={{ left: `${(beat / maxBeat) * 100}%` }}
                >
                  <span className="text-[9px] font-mono text-muted-foreground pl-1">
                    {Math.floor(beat / 4) + 1}
                  </span>
                  <div className="absolute top-0 left-0 w-px h-full bg-border/50" />
                </div>
              ))}
            </div>

            {/* Track rows with clips */}
            {tracks.map((track, i) => {
              const trackColor =
                track.color >= 0 && track.color < ABLETON_COLORS.length
                  ? ABLETON_COLORS[track.color]
                  : ABLETON_COLORS[0];
              return (
                <div
                  key={i}
                  className="relative border-b border-border/50"
                  style={{ height: TRACK_HEIGHT }}
                >
                  {/* Grid lines */}
                  {beatMarkers.map((beat) => (
                    <div
                      key={beat}
                      className="absolute top-0 w-px h-full bg-border/20"
                      style={{ left: `${(beat / maxBeat) * 100}%` }}
                    />
                  ))}
                  {/* Clips */}
                  {track.clips.map((clip, j) => {
                    const left = (clip.start / maxBeat) * 100;
                    const width = ((clip.end - clip.start) / maxBeat) * 100;
                    return (
                      <div
                        key={j}
                        className="absolute top-1 rounded-sm overflow-hidden"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          height: TRACK_HEIGHT - 8,
                          backgroundColor: trackColor,
                          opacity: 0.8,
                          minWidth: 2,
                        }}
                        title={clip.name || track.name}
                      >
                        {width > 3 && (
                          <span className="text-[8px] text-black/70 font-medium px-1 truncate block leading-tight" style={{ lineHeight: `${TRACK_HEIGHT - 8}px` }}>
                            {clip.name || track.name}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
