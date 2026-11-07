package fr.eclaire;

import com.sun.net.httpserver.Headers;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class HttpHeadersTest {
    @Test void cachesOnlyVersionedAssetsAndSetsContentPolicy() {
        var headers = new Headers();
        FranceServer.staticHeaders(headers, "/assets/index-TZIzPR4g.js");
        assertEquals("public, max-age=31536000, immutable", headers.getFirst("Cache-Control"));
        assertTrue(headers.getFirst("Content-Security-Policy").contains("frame-ancestors 'none'"));
        for (String path : new String[]{"/", "/version.json", "/assets/index.js", "/assets/index-TZIzPR4g.json", "/assets/nested/index-TZIzPR4g.js"}) {
            FranceServer.staticHeaders(headers, path);
            assertEquals("no-cache", headers.getFirst("Cache-Control"), path);
        }
    }
}
