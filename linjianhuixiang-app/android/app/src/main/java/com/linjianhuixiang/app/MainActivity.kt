package com.linjianhuixiang.app

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebChromeClient.FileChooserParams
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
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
    // 仅允许选择音频文件，对应 H5 侧 <input type="file" accept="audio/*">。
    private val openAudioFile =
        registerForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
            // 用户取消选择时 uri 为 null，回调 null 数组即 WebView 约定的“取消”语义；
            // 选择成功则回调包含单个 Uri 的数组（取 file.name 的逻辑在 H5 侧完成）。
            filePathCallback?.onReceiveValue(uri?.let { arrayOf(it) })
            filePathCallback = null
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
                openAudioFile.launch("audio/*") // 只选音频
                return true
            }
        }

        // JS 桥：H5 通过 window.AndroidBridge 调用原生能力
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")

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
