

## Plan: Pricing Page + Memory Fix

### Memory correction
Update `mem://index.md` and `mem://design/tokens` to remove all "dark theme" references. The app uses a light theme.

### What we're building
A `/pricing` page showing 4 plan tiers with "Coming Soon" buttons (no payment CTAs). The pricing section will be accessible from both the landing page and the authenticated app.

### Implementation

1. **Create `src/pages/PricingPage.tsx`**
   - 4-card responsive grid (1 col mobile, 2 col tablet, 4 col desktop)
   - Plans: Free (EUR 0), Basic (EUR 7.99/mo), Studio (EUR 29/mo), Launch Offer (EUR 15 one-time)
   - Launch Offer highlighted with green border, "Best Offer" badge, "Only 50 spots!" urgency text
   - All CTA buttons say **"Coming Soon"** and are disabled
   - Uses existing Card, Button, Badge components and pastel color tokens

2. **Add `/pricing` route in `src/App.tsx`**
   - Public route, no ProtectedRoute wrapper

3. **Add "Pricing" link to LandingPage nav** (`src/pages/LandingPage.tsx`)
   - Add link between existing nav items

4. **Add "Pricing" link to authenticated Navbar** (`src/components/Navbar.tsx`)
   - Add link visible to logged-in users

5. **Fix project memory**
   - Remove all "dark theme" references from `mem://index.md` and `mem://design/tokens`
   - Update to reflect light theme with current color tokens

### Technical notes
- No database changes needed
- No payment processing — display only
- All prices in EUR

