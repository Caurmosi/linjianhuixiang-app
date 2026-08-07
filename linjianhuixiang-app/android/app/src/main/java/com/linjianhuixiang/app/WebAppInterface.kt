package com.linjianhuixiang.app

import android.content.Context
import android.os.Build
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * WebAppInterface
 * H5 与原生通信的 JS 桥（预留）。
 * H5 侧调用示例：
 *   window.AndroidBridge.toast('hello')
 *   window.AndroidBridge.getDeviceInfo()
 *   window.AndroidBridge.exportReport('PDF')
 *
 * 后续可在 P1 扩展：读取录音文件 / 系统分享 / 申请录音权限 / 调用 Chaquopy 端侧推理等。
 */
class WebAppInterface(private val context: Context) {

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
}
