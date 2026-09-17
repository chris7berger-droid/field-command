/**
 * Synchronous CLOCK IN in-flight lock.
 * A second tap during GPS/permission/write must not start another submit.
 */
export function createClockInSubmitGuard() {
  let inFlight = false;
  return {
    tryBegin() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    end() {
      inFlight = false;
    },
    isInFlight() {
      return inFlight;
    },
  };
}
