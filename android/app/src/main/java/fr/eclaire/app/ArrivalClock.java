package fr.eclaire.app;

import java.util.Calendar;
import java.util.Locale;

final class ArrivalClock {
    static long arrivalMillis(double nowMs, double remainingSeconds) {
        double arrival = Math.ceil((nowMs + remainingSeconds * 1000) / 60000) * 60000;
        if (!Double.isFinite(nowMs) || nowMs < 0 || !Double.isFinite(remainingSeconds) || remainingSeconds < 0 || !Double.isFinite(arrival) || arrival > 8640000000000000L) return -1;
        return (long) arrival;
    }

    static String format(double nowMs, double remainingSeconds) {
        long millis = arrivalMillis(nowMs, remainingSeconds);
        if (millis < 0) return "";
        Calendar now = Calendar.getInstance(), arrival = Calendar.getInstance();
        now.setTimeInMillis((long) nowMs); arrival.setTimeInMillis(millis);
        boolean tomorrow = now.get(Calendar.ERA) != arrival.get(Calendar.ERA) || now.get(Calendar.YEAR) != arrival.get(Calendar.YEAR) || now.get(Calendar.DAY_OF_YEAR) != arrival.get(Calendar.DAY_OF_YEAR);
        return String.format(Locale.FRANCE, "%s%d h %02d", tomorrow ? "demain " : "", arrival.get(Calendar.HOUR_OF_DAY), arrival.get(Calendar.MINUTE));
    }
}
