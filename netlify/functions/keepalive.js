'use strict';
/**
 * Scheduled function (see netlify.toml): calls keepalive_ping() so the free
 * Supabase project does not get paused after a week without traffic.
 */
const { keepAlive } = require('../../store');

exports.handler = async () => {
  try {
    const pinged = await keepAlive();
    console.log(pinged ? 'supabase keep alive ok' : 'supabase not configured, nothing to do');
    return { statusCode: 200 };
  } catch (err) {
    console.error('keep alive failed:', err.message);
    return { statusCode: 500 };
  }
};
