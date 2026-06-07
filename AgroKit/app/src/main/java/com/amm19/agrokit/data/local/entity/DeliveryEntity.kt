package com.amm19.agrokit.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "deliveries",
    indices = [
        Index(value = ["workerDni"]),
        Index(value = ["synced"])
    ]
)
data class DeliveryEntity(
    @PrimaryKey val id: String,
    val workerDni: String,
    val kitIdsJson: String,
    val productItemsJson: String,
    val timestamp: Long,
    val photoPath: String,
    val pdaId: String,
    val userEmail: String,
    val eventId: String,
    val sectorId: String,
    val synced: Boolean
)
