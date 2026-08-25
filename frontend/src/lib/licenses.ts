/* Plain-English license compatibility explanations. */

export interface LicenseInfo {
  label: string
  commercial: 'yes' | 'attribution' | 'sharealike' | 'no' | 'unknown'
  blurb: string
}

const RULES: { match: RegExp; info: LicenseInfo }[] = [
  {
    match: /\bcc0|public\s*domain|pddl/i,
    info: {
      label: 'CC0 / Public Domain',
      commercial: 'yes',
      blurb: 'Free to use, modify and redistribute for any purpose — including commercial — with no conditions attached.',
    },
  },
  {
    match: /\bcc[- ]?by[^-]|attribution\s*4|cc-by-4/i,
    info: {
      label: 'CC BY',
      commercial: 'attribution',
      blurb: 'Commercial use allowed as long as you credit the original author (e.g. in a README or paper).',
    },
  },
  {
    match: /\bcc[- ]?by[- ]?sa|share[- ]?alike/i,
    info: {
      label: 'CC BY-SA',
      commercial: 'sharealike',
      blurb: 'Like CC BY, but derived datasets must be shared under the same license (copyleft).',
    },
  },
  {
    match: /\bcc[- ]?by[- ]?nc/i,
    info: {
      label: 'CC BY-NC',
      commercial: 'no',
      blurb: 'Non-commercial use only. Do not build products or paid work on this dataset without permission.',
    },
  },
  {
    match: /\bmit\b|apache|bsd|gpl|lgpl/i,
    info: {
      label: 'Open-source style',
      commercial: 'attribution',
      blurb: 'Open software-style license: generally fine to reuse; check the exact text for notice requirements.',
    },
  },
  {
    match: /\bodc|-by\b/i,
    info: {
      label: 'Open data license',
      commercial: 'attribution',
      blurb: 'Recognized open data license. Attribution and/or share-alike terms may apply — verify the variant.',
    },
  },
]

export function explainLicense(license: string | null | undefined): LicenseInfo {
  const name = (license || '').trim()
  if (!name) {
    return {
      label: 'Missing',
      commercial: 'unknown',
      blurb:
        'No license was stated. Legally this usually means "all rights reserved" — treat the dataset as risky to redistribute or build on.',
    }
  }
  for (const rule of RULES) {
    if (rule.match.test(name)) return rule.info
  }
  return {
    label: name,
    commercial: 'unknown',
    blurb: `License "${name}" is not in our allowlist. Read the terms manually before commercial or public use.`,
  }
}
