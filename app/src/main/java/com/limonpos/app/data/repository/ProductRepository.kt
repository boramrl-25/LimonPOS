package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.CategoryDao
import com.limonpos.app.data.local.dao.ProductDao
import com.limonpos.app.data.local.entity.CategoryEntity
import com.limonpos.app.data.local.entity.ProductEntity
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
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
    /** Products shown in till/order screen - only active and showInTill (pos_enabled from web). Filter in Kotlin to avoid Room/SQL boolean issues. */
    fun getProductsForOrder(categoryId: String): Flow<List<ProductEntity>> =
        if (categoryId == "all") productDao.getActiveProducts().map { it.filter { p -> p.showInTill } }
        else productDao.getProductsByCategory(categoryId).map { it.filter { p -> p.showInTill } }

    suspend fun getProductsForOrderOnce(categoryId: String): List<ProductEntity> =
        if (categoryId == "all") productDao.getActiveProducts().first().filter { it.showInTill }
        else productDao.getActiveProductsByCategoryOnce(categoryId).filter { it.showInTill }

    /** All categories (excluding "all") with their products for order screen. Only categories with showTill=true. Products must have showInTill=true (pos_enabled). Filter in Kotlin. */
    suspend fun getCategoriesWithProductsForOrder(): List<Pair<CategoryEntity, List<ProductEntity>>> {
        val categories = categoryDao.getActiveCategories().first()
            .filter { it.id != "all" && it.showTill }
            .sortedBy { it.sortOrder }
        val withProducts = categories.map { cat ->
            cat to productDao.getActiveProductsByCategoryOnce(cat.id).filter { it.showInTill }
        }.filter { (_, products) -> products.isNotEmpty() }
        val otherProducts = productDao.getActiveProductsByCategoryOnce("all").filter { it.showInTill }
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
