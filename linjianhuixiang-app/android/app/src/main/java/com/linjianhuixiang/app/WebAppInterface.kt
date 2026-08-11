package com.linjianhuixiang.app

import android.content.ContentValues
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Looper
import android.provider.MediaStore
import android.util.Base64
import android.util.Log
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException

/**
 * WebAppInterface
 * H5 与原生通信的 JS 桥。
 * H5 侧调用示例：
 *   window.AndroidBridge.toast('hello')
 *   window.AndroidBridge.getDeviceInfo()
 *   window.AndroidBridge.requestRecordPermission()
 *   window.AndroidBridge.startNativeRecord()
 *   window.AndroidBridge.stopNativeRecord()
 *   window.AndroidBridge.isNativeRecording()
 *   window.AndroidBridge.startLocationUpdate()
 *   window.AndroidBridge.getLocation()
 *   window.AndroidBridge.saveAudio(dataUrl, filename)
 *   window.AndroidBridge.importAudio(dataUrl, filename)
 *   window.AndroidBridge.saveImage(dataUrl, filename)
 *
 * 实时录音：优先走原生 MediaRecorder（startNativeRecord/stopNativeRecord），
 * 输出 m4a(aac) 并 Base64 返回，绕开 WebView getUserMedia 在部分机型/ file:// 下不可靠的问题。
 * 定位：录音前先 startLocationUpdate() 主动请求一次 GPS 定位（预热），
 * 回调结果缓存到 lastFix；getLocation() 优先返回 lastFix（最新），
 * 否则回退 last known "lng,lat"（GPS→NETWORK 兜底），供录音标点。
 * 权限相关能力由 MainActivity 注入 lambda（ensureRecordPermission / ensureWritePermission /
 * ensureLocationPermission），本类不直接持有 Activity，保持依赖干净。
 */
class WebAppInterface(
    private val context: Context,
    private val ensureRecordPermission: () -> Boolean = { false },
    private val ensureWritePermission: () -> Boolean = { false },
    private val ensureLocationPermission: () -> Boolean = { false }
) {

    // 原生录音状态：一次只允许一段活动录音（startNativeRecord 成功即占用，stopNativeRecord 后释放）
    private var nativeRecorder: MediaRecorder? = null
    private var nativeRecordFile: File? = null

    // 主动定位：startLocationUpdate() 请求一次 GPS 更新，回调结果缓存到 lastFix（getLocation 优先返回）。
    // singleFixListener 仅在 API<30 requestSingleUpdate 分支使用，回调后置空防泄漏。
    private var lastFix: Location? = null
    private var singleFixListener: LocationListener? = null

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
     * 原生录音：启动 MediaRecorder 录 m4a(aac)。
     * - 已在录制 → false；未授权 → false；prepare/start 异常 → Logcat 打错并释放 → false
     * - 成功 → 输出文件写入 cacheDir，返回 true（方法立即返回，不阻塞 JS 线程）
     * 调用方应在约 10s 后调用 stopNativeRecord() 取回数据。
     */
    @JavascriptInterface
    fun startNativeRecord(): Boolean {
        if (nativeRecorder != null) {
            Log.w(TAG, "startNativeRecord: 已在录制，忽略")
            return false
        }
        if (!ensureRecordPermission()) {
            Log.w(TAG, "startNativeRecord: 无录音权限")
            return false
        }
        val outputFile = File(context.cacheDir, "ljx_rec_${System.currentTimeMillis()}.m4a")
        var recorder: MediaRecorder? = null
        try {
            // 先创建实例再配置：prepare/start 抛错时局部引用仍指向实例，可在 catch 中正确释放
            recorder = MediaRecorder()
            recorder!!.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(96_000)
                setAudioSamplingRate(44_100)
                setOutputFile(outputFile.absolutePath)
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.e(TAG, "startNativeRecord failed: ${e.message}", e)
            releaseRecorder(recorder)
            outputFile.delete()
            return false
        }
        nativeRecorder = recorder
        nativeRecordFile = outputFile
        Log.i(TAG, "startNativeRecord: $outputFile")
        return true
    }

    /**
     * 停止原生录音并返回 dataURL（data:audio/mp4;base64,...）。
     * - 无活动录音 → ""
     * - stop/release 后读取文件 Base64；读失败 → ""；临时文件无论成败均删除
     */
    @JavascriptInterface
    fun stopNativeRecord(): String {
        val recorder = nativeRecorder ?: run {
            Log.w(TAG, "stopNativeRecord: 无活动录音")
            return ""
        }
        val outputFile = nativeRecordFile
        nativeRecorder = null
        nativeRecordFile = null
        releaseRecorder(recorder)
        if (outputFile == null || !outputFile.exists() || outputFile.length() == 0L) {
            Log.e(TAG, "stopNativeRecord: 输出文件缺失或为空 ${outputFile?.absolutePath}")
            outputFile?.delete()
            return ""
        }
        val dataUrl = try {
            val bytes = FileInputStream(outputFile).use { it.readBytes() }
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            "data:audio/mp4;base64,$b64"
        } catch (e: Exception) {
            Log.e(TAG, "stopNativeRecord: 读取录音失败: ${e.message}", e)
            ""
        } finally {
            outputFile.delete()
        }
        Log.i(TAG, "stopNativeRecord: dataUrl=${dataUrl.take(60)}... (${dataUrl.length} chars)")
        return dataUrl
    }

    /** 是否正在原生录音（供前端轮询 / 降级判断） */
    @JavascriptInterface
    fun isNativeRecording(): Boolean = nativeRecorder != null

    /**
     * GPS 定位：返回 "lng,lat"（6 位小数，GCJ-02/WGS84 原样透传，前端按高德瓦片直接使用）。
     * - 未授权 → 发起系统权限请求，返回 ""（前端可手动选点）；
     * - 优先返回 startLocationUpdate() 主动定位的最新结果（lastFix），
     *   其次取 last known location（GPS_PROVIDER 优先，NETWORK_PROVIDER 兜底）；
     * - 无任何已知位置 → ""。
     */
    @Suppress("DEPRECATION")
    @JavascriptInterface
    fun getLocation(): String {
        if (!ensureLocationPermission()) {
            Log.i(TAG, "getLocation: 无定位权限，返回空")
            return ""
        }
        val locationManager =
            context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                ?: run {
                    Log.e(TAG, "getLocation: LocationManager 不可用")
                    return ""
                }
        // 主动定位预热结果优先；无则回退 last known（GPS→NETWORK 兜底）
        val location: Location? = lastFix ?: try {
            locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER)
                ?: locationManager.getLastKnownLocation(LocationManager.NETWORK_PROVIDER)
        } catch (e: Exception) {
            Log.w(TAG, "getLocation: getLastKnownLocation 异常: ${e.message}")
            null
        }
        if (location == null) {
            Log.i(TAG, "getLocation: 无已知位置，返回空")
            return ""
        }
        val lng = "%.6f".format(location.longitude)
        val lat = "%.6f".format(location.latitude)
        Log.i(TAG, "getLocation: $lng,$lat")
        return "$lng,$lat"
    }

    /**
     * 主动定位（预热）：请求一次 GPS 定位更新，回调结果缓存到 lastFix，
     * 供录音停止后 getLocation() 优先返回（录音约 10s，足够拿到新位置）。
     * - 无定位权限 → 返回 false（不发请求）；
     * - API 30+：getCurrentLocation（一次性定位，回调即自动结束，无需手动移除）；
     * - API < 30：requestSingleUpdate（请求一次更新，回调后自动停止），listener 回调后置空防泄漏；
     * - 返回 true 表示请求已发起（异步，不阻塞），定位结果稍后写入 lastFix。
     */
    @Suppress("DEPRECATION")
    @JavascriptInterface
    fun startLocationUpdate(): Boolean {
        if (!ensureLocationPermission()) {
            Log.i(TAG, "startLocationUpdate: 无定位权限")
            return false
        }
        val locationManager =
            context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
                ?: run {
                    Log.e(TAG, "startLocationUpdate: LocationManager 不可用")
                    return false
                }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                // API 30+：getCurrentLocation(provider, cancellationSignal, executor, consumer)
                locationManager.getCurrentLocation(
                    LocationManager.GPS_PROVIDER,
                    null,
                    context.mainExecutor,
                    { loc -> onLocationFix(loc) }
                )
            } else {
                // API < 30：requestSingleUpdate（请求一次更新，回调后自动停止）
                singleFixListener?.let { old ->
                    try {
                        locationManager.removeUpdates(old)
                    } catch (e: Exception) {
                        /* 移除旧监听失败可忽略 */
                    }
                }
                val listener = object : LocationListener {
                    override fun onLocationChanged(location: Location) = onLocationFix(location)

                    @Deprecated("Deprecated in Java")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}

                    override fun onProviderEnabled(provider: String) {}

                    override fun onProviderDisabled(provider: String) {}
                }
                singleFixListener = listener
                locationManager.requestSingleUpdate(
                    LocationManager.GPS_PROVIDER,
                    listener,
                    Looper.getMainLooper()
                )
            }
        } catch (e: Exception) {
            singleFixListener = null
            Log.w(TAG, "startLocationUpdate: 主动定位异常: ${e.message}")
            return false
        }
        return true
    }

    /** 主动定位回调：缓存最新位置；单次请求的 listener 用完即置空（防泄漏） */
    private fun onLocationFix(location: Location?) {
        if (location != null) lastFix = location
        singleFixListener = null
    }

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

    /**
     * 安全停止并释放 MediaRecorder。
     * stop/release 在未录制 / 录制过短等场景可能抛 IllegalStateException / RuntimeException，
     * 统一捕获避免影响 JS 桥调用；空引用直接忽略。
     */
    private fun releaseRecorder(recorder: MediaRecorder?) {
        if (recorder == null) return
        try {
            recorder.stop()
        } catch (e: Exception) {
            Log.e(TAG, "MediaRecorder.stop failed: ${e.message}", e)
        }
        try {
            recorder.release()
        } catch (e: Exception) {
            Log.e(TAG, "MediaRecorder.release failed: ${e.message}", e)
        }
    }

    private companion object {
        private const val TAG = "LinjianHuixiang"
    }
}
