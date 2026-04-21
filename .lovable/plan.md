
## Restore Project Card Size and Increase Title Font

### Objective
Revert the project cards from square back to their previous rectangular aspect ratio, while keeping only the larger title font size.

### Changes Required

**File: `src/components/ProjectCard.tsx`**

1. **Line 59**: Remove `aspect-square` class to restore the previous rectangular card shape  
   - Replace: `"group glass-card overflow-hidden flex flex-col aspect-square transition-all duration-200"`  
   - With: `"group glass-card overflow-hidden flex flex-col rounded-xl transition-all duration-200"`

2. **Line 85**: Title font size is already `text-lg`, which will remain

**File: `src/components/NewProjectCard.tsx`**

1. Remove `aspect-square` to revert the "New Project" tile to match the project cards' previous shape

### Technical Details
- Cards were originally rectangular with `min-h-[260px]` on the New Project card
- The square constraint was added via `aspect-square` in the last change
- Removing this restores the natural flow-based height that was there before
- Title font remains `text-lg` as requested
