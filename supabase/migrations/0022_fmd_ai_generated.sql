-- Flags an FMD as AI-converted (from the Historical FMD wizard) so the catalog can show an AI icon
-- next to its name — distinct from a manually "Generate FMD"'d Standard/Custom FMD.

alter table fmds add column ai_generated boolean not null default false;
