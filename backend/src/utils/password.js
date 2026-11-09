const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, KEY_LENGTH);
    return `scrypt$${salt}$${hash.toString('hex')}`;
}

async function verifyPassword(password, storedPassword) {
    if (!storedPassword.startsWith('scrypt$')) {
        const submitted = Buffer.from(password);
        const stored = Buffer.from(storedPassword);
        return submitted.length === stored.length && crypto.timingSafeEqual(submitted, stored);
    }

    const [, salt, storedHash] = storedPassword.split('$');
    if (!salt || !storedHash) return false;

    const actualHash = await scrypt(password, salt, KEY_LENGTH);
    const expectedHash = Buffer.from(storedHash, 'hex');
    return actualHash.length === expectedHash.length && crypto.timingSafeEqual(actualHash, expectedHash);
}

module.exports = { hashPassword, verifyPassword };
