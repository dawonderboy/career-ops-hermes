# React dashboard calendar overflow fix

Session note: when the React dashboard calendar renders exact Google Calendar titles, long titles can stretch the chip past the day cell even if the inner text has `text-overflow: ellipsis`.

Working fix:
- Set the event chip container to `width: 100%`, `max-width: 100%`, `min-width: 0`, `box-sizing: border-box`, and `overflow: hidden`.
- Set the event list wrapper to `min-width: 0`, `width: 100%`, `overflow: hidden`.
- Render the title row as a grid (`grid-template-columns: auto 1fr`) or another layout that gives the title a constrained flex/grid track.
- On the title text itself, keep `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`.

Why this matters:
- In flex layouts, a long exact title can refuse to shrink and push the whole chip wider than the cell.
- The problem is usually not the ellipsis rule alone; the parent and intermediate wrappers also need width constraints.

Related user preference:
- Preserve the exact Google Calendar title; do not rewrite it into a company label or filter it down to an inferred interview name unless the user explicitly asks.
