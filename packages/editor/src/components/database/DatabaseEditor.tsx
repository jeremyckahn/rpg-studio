import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { Alert, Box, Button, Snackbar, Stack, Tab, Tabs, Typography } from '@mui/material'
import {
  DataGrid,
  type GridColDef,
  type GridRowId,
  type GridRowSelectionModel,
} from '@mui/x-data-grid'
import {
  DATABASE_TABLES,
  type DatabaseTableName,
  type ProjectAction,
  UpsertRecordPayloadSchema,
} from '@rpgstudio/core'
import { useMemo, useState } from 'react'

import { applyProjectAction } from '../../store/index.ts'
import { editorUiSlice } from '../../store/slices/editorUi.ts'
import { projectActions } from '../../store/slices/project.ts'
import { useAppDispatch, useAppSelector } from '../services.tsx'
import { type DatabaseRecord, newRecord, recordSchema } from './records.ts'
import { type FieldSpec, fieldsOf, formatJson, parseJsonCell } from './schemaColumns.ts'

type Row = Record<string, unknown> & { id: number }

const columnFor = (spec: FieldSpec): GridColDef<Row> => {
  const base: GridColDef<Row> = {
    field: spec.field,
    headerName: spec.field,
    editable: !spec.readOnly,
    width: spec.kind === 'json' ? 260 : spec.field === 'id' ? 70 : 150,
  }
  switch (spec.kind) {
    case 'number':
      return { ...base, type: 'number', align: 'left', headerAlign: 'left' }
    case 'boolean':
      return { ...base, type: 'boolean' }
    case 'enum':
      return { ...base, type: 'singleSelect', valueOptions: [...spec.options] }
    case 'json':
      return {
        ...base,
        type: 'string',
        valueGetter: (_value, row) => formatJson(row[spec.field]),
        valueSetter: (value: string, row) => ({ ...row, [spec.field]: parseJsonCell(value) }),
      }
    case 'string':
      return base
  }
}

/** Removes fields an optional column left empty so the record still validates. */
const withoutBlanks = (row: Row, specs: readonly FieldSpec[]): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(row).filter(([field, value]) => {
      const spec = specs.find((candidate) => candidate.field === field)
      return !(spec?.optional && (value === undefined || value === ''))
    }),
  )

/**
 * Every table as an editable grid whose columns come from its Zod schema. An
 * edit is only accepted if the whole record still validates and the project
 * stays consistent; otherwise the cell reverts and the reason is shown.
 */
export const DatabaseEditor = () => {
  const dispatch = useAppDispatch()
  const table = useAppSelector((state) => state.editorUi.databaseTable)
  const project = useAppSelector((state) => state.project.data)
  const [selection, setSelection] = useState<readonly GridRowId[]>([])
  const [error, setError] = useState<string | null>(null)

  const specs = useMemo(() => fieldsOf(recordSchema(table)), [table])
  const columns = useMemo(() => specs.map(columnFor), [specs])
  const rows = project.database[table] as readonly Row[]

  const tryUpsert = (record: unknown): string | null => {
    const payload = UpsertRecordPayloadSchema.safeParse({ table, record })
    if (!payload.success) {
      return payload.error.issues
        .slice(0, 2)
        .map((issue) => `${issue.path.join('.') || table}: ${issue.message}`)
        .join('; ')
    }
    const action: ProjectAction = { type: 'project/upsertRecord', payload: payload.data }
    const applied = applyProjectAction(project, action)
    if (!applied.success) return applied.error
    dispatch(projectActions.upsertRecord(payload.data))
    return null
  }

  const addRow = (): void => {
    const created = newRecord(project, table)
    if (!created.success) {
      setError(created.error)
      return
    }
    setError(tryUpsert(created.data satisfies DatabaseRecord))
  }

  const deleteSelected = (): void => {
    const failures = selection.flatMap((id) => {
      const action = { table, id: Number(id) }
      const applied = applyProjectAction(project, { type: 'project/deleteRecord', payload: action })
      if (!applied.success) return [`#${String(id)}: ${applied.error}`]
      dispatch(projectActions.deleteRecord(action))
      return []
    })
    setSelection([])
    setError(failures.length > 0 ? failures.join(' • ') : null)
  }

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Tabs
        value={table}
        onChange={(_event, next: DatabaseTableName) => {
          setSelection([])
          dispatch(editorUiSlice.actions.databaseTableSelected(next))
        }}
        variant="scrollable"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        {DATABASE_TABLES.map((name) => (
          <Tab
            key={name}
            value={name}
            label={`${name} (${project.database[name].length})`}
            sx={{ textTransform: 'capitalize' }}
          />
        ))}
      </Tabs>
      <Stack direction="row" spacing={1} sx={{ p: 1, alignItems: 'center' }}>
        <Button size="small" startIcon={<AddIcon />} onClick={addRow}>
          Add {table.slice(0, -1)}
        </Button>
        <Button
          size="small"
          color="error"
          startIcon={<DeleteIcon />}
          disabled={selection.length === 0}
          onClick={deleteSelected}
        >
          Delete selected
        </Button>
        <Typography variant="caption" color="text.secondary" sx={{ pl: 1 }}>
          Edit cells directly. Nested values are JSON. Changes are validated against the schema.
        </Typography>
      </Stack>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          density="compact"
          checkboxSelection
          disableRowSelectionOnClick
          rowSelectionModel={
            { type: 'include', ids: new Set(selection) } satisfies GridRowSelectionModel
          }
          onRowSelectionModelChange={(model) => {
            setSelection([...model.ids])
          }}
          processRowUpdate={(next: Row, previous: Row) => {
            const message = tryUpsert(withoutBlanks({ ...previous, ...next }, specs))
            if (message) throw new Error(message)
            setError(null)
            return next
          }}
          onProcessRowUpdateError={(failure: unknown) => {
            setError(failure instanceof Error ? failure.message : String(failure))
          }}
          sx={{ border: 0 }}
        />
      </Box>
      <Snackbar
        open={error !== null}
        autoHideDuration={8000}
        onClose={() => {
          setError(null)
        }}
      >
        <Alert
          severity="error"
          variant="filled"
          onClose={() => {
            setError(null)
          }}
        >
          {error}
        </Alert>
      </Snackbar>
    </Stack>
  )
}
