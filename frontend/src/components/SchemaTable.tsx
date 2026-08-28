import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

interface ColumnInfo {
  name: string
  type: 'numeric' | 'categorical' | 'unknown'
  missing_pct?: number
  unique_count?: number
  min?: number
  max?: number
  mean?: number
  top_values?: Array<{ value: string; count: number }>
  pii_risk?: 'high' | 'medium' | 'low'
}

interface SchemaTableProps {
  columns: string[]
  dataProfile: {
    rows_profiled?: number
    columns_profiled?: string[]
    numeric_summary?: Array<{
      column: string
      min: number
      max: number
      mean: number
      missing_pct: number
    }>
    class_balance?: {
      column: string
      values: Array<{ value: string; count: number }>
    }
    missing_total_pct?: number
  } | null
  isPartial?: boolean
}

// PII detection patterns
const PII_PATTERNS = {
  email: /email|e[-_]?mail|contact/i,
  phone: /phone|tel|mobile|cell|fax/i,
  name: /^(first|last|full)?[-_]?name$|person|user[-_]?name|author/i,
  id: /^id$|[-_]id$|uuid|ssn|social[-_]?security|passport|license[-_]?num/i,
  address: /address|street|city|zip|postal|location/i,
  geo: /lat|lng|lon|longitude|latitude|coord|gps/i,
  financial: /credit|card|account|bank|salary|income|ssn/i,
  health: /patient|medical|diagnos|health|clinical/i,
  biometric: /face|facial|fingerprint|biometric|retina/i,
}

function detectPII(columnName: string): 'high' | 'medium' | 'low' {
  const name = columnName.toLowerCase()

  // High risk patterns
  if (
    PII_PATTERNS.email.test(name) ||
    PII_PATTERNS.phone.test(name) ||
    PII_PATTERNS.id.test(name) ||
    PII_PATTERNS.financial.test(name) ||
    PII_PATTERNS.health.test(name) ||
    PII_PATTERNS.biometric.test(name)
  ) {
    return 'high'
  }

  // Medium risk patterns
  if (
    PII_PATTERNS.name.test(name) ||
    PII_PATTERNS.address.test(name) ||
    PII_PATTERNS.geo.test(name)
  ) {
    return 'medium'
  }

  return 'low'
}

type SortKey = 'name' | 'missing' | 'unique'
type SortDir = 'asc' | 'desc'

