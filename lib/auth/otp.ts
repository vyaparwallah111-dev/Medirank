import { randomInt, timingSafeEqual } from "crypto";

const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const NUMBERS = "23456789";
const ALPHANUMERIC = `${LETTERS}${NUMBERS}`;

function randomCharacter(source: string) {
  return source[randomInt(source.length)];
}

export function generateOtp() {
  const characters = [
    randomCharacter(LETTERS),
    randomCharacter(NUMBERS),
    ...Array.from({ length: 4 }, () => randomCharacter(ALPHANUMERIC)),
  ];

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }

  return {
    code: characters.join(""),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  };
}

export function otpMatches(received: string, expected: string) {
  const left = Buffer.from(received.trim().toUpperCase());
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
