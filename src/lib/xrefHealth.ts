import type { GoldenFmdStructure, XrefVersion } from '../types/entities';

/* What a Golden XREF template looks like as a whole, and what changed between two of its versions.
 *
 * The FMD's equivalent (`fmdHealth.ts`) grades a mapping DOCUMENT — rows, rules, effort, review
 * findings. A Golden XREF has none of that: it is the template itself, sections and fields and
 * nothing filled in. So the checks here are about whether the template can do its job, not about
 * how much of it is done.
 *
 * Every number is counted, never inferred. A health report nobody can reproduce by counting is one
 * nobody can act on — and unlike the FMD there is no AI opinion here to fall back on. */

export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheck {
  key: string;
  label: string;
  detail: string;
  status: CheckStatus;
}

export interface XrefHealth {
  sections: number;
  fields: number;
  /** Fields carrying a description. The rest are a column header with no stated meaning. */
  described: number;
  /** Sections with no fields in them. */
  emptySections: string[];
  /** Field names appearing more than once, compared case-insensitively. */
  duplicates: string[];
  versions: number;
  published: number;
  checks: HealthCheck[];
}

/** Every field in the template, flattened out of its sections, in template order. */
export const flattenXref = (structure?: GoldenFmdStructure) =>
  (structure?.sections ?? []).flatMap((s) => s.fields.map((f) => ({
    field: f.field, sectionName: s.name, color: s.color, description: f.description,
  })));

const norm = (s: string) => s.trim().toUpperCase();

/** Grades the template, and counts what it is made of.
 *
 * `versions` is the whole history, not just the one on screen: "has this template ever been
 * released" is a health question, and it can only be answered from the history. */
export function analyseXrefStructure(
  structure: XrefStructureInput,
  versions: Pick<XrefVersion, 'version' | 'publishedAt'>[] = [],
): XrefHealth {
  const sections = structure?.sections ?? [];
  const fields = flattenXref(structure);

  const emptySections = sections.filter((s) => s.fields.length === 0).map((s) => s.name);

  const seen = new Map<string, number>();
  for (const f of fields) seen.set(norm(f.field), (seen.get(norm(f.field)) ?? 0) + 1);
  const duplicates = [...seen.entries()].filter(([, n]) => n > 1).map(([f]) => f).sort();

  const described = fields.filter((f) => (f.description ?? '').trim() !== '').length;
  const uncoloured = sections.filter((s) => !s.color).map((s) => s.name);
  const blankNames = fields.filter((f) => f.field.trim() === '').length;
  const published = versions.filter((v) => v.publishedAt).length;

  const checks: HealthCheck[] = [
    {
      key: 'sections',
      label: 'The template has sections',
      status: sections.length > 0 ? 'pass' : 'fail',
      detail: sections.length > 0
        ? `${sections.length} section${sections.length === 1 ? '' : 's'}.`
        : 'Nothing is defined yet, so nothing can be generated from this template.',
    },
    {
      // A cross reference maps one value onto another. One column has nothing to map TO, which
      // makes the template structurally incapable of the only thing it exists for — and it is not
      // obvious from the designer, where one column looks like a start rather than a dead end.
      key: 'pair',
      label: 'Enough columns to map a value onto another',
      status: fields.length >= 2 ? 'pass' : 'fail',
      detail: fields.length >= 2
        ? `${fields.length} fields.`
        : fields.length === 1
          ? 'Only one field. A cross reference needs at least a value to match and a value to return.'
          : 'No fields defined.',
    },
    {
      // Field names are the identity a version diff is computed on, so a duplicate makes two
      // different columns indistinguishable — an added one and a removed one look like the same
      // field, and the comparison silently reports nothing changed.
      key: 'duplicates',
      label: 'Field names are unique',
      status: duplicates.length === 0 ? 'pass' : 'fail',
      detail: duplicates.length === 0
        ? 'No field name is used twice.'
        : `Used more than once: ${duplicates.join(', ')}. Names are matched ignoring case, so MATNR and matnr collide.`,
    },
    {
      key: 'blank-names',
      label: 'No field is left unnamed',
      status: blankNames === 0 ? 'pass' : 'fail',
      detail: blankNames === 0 ? 'Every field has a name.' : `${blankNames} field${blankNames === 1 ? ' has' : 's have'} a blank name.`,
    },
    {
      key: 'empty-sections',
      label: 'No empty sections',
      status: emptySections.length === 0 ? 'pass' : 'warn',
      detail: emptySections.length === 0
        ? 'Every section holds at least one field.'
        : `Empty: ${emptySections.join(', ')}. They render as a heading over nothing.`,
    },
    {
      key: 'descriptions',
      label: 'Every field says what it is for',
      status: fields.length === 0 ? 'warn' : described === fields.length ? 'pass' : 'warn',
      detail: fields.length === 0
        ? 'No fields to describe yet.'
        : described === fields.length
          ? 'All fields carry a description.'
          : `${fields.length - described} of ${fields.length} field${fields.length === 1 ? '' : 's'} have no description — a column header with no stated meaning.`,
    },
    {
      key: 'colours',
      label: 'Every section is colour-coded',
      status: uncoloured.length === 0 ? 'pass' : 'warn',
      detail: uncoloured.length === 0
        ? 'Sections are distinguishable at a glance.'
        : `No colour set: ${uncoloured.join(', ')}.`,
    },
    {
      // The one check about the template's STATE rather than its content: an unpublished template
      // is not the programme's template yet, however finished it looks in the designer.
      key: 'released',
      label: 'The template has been published',
      status: published > 0 ? 'pass' : 'fail',
      detail: published > 0
        ? `${published} published version${published === 1 ? '' : 's'}.`
        : 'Only drafts exist. Nothing downstream can be built against a template that was never released.',
    },
  ];

  return {
    sections: sections.length,
    fields: fields.length,
    described,
    emptySections,
    duplicates,
    versions: versions.length,
    published,
    checks,
  };
}

