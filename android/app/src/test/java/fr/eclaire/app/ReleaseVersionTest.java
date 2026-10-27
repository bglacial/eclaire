package fr.eclaire.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class ReleaseVersionTest {
    @Test public void ordersAlphaAndStableReleasesNumerically() {
        assertTrue(ReleaseVersion.parse("v1.1.0-alpha.10").compareTo(ReleaseVersion.parse("1.1.0-alpha.2")) > 0);
        assertTrue(ReleaseVersion.parse("1.1.0-beta.1").compareTo(ReleaseVersion.parse("1.1.0-alpha.99")) > 0);
        assertTrue(ReleaseVersion.parse("1.1.0").compareTo(ReleaseVersion.parse("1.1.0-rc.1")) > 0);
        assertTrue(ReleaseVersion.parse("1.2.0-alpha.1").compareTo(ReleaseVersion.parse("1.1.99")) > 0);
        assertEquals(0, ReleaseVersion.parse("v1.1.0-alpha.2").compareTo(ReleaseVersion.parse("1.1.0-alpha.2")));
    }

    @Test public void rejectsUnexpectedTags() {
        assertNull(ReleaseVersion.parse("../../other"));
        assertNull(ReleaseVersion.parse("1.1.0-alpha"));
        assertNull(ReleaseVersion.parse("v9999999.1.1"));
    }

    @Test public void acceptsOnlyThePublishedRepositoryAssetAndTrustedRedirectHosts() throws Exception {
        ReleaseVersion version = ReleaseVersion.parse("v1.1.0-alpha.3");
        String name = "eclaire-1.1.0-alpha.3-debug.apk";
        String url = "https://github.com/bglacial/eclaire/releases/download/v1.1.0-alpha.3/" + name;
        assertEquals(url, version.assetUrl("v1.1.0-alpha.3", name, "uploaded", url));
        assertNull(version.assetUrl("v1.1.0-alpha.3", name, "new", url));
        assertNull(version.assetUrl("v1.1.0-alpha.3", name, "uploaded", url.replace("github.com", "github.example")));
        assertTrue(ReleaseVersion.trustedHost(new java.net.URL("https://release-assets.githubusercontent.com/file")));
        assertFalse(ReleaseVersion.trustedHost(new java.net.URL("http://github.com/file")));
        assertFalse(ReleaseVersion.trustedHost(new java.net.URL("https://github.com.evil.example/file")));
        assertFalse(ReleaseVersion.trustedHost(new java.net.URL("https://github.com:8443/file")));
    }
}
