// Stub delivery adapter -- logs the message and reports success. This is
// the entire "provider" until a real one (Twilio, etc.) is wired up: swap
// it out in services/Notifications/localService.js's ADAPTERS map without
// touching anything else, since every adapter implements the same
// send(channel, recipient, body) -> { success, errorMessage? } contract.
const send = async (channel, recipient, body) => {
  console.log(`[notification:${channel}] to ${recipient} -- ${body}`);
  return { success: true };
};

module.exports = { send };