/** Accepts a missing structure so a version with nothing recorded still grades rather than throwing. */
export type XrefStructureInput = GoldenFmdStructure | undefined;

export interface XrefDiff {
  added: string[];
  removed: string[];
  /** Fields present in both, but in a different position within the template. */
  reordered: boolean;
  /** Same field name, changed presentation — the differences that move no column but are still
   * real, and the reason two versions can differ while their field lists match exactly. */
  changed: { field: string; what: string }[];
  /** Nothing differs at all. Distinct from "no fields": two empty versions are identical. */
  identical: boolean;
}

/** What changed between two template versions.
 *
 * Purely mechanical, and deliberately so: the FMD's sync asks an AI which removal is which addition
 * renamed, because there a wrong answer silently discards a populated column. Nothing is populated
 * here — a Golden XREF has no data of its own — so a guess would add uncertainty and buy nothing.
 * A rename shows up honestly as one field gone and another arrived. */
export function diffXrefStructures(from: XrefStructureInput, to: XrefStructureInput): XrefDiff {
  const before = flattenXref(from);
  const after = flattenXref(to);

  const beforeNames = new Set(before.map((f) => norm(f.field)));
  const afterNames = new Set(after.map((f) => norm(f.field)));

  const added = after.filter((f) => !beforeNames.has(norm(f.field))).map((f) => f.field);
  const removed = before.filter((f) => !afterNames.has(norm(f.field))).map((f) => f.field);

  // Order is compared over the SHARED fields only. Comparing the raw lists would report every
  // addition as a reorder too, which turns one real change into two and tells you nothing.
  const sharedBefore = before.filter((f) => afterNames.has(norm(f.field))).map((f) => norm(f.field));
  const sharedAfter = after.filter((f) => beforeNames.has(norm(f.field))).map((f) => norm(f.field));
  const reordered = sharedBefore.join('|') !== sharedAfter.join('|');

  const beforeByName = new Map(before.map((f) => [norm(f.field), f]));
  const changed: { field: string; what: string }[] = [];
  for (const next of after) {
    const prev = beforeByName.get(norm(next.field));
    if (!prev) continue;
    const bits: string[] = [];
    if (prev.sectionName !== next.sectionName) bits.push(`section ${prev.sectionName} → ${next.sectionName}`);
    if (prev.color !== next.color) bits.push('colour');
    if ((prev.description ?? '').trim() !== (next.description ?? '').trim()) bits.push('description');
    if (prev.field !== next.field) bits.push(`case ${prev.field} → ${next.field}`);
    if (bits.length) changed.push({ field: next.field, what: bits.join(', ') });
  }

  return {
    added, removed, reordered, changed,
    identical: added.length === 0 && removed.length === 0 && !reordered && changed.length === 0,
  };
}
