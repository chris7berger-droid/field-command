/**
 * Weather capture at punch time.
 * Uses Open-Meteo (free, no API key) to get current conditions.
 */

/**
 * Fetch current weather for a GPS position.
 * Returns { temp_f, condition } or null on failure.
 * Fails silently — weather is nice-to-have, never blocks a punch.
 */
export async function fetchWeather(latitude, longitude) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?` +
      `latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,weather_code` +
      `&temperature_unit=fahrenheit`;

    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;

    const data = await res.json();
    const current = data?.current;
    if (!current) return null;

    return {
      temp_f: Math.round(current.temperature_2m),
      condition: weatherCodeToCondition(current.weather_code),
    };
  } catch {
    // Network error, timeout, offline — don't block the punch
    return null;
  }
}

/**
 * Map WMO weather codes to simple condition strings.
 */
function weatherCodeToCondition(code) {
  if (code == null) return 'unknown';
  if (code === 0) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code <= 49) return 'fog';
  if (code <= 59) return 'drizzle';
  if (code <= 69) return 'rain';
  if (code <= 79) return 'snow';
  if (code <= 84) return 'rain';
  if (code <= 86) return 'snow';
  if (code <= 99) return 'thunderstorm';
  return 'unknown';
}
