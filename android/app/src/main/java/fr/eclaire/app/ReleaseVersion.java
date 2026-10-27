package fr.eclaire.app;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.net.URL;

final class ReleaseVersion implements Comparable<ReleaseVersion> {
    private static final Pattern PATTERN = Pattern.compile("v?(\\d{1,6})\\.(\\d{1,6})\\.(\\d{1,6})(?:-(alpha|beta|rc)\\.(\\d{1,6}))?");
    final String name;
    private final int[] parts;

    private ReleaseVersion(String name, int[] parts) { this.name = name; this.parts = parts; }

    static ReleaseVersion parse(String value) {
        if (value == null) return null;
        Matcher m = PATTERN.matcher(value);
        if (!m.matches()) return null;
        String stage = m.group(4);
        int rank = stage == null ? 3 : stage.equals("alpha") ? 0 : stage.equals("beta") ? 1 : 2;
        return new ReleaseVersion(value.startsWith("v") ? value.substring(1) : value, new int[] {
                Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)), rank,
                stage == null ? 0 : Integer.parseInt(m.group(5)) });
    }

    @Override public int compareTo(ReleaseVersion other) {
        for (int i = 0; i < parts.length; i++) {
            int comparison = Integer.compare(parts[i], other.parts[i]);
            if (comparison != 0) return comparison;
        }
        return 0;
    }

    static boolean trustedHost(URL url) {
        String host = url.getHost();
        return "https".equals(url.getProtocol()) && url.getUserInfo() == null && (url.getPort() == -1 || url.getPort() == 443)
                && (host.equals("api.github.com") || host.equals("github.com") || host.equals("release-assets.githubusercontent.com") || host.equals("objects.githubusercontent.com"));
    }

    String assetUrl(String tag, String name, String state, String url) {
        String asset = "eclaire-" + this.name + "-debug.apk";
        String expected = "https://github.com/bglacial/eclaire/releases/download/" + tag + "/" + asset;
        return asset.equals(name) && "uploaded".equals(state) && expected.equals(url) ? expected : null;
    }
}
