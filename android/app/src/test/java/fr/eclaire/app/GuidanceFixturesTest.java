package fr.eclaire.app;

import static org.junit.Assert.*;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/** Runs tests/fixtures/guidance/scenarios.json, shared with navigation.ts and GuidanceTracker.swift. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class GuidanceFixturesTest {
    private static JSONObject fixtures() throws Exception {
        try (InputStream input = GuidanceFixturesTest.class.getResourceAsStream("/guidance/scenarios.json")) {
            if (input == null) throw new IOException("Fixtures de guidage introuvables.");
            return new JSONObject(new String(input.readAllBytes(), StandardCharsets.UTF_8));
        }
    }

    private static Double optional(JSONObject object, String key) throws org.json.JSONException {
        return object.has(key) && !object.isNull(key) ? object.getDouble(key) : null;
    }

    private static GuidanceTracker.Fix fix(JSONObject f) throws org.json.JSONException {
        return new GuidanceTracker.Fix(f.getDouble("lat"), f.getDouble("lon"), f.getDouble("accuracy"), f.getLong("timestamp"), optional(f, "speed"), optional(f, "heading"));
    }

    @Test public void routeValidationMatchesSharedFixtures() throws Exception {
        JSONArray cases = fixtures().getJSONArray("validation");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            boolean valid;
            try { GuidanceTracker.fromJson(c.getJSONObject("route")); valid = true; } catch (RuntimeException | org.json.JSONException e) { valid = false; }
            assertEquals(c.getString("name"), c.getBoolean("valid"), valid);
        }
    }

    @Test public void trackingMatchesSharedFixtures() throws Exception {
        JSONObject all = fixtures();
        double tolerance = all.getDouble("tolerance");
        JSONArray scenarios = all.getJSONArray("tracking");
        for (int i = 0; i < scenarios.length(); i++) {
            JSONObject scenario = scenarios.getJSONObject(i);
            var tracker = GuidanceTracker.fromJson(all.getJSONObject("routes").getJSONObject(scenario.getString("route")));
            JSONArray updates = scenario.getJSONArray("updates");
            for (int j = 0; j < updates.length(); j++) {
                JSONObject update = updates.getJSONObject(j), expect = update.getJSONObject("expect");
                var f = fix(update.getJSONObject("fix"));
                var state = tracker.update(f, update.has("now") ? update.getLong("now") : f.timestamp());
                String label = scenario.getString("name") + " #" + j;
                assertEquals(label, expect.getString("status"), state.status());
                if (expect.has("at")) assertEquals(label, expect.getDouble("at"), state.at(), tolerance);
                if (expect.has("nextIndex")) assertEquals(label, expect.getInt("nextIndex"), state.nextIndex());
                if (expect.has("toTurn")) assertEquals(label, expect.getDouble("toTurn"), state.toTurn(), tolerance);
            }
        }
    }

    @Test public void voiceStageMatchesSharedFixtures() throws Exception {
        JSONArray cases = fixtures().getJSONArray("voiceStage");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            assertEquals(c.toString(), c.getString("expect"), GuidanceTracker.voiceStage(c.getDouble("distance"), optional(c, "speed")));
        }
    }

    @Test public void rerouteAcceptanceMatchesSharedFixtures() throws Exception {
        JSONArray cases = fixtures().getJSONArray("acceptsReroute");
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            var state = new GuidanceTracker.State(c.getString("state"), 0, 0, 0, 0, 0);
            assertEquals(c.getString("name"), c.getBoolean("expect"), GuidanceTracker.acceptsReroute(state, fix(c.getJSONObject("origin")), fix(c.getJSONObject("latest"))));
        }
    }
}
