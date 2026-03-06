package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.CategoryDao
import com.limonpos.app.data.local.dao.ProductDao
import com.limonpos.app.data.local.entity.CategoryEntity
import com.limonpos.app.data.local.entity.ProductEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import javax.inject.Inject

class ProductRepository @Inject constructor(
    private val categoryDao: CategoryDao,
    private val productDao: ProductDao
) {
    fun getActiveCategories(): Flow<List<CategoryEntity>> = categoryDao.getActiveCategories()
    fun getAllCategories(): Flow<List<CategoryEntity>> = categoryDao.getAllCategories()
    fun getProductsByCategory(categoryId: String): Flow<List<ProductEntity>> = productDao.getProductsByCategory(categoryId)
    fun getAllProducts(): Flow<List<ProductEntity>> = productDao.getActiveProducts()
    fun getAllProductsForManagement(): Flow<List<ProductEntity>> = productDao.getAllProducts()
    /** Products shown in till/order screen - only active and showInTill (pos_enabled from web) */
    fun getProductsForOrder(categoryId: String): Flow<List<ProductEntity>> =
        if (categoryId == "all") productDao.getProductsForTill() else productDao.getProductsForTillByCategory(categoryId)

    suspend fun getProductsForOrderOnce(categoryId: String): List<ProductEntity> =
        if (categoryId == "all") productDao.getProductsForTillOnce() else productDao.getProductsForTillByCategoryOnce(categoryId)

    /** All categories (excluding "all") with their products for order screen. Only categories with showTill=true. Products must have showInTill=true (pos_enabled). Categories sorted by sortOrder; products by name. Includes "Other" for products with categoryId "all". */
    suspend fun getCategoriesWithProductsForOrder(): List<Pair<CategoryEntity, List<ProductEntity>>> {
        val categories = categoryDao.getActiveCategories().first()
            .filter { it.id != "all" && it.showTill }
            .sortedBy { it.sortOrder }
        val withProducts = categories.map { cat ->
            cat to productDao.getProductsForTillByCategoryOnce(cat.id)
        }.filter { (_, products) -> products.isNotEmpty() }
        val otherProducts = productDao.getProductsForTillByCategoryOnce("all")
        return if (otherProducts.isEmpty()) withProducts
        else withProducts + (CategoryEntity("all", "Diğer", "#64748b", 999, true, true, "SYNCED", "[]") to otherProducts)
    }

    suspend fun getCategoryById(id: String): CategoryEntity? = categoryDao.getCategoryById(id)
    suspend fun getProductById(id: String): ProductEntity? = productDao.getProductById(id)

    suspend fun insertCategory(category: CategoryEntity) = categoryDao.insertCategory(category)
    suspend fun insertProduct(product: ProductEntity) = productDao.insertProduct(product)
    suspend fun updateCategory(category: CategoryEntity) = categoryDao.updateCategory(category.copy(syncStatus = "PENDING"))
    suspend fun updateProduct(product: ProductEntity) = productDao.updateProduct(product.copy(syncStatus = "PENDING"))
    suspend fun deleteCategory(category: CategoryEntity) = categoryDao.deleteCategory(category)
    suspend fun deleteProduct(product: ProductEntity) = productDao.deleteProduct(product)

    suspend fun insertCategories(categories: List<CategoryEntity>) = categoryDao.insertCategories(categories)
    suspend fun insertProducts(products: List<ProductEntity>) = productDao.insertProducts(products)
}
