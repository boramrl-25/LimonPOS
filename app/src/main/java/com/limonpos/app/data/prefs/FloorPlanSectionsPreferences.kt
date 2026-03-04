package com.limonpos.app.data.prefs

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import org.json.JSONObject
import javax.inject.Inject

private val Context.floorPlanDataStore: DataStore<Preferences> by preferencesDataStore(name = "floor_plan")

/** Stores floor plan section filters (A,B,C,D,E) synced from web. */
class FloorPlanSectionsPreferences @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val SECTIONS_JSON = stringPreferencesKey("sections_json")
    }

    val sections: Flow<Map<String, List<Int>>> = context.floorPlanDataStore.data.map { prefs ->
        val json = prefs[Keys.SECTIONS_JSON] ?: return@map emptyMap<String, List<Int>>()
        parseSectionsJson(json)
    }

    suspend fun getSections(): Map<String, List<Int>> {
        val json = context.floorPlanDataStore.data.first()[Keys.SECTIONS_JSON] ?: return emptyMap()
        return parseSectionsJson(json)
    }

    suspend fun setSections(map: Map<String, List<Int>>) {
        context.floorPlanDataStore.edit { prefs ->
            prefs[Keys.SECTIONS_JSON] = toJson(map)
        }
    }

    private fun parseSectionsJson(json: String): Map<String, List<Int>> {
        return try {
            val obj = JSONObject(json)
            val out = mutableMapOf<String, List<Int>>()
            for (key in listOf("A", "B", "C", "D", "E")) {
                if (!obj.has(key)) continue
                val arr = obj.getJSONArray(key)
                out[key] = List(arr.length()) { i -> arr.getInt(i) }
            }
            out
        } catch (_: Exception) {
            emptyMap()
        }
    }

    private fun toJson(map: Map<String, List<Int>>): String {
        val obj = JSONObject()
        for ((k, v) in map) {
            obj.put(k, org.json.JSONArray(v))
        }
        return obj.toString()
    }
}
