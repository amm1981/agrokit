import writeXlsxFile, { type SheetData, type SheetOptions } from 'write-excel-file/browser'

type BrowserFileContent = File | Blob | ArrayBuffer

export async function downloadSheet(sheetData: SheetData, fileName: string, options: SheetOptions<BrowserFileContent> = {}) {
  await writeXlsxFile(sheetData, options).toFile(fileName)
}
