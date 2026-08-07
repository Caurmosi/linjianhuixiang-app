package com.linjianhuixiang.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.util.Log
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
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
        webView.webChromeClient = WebChromeClient()

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
