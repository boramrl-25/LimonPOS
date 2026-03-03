package com.limonpos.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.limonpos.app.data.local.dao.*
import com.limonpos.app.data.local.entity.*

@Database(
    entities = [
        TableEntity::class,
        CategoryEntity::class,
        ProductEntity::class,
        OrderEntity::class,
        OrderItemEntity::class,
        PaymentEntity::class,
        PrinterEntity::class,
        SyncQueueEntity::class,
        ModifierGroupEntity::class,
        ModifierOptionEntity::class,
        TransferLog::class,
        VoidLogEntity::class,
        UserEntity::class,
        VoidRequestEntity::class
    ],
    version = 8,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun tableDao(): TableDao
    abstract fun categoryDao(): CategoryDao
    abstract fun productDao(): ProductDao
    abstract fun orderDao(): OrderDao
    abstract fun orderItemDao(): OrderItemDao
    abstract fun paymentDao(): PaymentDao
    abstract fun printerDao(): PrinterDao
    abstract fun syncQueueDao(): SyncQueueDao
    abstract fun modifierGroupDao(): ModifierGroupDao
    abstract fun modifierOptionDao(): ModifierOptionDao
    abstract fun transferLogDao(): TransferLogDao
    abstract fun voidLogDao(): VoidLogDao
    abstract fun userDao(): UserDao
    abstract fun voidRequestDao(): VoidRequestDao
}
