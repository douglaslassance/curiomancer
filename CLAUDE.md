# Curiomancer

A web service for taste-based place recommendations (shops, bars, restaurants).

## Value proposition

Cross-reference taste to deliver:

- Good matches for places you may not know.
- Matches with people like you, wherever you are.

The core idea: if you like certain places in LA and travel to Tokyo, people who share your taste across both cities are likely to give you the best recommendations.

## Tech stack

- SvelteKit
- Tailwind
- Shadcn
- Lucide icons

## Conventions

- Commit messages: sentence-cased one-liner, 72 characters max. Do not include co-authoring trailers.
- Work directly on `main`: commit and push there. Do not create branches or open pull requests unless explicitly asked. If a squash is wanted, do a local `git merge --squash` then commit and push, not a GitHub PR.
- No em dashes, en dashes, or any other non-hyphen dash character (minus signs, box-drawing lines, horizontal bars, figure dashes) anywhere (code, comments, or copy). Use a plain hyphen, commas, or restructure the sentence.
- Preserving user ratings (`place_relation` rows) is an important step in any schema migration or data cleanup. `place_relation.userId` and `.placeId` both `ON DELETE CASCADE`, so deleting a `user` or `place` row silently wipes their ratings, and there is no soft-delete, history, or rollback tooling in place. Before any migration or script that touches `user`, `place`, or `place_relation`, take a backup and verify existing ratings survive.
