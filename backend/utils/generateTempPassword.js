// Builds a short temporary password the admin can read out loud.
// Ambiguous characters (0/O, 1/l/I) are left out on purpose.

const crypto = require("crypto");

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = LETTERS + DIGITS;

function pick(charset) {
  return charset[crypto.randomInt(charset.length)];
}

function generateTempPassword(length = 10) {
  // Guarantee at least one letter and one digit, then fill the rest.
  const chars = [pick(LETTERS), pick(DIGITS)];

  while (chars.length < length) {
    chars.push(pick(ALPHABET));
  }

  // Shuffle so the guaranteed characters aren't always in front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

module.exports = generateTempPassword;
