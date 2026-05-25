package app.vector.cycling;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // IMPORTANT: EdgeToEdge BEFORE super.onCreate().
        // super.onCreate() loads Capacitor plugins; SafeAreaPlugin.load() sets
        // its own OnApplyWindowInsetsListener on the decor view.
        // If EdgeToEdge.enable() runs AFTER, it REPLACES that listener and
        // env(safe-area-inset-*) returns 0 → UI shifts under status bar.
        // By calling EdgeToEdge first, the plugin's listener is set LAST and wins.
        EdgeToEdge.enable(this);
        super.onCreate(savedInstanceState);
    }
}
