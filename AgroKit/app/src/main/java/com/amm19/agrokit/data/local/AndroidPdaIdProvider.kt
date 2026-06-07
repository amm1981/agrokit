package com.amm19.agrokit.data.local

import android.content.Context
import android.provider.Settings
import com.amm19.agrokit.domain.usecase.PdaIdProvider
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AndroidPdaIdProvider @Inject constructor(
    @ApplicationContext private val context: Context
) : PdaIdProvider {
    override fun getPdaId(): String {
        val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
        return if (androidId.isNullOrBlank()) "UNKNOWN_PDA" else "PDA_$androidId"
    }
}
