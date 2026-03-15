package com.limonpos.app.di

import com.google.gson.GsonBuilder
import com.limonpos.app.data.prefs.ServerPreferences
import com.limonpos.app.data.remote.ApiService
import com.limonpos.app.data.remote.LongOrIsoDateAdapter
import com.limonpos.app.data.remote.AuthInterceptor
import com.limonpos.app.data.remote.DeviceIdInterceptor
import com.limonpos.app.data.remote.FailoverInterceptor
import com.limonpos.app.data.remote.RetryInterceptor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(
        failoverInterceptor: FailoverInterceptor,
        deviceIdInterceptor: DeviceIdInterceptor,
        authInterceptor: AuthInterceptor,
        retryInterceptor: RetryInterceptor
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(failoverInterceptor)
        .addInterceptor(deviceIdInterceptor)
        .addInterceptor(retryInterceptor)
        .addInterceptor(authInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Provides
    @Singleton
    @LimonApi
    fun provideRetrofit(client: OkHttpClient, serverPreferences: ServerPreferences): Retrofit {
        val baseUrl = runBlocking { serverPreferences.getBaseUrl() }
        val builder = GsonBuilder().registerTypeAdapter(Long::class.javaObjectType, LongOrIsoDateAdapter)
        Long::class.javaPrimitiveType?.let { builder.registerTypeAdapter(it, LongOrIsoDateAdapter) }
        val gson = builder.create()
        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    @Provides
    @Singleton
    fun provideApiService(@LimonApi retrofit: Retrofit): ApiService = retrofit.create(ApiService::class.java)
}
