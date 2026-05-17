export interface RecordTemplateDefinition {
  id: string
  name: string
  content: string
}

export const RecordTemplateService = {
  async list(): Promise<RecordTemplateDefinition[]> {
    const res = await fetch('/record-templates')
    if (!res.ok) {
      throw new Error(`載入模板失敗：HTTP ${res.status}`)
    }

    const data = await res.json() as { templates?: RecordTemplateDefinition[] }
    return data.templates ?? []
  },
}
