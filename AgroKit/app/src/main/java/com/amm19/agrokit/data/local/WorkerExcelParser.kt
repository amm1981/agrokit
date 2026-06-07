package com.amm19.agrokit.data.local

import com.amm19.agrokit.domain.model.Worker
import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import java.io.InputStream
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WorkerExcelParser @Inject constructor() {

    fun parse(inputStream: InputStream): List<Worker> {
        inputStream.use { stream ->
            XSSFWorkbook(stream).use { workbook ->
                val sheet = workbook.getSheetAt(0)
                val workers = mutableListOf<Worker>()

                for (rowIndex in 1..sheet.lastRowNum) {
                    val row = sheet.getRow(rowIndex) ?: continue
                    val dni = row.getCellValue(0)
                    val fullName = row.getCellValue(1)
                    val area = row.getCellValue(2)
                    val costCenter = row.getCellValue(3)

                    if (dni.isBlank() || fullName.isBlank() || area.isBlank() || costCenter.isBlank()) {
                        continue
                    }

                    workers += Worker(
                        dni = dni,
                        fullName = fullName,
                        area = area,
                        costCenter = costCenter,
                        synced = false
                    )
                }

                return workers
            }
        }
    }

    private fun org.apache.poi.ss.usermodel.Row.getCellValue(index: Int): String {
        val cell = getCell(index) ?: return ""
        return when (cell.cellType) {
            CellType.STRING -> cell.stringCellValue.orEmpty()
            CellType.NUMERIC -> {
                val numeric = cell.numericCellValue
                if (numeric % 1.0 == 0.0) numeric.toLong().toString() else numeric.toString()
            }
            CellType.BOOLEAN -> cell.booleanCellValue.toString()
            CellType.FORMULA -> cell.toString()
            else -> ""
        }.trim()
    }
}
