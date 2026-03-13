package com.limonpos.app.data.repository

import com.limonpos.app.data.local.dao.UserDao
import com.limonpos.app.data.local.entity.UserEntity
import com.limonpos.app.data.remote.ApiService
import com.limonpos.app.data.remote.AuthTokenProvider
import com.google.gson.Gson
import com.limonpos.app.data.remote.dto.CashDrawerVerifyRequest
import com.limonpos.app.data.remote.dto.LoginRequest
import com.limonpos.app.data.remote.dto.UserDto
import com.limonpos.app.util.SessionManager
import com.limonpos.app.data.printer.PrinterWarningHolder
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
    private val authTokenProvider: AuthTokenProvider,
    private val printerWarningHolder: PrinterWarningHolder
) {
    private val _loginScreenKey = MutableStateFlow(0)
    val loginScreenKey: Flow<Int> = _loginScreenKey

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun isLoggedIn(): Flow<Boolean> = sessionManager.isLoggedIn

    suspend fun login(pin: String): Result<UserEntity> {
        // 1234 maintenance PIN - asla session açma; LoginViewModel 1234'ü yakalar, buraya gelmez
        if (pin == "1234") {
            return Result.failure(Exception("Use Server URL to configure API"))
        }
        // Önce API ile dene — Web'de On olan kullanıcılar sync beklemeden giriş yapabilsin
        try {
            val response = apiService.login(LoginRequest(pin = pin))
            if (response.isSuccessful) {
                val body = response.body()
                val dto = body?.user
                if (dto != null) {
                    val entity = userDtoToEntity(dto)
                    userDao.insertUser(entity)
                    val cashDrawerPermission = dto.role == "admin" || dto.role == "manager" || (dto.cashDrawerPermission == true)
                    val canAccessSettings = dto.canAccessSettings ?: (dto.role in listOf("admin", "manager", "kds"))
                    sessionManager.login(entity.id, entity.name, entity.role, entity.pin, cashDrawerPermission, canAccessSettings)
                    authTokenProvider.setToken(body.token ?: entity.pin)
                    return Result.success(entity)
                }
            }
        } catch (_: Exception) { /* offline veya hata — local DB'ye düş */ }
        // Fallback: local DB (sync ile güncellenmiş veya seed)
        val user = userDao.getUserByPin(pin) ?: return Result.failure(Exception("Invalid PIN"))
        val cashDrawerPermission = user.role == "admin" || user.role == "manager" || user.cashDrawerPermission
        val canAccessSettings = user.role in listOf("admin", "manager", "kds")
        sessionManager.login(user.id, user.name, user.role, user.pin, cashDrawerPermission, canAccessSettings)
        authTokenProvider.setToken(user.pin)
        scope.launch {
            try {
                val response = apiService.login(LoginRequest(pin = pin))
                if (response.isSuccessful) response.body()?.token?.let { authTokenProvider.setToken(it) }
            } catch (_: Exception) { }
        }
        return Result.success(user)
    }

    private fun userDtoToEntity(dto: UserDto): UserEntity {
        val isActive = when (dto.active) {
            is Boolean -> dto.active
            is Number -> (dto.active as Number).toInt() != 0
            else -> true
        }
        return UserEntity(
            id = dto.id,
            name = dto.name,
            pin = dto.pin,
            role = dto.role,
            active = isActive,
            permissions = Gson().toJson(dto.permissions ?: emptyList<String>()),
            cashDrawerPermission = dto.cashDrawerPermission ?: (dto.role == "cashier" || dto.role == "admin"),
            syncStatus = "SYNCED"
        )
    }

    suspend fun verifyPin(pin: String): Result<Boolean> {
        val storedPin = sessionManager.getUserPin() ?: return Result.failure(Exception("Not logged in"))
        return if (storedPin == pin) Result.success(true) else Result.failure(Exception("Invalid PIN"))
    }

    suspend fun verifyCashDrawer(pin: String): Result<Boolean> {
        val user = userDao.getUserByPin(pin) ?: return Result.failure(Exception("Invalid PIN"))
        val hasPermission = user.role == "admin" || user.role == "manager" || user.cashDrawerPermission
        if (!hasPermission) return Result.failure(Exception("No cash drawer permission"))
        scope.launch {
            try {
                apiService.verifyCashDrawer(CashDrawerVerifyRequest(pin = pin))
                // Backend logs who opened (user matched by PIN) and when
            } catch (_: Exception) { /* offline – drawer still opens locally */ }
        }
        return Result.success(true)
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

    /** Full logout: backend sign-out (shift out) + clear local session. Use for "End of shift". */
    suspend fun logout() {
        try {
            apiService.logout()
        } catch (_: Exception) { }
        clearSessionAndBumpKey()
    }

    /** Local-only logout: leave app without calling backend. Use for "Logout" (no shift-out recorded). */
    suspend fun logoutLocalOnly() {
        clearSessionAndBumpKey()
    }

    private suspend fun clearSessionAndBumpKey() {
        printerWarningHolder.clear()
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

    /** True if current user can approve void requests (supervisor only; KDS removed). */
    fun canAccessVoidApprovals(): Flow<Boolean> = sessionManager.currentUserId
        .flatMapLatest { userId ->
            if (userId == null) flowOf(null)
            else userDao.getUserByIdFlow(userId)
        }
        .map { user -> user?.role in listOf("admin", "manager", "supervisor") }

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

    /** True if current user can view all orders/tables (not just their own). */
    suspend fun hasViewAllOrders(): Boolean {
        val user = getCurrentUser() ?: return false
        return user.toUserPermissions().viewAllOrders
    }

    /** True if current user can access Settings screen (admin, manager, or can_access_settings). */
    fun canAccessSettingsFlow(): Flow<Boolean> = sessionManager.getCanAccessSettingsFlow()

    fun hasViewAllOrdersFlow(): Flow<Boolean> = sessionManager.currentUserId
        .flatMapLatest { userId ->
            if (userId == null) flowOf<UserEntity?>(null)
            else userDao.getUserByIdFlow(userId)
        }
        .map { user -> user?.toUserPermissions()?.viewAllOrders ?: false }
}
