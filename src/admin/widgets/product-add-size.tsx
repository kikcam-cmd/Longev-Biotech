import { defineWidgetConfig } from "@medusajs/admin-sdk"
import { DetailWidgetProps, AdminProduct } from "@medusajs/framework/types"
import { Container, Heading, Button, Input, Label, Text, Badge, toast } from "@medusajs/ui"
import { useMemo, useState } from "react"

/**
 * "Add a size" widget (Longev). The stock variant form is select-only — you can't
 * type a new option value there — so this does the whole lifecycle a usable size
 * needs in one click: add the Size value, create the variant (SKU + USD price),
 * stock it at the US Warehouse, and apply the per-vial volume tiers.
 *
 * Calls POST /admin/products/:id/add-size. After it succeeds, reload to see the
 * new row in the native Variants table above.
 */

// Derive a SKU prefix from an existing variant SKU, e.g. "RETA-12MG" → "RETA-".
const skuPrefix = (skus: string[]): string => {
  const m = skus.find((s) => /-[0-9.]+\s*(mg|ml)$/i.test(s))?.match(/^(.*-)[0-9.]+\s*(?:mg|ml)$/i)
  return m?.[1] ?? ""
}
const suggestSku = (prefix: string, size: string) =>
  prefix ? `${prefix}${size.replace(/\s+/g, "").toUpperCase()}` : ""

const ProductAddSizeWidget = ({ data: product }: DetailWidgetProps<AdminProduct>) => {
  const sizeOption = (product.options ?? []).find((o: any) => o.title === "Size")
  const currentSizes: string[] = (sizeOption?.values ?? []).map((v: any) => v.value)
  const prefix = useMemo(() => skuPrefix((product.variants ?? []).map((v: any) => v.sku).filter(Boolean)), [product.variants])

  const [size, setSize] = useState("")
  const [sku, setSku] = useState("")
  const [skuTouched, setSkuTouched] = useState(false)
  const [price, setPrice] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const onSize = (v: string) => {
    setSize(v)
    if (!skuTouched) setSku(suggestSku(prefix, v))
  }

  const submit = async () => {
    setDone(null)
    if (!size.trim() || !sku.trim() || !(Number(price) > 0)) {
      toast.error("Enter a size, SKU, and a price > 0")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/admin/products/${product.id}/add-size`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: size.trim(), sku: sku.trim(), price: Number(price) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || `Failed (${res.status})`)
      const tierStr = (data.tiers ?? []).map((t: any) => `${t.range}=$${t.price}`).join(" · ")
      setDone(`Added ${data.size} (${sku.trim()}) @ $${data.price} — ${data.stocked ? "stocked" : "NOT stocked"}, ${data.tiered ? `tiers ${tierStr}` : "no tiers"}.`)
      toast.success(`Size ${data.size} added`, { description: "Reload to see it in the Variants table." })
      setSize(""); setSku(""); setSkuTouched(false); setPrice("")
    } catch (e: any) {
      toast.error("Could not add size", { description: e?.message })
    } finally { setBusy(false) }
  }

  if (!sizeOption) return null // only for products with a "Size" option

  return (
    <Container className="divide-y p-0">
      <div className="flex items-center justify-between px-6 py-4">
        <Heading level="h2">Add a Size</Heading>
        <div className="flex flex-wrap gap-1">
          {currentSizes.map((s) => <Badge key={s} size="2xsmall">{s}</Badge>)}
        </div>
      </div>
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <Label size="small" weight="plus">New size</Label>
            <Input value={size} placeholder="100 mg" onChange={(e) => onSize(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small" weight="plus">SKU</Label>
            <Input value={sku} placeholder="RETA-100MG" onChange={(e) => { setSku(e.target.value); setSkuTouched(true) }} />
          </div>
          <div className="flex flex-col gap-1">
            <Label size="small" weight="plus">Price (USD)</Label>
            <Input type="number" value={price} placeholder="600" onChange={(e) => setPrice(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button size="small" onClick={submit} isLoading={busy}>Add size</Button>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Creates the option value + variant, stocks it at the US Warehouse, and applies volume tiers (2–3 / 4–5 / 6+ → 5 / 10 / 15%).
          </Text>
        </div>
        {done && <Text size="small" className="text-ui-fg-interactive mt-3">{done} Reload to see it in Variants above.</Text>}
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductAddSizeWidget
