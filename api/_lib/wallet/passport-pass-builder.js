const fs = require('fs');
const path = require('path');
const { PKPass } = require('passkit-generator');

const ASSETS_DIR = path.join(__dirname, 'assets');

function loadAsset(name) {
  return fs.readFileSync(path.join(ASSETS_DIR, name));
}

function loadWalletCertificates() {
  const passTypeIdentifier = process.env.APPLE_PASS_TYPE_IDENTIFIER;
  const teamIdentifier = process.env.APPLE_TEAM_IDENTIFIER;
  const wwdr = process.env.APPLE_WWDR_CERTIFICATE;
  const signerCert = process.env.APPLE_PASS_CERTIFICATE;
  const signerKey = process.env.APPLE_PASS_PRIVATE_KEY;
  const signerKeyPassphrase = process.env.APPLE_PASS_CERTIFICATE_PASSWORD || '';

  if (!passTypeIdentifier || !teamIdentifier || !wwdr || !signerCert || !signerKey) {
    return null;
  }

  return {
    passTypeIdentifier,
    teamIdentifier,
    certificates: {
      wwdr: Buffer.from(wwdr, 'utf8'),
      signerCert: Buffer.from(signerCert, 'utf8'),
      signerKey: Buffer.from(signerKey, 'utf8'),
      signerKeyPassphrase,
    },
  };
}

function walletConfigured() {
  return !!loadWalletCertificates();
}

function buildPassBuffers() {
  return {
    'icon.png': loadAsset('icon.png'),
    'icon@2x.png': loadAsset('icon@2x.png'),
    'icon@3x.png': loadAsset('icon@3x.png'),
    'logo.png': loadAsset('logo.png'),
    'logo@2x.png': loadAsset('logo@2x.png'),
    'logo@3x.png': loadAsset('logo@3x.png'),
    'strip.png': loadAsset('strip.png'),
    'strip@2x.png': loadAsset('strip@2x.png'),
    'strip@3x.png': loadAsset('strip@3x.png'),
  };
}

function buildGenericPassFields(passportData) {
  const fields = {
    headerFields: [
      {
        key: 'passport',
        label: 'WORLD CHOIR',
        value: 'PASSPORT',
      },
    ],
    primaryFields: [
      {
        key: 'voice',
        label: 'VOICE NUMBER',
        value: passportData.voiceNumberFormatted || '—',
      },
    ],
    secondaryFields: [],
    auxiliaryFields: [],
    backFields: [
      {
        key: 'about',
        label: 'About',
        value: 'Your World Choir Passport is a permanent record of your participation in World Choir.',
      },
    ],
  };

  if (passportData.country) {
    fields.secondaryFields.push({
      key: 'country',
      label: 'COUNTRY',
      value: passportData.country,
    });
  }

  if (passportData.city) {
    fields.secondaryFields.push({
      key: 'city',
      label: 'CITY',
      value: passportData.city,
    });
  }

  if (passportData.memberSinceFormatted) {
    fields.auxiliaryFields.push({
      key: 'memberSince',
      label: 'MEMBER SINCE',
      value: passportData.memberSinceFormatted,
    });
  }

  if (Number.isFinite(passportData.eventsJoined)) {
    fields.auxiliaryFields.push({
      key: 'eventsJoined',
      label: 'EVENTS JOINED',
      value: String(passportData.eventsJoined),
    });
  }

  if (Number.isFinite(passportData.dailyActsCompleted)) {
    fields.backFields.push({
      key: 'dailyActs',
      label: 'Daily Acts Completed',
      value: String(passportData.dailyActsCompleted),
    });
  }

  if (Number.isFinite(passportData.stampsEarned)) {
    fields.backFields.push({
      key: 'stamps',
      label: 'Stamps Collected',
      value: String(passportData.stampsEarned),
    });
  }

  if (passportData.eventTitle) {
    fields.backFields.push({
      key: 'event',
      label: 'Event',
      value: passportData.eventTitle,
    });
  }

  return fields;
}

async function generatePassportPass({
  passportData,
  walletRecord,
  qrUrl,
}) {
  const config = loadWalletCertificates();
  if (!config) {
    const err = new Error('Apple Wallet signing is not configured yet');
    err.code = 'WALLET_NOT_CONFIGURED';
    err.statusCode = 503;
    throw err;
  }

  const buffers = buildPassBuffers();
  const pass = new PKPass(
    buffers,
    config.certificates,
    {
      formatVersion: 1,
      passTypeIdentifier: config.passTypeIdentifier,
      teamIdentifier: config.teamIdentifier,
      organizationName: 'World Choir',
      description: 'World Choir Passport',
      serialNumber: walletRecord.walletPassSerialNumber,
      foregroundColor: 'rgb(255, 255, 255)',
      backgroundColor: 'rgb(11, 52, 107)',
      labelColor: 'rgb(78, 197, 232)',
      generic: {},
    }
  );

  const fields = buildGenericPassFields(passportData);
  pass.headerFields.push(...fields.headerFields);
  pass.primaryFields.push(...fields.primaryFields);
  pass.secondaryFields.push(...fields.secondaryFields);
  pass.auxiliaryFields.push(...fields.auxiliaryFields);
  pass.backFields.push(...fields.backFields);

  pass.setBarcodes({
    format: 'PKBarcodeFormatQR',
    message: qrUrl,
    messageEncoding: 'iso-8859-1',
    altText: 'World Choir Passport',
  });

  return pass.getAsBuffer();
}

module.exports = {
  walletConfigured,
  generatePassportPass,
  loadWalletCertificates,
};
