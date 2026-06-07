package com.amm19.agrokit.data.local.mapper

import com.amm19.agrokit.data.local.entity.DeliveryEntity
import com.amm19.agrokit.data.local.entity.KitEntity
import com.amm19.agrokit.data.local.entity.WorkerEntity
import com.amm19.agrokit.domain.model.Delivery
import com.amm19.agrokit.domain.model.DeliveryProduct
import com.amm19.agrokit.domain.model.Kit
import com.amm19.agrokit.domain.model.KitProduct
import com.amm19.agrokit.domain.model.Worker
import org.json.JSONArray
import org.json.JSONObject

private const val KIT_IDS_SEPARATOR = "|"

fun WorkerEntity.toDomain(): Worker = Worker(
    dni = dni,
    fullName = fullName,
    area = area,
    costCenter = costCenter,
    sectorId = sectorId,
    sectorName = sectorName,
    eventId = eventId,
    synced = synced
)

fun Worker.toEntity(): WorkerEntity = WorkerEntity(
    dni = dni,
    fullName = fullName,
    area = area,
    costCenter = costCenter,
    sectorId = sectorId,
    sectorName = sectorName,
    eventId = eventId,
    synced = synced
)

fun KitEntity.toDomain(): Kit = Kit(
    id = id,
    name = name,
    eventId = eventId,
    products = parseKitProducts(productsJson),
    synced = synced
)

fun Kit.toEntity(): KitEntity = KitEntity(
    id = id,
    name = name,
    eventId = eventId,
    productsJson = JSONArray(
        products.map { product ->
            JSONObject().apply {
                put("id", product.id)
                put("name", product.name)
                put("quantity", product.quantity)
            }
        }
    ).toString(),
    synced = synced
)

fun DeliveryEntity.toDomain(): Delivery = Delivery(
    id = id,
    workerDni = workerDni,
    products = parseDeliveryProducts(productItemsJson)
        .ifEmpty {
            parseKitIds(kitIdsJson).map { kitId ->
                DeliveryProduct(
                    kitId = kitId,
                    productId = kitId,
                    productName = kitId,
                    quantity = 1.0
                )
            }
        },
    timestamp = timestamp,
    photoPath = photoPath,
    pdaId = pdaId,
    userEmail = userEmail,
    eventId = eventId,
    sectorId = sectorId,
    synced = synced
)

fun Delivery.toEntity(): DeliveryEntity = DeliveryEntity(
    id = id,
    workerDni = workerDni,
    kitIdsJson = JSONArray(kitIds).toString(),
    productItemsJson = JSONArray(
        products
            .groupBy { "${it.kitId.trim()}__${it.productId.trim()}" }
            .values
            .mapNotNull { sameProduct ->
                val first = sameProduct.firstOrNull() ?: return@mapNotNull null
                val productId = first.productId.trim()
                if (productId.isBlank()) return@mapNotNull null
                val kitId = first.kitId.trim()
                val quantity = sameProduct.sumOf { it.quantity }.coerceAtLeast(0.0)
                if (quantity <= 0.000001) return@mapNotNull null
                JSONObject().apply {
                    put("kitId", kitId)
                    put("productId", productId)
                    put("productName", first.productName.ifBlank { productId })
                    put("quantity", quantity)
                }
            }
    ).toString(),
    timestamp = timestamp,
    photoPath = photoPath,
    pdaId = pdaId,
    userEmail = userEmail,
    eventId = eventId,
    sectorId = sectorId,
    synced = synced
)

private fun parseKitProducts(raw: String): List<KitProduct> {
    if (raw.isBlank()) return emptyList()
    return runCatching {
        val json = JSONArray(raw)
        buildList {
            for (index in 0 until json.length()) {
                val obj = json.optJSONObject(index) ?: continue
                val id = obj.optString("id").trim()
                val name = obj.optString("name").trim()
                val quantity = obj.optDouble("quantity", 1.0)
                if (id.isBlank() || name.isBlank()) continue
                add(
                    KitProduct(
                        id = id,
                        name = name,
                        quantity = if (quantity > 0) quantity else 1.0
                    )
                )
            }
        }
    }.getOrElse { emptyList() }
}

private fun parseKitIds(raw: String): List<String> {
    if (raw.isBlank()) return emptyList()

    val json = runCatching {
        val array = JSONArray(raw)
        buildList {
            for (index in 0 until array.length()) {
                val value = array.optString(index).trim()
                if (value.isNotBlank()) add(value)
            }
        }
    }.getOrNull()

    if (json != null) return json

    return raw.split(KIT_IDS_SEPARATOR)
        .map { it.trim() }
        .filter { it.isNotBlank() }
}

private fun parseDeliveryProducts(raw: String): List<DeliveryProduct> {
    if (raw.isBlank()) return emptyList()
    return runCatching {
        val json = JSONArray(raw)
        buildList {
            for (index in 0 until json.length()) {
                val obj = json.optJSONObject(index) ?: continue
                val productId = obj.optString("productId", obj.optString("productCode")).trim()
                val productName = obj.optString("productName", obj.optString("name")).trim()
                val kitId = obj.optString("kitId", obj.optString("kitCode")).trim()
                val quantity = obj.optDouble("quantity", 0.0)
                if (productId.isBlank() || quantity <= 0.000001) continue
                add(
                    DeliveryProduct(
                        kitId = kitId,
                        productId = productId,
                        productName = productName.ifBlank { productId },
                        quantity = quantity
                    )
                )
            }
        }
    }.getOrElse { emptyList() }
}
