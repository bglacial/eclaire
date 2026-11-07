package fr.eclaire.app;

import org.junit.Test;
import java.util.Calendar;
import static org.junit.Assert.assertEquals;

public class ArrivalClockTest {
    private static long time(int hour, int minute) {
        Calendar date = Calendar.getInstance();
        date.clear(); date.set(2026, Calendar.JANUARY, 2, hour, minute, 0);
        return date.getTimeInMillis();
    }

    @Test public void formatsArrivalInLocalTime() {
        long now = time(17, 45), late = time(23, 59);
        assertEquals("17 h 46", ArrivalClock.format(now, 59));
        assertEquals("demain 0 h 00", ArrivalClock.format(late, 60));
        assertEquals("17 h 45", ArrivalClock.format(now, 0));
        assertEquals("demain 4 h 45", ArrivalClock.format(now, 11 * 3600));
        assertEquals("", ArrivalClock.format(now, Double.NaN));
        assertEquals("", ArrivalClock.format(Double.NaN, 0));
        assertEquals("", ArrivalClock.format(now, -1));
        assertEquals("", ArrivalClock.format(-1, 0));
    }
}
