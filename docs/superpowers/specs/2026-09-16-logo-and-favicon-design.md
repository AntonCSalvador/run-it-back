# Logo and favicon design

Date: 2026-09-16
Status: Approved

## Goal

Integrate the supplied Run It Back identity into the existing Broadcast Tactical shell without weakening header contrast or changing game behavior.

## Assets

- Use `5dea005b-d133-4015-817c-8e10919aad66.png`, the horizontal Run It Back wordmark, in the app header.
- Use `39d05a2e-de52-443b-96a6-eb75e5264f96.png`, the crisp gold/red square mark, as the favicon.
- Do not ship the two unused icon variants. They add no required state or responsive treatment.
- Copy selected assets into stable, descriptive paths under `public/assets/brand/`.

## Header treatment

Replace the live-text header wordmark with the horizontal image inside the existing Home button. Place it on a compact warm off-white broadcast plate so the artwork's near-black shapes remain legible against the charcoal header. Preserve the existing accessible button name, heading semantics, click behavior, focus treatment, and minimum target size.

The image uses `object-fit: contain` and preserves its aspect ratio. Desktop shows the full compact wordmark. Mobile reduces its width without cropping and leaves room for run status and Exit run controls.

## Favicon

Expose the square gold/red mark through Next.js metadata using a repository-local PNG. Preserve static export and configured base-path behavior. The favicon is decorative browser chrome and does not alter page accessibility semantics.

## Validation

- Component coverage continues to find a level-one `Run It Back` heading and Home button by accessible name.
- Layout metadata tests verify the favicon declaration.
- CSS tests verify the header plate and responsive image sizing where useful.
- Run focused unit tests, lint, type checking, and a production build.
- Inspect desktop and mobile header captures once, then make at most one correction pass.
