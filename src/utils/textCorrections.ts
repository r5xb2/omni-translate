const REPLACEMENTS: Array<[string, string]> = [
  ['modem', 'Markdown'],
  ['Modem', 'Markdown'],
  ['馬當', 'Markdown'],
  ['馬档', 'Markdown'],
  ['供單', '工單'],
  ['技術在', '技術債'],
  ['後目錄', '家目錄'],
  ['加目錄', '家目錄'],
  ['掌聲呢各位', '掌聲呢，各位'],
  ['CheckGPT', 'ChatGPT'],
  ['ChatGBT', 'ChatGPT'],
  ['GPD 5', 'GPT-5'],
  ['GPD 4', 'GPT-4'],
  ['擬核', '擬合'],
  ['韓式庫', '函式庫'],
]

export function applyTerminologyCorrections(text: string): string {
  let normalized = text
  for (const [from, to] of REPLACEMENTS) {
    normalized = normalized.split(from).join(to)
  }
  return normalized.replace(/\s+/g, ' ').trim()
}
