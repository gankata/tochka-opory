package app.tochkaopory

import android.app.Activity
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private val executor = Executors.newSingleThreadExecutor()
    private val preferences by lazy { getSharedPreferences("connection", Context.MODE_PRIVATE) }
    private lateinit var root: FrameLayout
    private var webView: WebView? = null
    private var currentServer: String? = null
    private var uploadCallback: ValueCallback<Array<Uri>>? = null

    private val paper = Color.rgb(245, 242, 234)
    private val card = Color.rgb(255, 254, 250)
    private val forest = Color.rgb(40, 89, 67)
    private val forestDark = Color.rgb(29, 66, 50)
    private val ink = Color.rgb(32, 51, 42)
    private val muted = Color.rgb(100, 113, 105)
    private val line = Color.rgb(221, 222, 211)
    private val error = Color.rgb(164, 62, 55)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = paper
        window.navigationBarColor = paper
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            window.decorView.systemUiVisibility =
                window.decorView.systemUiVisibility or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
        root = FrameLayout(this)
        root.setBackgroundColor(paper)
        setContentView(root)
        WebView.setWebContentsDebuggingEnabled(false)
        showConnection(preferences.getString("server_url", null), autoConnect = true)
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()

    private fun rounded(color: Int, radius: Int, strokeColor: Int? = null): GradientDrawable =
        GradientDrawable().apply {
            setColor(color)
            cornerRadius = dp(radius).toFloat()
            strokeColor?.let { setStroke(dp(1), it) }
        }

    private fun label(text: String, size: Float, color: Int = ink, bold: Boolean = false): TextView =
        TextView(this).apply {
            this.text = text
            textSize = size
            setTextColor(color)
            typeface = Typeface.create("sans", if (bold) Typeface.BOLD else Typeface.NORMAL)
            setLineSpacing(0f, 1.12f)
        }

    private fun margins(view: View, left: Int = 0, top: Int = 0, right: Int = 0, bottom: Int = 0) {
        (view.layoutParams as? ViewGroup.MarginLayoutParams)?.setMargins(dp(left), dp(top), dp(right), dp(bottom))
    }

    private fun showConnection(initialUrl: String?, message: String? = null, autoConnect: Boolean = false) {
        uploadCallback?.onReceiveValue(null)
        uploadCallback = null
        webView?.destroy()
        webView = null
        root.removeAllViews()

        val scroll = ScrollView(this).apply { isFillViewport = true }
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(34), dp(24), dp(32))
        }
        scroll.addView(content, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

        val logo = label("Т", 30f, Color.WHITE, true).apply {
            gravity = Gravity.CENTER
            background = rounded(forest, 20)
        }
        content.addView(logo, LinearLayout.LayoutParams(dp(64), dp(64)))

        val eyebrow = label("ЛИЧНОЕ ПРОСТРАНСТВО", 11f, forest, true).apply {
            letterSpacing = 0.14f
            gravity = Gravity.CENTER
        }
        content.addView(eyebrow)
        margins(eyebrow, top = 22)

        val title = label("Точка опоры", 31f, forestDark, true).apply { gravity = Gravity.CENTER }
        content.addView(title)
        margins(title, top = 7)
        val subtitle = label("Деньги, настроение и заметки — в одной\nлокальной базе на вашем компьютере.", 16f, muted).apply {
            gravity = Gravity.CENTER
        }
        content.addView(subtitle)
        margins(subtitle, top = 9, bottom = 24)

        val form = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
            background = rounded(card, 22, line)
            elevation = dp(2).toFloat()
        }
        content.addView(form, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))

        val inputLabel = label("Адрес компьютера", 14f, ink, true)
        form.addView(inputLabel)
        val input = EditText(this).apply {
            setText(initialUrl.orEmpty())
            hint = "http://192.168.1.10:7100"
            textSize = 16f
            setTextColor(ink)
            setHintTextColor(Color.rgb(139, 147, 141))
            setSingleLine(true)
            inputType = EditorInfo.TYPE_CLASS_TEXT or EditorInfo.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
            setPadding(dp(15), 0, dp(15), 0)
            background = rounded(paper, 13, line)
        }
        form.addView(input, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(54)))
        margins(input, top = 9)

        val help = label("Адрес показан в окне запуска в режиме 2.\nОба устройства должны быть в одной сети.", 13f, muted)
        form.addView(help)
        margins(help, top = 10)

        val progress = ProgressBar(this).apply {
            isIndeterminate = true
            indeterminateTintList = ColorStateList.valueOf(forest)
            visibility = View.GONE
        }
        val button = Button(this).apply {
            text = "Подключиться"
            textSize = 16f
            isAllCaps = false
            setTextColor(Color.WHITE)
            typeface = Typeface.create("sans", Typeface.BOLD)
            backgroundTintList = ColorStateList.valueOf(forest)
            minHeight = dp(54)
        }
        form.addView(button, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(56)))
        margins(button, top = 18)

        form.addView(progress, LinearLayout.LayoutParams(dp(28), dp(28)).apply { gravity = Gravity.CENTER_HORIZONTAL })
        margins(progress, top = 12)

        val status = label(message.orEmpty(), 14f, if (message == null) muted else error).apply {
            gravity = Gravity.CENTER
            visibility = if (message == null) View.GONE else View.VISIBLE
        }
        form.addView(status)
        margins(status, top = 12)

        val connect = {
            val normalized = normalizeServerUrl(input.text.toString())
            if (normalized == null) {
                status.text = "Введите адрес вида http://192.168.1.10:7100"
                status.setTextColor(error)
                status.visibility = View.VISIBLE
            } else {
                button.isEnabled = false
                button.text = "Проверяем соединение…"
                progress.visibility = View.VISIBLE
                status.visibility = View.GONE
                checkServer(normalized,
                    onSuccess = {
                        preferences.edit().putString("server_url", normalized).apply()
                        currentServer = normalized
                        showWeb(normalized)
                    },
                    onFailure = { reason ->
                        button.isEnabled = true
                        button.text = "Попробовать снова"
                        progress.visibility = View.GONE
                        status.text = reason
                        status.setTextColor(error)
                        status.visibility = View.VISIBLE
                    }
                )
            }
        }
        button.setOnClickListener { connect() }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_GO) { connect(); true } else false
        }

        val note = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(18), dp(16), dp(18), dp(16))
            background = rounded(Color.rgb(233, 237, 225), 18)
        }
        val noteTitle = label("Без облака и дублирования данных", 14f, forestDark, true)
        note.addView(noteTitle)
        val noteText = label("Телефон подключается к запущенному приложению на компьютере. Все изменения сохраняются там же, а резервные копии продолжают создаваться автоматически.", 13f, muted)
        note.addView(noteText)
        margins(noteText, top = 6)
        content.addView(note, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        margins(note, top = 18)

        val privacy = label("Используйте только личную локальную сеть.\nHTTP в ней не шифрует трафик.", 12f, muted).apply { gravity = Gravity.CENTER }
        content.addView(privacy)
        margins(privacy, top = 18)

        root.addView(scroll, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        if (autoConnect && !initialUrl.isNullOrBlank()) root.postDelayed({ connect() }, 300)
    }

    private fun normalizeServerUrl(raw: String): String? {
        val value = raw.trim().removeSuffix("/")
        if (value.isEmpty()) return null
        val uri = Uri.parse(if (value.contains("://")) value else "http://$value")
        if (uri.scheme !in listOf("http", "https") || uri.host.isNullOrBlank() || uri.userInfo != null) return null
        return "${uri.scheme}://${uri.authority}"
    }

    private fun checkServer(server: String, onSuccess: () -> Unit, onFailure: (String) -> Unit) {
        executor.execute {
            var connection: HttpURLConnection? = null
            val result = try {
                connection = URL("$server/api/health").openConnection() as HttpURLConnection
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.requestMethod = "GET"
                connection.setRequestProperty("Accept", "application/json")
                val code = connection.responseCode
                val body = (if (code in 200..299) connection.inputStream else connection.errorStream)
                    ?.bufferedReader()?.use { it.readText() }.orEmpty()
                if (code == 200 && Regex("\\\"status\\\"\\s*:\\s*\\\"ok\\\"").containsMatchIn(body)) null
                else "Сервер отвечает, но база пока недоступна. Проверьте окно запуска."
            } catch (_: Exception) {
                "Не удалось подключиться. Проверьте адрес, режим 2, Wi-Fi и брандмауэр Windows."
            } finally {
                connection?.disconnect()
            }
            runOnUiThread {
                if (!isDestroyed) result?.let(onFailure) ?: onSuccess()
            }
        }
    }

    private fun showWeb(server: String) {
        root.removeAllViews()
        val view = WebView(this)
        webView = view
        view.setBackgroundColor(paper)
        view.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            loadsImagesAutomatically = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = true
            builtInZoomControls = false
            displayZoomControls = false
            cacheMode = WebSettings.LOAD_DEFAULT
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(view, false)
        }
        view.addJavascriptInterface(DownloadBridge(), "AndroidDownloads")
        view.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val sameComputer = uri.host == Uri.parse(currentServer).host
                if (uri.scheme in listOf("http", "https") && sameComputer) return false
                return try {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                    true
                } catch (_: ActivityNotFoundException) { true }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    showConnection(currentServer, "Связь с компьютером потеряна. Проверьте, что сервер запущен, и повторите подключение.")
                }
            }
        }
        view.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                uploadCallback?.onReceiveValue(null)
                uploadCallback = filePathCallback
                return try {
                    startActivityForResult(fileChooserParams.createIntent(), FILE_CHOOSER)
                    true
                } catch (_: ActivityNotFoundException) {
                    uploadCallback = null
                    Toast.makeText(this@MainActivity, "Не найдено приложение для выбора файла", Toast.LENGTH_LONG).show()
                    false
                }
            }
        }
        view.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            when {
                url.startsWith("blob:") -> downloadBlob(url, contentDisposition, mimeType)
                url.startsWith("http://") || url.startsWith("https://") ->
                    enqueueDownload(url, userAgent, contentDisposition, mimeType)
                else -> Toast.makeText(this, "Этот формат скачивания не поддерживается", Toast.LENGTH_LONG).show()
            }
        }
        root.addView(view, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        view.loadUrl(server)
    }

    private fun enqueueDownload(url: String, userAgent: String, contentDisposition: String, mimeType: String) {
        try {
            val name = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(name)
                .setDescription("Экспорт из Точки опоры")
                .setMimeType(mimeType.ifBlank { "application/octet-stream" })
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, name)
            CookieManager.getInstance().getCookie(url)?.let { request.addRequestHeader("Cookie", it) }
            if (userAgent.isNotBlank()) request.addRequestHeader("User-Agent", userAgent)
            getSystemService(DownloadManager::class.java).enqueue(request)
            Toast.makeText(this, "Скачивание началось: $name", Toast.LENGTH_LONG).show()
        } catch (exception: Exception) {
            Toast.makeText(this, "Не удалось скачать файл: ${exception.message}", Toast.LENGTH_LONG).show()
        }
    }

    private fun downloadBlob(url: String, contentDisposition: String, mimeType: String) {
        val suggested = URLUtil.guessFileName(url, contentDisposition, mimeType)
        val script = """
            (async () => {
              try {
                const response = await fetch(${JSONObject.quote(url)});
                const blob = await response.blob();
                const reader = new FileReader();
                reader.onloadend = () => {
                  const value = String(reader.result || '');
                  AndroidDownloads.saveBase64(${JSONObject.quote(suggested)}, blob.type || ${JSONObject.quote(mimeType)}, value.slice(value.indexOf(',') + 1));
                };
                reader.onerror = () => AndroidDownloads.reportError('Не удалось прочитать экспорт');
                reader.readAsDataURL(blob);
              } catch (error) {
                AndroidDownloads.reportError('Не удалось подготовить экспорт: ' + error);
              }
            })();
        """.trimIndent()
        webView?.evaluateJavascript(script, null)
        Toast.makeText(this, "Готовим файл к сохранению…", Toast.LENGTH_SHORT).show()
    }

    private inner class DownloadBridge {
        @JavascriptInterface
        fun saveBase64(fileName: String, mimeType: String, encoded: String) {
            executor.execute {
                try {
                    if (encoded.length > 180_000_000) throw IllegalArgumentException("Файл слишком большой для этого способа экспорта")
                    val safeName = fileName.replace(Regex("[^\\p{L}\\p{N}._ ()-]"), "_").ifBlank { "tochka-opory-export" }
                    val bytes = Base64.decode(encoded, Base64.DEFAULT)
                    val savedName = saveDownload(safeName, mimeType.ifBlank { "application/octet-stream" }, bytes)
                    showMessage("Файл сохранён в Загрузки: $savedName")
                } catch (exception: Exception) {
                    showMessage("Не удалось сохранить файл: ${exception.message}")
                }
            }
        }

        @JavascriptInterface
        fun reportError(message: String) = showMessage(message)
    }

    private fun saveDownload(name: String, mimeType: String, bytes: ByteArray): String {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            var uri: Uri? = null
            try {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/Точка опоры")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw IllegalStateException("Хранилище недоступно")
                contentResolver.openOutputStream(uri, "w")?.use { it.write(bytes) }
                    ?: throw IllegalStateException("Не удалось открыть файл")
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                contentResolver.update(uri, values, null, null)
                return name
            } catch (exception: Exception) {
                uri?.let { contentResolver.delete(it, null, null) }
                throw exception
            }
        }
        val directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(filesDir, "Downloads").apply { mkdirs() }
        var target = File(directory, name)
        var index = 2
        while (target.exists()) {
            val dot = name.lastIndexOf('.')
            target = File(directory, if (dot > 0) "${name.substring(0, dot)}-$index${name.substring(dot)}" else "$name-$index")
            index++
        }
        FileOutputStream(target).use { it.write(bytes) }
        return target.name
    }

    private fun showMessage(message: String) {
        runOnUiThread { if (!isDestroyed) Toast.makeText(this, message, Toast.LENGTH_LONG).show() }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != FILE_CHOOSER) return
        val uris = if (resultCode == RESULT_OK) WebChromeClient.FileChooserParams.parseResult(resultCode, data) else null
        uploadCallback?.onReceiveValue(uris)
        uploadCallback = null
    }

    override fun onBackPressed() {
        val view = webView
        when {
            view?.canGoBack() == true -> view.goBack()
            view != null -> showConnection(currentServer)
            else -> super.onBackPressed()
        }
    }

    override fun onDestroy() {
        uploadCallback?.onReceiveValue(null)
        uploadCallback = null
        webView?.destroy()
        webView = null
        executor.shutdownNow()
        super.onDestroy()
    }

    companion object {
        private const val FILE_CHOOSER = 41
    }
}
