package com.limonpos.app.di

import android.content.Context
import androidx.room.Room
import com.limonpos.app.data.local.AppDatabase
import com.limonpos.app.data.local.MIGRATION_8_9
import com.limonpos.app.data.local.MIGRATION_9_10
import com.limonpos.app.data.local.MIGRATION_10_11
import com.limonpos.app.data.local.MIGRATION_11_12
import com.limonpos.app.data.local.MIGRATION_12_13
import com.limonpos.app.data.local.dao.*
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase =
        Room.databaseBuilder(context, AppDatabase::class.java, "limonpos.db")
            .addMigrations(MIGRATION_8_9, MIGRATION_9_10, MIGRATION_10_11, MIGRATION_11_12, MIGRATION_12_13)
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    @Singleton
    fun provideUserDao(db: AppDatabase): UserDao = db.userDao()

    @Provides
    @Singleton
    fun provideTableDao(db: AppDatabase): TableDao = db.tableDao()

    @Provides
    @Singleton
    fun provideCategoryDao(db: AppDatabase): CategoryDao = db.categoryDao()

    @Provides
    @Singleton
    fun provideProductDao(db: AppDatabase): ProductDao = db.productDao()

    @Provides
    @Singleton
    fun provideOrderDao(db: AppDatabase): OrderDao = db.orderDao()

    @Provides
    @Singleton
    fun provideOrderItemDao(db: AppDatabase): OrderItemDao = db.orderItemDao()

    @Provides
    @Singleton
    fun providePaymentDao(db: AppDatabase): PaymentDao = db.paymentDao()

    @Provides
    @Singleton
    fun providePrinterDao(db: AppDatabase): PrinterDao = db.printerDao()

    @Provides
    @Singleton
    fun provideSyncQueueDao(db: AppDatabase): SyncQueueDao = db.syncQueueDao()

    @Provides
    @Singleton
    fun provideModifierGroupDao(db: AppDatabase): ModifierGroupDao = db.modifierGroupDao()

    @Provides
    @Singleton
    fun provideModifierOptionDao(db: AppDatabase): ModifierOptionDao = db.modifierOptionDao()

    @Provides
    @Singleton
    fun provideTransferLogDao(db: AppDatabase): TransferLogDao = db.transferLogDao()

    @Provides
    @Singleton
    fun provideVoidLogDao(db: AppDatabase): VoidLogDao = db.voidLogDao()

    @Provides
    @Singleton
    fun provideVoidRequestDao(db: AppDatabase): VoidRequestDao = db.voidRequestDao()

    @Provides
    @Singleton
    fun provideClosedBillAccessRequestDao(db: AppDatabase): ClosedBillAccessRequestDao = db.closedBillAccessRequestDao()
}
