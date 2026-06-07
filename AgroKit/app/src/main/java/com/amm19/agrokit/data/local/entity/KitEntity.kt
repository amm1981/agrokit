package com.amm19.agrokit.data.local.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "kits",
    indices = [Index(value = ["synced"])]
)
data class KitEntity(
    @PrimaryKey val id: String,
    val name: String,
    val eventId: String,
    val productsJson: String,
    val synced: Boolean
)
