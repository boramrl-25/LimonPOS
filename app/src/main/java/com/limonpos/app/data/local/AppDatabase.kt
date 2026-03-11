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

val MIGRATION_11_12 = object : Migration(11, 12) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE tables ADD COLUMN reservationGuestName TEXT NULL")
        db.execSQL("ALTER TABLE tables ADD COLUMN reservationFrom INTEGER NULL")
        db.execSQL("ALTER TABLE tables ADD COLUMN reservationTo INTEGER NULL")
    }
}

val MIGRATION_12_13 = object : Migration(12, 13) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE tables ADD COLUMN reservationGuestPhone TEXT NULL")
    }
}

val MIGRATION_13_14 = object : Migration(13, 14) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE categories ADD COLUMN overdueUndeliveredMinutes INTEGER NULL")
        db.execSQL("ALTER TABLE products ADD COLUMN overdueUndeliveredMinutes INTEGER NULL")
    }
}

val MIGRATION_14_15 = object : Migration(14, 15) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS applied_client_actions (id TEXT PRIMARY KEY NOT NULL)"
        )
    }
}

val MIGRATION_15_16 = object : Migration(15, 16) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE order_items ADD COLUMN clientLineId TEXT NULL")
        db.execSQL("CREATE INDEX IF NOT EXISTS index_order_items_orderId_clientLineId ON order_items(orderId, clientLineId)")
    }
}

val MIGRATION_17_18 = object : Migration(17, 18) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE printers ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1")
    }
}

val MIGRATION_18_19 = object : Migration(18, 19) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE tables ADD COLUMN isOrphaned INTEGER NOT NULL DEFAULT 0")
    }
}

val MIGRATION_16_17 = object : Migration(16, 17) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE IF NOT EXISTS pending_order_item_deletes (" +
                "id TEXT PRIMARY KEY NOT NULL, " +
                "orderId TEXT NOT NULL, " +
                "apiItemId TEXT NOT NULL, " +
                "createdAt INTEGER NOT NULL)"
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
        ClosedBillAccessRequestEntity::class,
        AppliedClientActionEntity::class,
        PendingOrderItemDeleteEntity::class
    ],
    version = 19,
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
    abstract fun appliedClientActionDao(): AppliedClientActionDao
    abstract fun pendingOrderItemDeleteDao(): PendingOrderItemDeleteDao
}
