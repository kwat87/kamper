'use client'

import { useState, useRef } from 'react'
import { IMPORT_FIELDS, REQUIRED_FIELDS, type ImportFieldKey } from '@/lib/import/fields'

type FieldMapping = Partial<Record<ImportFieldKey, string>>

interface Program {
  id: string
  name: string
  camp_id: string
  start_date: string
  end_date: string
}

interface Camp {
  id: string
  name: string
}

interface Props {
  camps: Camp[]
  programs: Program[]
}

type Step = 'upload' | 'mapping' | 'preview' | 'result'

interface PreviewData {
  headers: string[]
  previewRows: Record<string, string>[]
  totalRows: number
  suggestedMappings: FieldMapping
}

interface ImportResult {
  householdsCreated: number
  campersCreated: number
  enrollmentsCreated: number
  contactsImported: number
  skipped: number
  errors: string[]
}

export default function ImportWizard({ camps, programs }: Props) {
  const [step, setStep] = useState<Step>('upload')
  const [selectedCampId, setSelectedCampId] = useState(camps[0]?.id ?? '')
  const [selectedProgramId, setSelectedProgramId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState('')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const campPrograms = programs.filter((p) => p.camp_id === selectedCampId)

  // ── Step 1: Upload ──────────────────────────────────────────────────────────

  async function handleUpload() {
    if (!file || !selectedCampId || !selectedProgramId) return
    setLoading(true)
    setError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('camp_id', selectedCampId)

    const res = await fetch('/api/import/preview', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Failed to parse CSV')
      setLoading(false)
      return
    }

    // Read file text for later submission
    const text = await file.text()
    setCsvText(text)

    setPreview(data)
    setMapping(data.suggestedMappings)
    setStep('mapping')
    setLoading(false)
  }

  // ── Step 2: Mapping ─────────────────────────────────────────────────────────

  function setFieldMapping(fieldKey: ImportFieldKey, csvColumn: string) {
    setMapping((prev) => ({ ...prev, [fieldKey]: csvColumn || undefined }))
  }

  function mappingIsValid() {
    return REQUIRED_FIELDS.every((f) => mapping[f])
  }

  // ── Step 3: Preview ─────────────────────────────────────────────────────────

  // ── Step 4: Execute ─────────────────────────────────────────────────────────

  async function handleExecute() {
    setLoading(true)
    setError(null)

    const res = await fetch('/api/import/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campId: selectedCampId,
        programId: selectedProgramId,
        csv: csvText,
        mapping,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? 'Import failed')
      setLoading(false)
      return
    }

    setResult(data)
    setStep('result')
    setLoading(false)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Step indicator */}
      <div className="flex border-b border-gray-200">
        {(['upload', 'mapping', 'preview', 'result'] as Step[]).map((s, i) => {
          const labels = ['Upload', 'Map Columns', 'Preview', 'Results']
          const isActive = step === s
          const isPast =
            ['upload', 'mapping', 'preview', 'result'].indexOf(step) >
            ['upload', 'mapping', 'preview', 'result'].indexOf(s)
          return (
            <div
              key={s}
              className={`flex-1 py-3 text-center text-sm font-medium border-b-2 ${
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : isPast
                  ? 'border-transparent text-gray-400'
                  : 'border-transparent text-gray-400'
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs mr-1.5 ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : isPast
                    ? 'bg-gray-300 text-gray-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {i + 1}
              </span>
              {labels[i]}
            </div>
          )
        })}
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Camp</label>
                <select
                  value={selectedCampId}
                  onChange={(e) => { setSelectedCampId(e.target.value); setSelectedProgramId('') }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {camps.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Program</label>
                <select
                  value={selectedProgramId}
                  onChange={(e) => setSelectedProgramId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select a program…</option>
                  {campPrograms.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CSV File</label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 hover:bg-blue-50 transition-colors"
              >
                {file ? (
                  <div>
                    <p className="text-sm font-medium text-gray-900">{file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm text-gray-600">Click to select a CSV file</p>
                    <p className="text-xs text-gray-400 mt-1">Max 10MB</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <button
              onClick={handleUpload}
              disabled={!file || !selectedCampId || !selectedProgramId || loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Parsing…' : 'Continue'}
            </button>
          </div>
        )}

        {/* ── Step 2: Field Mapping ── */}
        {step === 'mapping' && preview && (
          <div className="space-y-5">
            <p className="text-sm text-gray-500">
              Match your CSV columns to the Kamper fields below.{' '}
              <span className="text-red-500">*</span> fields are required.
            </p>

            <div className="space-y-3">
              {IMPORT_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <div className="w-48 shrink-0">
                    <span className="text-sm font-medium text-gray-700">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </span>
                    <p className="text-xs text-gray-400">{field.description}</p>
                  </div>
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(e) => setFieldMapping(field.key, e.target.value)}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                      field.required && !mapping[field.key]
                        ? 'border-red-300 bg-red-50 focus:border-red-500'
                        : 'border-gray-300 focus:border-blue-500'
                    }`}
                  >
                    <option value="">— not mapped —</option>
                    {preview.headers.map((h) => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('upload')}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={() => setStep('preview')}
                disabled={!mappingIsValid()}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Preview Import
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ── */}
        {step === 'preview' && preview && (
          <div className="space-y-5">
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              Ready to import <strong>{preview.totalRows} rows</strong> into{' '}
              <strong>{campPrograms.find((p) => p.id === selectedProgramId)?.name}</strong>.
              Showing first {preview.previewRows.length} rows below.
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {IMPORT_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                      <th key={f.key} className="px-3 py-2 text-left font-medium text-gray-600">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.previewRows.map((row, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      {IMPORT_FIELDS.filter((f) => mapping[f.key]).map((f) => (
                        <td key={f.key} className="px-3 py-2 text-gray-700">
                          {row[mapping[f.key]!] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('mapping')}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleExecute}
                disabled={loading}
                className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Importing…' : `Import ${preview.totalRows} Rows`}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Results ── */}
        {step === 'result' && result && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Households created', value: result.householdsCreated },
                { label: 'Campers created', value: result.campersCreated },
                { label: 'Enrollments created', value: result.enrollmentsCreated },
                { label: 'Guardian contacts imported', value: result.contactsImported },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg bg-gray-50 border border-gray-200 p-4">
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-sm text-gray-500">{label}</p>
                </div>
              ))}
            </div>

            {result.skipped > 0 && (
              <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                <p className="text-sm font-medium text-yellow-800">{result.skipped} rows skipped</p>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 border-b border-gray-200">
                  <p className="text-xs font-medium text-gray-600">Warnings & Errors</p>
                </div>
                <ul className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <li key={i} className="px-3 py-1.5 text-xs text-gray-600">{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <button
              onClick={() => {
                setStep('upload')
                setFile(null)
                setCsvText('')
                setPreview(null)
                setMapping({})
                setResult(null)
              }}
              className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Import Another File
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
