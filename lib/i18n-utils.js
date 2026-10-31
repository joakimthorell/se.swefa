'use strict';

const LOCALES = Object.freeze({ en: 'en-GB', sv: 'sv-SE', no: 'nb-NO' });

function getLocale(language) {
  return Object.hasOwn(LOCALES, language) ? LOCALES[language] : LOCALES.en;
}

module.exports = { getLocale };
