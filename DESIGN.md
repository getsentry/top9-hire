---
name: Top9 Hire
description: A manila personnel file. Nine games are the résumé; the verdict is a rubber stamp.
colors:
  paper: "#e6d1a0"
  ink: "#1b1710"
  ink-2: "#4b3c1e"
  rule: "#8a7444"
  stamp: "#9e1b25"
  stamp-wash: "rgba(158, 27, 37, 0.12)"
typography:
  display:
    fontFamily: "League Gothic, ui-sans-serif, sans-serif"
    fontSize: "clamp(3.75rem, 12vw, 7rem)"
    fontWeight: 400
    lineHeight: 0.88
    letterSpacing: "0.01em"
  stamp:
    fontFamily: "League Gothic, ui-sans-serif, sans-serif"
    fontSize: "clamp(2.8rem, 9vw, 5.2rem)"
    fontWeight: 400
    lineHeight: 0.88
    letterSpacing: "0.03em"
  roast:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.35rem, 4.2vw, 1.6rem)"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.78rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "0.05em"
rounded:
  none: "0"
spacing:
  xs: "0.45rem"
  sm: "0.9rem"
  md: "1.75rem"
  lg: "2.75rem"
  xl: "3.5rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0.75rem 1.4rem"
  button-primary-hover:
    backgroundColor: "{colors.stamp}"
    textColor: "{colors.paper}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0.9rem"
  input-line:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0.45rem 0"
  stamp:
    backgroundColor: "transparent"
    textColor: "{colors.stamp}"
    typography: "{typography.stamp}"
    padding: "0.1em 0.45em 0.16em"
---

# Design System: Top9 Hire

## Overview

The page is a personnel file. The whole viewport is one sheet of manila stock, drawn by the Paper Shaders `PaperTexture` component (`app/backdrop.tsx`) with light roughness, fibre, one soft fold and a few crumples. Everything on it is either typed on the form or stamped onto it. There are no cards, panels, shadows or rounded corners; hierarchy comes from ink weight, type size and one-pixel rules.

The joke is the thesis: a Top9 of games treated with the seriousness of an HR file. The form on the left is the candidate's document (handle, source, the nine squares). The right side is the office's, where the archetype lands as a red rubber stamp. Below 72rem the office area stacks under the form behind a single rule.

The one authored motion is the stamp. It lands once (scale 1.35 to 1, 420ms, exponential ease-out) and after that changes by morphing its letters with Torph (`TextMorph`, 520ms). The roast morphs the same way. Everything else that changes text (score criteria, the split-vibes note) fades in over 360ms. `prefers-reduced-motion` removes the landing and the fades; Torph disables itself. The paper is static by design.

## Colors

Strategy: restrained. One field (manila), one ink (near-black), one accent (stamp red). Nothing else.

### Primary

- `paper` `#e6d1a0`. The field. Also the CSS fallback behind the shader and the text colour on ink buttons. The shader renders slightly lighter (`#e8d4a5`) with shadow `#8d6f3c`.
- `ink` `#1b1710`. All primary text, rules around the nine squares, the primary button, focus outlines, the filled tick.

### Secondary

- `stamp` `#9e1b25`. The verdict stamp (border and letters, `mix-blend-mode: multiply` so the paper grain shows through the ink), the pending stamp at 32% opacity, error text, the primary button on hover, the caret and text selection.
- `stamp-wash` `rgba(158,27,37,.12)`. Drop-target fill on the nine squares and the quiet button on hover.

### Neutral

- `ink-2` `#4b3c1e`. Labels, legend, lede, placeholders, criteria, status line, disclaimer. Tinted from the paper hue, never grey. 6.4:1 on paper.
- `rule` `#8a7444`. Hairlines between score rows and the fuzzy tick fill.

### Named Rules

- Red is a verdict or a failure, never decoration. It appears on the stamp, on an error, and on hover of the action that produces a stamp.
- Secondary text is brown ink, not grey ink. Grey does not exist on this paper.

## Typography

- **League Gothic** (Google, via `next/font`) for the title and the stamp. Condensed, uppercase, tight leading. It is the rubber-stamp face and nothing else uses it.
- **Public Sans** (Google, via `next/font`) for everything typed: labels, inputs, roast, criteria. Chosen because it is the US government forms face; it is what a form is set in.

### Hierarchy

