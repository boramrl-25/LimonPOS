package com.limonpos.app

import android.app.ActivityManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.limonpos.app.ui.navigation.NavGraph
import com.limonpos.app.ui.theme.LimonPOSTheme
import com.limonpos.app.ui.theme.LimonBackground
import com.limonpos.app.data.repository.AuthRepository
import com.limonpos.app.data.repository.ApiSyncRepository
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    @Inject lateinit var authRepository: AuthRepository
    @Inject lateinit var apiSyncRepository: ApiSyncRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            setTaskDescription(ActivityManager.TaskDescription("Limon POS"))
        }
        setContent {
            LimonPOSTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = LimonBackground
                ) {
                    NavGraph(authRepository = authRepository, apiSyncRepository = apiSyncRepository)
                }
            }
        }
    }
}
