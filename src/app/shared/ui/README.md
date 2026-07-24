# shared/ui

Reusable presentational components (see handoff §8 and the wireframes' component kit):

- `activity-card` — poster, title, year, service badges, quick action
- `swipe-card` — pointer-event drag with rotate/translate; buttons as fallback
- `service-badge-row` — my services highlighted, others dimmed
- `vibe-chip` — selectable pill, multi-select up to 3
- `score-ring` — SVG arc, coral→gold gradient, "% FIT"
- `avatar-stack` — overlapping initials with overflow count
- `join-code-display` — big code + copyable link

Built as needed from milestone 3 onward. Respect `prefers-reduced-motion` in
swipe/confetti animations.
