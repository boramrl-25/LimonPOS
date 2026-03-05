package com.limonpos.app.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.limonpos.app.data.local.dao.*
import com.limonpos.app.data.local.entity.*

val MIGRATION_8_9 = object : Migration(8, 9) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE order_items ADD COLUMN deliveredAt INTEGER NULL")
    }
}

val MIGRATION_9_10 = object : Migration(9, 10) {
    override fun migrate(db: SupportSQLiteDatabase) {
        // New column to control whether category appears on Till screen.
        db.execSQL("ALTER TABLE categories ADD COLUMN showTill INTEGER NOT NULL DEFAULT 1")
    }
}

val MIGRATION_10_11 = object : Migration(10, 11) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS closed_bill_access_requests (" +
                "id TEXT PRIMARY KEY NOT NULL, " +
                "requestedByUserId TEXT NOT NULL, " +
                "requestedByUserName TEXT NOT NULL, " +
                "requestedAt INTEGER NOT NULL, " +
                "status TEXT NOT NULL, " +
                "approvedByUserId TEXT, " +
                "approvedByUserName TEXT, " +
                "approvedAt INTEGER, " +
                "expiresAt INTEGER)" 
        )
    }
}

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
        VoidRequestEntity::class,
        ClosedBillAccessRequestEntity::class
    ],
    version = 11,
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
    abstract fun closedBillAccessRequestDao(): ClosedBillAccessRequestDao
}
