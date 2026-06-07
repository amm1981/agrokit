package com.amm19.agrokit.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "workers",
    indices = [Index(value = ["synced"])]
)
data class WorkerEntity(
    @PrimaryKey val dni: String,
    val fullName: String,
    val area: String,
    val costCenter: String,
    val sectorId: String,
    val sectorName: String,
    val eventId: String,
    val synced: Boolean
)
