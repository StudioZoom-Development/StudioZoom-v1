## Conventions for building with this design system

This library bundles **7 independent component libraries** (shadcn/ui, HeroUI,
Aceternity UI, Skiper UI, Framer Motion wrappers, 21st.dev, Pines UI) behind
one flat namespace. It intentionally has no single wrapping provider — every
component works standalone.

### Naming: every component is prefixed by its source library

Because these libraries independently ship components with the same name
(`Button`, `Card`, `Badge`, `Modal`...), every export is prefixed to stay
unique:

| Prefix | Library | Example |
|---|---|---|
| `Shadcn` | shadcn/ui | `ShadcnButton`, `ShadcnCard`, `ShadcnDialog` |
| `Hero` | HeroUI 3.x | `HeroButton`, `HeroCard`, `HeroInput` |
| `Aceternity` | Aceternity UI | `AceternitySpotlight`, `AceternityBentoGrid` |
| `Skiper` | Skiper UI | `Skiper3`, `SkiperAnimatedCard` (already self-prefixed in source, never doubled) |
| `TwentyFirst` | 21st.dev | `TwentyFirstGradientText`, `TwentyFirstShimmerCard` |
| `Motion` | Framer Motion wrappers | `MotionFadeIn`, `MotionHoverCard` |
| `Pines` | Pines UI | `PinesAccordion`, `PinesRating` (already self-prefixed in source) |

Always use the full prefixed name — there is no unprefixed `Button` export.
When composing a UI, prefer staying within ONE library's components for a
given region (e.g. build a whole form out of `Shadcn*` pieces) rather than
mixing prefixes for the same role, unless deliberately combining libraries.

### Styling: Tailwind v4 utility classes, real design tokens

