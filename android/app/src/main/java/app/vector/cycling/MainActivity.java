package app.vector.cycling;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Enable edge-to-edge so @capacitor-community/safe-area can provide
        // correct env(safe-area-inset-*) values to the WebView (Android 15+).
        EdgeToEdge.enable(this);
    }
}
