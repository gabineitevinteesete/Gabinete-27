function onlyDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function normalizePhone(input: string): string {
  let digits = onlyDigits(input);
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return `+55${digits}`;
}

export function isValidBrazilianPhone(input: string): boolean {
  let digits = onlyDigits(input);
  if (digits.startsWith('55') && digits.length > 11) {
    digits = digits.slice(2);
  }
  return digits.length === 10 || digits.length === 11;
}