- Title: display, uppercase, `clamp(3.75rem, 12vw, 7rem)`.
- Stamp: League Gothic uppercase, `clamp(2.8rem, 9vw, 5.2rem)`, always broken after the first word so it reads as a two-line block.
- Roast: Public Sans 500, `clamp(1.35rem, 4.2vw, 1.6rem)`, wrapped by `wrapLines(text, 24)` because Torph sets `white-space: nowrap`.
- Body and inputs: 17px / 1.5. Titles in the squares 0.95rem 500 (0.85rem under 40rem).
- Labels, legend, score poles: 0.78–0.8rem, 600, uppercase, 0.05em tracking, `ink-2`.
- Criteria and disclaimer: 0.82–0.92rem, `ink-2`; fuzzy criteria in italic with the word "(fuzzy)".

### Named Rules

- Uppercase tracking lives only on labels and the stamp. Body copy is never tracked.
- Tabular numerals on the slot numbers and the status count.

## Layout

- Single column, max 46rem, padding `clamp(2rem, 6vw, 4.5rem)` top and 1.25rem sides.
- From 72rem: two columns, `minmax(0, 36rem) minmax(0, 1fr)`, 5rem gutter, max 80rem. The header spans both. Form left, office (stamp, roast, scores) right, aligned to the top of the form.
- Form rows are a 6.5rem label column plus the field, aligned at the baseline rule. Under 40rem the label stacks above the field and the upload button drops under the source field.
- The nine squares are a 3×3 CSS grid with one-pixel ink rules, always 3×3, including phones. Each square holds a two-row textarea that grows with `field-sizing: content`.
- Score rows: `8rem 1fr 8rem` (poles, four ticks centred, poles) with the criterion spanning underneath; hairline above each row and below the last.

## Elevation & Depth

None. The paper is the only surface. Depth comes from the shader's folds and from ink multiplying into the grain. No shadows, no glass, no borders thicker than 1px except the 4px double rule of the stamp.

## Shapes

Square. `border-radius: 0` everywhere, including inputs and buttons. The stamp is a rectangle with a 4px double border rotated −3° (chaos verdicts rotate +2.5°). Ticks are 1.15rem squares.

## Components

### Buttons

- Primary (`Stamp the verdict`): ink fill, paper text, 700 weight, square. Hover turns stamp red. Disabled at 55% with a progress cursor.
- Quiet (`Upload card image`): 1px ink border, transparent, 600 weight, 0.9rem. Hover fills with `stamp-wash` and turns the text red.

### Inputs / Fields

- Line inputs (Candidate, Source): transparent, no border except a 1px ink baseline; the baseline thickens to 2px on focus. Placeholders in `ink-2`.
- Square textareas: transparent, no border, no resize handle, two rows minimum. The focused square tints 6% ink.
- Focus ring for anything else: 2px ink outline with 3px offset.

### Nine squares

`fieldset.nine > legend + div.grid > label.slot × 9`. Each slot shows a small tabular numeral (1–9, reading order matches a Top9 card) and the textarea. Multi-line paste into any square fills forward from that square. Enter moves to the next square; Enter on the ninth submits. The grid is also the image drop target and shows `stamp-wash` with a dashed red outline while a file is over it.

### Stamp

`div.stamp > h2.stamp-text > TextMorph`. Variants by badge kind: `primary` (full ink), `soft` (74% opacity, followed by the split-vibes note), `chaos` (text "Unclassifiable chaos", tilted the other way). The `pending` variant is the same shape at 32% opacity with "No verdict yet", shown only in the two-column layout.

### Score row

Left pole, four ticks with the chosen level filled ink, right pole, criterion underneath. A fuzzy score fills its tick with `rule` instead of ink and sets the criterion in italic.

### Status line

Lives beside the primary button. Idle it counts (`4 of 9`, `Nine of nine. Ready.`); busy it says what is being read; failed it turns red and carries `role="alert"`.

## Do's and Don'ts

### Do:

- Add new form facts as new rows in the same label-plus-baseline grammar. The planned job posting URL is a `Position` row directly under `Candidate`.
- Add new verdicts as new stamps. A job match lands as a second stamp under the archetype, same face, same double rule, its own tilt.
- Keep every string that changes on a verdict either morphing (short, one or two lines) or fading (anything that wraps).
- Keep text on the paper at 4.5:1 or better; check new tints against `#e6d1a0`.

### Don't:

- Add cards, panels, shadows, radii or a second accent colour.
- Use red for anything that is not a verdict, an error or the hover of the stamping action.
- Put Torph on text that must wrap; it sets `nowrap` and will overflow on phones.
- Animate the paper. The shader is static so the sheet reads as an object, and so reduced-motion users get the same page.
- Break the 3×3. The nine squares are the artifact people recognise from their own Top9 card.
