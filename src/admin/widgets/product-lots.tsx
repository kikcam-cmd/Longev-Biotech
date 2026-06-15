import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types"
import { Container, Heading, Button, Input, Label, Text, Badge, toast } from "@medusajs/ui"
import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Lot & Certificate of Analysis manager (Longev). Lets you create/edit a product's
 * lots and upload the CoA file — the data behind the PDP "This Batch's Lab Report"
 * hero — entirely from Admin, instead of the seed/upload scripts.
 *
 * Talks to custom admin routes (/admin/products/:id/lots, /admin/lots/:id) plus the
 * native /admin/uploads endpoint for the CoA file.
 */

type Lot = {
  id: string
  lot_number: string
  purity_text?: string | null
  purity_pct?: number | null
  strength?: string | null
  lab_name?: string | null
  test_method?: string | null
  endotoxin?: string | null
  released_at?: string | null
  coa_file_id?: string | null
}

type Draft = Record<string, string>

const FIELDS: { key: keyof Lot; label: string; placeholder?: string; type?: string; help?: string }[] = [
  { key: "lot_number", label: "Lot Number *", placeholder: "1234" },
  { key: "purity_text", label: "Purity (verbatim)", placeholder: "99.54%", help: "Exactly as the cert prints it — shown in the hero." },
  { key: "purity_pct", label: "Purity % (integer)", placeholder: "99", type: "number" },
  { key: "strength", label: "Strength", placeholder: "30 mg" },
  { key: "lab_name", label: "Lab", placeholder: "Vanguard Laboratory" },
  { key: "test_method", label: "Test Method", placeholder: "HPLC-UV/VIS" },
  { key: "endotoxin", label: "Endotoxin", placeholder: "≤0.05 EU/mL" },
  { key: "released_at", label: "Released", type: "date" },
]

const api = async (url: string, opts: RequestInit = {}) => {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  })
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}))
    throw new Error(msg?.message || `Request failed (${res.status})`)
  }
  return res.json()
}

const toDraft = (lot?: Lot): Draft => {
  const d: Draft = {}
  for (const f of FIELDS) {
    const v = lot ? (lot[f.key] as any) : undefined
    d[f.key] = v == null ? "" : f.key === "released_at" ? String(v).slice(0, 10) : String(v)
  }
  return d
}

const ProductLotsWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const [lots, setLots] = useState<Lot[]>([])
  const [editingId, setEditingId] = useState<string | null>(null) // lot id, "new", or null
  const [draft, setDraft] = useState<Draft>({})
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const uploadTarget = useRef<string | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await api(`/admin/products/${product.id}/lots`)
      setLots(d.lots ?? [])
    } catch (e: any) {
      toast.error("Could not load lots", { description: e?.message })
    }
  }, [product.id])

  useEffect(() => { load() }, [load])

  const startNew = () => { setDraft(toDraft()); setEditingId("new") }
  const startEdit = (lot: Lot) => { setDraft(toDraft(lot)); setEditingId(lot.id) }
  const cancel = () => { setEditingId(null); setDraft({}) }

  const saveLot = async () => {
    if (!draft.lot_number?.trim()) { toast.error("Lot Number is required"); return }
    setBusy(true)
    try {
      if (editingId === "new") {
        await api(`/admin/products/${product.id}/lots`, { method: "POST", body: JSON.stringify(draft) })
      } else {
        await api(`/admin/lots/${editingId}`, { method: "POST", body: JSON.stringify(draft) })
      }
      toast.success("Lot saved", { description: "PDP refreshes automatically." })
      cancel()
      await load()
    } catch (e: any) {
      toast.error("Could not save lot", { description: e?.message })
    } finally { setBusy(false) }
  }

  const remove = async (id: string) => {
    setBusy(true)
    try {
      await api(`/admin/lots/${id}`, { method: "DELETE" })
      toast.success("Lot deleted")
      await load()
    } catch (e: any) {
      toast.error("Could not delete lot", { description: e?.message })
    } finally { setBusy(false) }
  }

  const pickCoa = (lotId: string) => { uploadTarget.current = lotId; fileInput.current?.click() }

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    const lotId = uploadTarget.current
    e.target.value = "" // allow re-picking same file
    if (!file || !lotId) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("files", file)
      const up = await fetch("/admin/uploads", { method: "POST", credentials: "include", body: fd })
      if (!up.ok) throw new Error(`Upload failed (${up.status})`)
      const uj = await up.json()
      const fileId = uj.files?.[0]?.id
      if (!fileId) throw new Error("No file id returned")
      await api(`/admin/lots/${lotId}`, { method: "POST", body: JSON.stringify({ coa_file_id: fileId }) })
      toast.success("CoA uploaded", { description: file.name })
      await load()
    } catch (err: any) {
      toast.error("Could not upload CoA", { description: err?.message })
    } finally { setBusy(false) }
  }

  return (
    <Container className="divide-y p-0">
      <input ref={fileInput} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" hidden onChange={onFile} />
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Lots & Certificate of Analysis</Heading>
        {editingId == null && <Button size="small" variant="secondary" onClick={startNew}>Add lot</Button>}
      </div>

      {/* Existing lots */}
      <div className="px-6 py-2">
        {lots.length === 0 && editingId == null && (
          <Text size="small" className="text-ui-fg-subtle py-2">
            No lots yet. Add one so the PDP “This Batch’s Lab Report” hero populates (until then it shows the graceful fallback).
          </Text>
        )}
        {lots.map((lot) => (
          <div key={lot.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b py-3 last:border-b-0">
            <span className="font-medium">Lot {lot.lot_number}</span>
            <span className="text-ui-fg-subtle text-sm">{lot.purity_text || (lot.purity_pct != null ? `${lot.purity_pct}%` : "—")}</span>
            <span className="text-ui-fg-subtle text-sm">{lot.strength || "—"}</span>
            <span className="text-ui-fg-subtle text-sm">{lot.lab_name || "—"}</span>
            <span className="text-ui-fg-subtle text-sm">{lot.test_method || "—"}</span>
            <span className="text-ui-fg-subtle text-sm">{lot.released_at ? String(lot.released_at).slice(0, 10) : "—"}</span>
            {lot.coa_file_id
              ? <Badge size="2xsmall" color="green">CoA ✓</Badge>
              : <Badge size="2xsmall" color="orange">No CoA</Badge>}
            <div className="ml-auto flex gap-2">
              <Button size="small" variant="transparent" disabled={busy} onClick={() => pickCoa(lot.id)}>
                {lot.coa_file_id ? "Replace CoA" : "Upload CoA"}
              </Button>
              <Button size="small" variant="secondary" disabled={busy} onClick={() => startEdit(lot)}>Edit</Button>
              <Button size="small" variant="danger" disabled={busy} onClick={() => remove(lot.id)}>Delete</Button>
            </div>
          </div>
        ))}
      </div>

      {/* Add / edit form */}
      {editingId != null && (
        <div className="px-6 py-4">
          <Heading level="h3" className="mb-3">{editingId === "new" ? "New lot" : "Edit lot"}</Heading>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={String(f.key)} className="flex flex-col gap-1">
                <Label size="small" weight="plus">{f.label}</Label>
                <Input
                  type={f.type ?? "text"}
                  value={draft[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setDraft((s) => ({ ...s, [f.key]: e.target.value }))}
                />
                {f.help ? <Text size="xsmall" className="text-ui-fg-subtle">{f.help}</Text> : null}
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button size="small" onClick={saveLot} isLoading={busy}>Save lot</Button>
            <Button size="small" variant="secondary" onClick={cancel} disabled={busy}>Cancel</Button>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle mt-2">
            Upload the CoA file from the lot row after saving. The measured purity here is the per-lot value — the molecule’s label specs live in the “Spec Sheet” widget.
          </Text>
        </div>
      )}
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductLotsWidget
