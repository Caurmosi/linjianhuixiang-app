package com.linjianhuixiang.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebChromeClient.FileChooserParams
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

/**
 * MainActivity
 * WebView 套壳：加载 assets/index.html（由 frontend 构建产物复制而来）。
 * 启用 JavaScript 与 DOM Storage，注册 JS 桥（window.AndroidBridge）。
 */
class MainActivity : AppCompatActivity() {

    private companion object {
        private const val TAG = "LinjianHuixiang"
    }

    private lateinit var webView: WebView

    // H5 <input type="file"> 的文件选择回调：由 onShowFileChooser 传入，
    // ActivityResult 返回结果后回调给 WebView（必须在使用前持有，防止回调丢失）。
    private var filePathCallback: ValueCallback<Array<Uri>>? = null

    // 在 onCreate 之前注册（类属性初始化时机最稳，Activity 重建不丢注册）。
    // 仅允许选择音频文件，对应 H5 侧 <input type="file" accept="audio/*" multiple>。
    // 使用 GetMultipleContents（多选契约）：即使 H5 input 已加 multiple，
    // GetContent 仍只返回 1 个文件；多选后 ≥2 个由 H5 侧走 START_BATCH 批量，1 个走结果页。
    private val openAudioFiles =
        registerForActivityResult(ActivityResultContracts.GetMultipleContents()) { uris: List<Uri>? ->
            // 用户取消选择时 uris 为 null，回调 null 即 WebView 约定的“取消”语义；
            // 选择成功则回调全部 Uri 数组（ValueCallback<Array<Uri>>，取 file.name 的逻辑在 H5 侧完成）。
            filePathCallback?.onReceiveValue(uris?.toTypedArray())
            filePathCallback = null
        }

    // 录音权限：H5 通过 AndroidBridge.requestRecordPermission() 触发（同步返回当前状态）
    private var recordPermissionRequestPending = false
    private val recordPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            recordPermissionRequestPending = false
            Toast.makeText(this, if (granted) "已获得录音权限" else "未获得录音权限", Toast.LENGTH_SHORT).show()
        }

    // 写外部存储权限：仅 API ≤ 28 导出 PNG 到公共相册目录时需要
    private var writePermissionRequestPending = false
    private val writeStorageLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            writePermissionRequestPending = false
            if (granted) Toast.makeText(this, "已获得存储权限", Toast.LENGTH_SHORT).show()
            else Toast.makeText(this, "未获得存储权限，无法保存到相册", Toast.LENGTH_SHORT).show()
        }

    // 定位权限：H5 通过 AndroidBridge.getLocation() 触发（同步返回当前状态，
    // 未授权时发起系统请求；请求进行中 pending 防重弹）
    private var locationPermissionRequestPending = false
    private val locationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            locationPermissionRequestPending = false
            if (granted) Toast.makeText(this, "已获得定位权限", Toast.LENGTH_SHORT).show()
            else Toast.makeText(this, "未获得定位权限，可在地图页手动选点", Toast.LENGTH_SHORT).show()
        }

    /** 供 JS 桥调用：同步返回当前是否有录音权限；无则发起系统权限请求 */
    private fun ensureRecordPermission(): Boolean {
        return if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            recordPermissionRequestPending = false
            true
        } else {
            if (!recordPermissionRequestPending) {
                recordPermissionRequestPending = true
                recordPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            }
            false
        }
    }

    /** 供 JS 桥调用：API 29+ 走 MediaStore 无需权限；API ≤ 28 需 WRITE_EXTERNAL_STORAGE */
    private fun ensureWritePermission(): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return true
        return if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED) {
            writePermissionRequestPending = false
            true
        } else {
            if (!writePermissionRequestPending) {
                writePermissionRequestPending = true
                writeStorageLauncher.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE)
            }
            false
        }
    }

    /** 供 JS 桥调用：同步返回当前是否有精确定位权限；无则发起系统权限请求（pending 防重弹） */
    private fun ensureLocationPermission(): Boolean {
        return if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            locationPermissionRequestPending = false
            true
        } else {
            if (!locationPermissionRequestPending) {
                locationPermissionRequestPending = true
                locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
            }
            false
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        // 允许 file:// 页面加载同源 file:// 资源（ES Module 无 CORS 头，
        // 从 file:///android_asset/index.html 加载 type="module" 脚本必须开启）
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        webView.webViewClient = object : WebViewClient() {
            // 外链统一在 WebView 内嵌加载（与微信同内核，绕开系统浏览器对部分域名的拦截）：
            // 公共地图等外部 https 页面直接在 App 内打开，返回键 canGoBack 回到 App。
            // 不再跳系统浏览器——国内手机默认浏览器对未备案/部分第三方域名有拦截，跳出去反而打不开。
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false // false = WebView 自己加载（内嵌），不转交系统浏览器
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                // 仅记录主 frame 加载失败，方便真机 Logcat 排查白屏（不弹 Toast，避免误报）
                if (request?.isForMainFrame == true) {
                    Log.e(
                        TAG,
                        "Main frame load error: code=${error?.errorCode} " +
                            "desc=${error?.description} url=${request.url}"
                    )
                }
                super.onReceivedError(view, request, error)
            }
        }
        // WebChromeClient：覆写 onShowFileChooser 以支持 H5 <input type="file">
        // （默认实现直接返回 false，导致 WebView 忽略文件选择，导入音频无响应）。
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView?,
                filePathCallback: ValueCallback<Array<Uri>>?,
                fileChooserParams: FileChooserParams?
            ): Boolean {
                this@MainActivity.filePathCallback = filePathCallback
                openAudioFiles.launch("audio/*") // 只选音频（多选）
                return true
            }

            // 关键：WebView 的 getUserMedia 需要显式授权，
            // 否则录音权限会被静默拒绝，MediaRecorder 无法获取音频流。
            override fun onPermissionRequest(request: PermissionRequest?) {
                if (request != null && request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                    request.grant(request.resources)
                } else {
                    request?.deny()
                }
            }
        }

        // JS 桥：H5 通过 window.AndroidBridge 调用原生能力；
        // 权限相关由本 Activity 提供实现（同步返回当前授权状态）。
        webView.addJavascriptInterface(
            WebAppInterface(
                this,
                ::ensureRecordPermission,
                ::ensureWritePermission,
                ::ensureLocationPermission
            ),
            "AndroidBridge"
        )

        // 加载打包进 assets 的 H5 入口
        webView.loadUrl("file:///android_asset/index.html")

        // 系统返回键：优先回退 WebView 历史
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
