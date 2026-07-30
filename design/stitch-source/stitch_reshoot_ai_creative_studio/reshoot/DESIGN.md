---
name: Reshoot
colors:
  surface: '#faf9f6'
  surface-dim: '#dbdad7'
  surface-bright: '#faf9f6'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f3f1'
  surface-container: '#efeeeb'
  surface-container-high: '#e9e8e5'
  surface-container-highest: '#e3e2e0'
  on-surface: '#1a1c1a'
  on-surface-variant: '#59413c'
  inverse-surface: '#2f312f'
  inverse-on-surface: '#f2f1ee'
  outline: '#8d716b'
  outline-variant: '#e1bfb8'
  surface-tint: '#ae311a'
  primary: '#ae311a'
  on-primary: '#ffffff'
  primary-container: '#ff6b4e'
  on-primary-container: '#680c00'
  inverse-primary: '#ffb4a5'
  secondary: '#575d78'
  on-secondary: '#ffffff'
  secondary-container: '#d8defe'
  on-secondary-container: '#5b617d'
  tertiary: '#5c5d6e'
  on-tertiary: '#ffffff'
  tertiary-container: '#9899ab'
  on-tertiary-container: '#2f3140'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad3'
  primary-fixed-dim: '#ffb4a5'
  on-primary-fixed: '#3e0400'
  on-primary-fixed-variant: '#8c1803'
  secondary-fixed: '#dce1ff'
  secondary-fixed-dim: '#bfc5e4'
  on-secondary-fixed: '#141a32'
  on-secondary-fixed-variant: '#3f465f'
  tertiary-fixed: '#e1e1f5'
  tertiary-fixed-dim: '#c5c5d8'
  on-tertiary-fixed: '#191b29'
  on-tertiary-fixed-variant: '#444655'
  background: '#faf9f6'
  on-background: '#1a1c1a'
  surface-variant: '#e3e2e0'
typography:
  display-lg:
    fontFamily: Bricolage Grotesque
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Bricolage Grotesque
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Bricolage Grotesque
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 8px
  container-max: 1440px
  gutter: 24px
  margin-desktop: 40px
  margin-mobile: 16px
---

## Brand & Style
The design system is built for a premium AI photography studio that bridges the gap between high-end editorial aesthetics and powerful creative utility. The personality is "The Technical Curator"—an interface that feels as much like a physical studio as it does a software tool.

The visual style draws from **Modern Minimalism** with a **Tactile** edge. It rejects the generic vibrancy of typical SaaS in favor of a sophisticated, editorial layout characterized by generous white space, structured thin borders, and a high-contrast palette. The mood is serious, trustworthy, and focused, positioning the AI not as a gimmick, but as a professional-grade instrument for creators who value precision and style.

## Colors
This design system utilizes a specific "Warm Canvas" approach. The primary surface is a warm ivory (#FAF9F6), which provides a more organic, paper-like feel than pure white.

- **Primary (Coral-Orange):** Reserved strictly for high-priority actions and creative catalysts.
- **Secondary (Deep Ink):** Used for navigation sidebars, header backgrounds, and primary text to provide grounding and depth.
- **Tertiary (Lavender):** A soft accent used for secondary UI elements, such as selection states or inactive progress indicators.
- **Success (Muted Sage):** Used for approval states and completed renders, maintaining the low-saturation editorial feel.
- **Borders:** A thin, warm-gray (#D1D1D1) is used to define the grid without creating visual noise.

## Typography
The typography strategy pairings a characterful, slightly quirky grotesque for headings with a high-precision sans-serif for functional UI.

- **Headlines:** Use Bricolage Grotesque. It provides an editorial "wordmark" feel that suggests creativity and modern craftsmanship. Tighten letter-spacing on larger displays.
- **UI & Body:** Use Hanken Grotesk. Its sharp, contemporary metrics ensure high legibility in data-heavy panels and tool settings.
- **Labels:** Small labels use Hanken Grotesk in semi-bold with increased tracking and uppercase casing to mimic technical camera equipment markings.

## Layout & Spacing
The design system employs a **Fixed Grid** philosophy for the main content area to maintain an editorial, magazine-like composition, while functional sidebars (tools/layers) remain pinned to the viewport edges.

- **Grid:** A 12-column grid on desktop with 24px gutters.
- **Rhythm:** All margins and paddings must be multiples of 8px. Use generous internal padding (32px+) for workspace areas to let the product photography "breathe."
- **Side Panels:** Fixed at 320px for the "Studio Toolset," using thin borders instead of shadows to separate from the main canvas.

## Elevation & Depth
This design system avoids the "floating" look of standard SaaS. Instead, it uses **Tonal Layering** and **Editorial Shadows**.

- **Surface Levels:** The Warm Ivory (#FAF9F6) is the base. Secondary panels use Deep Ink (#0A1128) to create a clear "Darkroom" mode for image editing.
- **Shadows:** When elevation is required (e.g., a floating image preview), use a "Long-Tail" shadow: `0px 12px 32px rgba(10, 17, 40, 0.08)`. Shadows should be soft, diffused, and slightly tinted by the Deep Ink color.
- **Borders:** 1px solid lines are the primary method of separation. They should feel like "technical drawings" rather than heavy containers.

## Shapes
The shape language is "Constructed Softness." Most functional UI elements use a subtle 4px (Soft) radius to maintain a professional, architectural feel.

- **Containers:** Standard cards and input fields use a 4px corner.
- **Images:** Photography previews use a larger 12px (rounded-lg) radius to distinguish creative content from the functional interface.
- **Buttons:** Primary action buttons can utilize a "Pill-shape" to draw contrast against the rigid grid of the tools.

## Components
Consistent execution of components is vital to maintaining the premium studio feel.

- **Buttons:** Primary buttons use the Vivid Coral (#FF6B4E) with white text. Secondary buttons use a Deep Ink border and text with no fill.
- **Inputs:** Fields use a 1px border (#D1D1D1) on the Warm Ivory background. Focus states use a subtle Lavender (#E6E6FA) glow rather than a thick ring.
- **Cards (The "Slide"):** Image cards should resemble physical slides or contact sheets, featuring a thin border and the Muted Sage (#8BA888) for the "Approved" checkmark.
- **Chips:** Used for metadata (ISO, Lens, Lighting Style). They are rectangular with 2px corners, using Deep Ink text on a Lavender background.
- **Lists:** Clean, horizontal rules between items. Use Hanken Grotesk for list items with high contrast against the background.