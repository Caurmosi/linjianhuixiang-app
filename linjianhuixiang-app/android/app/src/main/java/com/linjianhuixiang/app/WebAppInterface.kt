package com.linjianhuixiang.app

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/**
 * WebAppInterface
 * H5 与原生通信的 JS 桥。
 * H5 侧调用示例：
 *   window.AndroidBridge.toast('hello')
 *   window.AndroidBridge.getDeviceInfo()
 *   window.AndroidBridge.requestRecordPermission()
 *   window.AndroidBridge.saveAudio(dataUrl, filename)
 *   window.AndroidBridge.importAudio(dataUrl, filename)
 *   window.AndroidBridge.saveImage(dataUrl, filename)
 *
 * 权限相关能力由 MainActivity 注入 lambda（ensureRecordPermission / ensureWritePermission），
 * 本类不直接持有 Activity，保持依赖干净。
 */
class WebAppInterface(
    private val context: Context,
    private val ensureRecordPermission: () -> Boolean = { false },
    private val ensureWritePermission: () -> Boolean = { false }
) {

    @JavascriptInterface
    fun toast(message: String) {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
    }

    @JavascriptInterface
    fun getDeviceInfo(): String {
        return "Android ${Build.VERSION.RELEASE} / API ${Build.VERSION.SDK_INT} / " +
            "${Build.MANUFACTURER} ${Build.MODEL}"
    }

    @JavascriptInterface
    fun exportReport(format: String): Boolean {
        // P1：调用系统分享或保存报告。当前为占位实现。
        toast("导出 $format 报告（P1）")
        return true
    }

    /** 录音权限：同步返回当前是否已有权限（无则发起系统请求） */
    @JavascriptInterface
    fun requestRecordPermission(): Boolean = ensureRecordPermission()

    /**
     * 保存录音到 App 专属外部目录（无需存储权限）。
     * 目录：/storage/emulated/0/Android/data/<pkg>/files/Music
     * 说明：写入 App 专属目录，无需 WRITE_EXTERNAL_STORAGE；该目录不出现在系统音乐库。
     */
    @JavascriptInterface
    fun saveAudio(dataUrl: String, filename: String): Boolean =
        writeBase64ToAppFiles(dataUrl, filename, Environment.DIRECTORY_MUSIC)

    /**
     * 导入音频到 App 专属外部目录（无需存储权限）。
     * 目录：/storage/emulated/0/Android/data/<pkg>/files/Music
     */
    @JavascriptInterface
    fun importAudio(dataUrl: String, filename: String): Boolean =
        writeBase64ToAppFiles(dataUrl, filename, Environment.DIRECTORY_MUSIC)

    /**
     * 导出 PNG 到系统相册：
     * - API 29+：MediaStore.Images（免存储权限），图片出现在系统相册
     * - API ≤ 28：写入公共 Pictures/LinjianHuixiang（需 WRITE_EXTERNAL_STORAGE，
     *   由 MainActivity 注入的 ensureWritePermission 负责申请）
     */
    @JavascriptInterface
    fun saveImage(dataUrl: String, filename: String): Boolean {
        val bytes = decodeBase64(dataUrl) ?: return false
        val safeName = sanitize(filename)
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                saveToMediaStore(bytes, safeName)
            } else {
                if (!ensureWritePermission()) {
                    Log.i(TAG, "saveImage: WRITE_EXTERNAL_STORAGE 未授权（请求已发起），等待用户授权后重试")
                    return false
                }
                saveToPublicPictures(bytes, safeName)
            }
        } catch (e: Exception) {
            Log.e(TAG, "saveImage failed: ${e.message}", e)
            false
        }
    }

    // ---------- 内部实现 ----------

    private fun writeBase64ToAppFiles(dataUrl: String, filename: String, subDir: String): Boolean {
        val bytes = decodeBase64(dataUrl) ?: return false
        val dir = context.getExternalFilesDir(subDir) ?: run {
            Log.e(TAG, "getExternalFilesDir($subDir) returned null")
            return false
        }
        if (!dir.exists() && !dir.mkdirs()) {
            Log.e(TAG, "Failed to create dir: $dir")
            return false
        }
        val file = File(dir, sanitize(filename))
        return try {
            FileOutputStream(file).use { it.write(bytes) }
            Log.i(TAG, "Saved ${file.absolutePath} (${bytes.size} bytes)")
            true
        } catch (e: IOException) {
            Log.e(TAG, "write file failed: ${e.message}", e)
            false
        }
    }

    private fun saveToMediaStore(bytes: ByteArray, displayName: String): Boolean {
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Images.Media.MIME_TYPE, "image/png")
            put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/LinjianHuixiang")
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
            ?: run {
                Log.e(TAG, "MediaStore insert returned null")
                return false
            }
        return try {
            val os = resolver.openOutputStream(uri)
            if (os == null) {
                Log.e(TAG, "MediaStore openOutputStream returned null")
                resolver.delete(uri, null, null)
                return false
            }
            os.use { it.write(bytes) }
            values.clear()
            values.put(MediaStore.Images.Media.IS_PENDING, 0)
            resolver.update(uri, values, null, null)
            Log.i(TAG, "Image saved to MediaStore: $displayName")
            true
        } catch (e: Exception) {
            resolver.delete(uri, null, null)
            throw e
        }
    }

    @Suppress("DEPRECATION")
    private fun saveToPublicPictures(bytes: ByteArray, displayName: String): Boolean {
        val dir = File(
            Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
            "LinjianHuixiang"
        )
        if (!dir.exists() && !dir.mkdirs()) {
            Log.e(TAG, "Failed to create dir: $dir")
            return false
        }
        val file = File(dir, displayName)
        FileOutputStream(file).use { it.write(bytes) }
        Log.i(TAG, "Image saved to ${file.absolutePath}")
        return true
    }

    /**
     * 解析 dataUrl 前缀并 Base64 解码。
     * 前缀不匹配 / 解码失败均返回 null（不崩溃）。
     */
    private fun decodeBase64(dataUrl: String): ByteArray? {
        if (dataUrl.isBlank()) return null
        val comma = dataUrl.indexOf(',')
        if (comma <= 0) return null
        val header = dataUrl.substring(0, comma)
        if (!header.contains("base64")) {
            Log.e(TAG, "decodeBase64: 非 base64 dataUrl（header=$header）")
            return null
        }
        return try {
            Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT)
        } catch (e: Exception) {
            Log.e(TAG, "Base64 decode failed: ${e.message}", e)
            null
        }
    }

    private fun sanitize(name: String): String {
        val cleaned = name.replace(Regex("[\\\\/:*?\"<>|]"), "_").trim()
        return if (cleaned.isBlank()) "recording_${System.currentTimeMillis()}.bin" else cleaned
    }

    private companion object {
        private const val TAG = "LinjianHuixiang"
    }
}
