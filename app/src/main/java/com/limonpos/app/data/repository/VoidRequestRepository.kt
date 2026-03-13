package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.VoidRequestDao
import com.limonpos.app.data.local.entity.VoidRequestEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class VoidRequestRepository @Inject constructor(
    private val voidRequestDao: VoidRequestDao,
    private val apiSyncRepository: ApiSyncRepository
) {
    fun getPendingRequests(): Flow<List<VoidRequestEntity>> =
        voidRequestDao.getPendingRequests()

    suspend fun createRequest(
        orderId: String,
        orderItemId: String,
        productName: String,
        quantity: Int,
        price: Double,
        tableNumber: String,
        requestedByUserId: String,
        requestedByUserName: String
    ) {
        val entity = VoidRequestEntity(
            orderId = orderId,
            orderItemId = orderItemId,
            productName = productName,
            quantity = quantity,
            price = price,
            tableNumber = tableNumber,
            requestedByUserId = requestedByUserId,
            requestedByUserName = requestedByUserName
        )
        voidRequestDao.insert(entity)
        apiSyncRepository.pushVoidRequest(entity)
    }

    suspend fun getById(id: String): VoidRequestEntity? =
        voidRequestDao.getById(id)

    suspend fun updateRequest(request: VoidRequestEntity) {
        voidRequestDao.update(request)
    }

    suspend fun deleteRequest(id: String) {
        voidRequestDao.deleteById(id)
    }
}
