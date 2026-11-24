package au.willitflood.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.IOException;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private static final String START_URL = "https://" + ASSET_HOST + "/index.html";
    private static final String CONTENT_POLICY =
            "default-src 'self'; connect-src https://data.brisbane.qld.gov.au "
            + "https://services5.arcgis.com https://arcgis.lcc.wspdigital.com; "
            + "object-src 'none'; frame-src 'none'; base-uri 'none'";
    private WebView webView;

    @Override
    @SuppressLint("SetJavaScriptEnabled")
    public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        // Route target="_blank" map and report links through the navigation handler.
        settings.setSupportMultipleWindows(false);
        settings.setUseWideViewPort(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);
        webView.setWebViewClient(new LookupClient());
        setContentView(webView);
        if (state == null || webView.restoreState(state) == null) {
            webView.loadUrl(START_URL);
        }
    }

    private static boolean isLocal(Uri uri) {
        return "https".equals(uri.getScheme()) && ASSET_HOST.equals(uri.getAuthority());
    }

    private static String assetType(String path) {
        if ("/index.html".equals(path)) return "text/html";
        if ("/credits.txt".equals(path)) return "text/plain";
        if (path != null && path.matches("/assets/[A-Za-z0-9_-]+\\.(css|js)")) {
            return path.endsWith(".js") ? "text/javascript" : "text/css";
        }
        return null;
    }

    private final class LookupClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (!isLocal(uri)) return null;
            String path = uri.getEncodedPath();
            String type = assetType(path);
            if (type != null && "GET".equals(request.getMethod())) {
                try {
                    return new WebResourceResponse(type, "UTF-8", 200, "OK",
                            Collections.singletonMap("Content-Security-Policy", CONTENT_POLICY),
                            getAssets().open(path.substring(1)));
                } catch (IOException missingAsset) {
                    // Return a local 404 instead of falling through to a network request.
                }
            }
            return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    Collections.emptyMap(), null);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isLocal(uri)) return false;
            if (request.isForMainFrame() && "https".equals(uri.getScheme())) {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                } catch (ActivityNotFoundException noBrowser) {
                    Toast.makeText(MainActivity.this, "Install a browser to open the council map.", Toast.LENGTH_LONG).show();
                }
            }
            return true;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle state) {
        super.onSaveInstanceState(state);
        webView.saveState(state);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        ((ViewGroup) webView.getParent()).removeView(webView);
        webView.destroy();
        super.onDestroy();
    }
}
