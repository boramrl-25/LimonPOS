package com.limonpos.app.data.local.dao

import androidx.room.*
import com.limonpos.app.data.local.entity.ProductEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ProductDao {
    @Query("SELECT * FROM products WHERE active = 1 ORDER BY categoryId, name")
    fun getActiveProducts(): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products WHERE categoryId = :categoryId AND active = 1 ORDER BY name")
    fun getProductsByCategory(categoryId: String): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products WHERE categoryId = :categoryId ORDER BY name")
    fun getProductsByCategoryAll(categoryId: String): Flow<List<ProductEntity>>

    /** Products shown in till - must be active and showInTill (pos_enabled from web) */
    @Query("SELECT * FROM products WHERE active = 1 AND showInTill = 1 ORDER BY categoryId, name")
    fun getProductsForTill(): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products WHERE categoryId = :categoryId AND active = 1 AND showInTill = 1 ORDER BY name")
    fun getProductsForTillByCategory(categoryId: String): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products WHERE categoryId = :categoryId AND active = 1 AND showInTill = 1 ORDER BY name")
    suspend fun getProductsForTillByCategoryOnce(categoryId: String): List<ProductEntity>

    /** Active products in category for order screen (no showInTill filter so sync’d products always show). */
    @Query("SELECT * FROM products WHERE categoryId = :categoryId AND active = 1 ORDER BY name")
    suspend fun getActiveProductsByCategoryOnce(categoryId: String): List<ProductEntity>

    @Query("SELECT * FROM products WHERE active = 1 AND showInTill = 1 ORDER BY categoryId, name")
    suspend fun getProductsForTillOnce(): List<ProductEntity>

    @Query("SELECT * FROM products ORDER BY categoryId, name")
    fun getAllProducts(): Flow<List<ProductEntity>>

    @Query("SELECT * FROM products ORDER BY categoryId, name")
    suspend fun getAllProductsOnce(): List<ProductEntity>

    @Query("SELECT * FROM products WHERE categoryId = :categoryId ORDER BY name")
    suspend fun getProductsByCategoryOnce(categoryId: String): List<ProductEntity>

    @Query("SELECT * FROM products WHERE id = :id")
    suspend fun getProductById(id: String): ProductEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProduct(product: ProductEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProducts(products: List<ProductEntity>)

    @Update
    suspend fun updateProduct(product: ProductEntity)

    @Delete
    suspend fun deleteProduct(product: ProductEntity)

    @Query("SELECT COUNT(*) FROM products")
    suspend fun getProductCount(): Int

    @Query("SELECT * FROM products WHERE syncStatus = 'PENDING'")
    suspend fun getPendingProducts(): List<ProductEntity>

    @Query("DELETE FROM products")
    suspend fun deleteAll()
}
