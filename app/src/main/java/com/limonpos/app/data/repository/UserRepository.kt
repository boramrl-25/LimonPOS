package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.UserDao
import com.limonpos.app.data.local.entity.UserEntity
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class UserRepository @Inject constructor(
    private val userDao: UserDao
) {
    fun getAllUsers(): Flow<List<UserEntity>> = userDao.getAllUsers()
    suspend fun getUserById(id: String): UserEntity? = userDao.getUserById(id)
    suspend fun getUserByPin(pin: String): UserEntity? = userDao.getUserByPin(pin)

    suspend fun insertUser(user: UserEntity) = userDao.insertUser(user.copy(syncStatus = "PENDING"))
    suspend fun updateUser(user: UserEntity) = userDao.updateUser(user.copy(syncStatus = "PENDING"))
    suspend fun deleteUser(user: UserEntity) = userDao.deleteUser(user)
    suspend fun insertUsers(users: List<UserEntity>) = userDao.insertUsers(users)
}
