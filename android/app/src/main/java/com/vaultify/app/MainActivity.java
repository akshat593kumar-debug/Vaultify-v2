package com.vaultify.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.WindowManager;
import android.view.Display;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Allow Background Audio
        WebView webView = getBridge().getWebView();
        WebSettings webSettings = webView.getSettings();
        webSettings.setMediaPlaybackRequiresUserGesture(false);

        // 2. Force Max Refresh Rate (High FPS)
        try {
            WindowManager.LayoutParams params = getWindow().getAttributes();
            Display display = getWindowManager().getDefaultDisplay();
            Display.Mode[] modes = display.getSupportedModes();
            float maxRefreshRate = 0;

            for (Display.Mode mode : modes) {
                if (mode.getRefreshRate() > maxRefreshRate) {
                    maxRefreshRate = mode.getRefreshRate();
                }
            }
            if (maxRefreshRate > 0) {
                params.preferredRefreshRate = maxRefreshRate;
                getWindow().setAttributes(params);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
