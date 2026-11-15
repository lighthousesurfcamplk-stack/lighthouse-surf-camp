/* /api/payhere-notify — the Netlify handler, adapted for Vercel.
   All of the logic lives in netlify/functions/payhere-notify.js; this file
   only bridges the two runtimes. See api/_netlify-shim.js for why. */
'use strict';

module.exports = require('./_netlify-shim')(
  require('../netlify/functions/payhere-notify').handler
);
