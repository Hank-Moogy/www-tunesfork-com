# Tunesfork Future Product Roadmap

This document captures promising product directions that are intentionally **not part of the current implementation plan**. It exists so future agents and contributors can distinguish validated product opportunities from active scope.

## Realtime collaborative tracks inside Ableton

**Status:** Future opportunity / technical spike recommended  
**Product thesis:** **Realtime collaborative tracks inside Ableton, backed by Tunesfork version control.**

### Why this is interesting

Tunesfork already sits naturally between Ableton projects, local desktop sync, cloud assets, collaborators, and version history. A future collaboration layer could make selected Ableton edits propagate between collaborators in near real time while Tunesfork remains the durable source of truth for versions and unsupported state.

The target should **not** initially be unrestricted "Google Docs for Ableton." A constrained track-level collaboration model is substantially more realistic and can still feel live and multiplayer.

### Proposed product model

- Each collaborator runs their own local Ableton Live instance.
- A thin Ableton adapter observes supported Live state and sends structured operations to the Tunesfork desktop app.
- Tunesfork relays those operations through a collaboration service to the other participant(s).
- Remote clients reproduce supported changes in their own Ableton instance.
- Audio/sample assets continue to sync through Tunesfork storage rather than through the realtime operation channel.
- Track-level ownership/leases prevent two people from destructively editing the same track at once.
- Unsupported or lossy Ableton state falls back to normal Tunesfork version/checkpoint sync instead of pretending to be realtime.

Conceptual architecture:

```text
Ableton A
   ↕
Ableton adapter (prefer Python MIDI Remote Script)
   ↕ localhost
Tunesfork Desktop A
   ↕ WebSocket
Tunesfork collaboration service
   ↕ WebSocket
Tunesfork Desktop B
   ↕ localhost
Ableton adapter
   ↕
Ableton B

Durable state + assets + recovery → Tunesfork version history
```

### Likely realtime-capable surface

High-confidence candidates for an initial implementation:

- track creation/deletion and basic metadata
- mixer state such as volume, pan, mute and solo
- MIDI clips and MIDI note edits
- scenes / Session View state where exposed reliably
- device parameters
- tempo and other observable song-level properties
- native Ableton devices where programmatic insertion is supported
- audio clip creation when the corresponding asset is available locally

### Known hard areas

Do not assume full Ableton fidelity. Important risks identified during feasibility research:

- Some Arrangement properties are observable but not directly settable, so actions such as moving clips may require reconstruction/workarounds.
- Third-party plugin parameters can often be exposed, but complete plugin-internal state is not guaranteed to be available through Live's public object model.
- Programmatic loading of third-party plugins may require less-stable Remote Script/browser APIs and needs compatibility testing across Live versions.
- Automation authoring, comping, deeply nested device/rack operations, track/device reordering, undo/redo semantics, freeze/bounce workflows, and other advanced state may have API gaps.
- Plugin/version/platform mismatches need a collaboration-readiness check before a session.
- Arbitrary simultaneous editing introduces conflict-resolution complexity. Prefer track ownership before considering CRDT/OT-style collaboration.

### Recommended synchronization classes

1. **Realtime**: small structured operations such as MIDI edits, mixer state, device parameters and track metadata.
2. **Fast/asynchronous**: audio assets, new plugins/devices, larger clip creation and other operations that require asset transfer or slower reconstruction.
3. **Checkpointed**: unsupported or potentially lossy state, captured through normal Tunesfork versions.

This hybrid model is core to the concept: **realtime when reliable, version control when necessary.**

### Technical dependency / strategic fit

This direction becomes much more attractive after the content-addressed incremental sync architecture in `docs/INCREMENTAL_SYNC_SPEC.md` is stable. That architecture provides reusable asset blobs, manifests, selective transfer and reconstructable versions, all of which reduce the cost and complexity of multiplayer asset synchronization.

The Ableton state adapter could also become shared infrastructure for future AI/agent control and an Ableton extension-building platform, so the technical spike has value even if full multiplayer is never shipped.

### Go / no-go technical spike

Before committing roadmap capacity, test two Ableton instances and build a capability matrix for normal producer actions.

Minimum proof of concept:

1. Create a MIDI track on A and reproduce it on B.
2. Create/edit a MIDI clip and mirror note changes smoothly.
3. Change mixer/device parameters and mirror them with low perceived latency.
4. Drop a WAV into Arrangement, transfer the asset through Tunesfork and recreate the clip on B.
5. Load the same third-party plugin on both machines and mirror exposed parameters.
6. Test disconnect/reconnect and confirm state can reconcile from a Tunesfork checkpoint.
7. Exercise common actions: duplicate, move, crop, delete, undo/redo, automation, racks, grouping, warp, freeze and recording. Record each as Detectable / Reproducible / Lossless / Smooth.

**Go condition:** the supported subset feels seamless enough that users can collaborate naturally without constantly noticing the boundary between realtime state and checkpointed state.

### Product positioning if validated

Do not promise "every Ableton action is multiplayer." Position the first version around collaborative ownership of tracks:

> Work on different tracks together in Ableton, see supported edits appear live, and rely on Tunesfork version history for everything else.

Long-term shorthand: **Figma-like collaboration for music production, constrained by Ableton's integration surface and made safe by Tunesfork version control.**
