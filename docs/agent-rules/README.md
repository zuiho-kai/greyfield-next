# Agent Rule Index

This directory holds detailed agent rules. `AGENTS.md` stays compact and links here instead of carrying every workflow detail.

## Files

- `worktree-pr.md`: multi-agent coordination, git worktrees, branches, pull requests, and cleanup.
- `code-check-owners.md`: code check levels, module owner review, project owner review, and reviewer-lens audits.
- `debugging-knowledge.md`: bug locating discipline, common Greyfield traps, and knowledge-base maintenance.
- `framework-practices.md`: useful practices absorbed from `growth-vibe-framework`, `claude-workflow-starter`, `everything-claude-code`, `BMAD-METHOD`, and `SuperClaude`, including the product-language-first planning rule.

## Rule Placement

- Put always-on rules in `AGENTS.md`.
- Put detailed workflows in this directory.
- Put product truths in `docs/desktop-pet-product-commonsense.md` or `docs/product-shape.md`.
- Put real misses and regression lessons in `docs/qa-retro.md` or `docs/failure-retro.md`.
- Create `docs/runbooks/error-books/*` only when repeated failures no longer fit existing retros.