export default function SchemaTable({ columns, dataProfile, isPartial }: SchemaTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [filter, setFilter] = useState('')

  const columnInfo = useMemo(() => {
    const info: ColumnInfo[] = columns.map((name) => {
      const numSummary = dataProfile?.numeric_summary?.find((s) => s.column === name)
      const isClassBalance = dataProfile?.class_balance?.column === name
      const pii_risk = detectPII(name)

      if (numSummary) {
        return {
          name,
          type: 'numeric' as const,
          missing_pct: numSummary.missing_pct,
          min: numSummary.min,
          max: numSummary.max,
          mean: numSummary.mean,
          pii_risk,
        }
      }

      if (isClassBalance) {
        return {
          name,
          type: 'categorical' as const,
          top_values: dataProfile.class_balance!.values.slice(0, 3),
          pii_risk,
        }
      }

      return {
        name,
        type: 'unknown' as const,
        pii_risk,
      }
    })

    return info
  }, [columns, dataProfile])

  const filtered = useMemo(() => {
    let result = columnInfo

    if (filter) {
      const lower = filter.toLowerCase()
      result = result.filter((col) => col.name.toLowerCase().includes(lower))
    }

    result.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (sortKey === 'missing') {
        cmp = (a.missing_pct || 0) - (b.missing_pct || 0)
      } else if (sortKey === 'unique') {
        cmp = (a.unique_count || 0) - (b.unique_count || 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [columnInfo, filter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active) return null
    return dir === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
  }

  if (!columns.length) {
    return null
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-heading" style={{ color: '#e4e6eb' }}>
          Dataset Schema
        </h3>
        {isPartial && (
          <div
            className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-tiny"
            style={{
              background: 'color-mix(in srgb, #c4645f 10%, transparent)',
              borderColor: 'color-mix(in srgb, #c4645f 25%, transparent)',
              color: '#c4645f',
            }}
          >
            <AlertTriangle size={14} />
            <span>Partial profile — data cap reached</span>
          </div>
        )}
      </div>

      {/* Filter */}
      <input
        type="text"
        placeholder="Filter columns..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-small transition-colors"
        style={{
          background: '#14171b',
          borderColor: 'rgba(255, 255, 255, 0.08)',
          color: '#e4e6eb',
        }}
      />

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
        <table className="w-full text-small" style={{ tableLayout: 'fixed', minWidth: '700px' }}>
          <thead style={{ background: '#14171b', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <tr>
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium transition-colors hover:bg-opacity-80"
                style={{ color: '#8b9099', width: '30%' }}
                onClick={() => toggleSort('name')}
              >
                <div className="flex items-center gap-2">
                  Column Name
                  <SortIcon active={sortKey === 'name'} dir={sortDir} />
                </div>
              </th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: '#8b9099', width: '15%' }}>
                Type
              </th>
              <th
                className="cursor-pointer px-4 py-3 text-left font-medium transition-colors hover:bg-opacity-80"
                style={{ color: '#8b9099', width: '15%' }}
                onClick={() => toggleSort('missing')}
              >
                <div className="flex items-center gap-2">
                  Missing
                  <SortIcon active={sortKey === 'missing'} dir={sortDir} />
                </div>
              </th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: '#8b9099', width: '40%' }}>
                Summary
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((col, idx) => (
              <tr
                key={col.name}
                style={{
                  borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
                }}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono" style={{ color: '#e4e6eb' }}>
                      {col.name}
                    </span>
                    {(col.pii_risk === 'high' || col.pii_risk === 'medium') && (
                      <span
                        className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-tiny font-medium"
                        style={{
                          background:
                            col.pii_risk === 'high'
                              ? 'color-mix(in srgb, #c4645f 15%, transparent)'
                              : 'color-mix(in srgb, #c4645f 10%, transparent)',
                          color: '#c4645f',
                          border: `1px solid color-mix(in srgb, #c4645f ${col.pii_risk === 'high' ? '30' : '20'}%, transparent)`,
                        }}
                      >
                        <AlertTriangle size={11} />
                        PII?
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className="inline-block rounded px-2 py-0.5 text-tiny font-medium"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#8b9099',
                    }}
                  >
                    {col.type}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: '#8b9099' }}>
                  {col.missing_pct != null ? `${col.missing_pct}%` : '—'}
                </td>
                <td className="px-4 py-3 text-tiny" style={{ color: '#8b9099' }}>
                  {col.type === 'numeric' && col.min != null && col.max != null && (
                    <span>
                      Range: {col.min.toFixed(2)} – {col.max.toFixed(2)}
                      {col.mean != null && <span className="ml-2">· Mean: {col.mean.toFixed(2)}</span>}
                    </span>
                  )}
                  {col.type === 'categorical' && col.top_values && (
                    <span>
                      Top: {col.top_values.map((v) => `${v.value} (${v.count})`).join(', ')}
                    </span>
                  )}
                  {col.type === 'unknown' && <span style={{ color: '#5a5f68' }}>No profile data</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer stats */}
      {dataProfile && (
        <div className="flex flex-wrap gap-4 text-tiny" style={{ color: '#5a5f68' }}>
          {dataProfile.rows_profiled && (
            <span>
              {dataProfile.rows_profiled.toLocaleString()} row{dataProfile.rows_profiled !== 1 ? 's' : ''} profiled
            </span>
          )}
          {dataProfile.missing_total_pct != null && (
            <span>{dataProfile.missing_total_pct}% overall missing values</span>
          )}
        </div>
      )}
    </div>
  )
}
