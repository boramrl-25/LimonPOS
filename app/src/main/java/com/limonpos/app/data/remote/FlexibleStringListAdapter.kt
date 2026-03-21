package com.limonpos.app.data.remote

import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.JsonParseException
import com.google.gson.JsonParser
import java.lang.reflect.Type

/**
 * Delta/full sync: backend bazen `printers` / `modifier_groups` alanını JSON dizisi yerine
 * string (ör. `"[]"` veya serileştirilmiş dizi) olarak döndürüyor.
 */
object FlexibleStringListAdapter : JsonDeserializer<List<String>?> {
    override fun deserialize(json: JsonElement, typeOfT: Type, context: JsonDeserializationContext): List<String>? {
        if (json.isJsonNull) return null
        if (json.isJsonArray) {
            return json.asJsonArray.mapNotNull { el ->
                when {
                    el.isJsonNull -> null
                    el.isJsonPrimitive -> el.asString
                    else -> el.toString()
                }
            }
        }
        if (json.isJsonPrimitive && json.asJsonPrimitive.isString) {
            val s = json.asString.trim()
            if (s.isEmpty()) return emptyList()
            return try {
                val inner: JsonElement = JsonParser().parse(s)
                if (inner.isJsonArray) {
                    inner.asJsonArray.mapNotNull { el ->
                        when {
                            el.isJsonNull -> null
                            el.isJsonPrimitive && el.asJsonPrimitive.isString -> el.asString
                            el.isJsonPrimitive -> el.asString
                            else -> null
                        }
                    }
                } else {
                    listOf(s)
                }
            } catch (_: JsonParseException) {
                listOf(s)
            }
        }
        return null
    }
}
