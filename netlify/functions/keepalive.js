'use strict';
/**
 * Scheduled function (see netlify.toml): a small read on the compiti table so
 * the free Supabase project does not get paused after a week without traffic.
 */
const { keepAlive } = require('../../stato');

exports.handler = async () => {
  try {
    const fatto = await keepAlive();
    console.log(fatto ? 'supabase keep alive ok' : 'supabase non configurato, niente da fare');
    return { statusCode: 200 };
  } catch (err) {
    console.error('keep alive fallito:', err.message);
    return { statusCode: 500 };
  }
};
