package com.limonpos.app.data.remote

import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import com.google.gson.JsonParseException
import com.google.gson.JsonPrimitive
import com.google.gson.JsonSerializationContext
import com.google.gson.JsonSerializer
import java.lang.reflect.Type

/**
 * Gson adapter for Long that accepts:
 * - Number (epoch milliseconds)
 * - String in ISO 8601 format (e.g. "2026-03-13T23:39:57.615Z")
 * Backend may return dates as ISO strings; default Gson Long deserializer would throw NumberFormatException.
 */
object LongOrIsoDateAdapter : JsonDeserializer<Long?>, JsonSerializer<Long?> {
    override fun deserialize(json: JsonElement, typeOfT: Type, context: JsonDeserializationContext): Long? {
        if (json.isJsonNull) return null
        return when {
            json is JsonPrimitive && json.isNumber -> json.asLong
            json is JsonPrimitive && json.isString -> {
                val str = json.asString
                if (str.isBlank()) return null
                try {
                    java.time.Instant.parse(str).toEpochMilli()
                } catch (e: Exception) {
                    str.toLongOrNull() ?: throw JsonParseException("Cannot parse as Long or ISO date: $str", e)
                }
            }
            else -> throw JsonParseException("Expected number or string for Long, got ${json::class.simpleName}")
        }
    }

    override fun serialize(src: Long?, typeOfSrc: Type, context: JsonSerializationContext): JsonElement {
        return if (src == null) context.serialize(null) else JsonPrimitive(src)
    }
}
