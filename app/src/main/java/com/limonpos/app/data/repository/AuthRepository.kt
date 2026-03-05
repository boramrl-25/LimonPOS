package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.UserDao
import com.limonpos.app.data.local.entity.UserEntity
import com.limonpos.app.data.remote.ApiService
import com.limonpos.app.data.remote.AuthTokenProvider
import com.limonpos.app.data.remote.dto.LoginRequest
import com.limonpos.app.util.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import com.limonpos.app.util.toUserPermissions
import javax.inject.Inject

class AuthRepository @Inject constructor(
    private val userDao: UserDao,
    private val sessionManager: SessionManager,
    private val apiService: ApiService,
    private val authTokenProvider: AuthTokenProvider
) {
    private val _loginScreenKey = MutableStateFlow(0)
    val loginScreenKey: Flow<Int> = _loginScreenKey

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun isLoggedIn(): Flow<Boolean> = sessionManager.isLoggedIn

    suspend fun login(pin: String): Result<UserEntity> {
        val user = userDao.getUserByPin(pin) ?: return Result.failure(Exception("Invalid PIN"))
        val cashDrawerPermission = user.role == "admin" || user.role == "manager" || user.cashDrawerPermission
        sessionManager.login(user.id, user.name, user.role, user.pin, cashDrawerPermission)
        // Backend accepts user.id or user.pin as token; use pin for compatibility (app/backend user IDs may differ)
        authTokenProvider.setToken(user.pin)
        scope.launch {
            try {
                val response = apiService.login(LoginRequest(pin = pin))
                if (response.isSuccessful) {
                    response.body()?.token?.let { authTokenProvider.setToken(it) }
                }
            } catch (_: Exception) { /* offline – token already set above */ }
        }
        return Result.success(user)
    }

    suspend fun verifyPin(pin: String): Result<Boolean> {
        val storedPin = sessionManager.getUserPin() ?: return Result.failure(Exception("Not logged in"))
        return if (storedPin == pin) Result.success(true) else Result.failure(Exception("Invalid PIN"))
    }

    suspend fun verifyCashDrawer(pin: String): Result<Boolean> {
        val user = userDao.getUserByPin(pin)
        return if (user != null) {
            val hasPermission = user.role == "admin" || user.role == "manager" || user.cashDrawerPermission
            if (hasPermission) Result.success(true)
            else Result.failure(Exception("No cash drawer permission"))
        } else {
            Result.failure(Exception("Invalid PIN"))
        }
    }

    /** Verify PIN belongs to user with post_void permission (admin, manager, or post_void role). */
    suspend fun verifyPostVoidPin(pin: String): Result<Boolean> {
        val user = userDao.getUserByPin(pin)
        return if (user != null) {
            val perms = user.toUserPermissions()
            if (perms.postVoid) Result.success(true)
            else Result.failure(Exception("No post-void permission"))
        } else {
            Result.failure(Exception("Invalid PIN"))
        }
    }

    suspend fun logout() {
        authTokenProvider.setToken(null)
        sessionManager.logout()
        _loginScreenKey.value = _loginScreenKey.value + 1
    }

    fun getCurrentUserId(): Flow<String?> = sessionManager.getUserIdFlow()

    suspend fun getCurrentUserIdSync(): String? = sessionManager.getUserId()

    suspend fun getCurrentUserNameSync(): String? = sessionManager.getUserName()
    fun getCurrentUserName(): Flow<String?> = sessionManager.getUserNameFlow()
    fun getCurrentUserRole(): Flow<String?> = sessionManager.getUserRoleFlow()
    fun hasCashDrawerPermission(): Flow<Boolean> = sessionManager.getCashDrawerPermissionFlow()

    /** True if current user has permission to access Kitchen Display (KDS) screen. */
    fun canAccessKds(): Flow<Boolean> = sessionManager.currentUserId
        .flatMapLatest { userId ->
            if (userId == null) flowOf(null)
            else userDao.getUserByIdFlow(userId)
        }
        .map { user -> user?.toUserPermissions()?.kdsModeAccess ?: false }

    /** Current user entity or null if not logged in. */
    suspend fun getCurrentUser(): UserEntity? {
        val userId = sessionManager.getUserId() ?: return null
        return userDao.getUserById(userId)
    }

    /** True if current user has supervisor role (admin, manager, supervisor). */
    suspend fun isSupervisorRole(): Boolean {
        val user = getCurrentUser() ?: return false
        return user.role in listOf("admin", "manager", "supervisor")
    }

    /** True if current user has KDS access (kds_mode or manager/admin). */
    suspend fun hasKdsAccess(): Boolean {
        val user = getCurrentUser() ?: return false
        return user.toUserPermissions().kdsModeAccess
    }

    /** True if current user can access closed bills without approval (and can approve others' requests). */
    suspend fun hasClosedBillAccess(): Boolean {
        val user = getCurrentUser() ?: return false
        return user.toUserPermissions().closedBillAccess
    }
}
