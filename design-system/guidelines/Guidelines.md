# ILKA UI migration guidelines

## Sources of truth

- Visual token IDs and values: `design-system/tokens/design-tokens.with-ids.json`.
- Visual component IDs: `design-system/components/component-catalog.with-ids.json`.
- Domain data: generated from JSON Schema and Engine catalogs.
- Business permissions and transitions: Engine projections only.

## Runtime rules

1. Every migrated component uses its stable `data-ui-id`.
2. CSS and TypeScript token outputs are generated and never edited manually.
3. UI does not calculate rotation, Definition of Done, vote outcome, permissions, XP or ratings.
4. `Calendar Day` and `Product Stage` remain separate.
5. Product Captain never receives Captain or vessel-safety authority.
6. Sync states are shown with text and icon, not colour alone.
7. Fonts must remain usable offline; use the system font stack until bundled fonts are approved.
8. Figma Make fixtures and simulation controls stay outside production navigation.
