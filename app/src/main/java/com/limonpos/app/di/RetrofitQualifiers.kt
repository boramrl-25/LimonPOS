package com.limonpos.app.di

import javax.inject.Qualifier

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class LimonApi

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ZohoApi

@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class ZohoOkHttp
