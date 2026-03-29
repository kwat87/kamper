// ─── Import Field Definitions ─────────────────────────────────────────────────
// Describes the Kamper fields that a CSV column can be mapped to.

export type ImportFieldKey =
  | 'camper_first_name'
  | 'camper_last_name'
  | 'camper_date_of_birth'
  | 'guardian_email'
  | 'guardian_first_name'
  | 'guardian_last_name'
  | 'guardian_phone'
  | 'guardian_2_email'
  | 'guardian_2_first_name'
  | 'guardian_2_last_name'
  | 'guardian_2_phone'
  | 'account_id'   // optional — groups siblings into the same household

export interface ImportField {
  key: ImportFieldKey
  label: string
  required: boolean
  description: string
  /** Common CSV column name variations to auto-detect */
  aliases: string[]
}

export const IMPORT_FIELDS: ImportField[] = [
  {
    key: 'camper_first_name',
    label: 'Camper First Name',
    required: true,
    description: "Camper's first name",
    aliases: ['first name', 'firstname', 'first', 'camper first', 'child first', 'participant first'],
  },
  {
    key: 'camper_last_name',
    label: 'Camper Last Name',
    required: true,
    description: "Camper's last name",
    aliases: ['last name', 'lastname', 'last', 'camper last', 'child last', 'participant last', 'surname'],
  },
  {
    key: 'camper_date_of_birth',
    label: 'Camper Date of Birth',
    required: false,
    description: 'Any standard date format (MM/DD/YYYY, YYYY-MM-DD, etc.)',
    aliases: ['date of birth', 'dob', 'birthdate', 'birth date', 'birthday'],
  },
  {
    key: 'guardian_email',
    label: 'Guardian Email',
    required: true,
    description: 'Used to auto-link accounts when the parent registers',
    aliases: ['email', 'parent email', 'guardian email', 'contact email', 'primary email', 'email address'],
  },
  {
    key: 'guardian_first_name',
    label: 'Guardian First Name',
    required: false,
    description: "Parent/guardian's first name",
    aliases: ['parent first', 'guardian first', 'contact first', 'primary first'],
  },
  {
    key: 'guardian_last_name',
    label: 'Guardian Last Name',
    required: false,
    description: "Parent/guardian's last name",
    aliases: ['parent last', 'guardian last', 'contact last', 'primary last'],
  },
  {
    key: 'guardian_phone',
    label: 'Guardian Phone',
    required: false,
    description: "Parent/guardian's phone number",
    aliases: ['phone', 'parent phone', 'guardian phone', 'contact phone', 'mobile', 'cell'],
  },
  {
    key: 'guardian_2_email',
    label: 'Guardian 2 Email',
    required: false,
    description: 'Second parent/guardian email',
    aliases: ['email 2', 'secondary email', 'parent 2 email', 'guardian 2 email', 'second email'],
  },
  {
    key: 'guardian_2_first_name',
    label: 'Guardian 2 First Name',
    required: false,
    description: 'Second parent/guardian first name',
    aliases: ['parent 2 first', 'guardian 2 first', 'secondary first', 'second parent first'],
  },
  {
    key: 'guardian_2_last_name',
    label: 'Guardian 2 Last Name',
    required: false,
    description: 'Second parent/guardian last name',
    aliases: ['parent 2 last', 'guardian 2 last', 'secondary last', 'second parent last'],
  },
  {
    key: 'guardian_2_phone',
    label: 'Guardian 2 Phone',
    required: false,
    description: 'Second parent/guardian phone number',
    aliases: ['phone 2', 'parent 2 phone', 'guardian 2 phone', 'secondary phone'],
  },
  {
    key: 'account_id',
    label: 'Family / Account ID',
    required: false,
    description: 'Groups siblings into the same household. Use if your system exports a family or account identifier.',
    aliases: ['account id', 'account #', 'family id', 'household id', 'account number', 'id account'],
  },
]

export const REQUIRED_FIELDS = IMPORT_FIELDS.filter((f) => f.required).map((f) => f.key)

/**
 * Auto-detect field mappings from CSV column headers.
 * Returns a map of ImportFieldKey → CSV column name for confident matches.
 */
export function autoDetectMappings(csvHeaders: string[]): Partial<Record<ImportFieldKey, string>> {
  const mappings: Partial<Record<ImportFieldKey, string>> = {}

  for (const field of IMPORT_FIELDS) {
    for (const header of csvHeaders) {
      const normalized = header.toLowerCase().trim()
      if (field.aliases.some((alias) => alias === normalized)) {
        mappings[field.key] = header
        break
      }
    }
  }

  return mappings
}
