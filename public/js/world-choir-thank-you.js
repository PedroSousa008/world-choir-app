/**
 * Localized "Thank You" for the post-event Home hero.
 * Uses the participant's pledged country when available, else browser locale.
 */
const WorldChoirThankYou = (() => {
  const BY_COUNTRY = {
    Afghanistan: 'تشکر',
    Albania: 'Faleminderit',
    Algeria: 'شكراً',
    Argentina: 'Gracias',
    Armenia: 'Շնորհակալություն',
    Australia: 'Thank You',
    Austria: 'Danke',
    Azerbaijan: 'Təşəkkür',
    Bahrain: 'شكراً',
    Bangladesh: 'ধন্যবাদ',
    Belarus: 'Дзякуй',
    Belgium: 'Merci',
    Brazil: 'Obrigado',
    Bulgaria: 'Благодаря',
    Cambodia: 'អរគុណ',
    Canada: 'Thank You',
    Chile: 'Gracias',
    China: '谢谢',
    Colombia: 'Gracias',
    Croatia: 'Hvala',
    Cuba: 'Gracias',
    Cyprus: 'Ευχαριστώ',
    Czechia: 'Děkuji',
    'Côte d\'Ivoire': 'Merci',
    Denmark: 'Tak',
    'Dominican Republic': 'Gracias',
    Ecuador: 'Gracias',
    Egypt: 'شكراً',
    Estonia: 'Tänan',
    Ethiopia: 'አመሰግናለሁ',
    Finland: 'Kiitos',
    France: 'Merci',
    Georgia: 'მადლობა',
    Germany: 'Danke',
    Ghana: 'Medaase',
    Greece: 'Ευχαριστώ',
    Guatemala: 'Gracias',
    Haiti: 'Mèsi',
    Honduras: 'Gracias',
    Hungary: 'Köszönöm',
    Iceland: 'Takk',
    India: 'धन्यवाद',
    Indonesia: 'Terima Kasih',
    Iran: 'متشکرم',
    Iraq: 'شكراً',
    Ireland: 'Go raibh maith agat',
    Israel: 'תודה',
    Italy: 'Grazie',
    Japan: 'ありがとう',
    Jordan: 'شكراً',
    Kazakhstan: 'Рақмет',
    Kenya: 'Asante',
    'South Korea': '감사합니다',
    Kuwait: 'شكراً',
    Latvia: 'Paldies',
    Lebanon: 'شكراً',
    Lithuania: 'Ačiū',
    Luxembourg: 'Merci',
    Malaysia: 'Terima Kasih',
    Mexico: 'Gracias',
    Morocco: 'شكراً',
    Netherlands: 'Dank je',
    'New Zealand': 'Thank You',
    Nigeria: 'Daalụ',
    Norway: 'Takk',
    Pakistan: 'شکریہ',
    Palestine: 'شكراً',
    Panama: 'Gracias',
    Paraguay: 'Gracias',
    Peru: 'Gracias',
    Philippines: 'Salamat',
    Poland: 'Dziękuję',
    Portugal: 'Obrigado',
    Romania: 'Mulțumesc',
    Russia: 'Спасибо',
    'Saudi Arabia': 'شكراً',
    Serbia: 'Хвала',
    Singapore: 'Thank You',
    Slovakia: 'Ďakujem',
    Slovenia: 'Hvala',
    'South Africa': 'Enkosi',
    Spain: 'Gracias',
    Sweden: 'Tack',
    Switzerland: 'Merci',
    Taiwan: '謝謝',
    Thailand: 'ขอบคุณ',
    Tunisia: 'شكراً',
    Turkey: 'Teşekkürler',
    Ukraine: 'Дякую',
    'United Arab Emirates': 'شكراً',
    'United Kingdom': 'Thank You',
    'United States': 'Thank You',
    Uruguay: 'Gracias',
    Venezuela: 'Gracias',
    Vietnam: 'Cảm ơn',
  };

  const BY_LANG = {
    pt: 'Obrigado',
    es: 'Gracias',
    fr: 'Merci',
    de: 'Danke',
    it: 'Grazie',
    nl: 'Dank je',
    pl: 'Dziękuję',
    ru: 'Спасибо',
    ja: 'ありがとう',
    ko: '감사합니다',
    zh: '谢谢',
    ar: 'شكراً',
    hi: 'धन्यवाद',
    tr: 'Teşekkürler',
    sv: 'Tack',
    da: 'Tak',
    fi: 'Kiitos',
    el: 'Ευχαριστώ',
    he: 'תודה',
    th: 'ขอบคุณ',
    vi: 'Cảm ơn',
    id: 'Terima Kasih',
    ro: 'Mulțumesc',
    uk: 'Дякую',
    en: 'Thank You',
  };

  function getUserCountry() {
    const pledge = typeof WorldChoirDB !== 'undefined'
      ? WorldChoirDB.getPledgeForCurrentUser?.()
      : null;
    if (pledge?.country) return pledge.country;
    const user = typeof WorldChoirDB !== 'undefined'
      ? WorldChoirDB.getCurrentUser?.()
      : null;
    return user?.country || null;
  }

  function getThankYou(country) {
    const c = country || getUserCountry();
    if (c && BY_COUNTRY[c]) return BY_COUNTRY[c];
    const lang = (navigator.language || 'en').split('-')[0].toLowerCase();
    return BY_LANG[lang] || BY_LANG.en;
  }

  return { getThankYou, getUserCountry };
})();
