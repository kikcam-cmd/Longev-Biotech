import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types"
import { Container, Heading, Label, Input, Switch, Button, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"

/**
 * Product spec-sheet widget (Longev). Renders the molecule-level label specs the
 * storefront PDP reads out of `product.metadata` as TYPED fields instead of the
 * stock Admin's raw-JSON metadata box — so a typo can't silently drop a PDP row.
 *
 * These are fixed label specs, NOT per-lot measured values (those live on the
 * lot/CoA — see the "Lot & Certificate of Analysis" widget below).
 */

type Field = { key: string; label: string; placeholder?: string; help?: string }

// Keys consumed by the storefront PDP (modules/products/templates/index.tsx).
const TEXT_FIELDS: Field[] = [
  { key: "cas_number", label: "CAS Number", placeholder: "2381089-83-2" },
  { key: "molecular_formula", label: "Molecular Formula", placeholder: "C221H342N46O68", help: "Free-base formula (matches the CAS), not the TFA-salt form." },
  { key: "avg_mol_weight", label: "Avg. Mol. Weight (g/mol)", placeholder: "4731.41" },
  { key: "monoisotopic_mass", label: "Monoisotopic Mass (Da)", placeholder: "4728.47" },
  { key: "purity_spec", label: "Purity (Spec)", placeholder: ">=99%", help: "The label floor, e.g. ≥ 99%. The MEASURED purity goes on the lot CoA." },
  { key: "method", label: "Analysis Method", placeholder: "HPLC-UV-MS" },
  { key: "format", label: "Format", placeholder: "Lyophilized Powder" },
  { key: "made_in", label: "Made In", placeholder: "USA" },
  { key: "quantity_mg", label: "Quantity per vial (mg)", placeholder: "30", help: "Single-strength products ONLY. Leave blank for multi-variant products — the Size variant carries the mg, and setting this would show a fixed “mg vial” line that contradicts the selector." },
  { key: "volume_ml", label: "Volume per vial (mL)", placeholder: "30", help: "For volume-based products (e.g. bacteriostatic water) instead of mg." },
]

const ProductSpecsWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const meta = (product.metadata ?? {}) as Record<string, unknown>
  const [values, setValues] = useState<Record<string, string>>({})
  const [ruo, setRuo] = useState<boolean>(meta.research_use_only === true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const seed: Record<string, string> = {}
    for (const f of TEXT_FIELDS) seed[f.key] = meta[f.key] != null ? String(meta[f.key]) : ""
    setValues(seed)
    setRuo(meta.research_use_only === true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id])

  const save = async () => {
    setSaving(true)
    try {
      // Admin product update REPLACES metadata wholesale, so start from the
      // existing object to preserve any keys we don't render, then overlay edits.
      // An empty text field deletes that key (PDP treats absent == not shown).
      const next: Record<string, unknown> = { ...meta }
      for (const f of TEXT_FIELDS) {
        const v = (values[f.key] ?? "").trim()
        if (v) next[f.key] = v
        else delete next[f.key]
      }
      next.research_use_only = ruo

      const res = await fetch(`/admin/products/${product.id}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metadata: next }),
      })
      if (!res.ok) throw new Error(`Save failed (${res.status})`)
      toast.success("Spec sheet saved", {
        description: "The PDP refreshes automatically (on-publish revalidation).",
      })
    } catch (e: any) {
      toast.error("Could not save specs", { description: e?.message ?? "Unknown error" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Spec Sheet (PDP)</Heading>
        <Button size="small" onClick={save} isLoading={saving}>
          Save specs
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <Label size="small" weight="plus">{f.label}</Label>
            <Input
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
            />
            {f.help ? <Text size="xsmall" className="text-ui-fg-subtle">{f.help}</Text> : null}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Switch checked={ruo} onCheckedChange={setRuo} />
          <Label size="small" weight="plus">Research Use Only</Label>
        </div>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductSpecsWidget
