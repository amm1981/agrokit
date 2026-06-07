package com.amm19.agrokit.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.amm19.agrokit.data.local.dao.DeliveryDao
import com.amm19.agrokit.data.local.dao.KitDao
import com.amm19.agrokit.data.local.dao.WorkerDao
import com.amm19.agrokit.data.local.entity.DeliveryEntity
import com.amm19.agrokit.data.local.entity.KitEntity
import com.amm19.agrokit.data.local.entity.WorkerEntity

@Database(
    entities = [
        WorkerEntity::class,
        KitEntity::class,
        DeliveryEntity::class
    ],
    version = 7,
    exportSchema = false
)
abstract class AgroKitDatabase : RoomDatabase() {
    abstract fun workerDao(): WorkerDao
    abstract fun kitDao(): KitDao
    abstract fun deliveryDao(): DeliveryDao
}
