package com.limonpos.app.di

import com.limonpos.app.data.zoho.ZohoAuthInterceptor
import com.limonpos.app.data.zoho.ZohoBooksApi
import com.limonpos.app.data.zoho.ZohoBooksPreferences
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object ZohoBooksModule {

    private const val ZOHO_BASE_URL = "https://www.zohoapis.com/books/v3/"

    @Provides
    @Singleton
    @ZohoOkHttp
    fun provideZohoOkHttpClient(
        zohoAuthInterceptor: ZohoAuthInterceptor
    ): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(zohoAuthInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        })
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    @ZohoApi
    fun provideZohoRetrofit(@ZohoOkHttp client: OkHttpClient): Retrofit = Retrofit.Builder()
        .baseUrl(ZOHO_BASE_URL)
        .client(client)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    @Provides
    @Singleton
    fun provideZohoBooksApi(@ZohoApi retrofit: Retrofit): ZohoBooksApi =
        retrofit.create(ZohoBooksApi::class.java)
}
