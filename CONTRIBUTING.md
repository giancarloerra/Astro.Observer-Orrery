# Contributing

Thank you for considering a contribution.

## Licence of contributions

This project is licensed under AGPL-3.0-or-later. By submitting a contribution
(pull request, patch, issue containing code or data) you agree that:

1. Your contribution is licensed under AGPL-3.0-or-later, the same licence as
   the project (inbound equals outbound).
2. You have the right to submit it under that licence.
3. The project's copyright notice, Copyright © 2026 Giancarlo Erra, is
   preserved; you retain copyright in your own contribution.

See [CLA.md](CLA.md) for the exact terms. Sign off each commit
(`git commit -s`) to certify the above, in the spirit of the Developer
Certificate of Origin.

## Rules that are not negotiable

- No invented numbers. Every value in `data/` cites a fetchable source in
  DATA-SOURCES.md. A value you cannot source is null with a note.
- No runtime network requests. Everything ships in the repository.
- No fallback or synthetic data paths. A missing data file is a visible error.
- Approximations are labelled as such in the interface, never silently.

## Practical notes

- Plain ES modules, no build step. Keep it that way.
- Test the Kepler engine against JPL Horizons when touching `js/kepler.js`
  (the method and tolerances are in the README's accuracy section).
- British spelling in prose.
