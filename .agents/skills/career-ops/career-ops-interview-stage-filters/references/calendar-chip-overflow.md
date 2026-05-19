# Calendar chip overflow and grid sizing

## Symptom
Long event titles caused calendar chips to stretch beyond their day cells. The UI could appear fixed after a rerender, then "jump back" when the grid remeasured content.

## Root cause
CSS grid items were still allowed to use content-based min sizing.

Common culprits:
- `gridTemplateColumns: repeat(7, 1fr)` instead of `repeat(7, minmax(0, 1fr))`
- day cell containers missing `minWidth: 0`
- chip wrappers missing `overflow: hidden`
- title spans not constrained with `minWidth: 0` in a flex/grid row

## Fix pattern
1. Make the grid columns shrinkable:
   - `repeat(7, minmax(0, 1fr))`
2. Force the day cell to clip:
   - `minWidth: 0`
   - `overflow: hidden`
3. Make the chip itself fill the cell, but not exceed it:
   - `width: 100%`
   - `maxWidth: 100%`
   - `boxSizing: border-box`
   - `overflow: hidden`
4. Put title text in a constrained layout cell:
   - use `display: grid` with `gridTemplateColumns: "auto 1fr"`
   - add `minWidth: 0` to the title span
   - apply `whiteSpace: "nowrap"`, `textOverflow: "ellipsis"`, `overflow: "hidden"`

## Verification
Use browser DOM inspection, not just visual judgment:
- check `getBoundingClientRect()` for the chip and its parent day cell
- verify the chip width stays close to the cell width
- sample the title span to confirm it is clipped rather than expanding the parent

If a fix appears to work and then reverts after interaction, inspect the actual rendered ancestor chain to find the first wrapper that still has `minWidth: auto` or `overflow: visible`.