This is a Tailwind v4 design system (shadcn's "base-nova" style) with CSS
custom properties as the token layer — `bg-card`, `text-muted-foreground`,
`border-border`, `bg-primary text-primary-foreground`, `rounded-lg`, etc. are
real, already-themed utility classes, not raw colors. Compose new layout/glue
code the same way: plain Tailwind utility classes, referencing these
semantic token classes (`bg-background`, `text-foreground`, `bg-muted`,
`bg-destructive/10 text-destructive`) rather than literal color values, so
generated UI stays on-theme in both light and dark contexts.

Aceternity/Skiper/21st.dev pieces are visual/motion components (spotlights,
gradients, bento grids, cards with hover effects) — they carry their own
internal styling and typically just need a sized container (explicit
width/height) around them; several are designed for dark sections and read
best on a `bg-black`/dark-toned host.

### Where the real styles and tokens live

Read `styles.css` (the design's root stylesheet) and its `@import` chain —
it pulls in the compiled component CSS (`_ds_bundle.css`) and the bundled
fonts. Per-component `.prompt.md` files in each `components/<library>/<Name>/`
folder are the best usage reference — many are authored with realistic,
graded example compositions (variant sweeps, real content) worth imitating
directly.

### One idiomatic build snippet

```jsx
import { ShadcnCard, ShadcnCardHeader, ShadcnCardTitle, ShadcnCardDescription, ShadcnCardContent, ShadcnCardFooter, ShadcnButton } from "my-design-system";

function TeamCard() {
  return (
    <ShadcnCard className="max-w-sm">
      <ShadcnCardHeader>
        <ShadcnCardTitle>Team members</ShadcnCardTitle>
        <ShadcnCardDescription>Invite people to collaborate on this project.</ShadcnCardDescription>
      </ShadcnCardHeader>
      <ShadcnCardContent>
        <p className="text-sm text-muted-foreground">3 members currently have access to this workspace.</p>
      </ShadcnCardContent>
      <ShadcnCardFooter>
        <ShadcnButton size="sm">Invite member</ShadcnButton>
      </ShadcnCardFooter>
    </ShadcnCard>
  );
}
```

# MyDesignSystem (my-design-system@0.0.0)

This design system is the published my-design-system React library, bundled as a single
browser global. All 222 components are the real upstream code.

## Where things are

- `_ds_bundle.js` — the whole-DS bundle at the project root; loads every component to `window.MyDesignSystem`. First line is a `/* @ds-bundle: … */` metadata header.
- `styles.css` — the single stylesheet entry: it `@import`s the tokens, fonts, and component styles (`_ds_bundle.css`). Link this one file.
- `components/<group>/<Name>/<Name>.prompt.md` (example JSX + variants), `<Name>.d.ts` (types), `<Name>.html` (variant grid).
- `tokens/*.css` — CSS custom properties, names verbatim from upstream.
- `fonts/` — `@font-face` files + `fonts.css` (when the package ships fonts).

For a specific component, `read_file("components/<group>/<Name>/<Name>.prompt.md")`.

## Loading

Add these two lines to your page once (React must be on the page first):

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

Components are then available at `window.MyDesignSystem.*`. Mount into a dedicated child node (e.g. `<div id="ds-root">`), not the host page's own React root, so the two trees don't collide:

```jsx
const { AceternityAnimatedTestimonials } = window.MyDesignSystem;
ReactDOM.createRoot(document.getElementById('ds-root')).render(<AceternityAnimatedTestimonials />);
```

## Tokens

539 CSS custom properties from my-design-system. Names are
preserved verbatim from upstream. They are declared inside `_ds_bundle.css` (this DS ships one compiled stylesheet rather than separate token files).

- **color** (206): `--swiper-theme-color`, `--swiper-preloader-color`, `--tw-border-style`, …
- **spacing** (6): `--tw-space-y-reverse`, `--tw-space-x-reverse`, `--tw-inset-shadow`, …
- **typography** (16): `--tw-font-weight`, `--tw-tracking`, `--font-sans`, …
- **radius** (9): `--radius-md`, `--radius-xl`, `--radius-2xl`, …
- **shadow** (13): `--tw-shadow`, `--tw-shadow-alpha`, `--tw-ring-shadow`, …
- **other** (289): `--swiper-navigation-size`, `--shimmer-angle`, `--tw-translate-x`, …

## Components

### aceternity
- `AceternityAnimatedTestimonials`
- `AceternityAnimatedTooltip`
- `AceternityAsciiArt`
- `AceternityAuroraBackground`
- `AceternityBackgroundBeams`
- `AceternityBackgroundBeamsWithCollision`
- `AceternityBackgroundGradient`
- `AceternityBackgroundGradientAnimation`
- `AceternityBackgroundLines`
- `AceternityBackgroundRippleEffect`
- `AceternityBentoGrid`
- `AceternityBoxesCore`
- `AceternityCardContainer`
- `AceternityCardStack`
- `AceternityCarousel`
- `AceternityCodeBlock`
- `AceternityColourfulText`
- `AceternityCometCard`
- `AceternityCompare`
- `AceternityContainerScroll`
- `AceternityDirectionAwareHover`
- `AceternityDottedGlowBackground`
- `AceternityDraggableCardBody`
- `AceternityEncryptedText`
- `AceternityEvervaultCard`
- `AceternityFileUpload`
- `AceternityFlipWords`
- `AceternityFloatingDock`
- `AceternityFloatingNav`
- `AceternityFocusCards`
- `AceternityFollowerPointerCard`
- `AceternityGlareCard`
- `AceternityGlowingEffect`
- `AceternityGooeyInput`
- `AceternityGoogleGeminiEffect`
- `AceternityHeroHighlight`
- `AceternityHeroParallax`
- `AceternityHoverBorderGradient`
- `AceternityHoverEffect`
- `AceternityImagesBadge`
- `AceternityImagesSlider`
- `AceternityInfiniteMovingCards`
- `AceternityLayoutGrid`
- `AceternityLens`
- `AceternityLinkPreview`
- `AceternityMacbookScroll`
- `AceternityMagneticButton`
- `AceternityMaskContainer`
- `AceternityMeteors`
- `AceternityModal`
- `AceternityMovingBorder`
- `AceternityMultiStepLoader`
- `AceternityParallaxScroll`
- `AceternityPinContainer`
- `AceternityPixelatedCanvas`
- `AceternityPlaceholdersAndVanishInput`
- `AceternityPointerHighlight`
- `AceternitySidebar`
- `AceternitySparklesCore`
- `AceternitySpotlight`
- `AceternitySpotlightNew`
- `AceternityStickyBanner`
- `AceternityStickyScroll`
- `AceternityTabs`
- `AceternityTerminal`
- `AceternityTextGenerateEffect`
- `AceternityTextHoverEffect`
- `AceternityTextRevealCard`
- `AceternityTimeline`
- `AceternityTracingBeam`
- `AceternityTypewriterEffect`
- `AceternityVortex`
- `AceternityWavyBackground`
- `AceternityWobbleCard`
- `AceternityWorldMap`

### heroui
- `HeroAccordion`
- `HeroAlert`
- `HeroAutocomplete`
- `HeroAvatar`
- `HeroBadge`
- `HeroBreadcrumbs`
- `HeroButton`
- `HeroButtonGroup`
- `HeroCalendar`
- `HeroCard`
- `HeroCheckbox`
- `HeroCheckboxGroup`
- `HeroChip`
- `HeroDatePicker`
- `HeroDateRangePicker`
- `HeroDrawer`
- `HeroDropdown`
- `HeroEmptyState`
- `HeroForm`
- `HeroInput`
- `HeroKbd`
- `HeroLink`
- `HeroModal`
- `HeroPagination`
- `HeroPopover`
- `HeroRadio`
- `HeroRadioGroup`
- `HeroRangeCalendar`
- `HeroScrollShadow`
- `HeroSelect`
- `HeroSeparator`
- `HeroSkeleton`
- `HeroSlider`
- `HeroSpinner`
- `HeroSwitch`
- `HeroTable`
- `HeroTabs`
- `HeroTooltip`

### motion
- `MotionFadeIn`
- `MotionHoverCard`
- `MotionScaleIn`
- `MotionSlideIn`
- `MotionStaggerList`

### pines
- `PinesAccordion`
- `PinesModal`
- `PinesRating`
- `PinesSlideover`

### shadcn
- `ShadcnAccordion`
- `ShadcnAlert`
- `ShadcnAlertDialog`
- `ShadcnAspectRatio`
- `ShadcnAttachment`
- `ShadcnAvatar`
- `ShadcnBadge`
- `ShadcnBreadcrumb`
- `ShadcnBubble`
- `ShadcnButton`
- `ShadcnButtonGroup`
- `ShadcnCalendar`
- `ShadcnCard`
- `ShadcnCarousel`
- `ShadcnChartContainer`
- `ShadcnCheckbox`
- `ShadcnCollapsible`
- `ShadcnCombobox`
- `ShadcnCommand`
- `ShadcnContextMenu`
- `ShadcnDialog`
- `ShadcnDirectionProvider`
- `ShadcnDrawer`
- `ShadcnDropdownMenu`
- `ShadcnEmpty`
- `ShadcnField`
- `ShadcnHoverCard`
- `ShadcnInput`
- `ShadcnInputGroup`
- `ShadcnInputOTP`
- `ShadcnItem`
- `ShadcnKbd`
- `ShadcnLabel`
- `ShadcnMarker`
- `ShadcnMenubar`
- `ShadcnMessage`
- `ShadcnMessageScroller`
- `ShadcnNativeSelect`
- `ShadcnNavigationMenu`
- `ShadcnPagination`
- `ShadcnPopover`
- `ShadcnProgress`
- `ShadcnRadioGroup`
- `ShadcnResizablePanelGroup`
- `ShadcnScrollArea`
- `ShadcnSelect`
- `ShadcnSeparator`
- `ShadcnSheet`
- `ShadcnSidebar`
- `ShadcnSkeleton`
- `ShadcnSlider`
- `ShadcnSpinner`
- `ShadcnSwitch`
- `ShadcnTable`
- `ShadcnTabs`
- `ShadcnTextarea`
- `ShadcnToaster`
- `ShadcnToggle`
- `ShadcnToggleGroup`
- `ShadcnTooltip`

### skiper
- `Skiper16`
- `Skiper17`
- `Skiper19`
- `Skiper25`
- `Skiper26`
- `Skiper28`
- `Skiper3`
- `Skiper30`
- `Skiper31`
- `Skiper34`
- `Skiper37`
- `Skiper39`
- `Skiper4`
- `Skiper40`
- `Skiper41`
- `Skiper47`
- `Skiper48`
- `Skiper49`
- `Skiper50`
- `Skiper51`
- `Skiper52`
- `Skiper53`
- `Skiper54`
- `Skiper58`
- `Skiper61`
- `Skiper62`
- `Skiper63`
- `Skiper64`
- `Skiper65`
- `Skiper66`
- `Skiper67`
- `Skiper87`
- `Skiper89`
- `Skiper99`
- `SkiperAnimatedCard`
- `SkiperGlassContainer`

### 21stdev
- `TwentyFirstGlowBorder`
- `TwentyFirstGradientText`
- `TwentyFirstInteractiveDock`
- `TwentyFirstShimmerCard`
