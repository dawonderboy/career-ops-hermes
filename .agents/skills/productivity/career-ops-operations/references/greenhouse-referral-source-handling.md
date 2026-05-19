# Greenhouse referral-source handling

Use this when a Greenhouse form asks `How did you hear about this job?` and Robin is applying through a real human referral.

## Patterns

1. If the dropdown includes `Employee Referral`, prefer that.
2. If the form only offers `Other`, select `Other` and specify:
   - `Referred by {Name}, {Title} at {Company}`
3. If there is a separate free-text field for referral detail, include the referrer name/title there and keep the dropdown answer concise.

## Accuracy rule

Do not imply a formal internal referral unless the employee explicitly agreed to submit one.

For friend-of-friend situations, keep the wording factual:
- `{Friend} shared {Employee}'s contact information`
- `{Employee} is a {Title} at {Company}`
- Robin is reaching out directly and sending resume materials

## Tracker note rule

If the referral context materially changes how the form should be answered, note it briefly in tracker notes so future apply/edit sessions stay consistent.

## Live-form extraction reminder

Greenhouse may keep the JD visible after clicking `Apply` while the form exists in the DOM. If the accessibility snapshot still looks like the posting page, inspect the DOM directly with `browser_console` and enumerate `input`, `textarea`, `select`, and `button` elements to capture the real application fields.

## Session example

CZI Senior IT Support Specialist (May 2026):
- Referral source: Michael Choi, Senior IT/AV Engineer at Chan Zuckerberg Initiative
- Contact path: Kevin Zheng shared Michael Choi's email and suggested sending resume materials
- Best form answer: `Employee Referral` if available; otherwise `Other` + `Referred by Michael Choi, Senior IT/AV Engineer at CZI`
- Do not overstate as a formal internal submission unless Michael explicitly confirms he is referring Robin inside Greenhouse.
